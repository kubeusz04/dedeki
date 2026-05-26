// ===== Map tactical combat =====
const MapCombat = {
  combat: null,
  blocking: new Set(),
  losFogBlocks: true,
  targeting: null,
  attackEffects: [],
  _wheelOpen: false,
  _requestSeq: 0,

  init() {
    document.getElementById('map-btn-end-turn')?.addEventListener('click', () => this.endTurn());
    document.getElementById('map-btn-combat-toggle')?.addEventListener('click', () => {
      if (App.currentCampaign?.role !== 'dm') return;
      const enabled = !this.combat?.enabled;
      App.socket?.emit('combat-enable', { enabled });
    });
    document.getElementById('map-btn-reset-movement')?.addEventListener('click', () => {
      if (App.currentCampaign?.role !== 'dm') return;
      const tokenId = this.getActiveTokenId();
      if (!tokenId) {
        showToast('Brak aktywnego tokena w inicjatywie', 'warning');
        return;
      }
      App.socket?.emit('combat-set-movement', { tokenId, reset: true });
      showToast('Przywrócono pełny ruch', 'success');
    });

    document.getElementById('map-action-wheel')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-combat-action]');
      if (!btn) return;
      e.stopPropagation();
      this.onWheelAction(btn.dataset.combatAction);
    });

    document.querySelectorAll('#map-combat-saves .btn-save-map').forEach((btn) => {
      btn.addEventListener('click', () => this.rollSave(btn.dataset.save));
    });

    document.getElementById('map-btn-roll-attack')?.addEventListener('click', () => this.startAttackFromSidebar());
    document.getElementById('map-btn-roll-spell')?.addEventListener('click', () => this.startSpellFromSidebar());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.cancelTargeting();
        this.hideActionWheel();
        if (typeof MapZones !== 'undefined') MapZones.cancelPlacement();
      }
    });

    // Klik poza kołem akcji = zamyka koło
    document.addEventListener('mousedown', (e) => {
      if (!this._wheelOpen) return;
      const wheel = document.getElementById('map-action-wheel');
      if (wheel && !wheel.contains(e.target)) {
        this.hideActionWheel();
      }
    }, true);

    this.bindInitTrackClicks();
  },

  load() {
    App.socket?.emit('combat-get-state');
  },

  update(payload) {
    if (!payload) return;
    this.combat = payload.combat || payload;
    this.blocking = MapLos.parseBlocking(payload.blocking || []);
    this.losFogBlocks = payload.losFogBlocks !== false;
    this.renderOverlay();
    if (typeof BattleMap !== 'undefined') BattleMap.render();
    this.updateCombatSidebar();
  },

  getActiveTokenId() {
    const active = Initiative.getActiveEntry?.();
    return active?.map_token_id || '';
  },

  getTurnState(tokenId) {
    return this.combat?.tokens?.[tokenId] || null;
  },

  isCombatEnabled() {
    return !!this.combat?.enabled && Initiative.entries?.length > 0;
  },

  isMovementLimited() {
    return Initiative.entries?.length > 0;
  },

  canMoveToken(token) {
    if (!token) return false;
    if (!this.canControlToken(token)) return false;
    if (!this.isMovementLimited()) return true;
    if (App.currentCampaign?.role === 'dm') return true;
    return this.isTokenTurn(token.id);
  },

  getRemainingMovementFt(tokenId) {
    const turn = this.getTurnState(tokenId);
    if (!turn) return null;
    return (turn.movementRemainingFt ?? 0) + (turn.dashBonusFt ?? 0);
  },

  getMovementRangeCells(tokenId) {
    const remaining = this.getRemainingMovementFt(tokenId);
    if (remaining == null) return 0;
    return MapTactics.feetToCells(remaining);
  },

  canControlToken(token) {
    if (!token) return false;
    const isDm = App.currentCampaign?.role === 'dm';
    if (isDm) return true;
    const char = BattleMap.getCharacterForToken(token);
    return char && char.user_id === getUser()?.id;
  },

  isTokenTurn(tokenId) {
    return this.getActiveTokenId() === tokenId;
  },

  canActOnToken(token) {
    if (!this.isCombatEnabled()) return this.canControlToken(token);
    return this.isTokenTurn(token.id) && this.canControlToken(token);
  },

  onInitiativeUpdate() {
    this.load();
    this.renderOverlay();
    if (typeof BattleMap !== 'undefined') {
      BattleMap.renderSidebar();
      BattleMap.render();
    }
    const active = Initiative.getActiveEntry();
    if (active?.map_token_id && (Initiative.isMyCharacterTurn(active) || (App.currentCampaign?.role === 'dm' && Initiative.isDmTurn(active)))) {
      document.querySelector('.session-tab[data-panel="map-panel"]')?.click();
      BattleMap.focusToken?.(active.map_token_id);
    }
  },

  onHighlight(data) {
    if (data?.mapTokenId) {
      BattleMap.focusToken?.(data.mapTokenId);
      BattleMap.selectToken(data.mapTokenId);
    }
  },

  renderOverlay() {
    const track = document.getElementById('map-init-order-track');
    const status = document.getElementById('map-combat-status');
    const endBtn = document.getElementById('map-btn-end-turn');
    const meter = document.getElementById('map-movement-meter');
    const meterText = document.getElementById('map-movement-text');
    const meterFill = document.getElementById('map-movement-fill');
    const resetBtn = document.getElementById('map-btn-reset-movement');
    if (!track) return;

    const active = Initiative.getActiveEntry();
    if (!Initiative.entries?.length) {
      track.innerHTML = '<span class="sheet-hint">Brak inicjatywy — ruch bez limitu</span>';
      if (status) status.textContent = '';
      if (endBtn) endBtn.disabled = true;
      meter?.classList.add('hidden');
      resetBtn?.classList.add('hidden');
      return;
    }

    track.innerHTML = Initiative.entries.map((entry) => {
      const cls = entry.is_active ? 'map-order-chip active' : 'map-order-chip';
      const short = entry.entity_name.length > 8 ? `${entry.entity_name.slice(0, 7)}…` : entry.entity_name;
      const tokId = entry.map_token_id || '';
      return `<span class="${cls}" data-init-token="${escapeHtml(tokId)}" title="${escapeHtml(entry.entity_name)}">${escapeHtml(short)}</span>`;
    }).join('');

    const activeChip = track.querySelector('.map-order-chip.active');
    if (activeChip && this._lastActiveChip !== active?.id) {
      activeChip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      this._lastActiveChip = active?.id;
    }

    const activeTokenId = active?.map_token_id || '';
    const turn = activeTokenId ? this.getTurnState(activeTokenId) : null;

    if (status && active) {
      const extra = turn
        ? ` · A:${turn.actionUsed ? '✓' : '—'} B:${turn.bonusUsed ? '✓' : '—'} R:${turn.reactionAvailable === false ? '✓' : '—'}`
        : '';
      status.textContent = `Runda ${Initiative.round} — tura: ${active.entity_name}${extra}`;
    }
    this.renderSelectedTokenStatus(activeTokenId);

    if (turn && meter && meterText && meterFill) {
      const remaining = (turn.movementRemainingFt ?? 0) + (turn.dashBonusFt ?? 0);
      const max = turn.movementMaxFt ?? remaining;
      const ratio = max > 0 ? remaining / max : 0;
      meter.classList.remove('hidden');
      meterText.textContent = `${remaining} / ${max} ft (${MapTactics.feetToCells(remaining)} kratek)`;
      meterFill.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
      meterFill.classList.toggle('low', ratio <= 0.25 && ratio > 0);
      meterFill.classList.toggle('empty', ratio <= 0);
    } else {
      meter?.classList.add('hidden');
    }

    if (resetBtn) {
      resetBtn.classList.toggle('hidden', App.currentCampaign?.role !== 'dm' || !activeTokenId);
    }

    if (endBtn) endBtn.disabled = !Initiative.canEndTurn();
  },

  renderSelectedTokenStatus(activeTokenId) {
    const box = document.getElementById('map-selected-turn-info');
    if (!box) return;
    const selId = BattleMap.selectedTokenId;
    if (!selId || selId === activeTokenId) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    const token = BattleMap.tokens.find((t) => t.id === selId);
    if (!token) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    const turn = this.getTurnState(selId);
    if (!turn) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    const remaining = (turn.movementRemainingFt ?? 0) + (turn.dashBonusFt ?? 0);
    const max = turn.movementMaxFt ?? remaining;
    const ratio = max > 0 ? remaining / max : 0;
    const cells = MapTactics.feetToCells(remaining);
    const name = escapeHtml(token.entity_name || '?');
    box.classList.remove('hidden');
    box.innerHTML = `
      <span class="map-selected-name">👁 ${name}</span>
      <span class="map-selected-mv" title="Ruch tej tury">🏃 ${remaining}/${max} ft (${cells})</span>
      <span class="map-selected-mv-bar"><span style="width:${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%"></span></span>
      <span class="map-selected-badges">
        <span class="map-act-badge ${turn.actionUsed ? 'used' : 'free'}" title="Akcja">A</span>
        <span class="map-act-badge ${turn.bonusUsed ? 'used' : 'free'}" title="Akcja dodatkowa">B</span>
        <span class="map-act-badge ${turn.reactionAvailable === false ? 'used' : 'free'}" title="Reakcja">R</span>
      </span>
    `;
  },

  bindInitTrackClicks() {
    if (this._initTrackBound) return;
    this._initTrackBound = true;
    const track = document.getElementById('map-init-order-track');
    if (!track) return;
    track.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-init-token]');
      if (!chip) return;
      const tid = chip.dataset.initToken;
      if (!tid) return;
      BattleMap.selectToken(tid);
      BattleMap.focusToken?.(tid);
    });
  },

  updateCombatSidebar() {
    const hint = document.getElementById('map-attack-hint');
    const char = Characters.activeCharacter || Characters.myCampaignCharacter;
    if (hint) {
      hint.textContent = char
        ? `Postać: ${char.name} — wybierz token i użyj koła akcji lub ataku.`
        : 'Wybierz postać w panelu Postacie.';
    }
  },

  endTurn() {
    Initiative.endTurn();
    this.hideActionWheel();
    this.cancelTargeting();
  },

  showActionWheel(screenX, screenY, token) {
    const wheel = document.getElementById('map-action-wheel');
    if (!wheel || !token) return;
    this._wheelTokenId = token.id;
    this._wheelOpen = true;

    const turn = this.getTurnState(token.id);
    const setDisabled = (action, disabled) => {
      const btn = wheel.querySelector(`[data-combat-action="${action}"]`);
      if (btn) btn.disabled = !!disabled;
    };

    if (this.isCombatEnabled()) {
      setDisabled('attack', !this.canActOnToken(token) || turn?.actionUsed);
      setDisabled('spell', !this.canActOnToken(token) || turn?.actionUsed);
      setDisabled('bonus', !this.canActOnToken(token) || turn?.bonusUsed);
      setDisabled('save', false);
      setDisabled('end', !Initiative.canEndTurn());
    }

    // Pokaż imię tokena w centralnym medalionie
    const label = document.getElementById('map-action-wheel-label');
    if (label) {
      const name = token.entity_name || token.name || 'Token';
      label.textContent = name.length > 9 ? name.slice(0, 8) + '…' : name;
      label.title = name;
    }

    wheel.classList.remove('hidden');
    // Restart animacji popIn przy każdym otwarciu
    wheel.style.animation = 'none';
    void wheel.offsetWidth;
    wheel.style.animation = '';

    // Wheel ma 200x200, centrujemy na klikniętym punkcie
    const WHEEL = 200;
    const HALF = WHEEL / 2;
    const rect = BattleMap.viewport?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
    const relX = screenX - rect.left - HALF;
    const relY = screenY - rect.top - HALF;
    const clampedX = Math.max(8, Math.min(rect.width - WHEEL - 8, relX));
    const clampedY = Math.max(8, Math.min(rect.height - WHEEL - 8, relY));
    wheel.style.left = `${clampedX}px`;
    wheel.style.top = `${clampedY}px`;
  },

  hideActionWheel() {
    document.getElementById('map-action-wheel')?.classList.add('hidden');
    this._wheelOpen = false;
    this._wheelTokenId = null;
  },

  onWheelAction(action) {
    const tokenId = this._wheelTokenId;
    const token = BattleMap.tokens.find((t) => t.id === tokenId);
    this.hideActionWheel();
    if (!token) return;

    if (action === 'move') {
      BattleMap.setTool('select');
      showToast('Przeciągnij token, aby się poruszyć', 'info');
      return;
    }
    if (action === 'end') {
      this.endTurn();
      return;
    }
    if (action === 'save') {
      this.rollSave(null, token);
      return;
    }
    if (action === 'bonus') {
      this.showBonusMenu(token);
      return;
    }
    if (action === 'attack') {
      this.startAttackTargeting(token);
      return;
    }
    if (action === 'spell') {
      this.startSpellTargeting(token);
      return;
    }
  },

  showBonusMenu(token) {
    const actions = [
      { id: 'dash', label: 'Sprint (Dash)' },
      { id: 'disengage', label: 'Odwrót (Disengage)' },
      { id: 'dodge', label: 'Unik (Dodge)' },
      { id: 'help', label: 'Pomoc (Help)' },
      { id: 'hide', label: 'Ukrycie (Hide)' }
    ];
    const html = actions.map((a) =>
      `<button type="button" class="btn btn-secondary btn-full map-bonus-pick" data-bonus="${a.id}">${escapeHtml(a.label)}</button>`
    ).join('');
    showGenericModal('Akcja dodatkowa', `<div class="map-bonus-list">${html}</div>`);
    document.querySelectorAll('.map-bonus-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeModal('generic-modal');
        if (btn.dataset.bonus === 'dash') {
          App.socket?.emit('combat-bonus-action', { tokenId: token.id, actionId: 'dash' });
          showToast('Sprint — podwojony pozostały ruch', 'success');
        } else {
          App.socket?.emit('combat-bonus-action', { tokenId: token.id, actionId: btn.dataset.bonus });
          showToast('Akcja dodatkowa zarejestrowana', 'success');
        }
      });
    });
  },

  getCharacterForToken(token) {
    return BattleMap.getCharacterForToken(token);
  },

  startAttackTargeting(attackerToken) {
    const char = this.getCharacterForToken(attackerToken);
    if (!char && attackerToken.entity_type === 'player') {
      showToast('Token nie jest powiązany z postacią', 'warning');
      return;
    }
    const weapons = char ? Dice.getCharacterWeapons(char) : [];
    if (!weapons.length && attackerToken.entity_type === 'player') {
      showToast('Brak broni na karcie postaci', 'warning');
      return;
    }
    const pickWeapon = (weapon) => {
      this.targeting = {
        mode: 'attack',
        attackerTokenId: attackerToken.id,
        weapon,
        characterId: char?.id
      };
      BattleMap.setTool('select');
      const r = MapRange.weaponRangeCells(weapon);
      const rangeHint = r.melee
        ? `wręcz (${r.normalFt || 5} ft)`
        : (r.long ? `${r.normalFt}/${r.longFt} ft — długi z utrudnieniem` : `${r.normalFt} ft`);
      showToast(`⚔ ${weapon.name}: ${rangeHint}. Kliknij wroga w zasięgu`, 'info');
      BattleMap.render();
    };
    if (weapons.length === 1) pickWeapon(weapons[0]);
    else Dice.showWeaponPicker(char, pickWeapon);
  },

  startSpellTargeting(attackerToken) {
    const char = this.getCharacterForToken(attackerToken);
    if (!char) {
      showToast('Tylko postać gracza może rzucać czary z karty', 'warning');
      return;
    }
    const spells = typeof DndSpells !== 'undefined' ? DndSpells.parseSpellsKnown(char) : [];
    const combatSpells = spells.filter((s) => s.attackType === 'attack' || s.attackType === 'save');
    if (!combatSpells.length) {
      showToast('Brak czarów ofensywnych na karcie', 'warning');
      return;
    }
    this.targeting = { mode: 'spell', attackerTokenId: attackerToken.id, spell: null, characterId: char.id, spellList: combatSpells };
    this.showSpellPicker(combatSpells, attackerToken, char);
  },

  _turnStateFor(tokenId) {
    const cs = BattleMap.settings?.combat_state;
    if (!cs) return null;
    let st;
    try { st = typeof cs === 'string' ? JSON.parse(cs) : cs; } catch (_e) { return null; }
    return st?.tokens?.[tokenId] || null;
  },

  _spellAvailability(spell, char, attackerTokenId) {
    const lvl = parseInt(spell.level, 10) || 0;
    const hasSlot = lvl === 0 ? true : DndSpells.hasSlot(char, lvl);
    const ctKind = DndSpells.getCastingTimeKind(spell);
    const turn = this._turnStateFor(attackerTokenId);
    const inCombat = !!turn;
    let actionOk = true;
    if (inCombat) {
      if (ctKind === 'bonus') actionOk = !turn.bonusUsed;
      else if (ctKind === 'reaction') actionOk = turn.reactionAvailable !== false;
      else actionOk = !turn.actionUsed;
    }
    return { hasSlot, actionOk, ctKind, level: lvl };
  },

  showSpellPicker(spells, attackerToken, char) {
    char = char || this.getCharacterForToken(attackerToken);
    const remaining = char ? DndSpells.getRemainingSlots(char) : {};
    const maxSlots = char ? DndSpells.getMaxSpellSlots(char.char_class, char.level) : {};

    const slotsRow = Object.keys(maxSlots).length
      ? `<div class="spell-picker-slots">${
          Object.keys(maxSlots).sort().map((lv) =>
            `<span class="slot-pill ${(remaining[lv] || 0) === 0 ? 'is-empty' : ''}" title="Sloty poziom ${lv}">${lv}: ${remaining[lv] || 0}/${maxSlots[lv]}</span>`
          ).join('')
        }</div>`
      : '';

    const rows = spells.slice(0, 16).map((s) => {
      const av = this._spellAvailability(s, char, attackerToken.id);
      const reason = !av.hasSlot ? 'Brak slotu' : (!av.actionOk ? 'Akcja zużyta' : '');
      const disabled = !av.hasSlot || !av.actionOk;
      const lvlBadge = av.level === 0
        ? '<span class="spell-pick-lvl">C</span>'
        : `<span class="spell-pick-lvl">${av.level}</span>`;
      const kindIcon = av.ctKind === 'bonus' ? '⚡' : (av.ctKind === 'reaction' ? '↩' : '');
      const aoe = DndSpells.parseAreaFromSpell(s);
      const aoeIcon = aoe.aoeShape ? '🎯' : '';
      return `<button type="button" class="btn ${disabled ? 'btn-secondary' : 'btn-primary'} btn-full map-spell-pick" data-spell-id="${escapeHtml(s.id)}" ${disabled ? `disabled title="${escapeHtml(reason)}"` : ''}>
        ${lvlBadge} ${escapeHtml(s.namePl || s.name)} ${kindIcon}${aoeIcon}
        <small>(${escapeHtml(s.range || '')}${s.damage ? ' · ' + escapeHtml(s.damage) : ''})</small>
      </button>`;
    }).join('');

    showGenericModal('Wybierz czar', `${slotsRow}<div class="map-spell-picks">${rows}</div>`);
    document.querySelectorAll('.map-spell-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        const spell = spells.find((s) => s.id === btn.dataset.spellId);
        closeModal('generic-modal');
        if (!spell) return;
        const area = DndSpells.parseAreaFromSpell(spell);
        const canPlaceAoe = BattleMap.isDm()
          || this.getCharacterForToken(attackerToken)?.user_id === App.user?.id;
        if (area.aoeShape && canPlaceAoe) {
          closeModal('generic-modal');
          MapZones.startSpellPlacement(spell, attackerToken.id);
          this.cancelTargeting();
          return;
        }
        this.targeting = { mode: 'spell', attackerTokenId: attackerToken.id, spell, characterId: this.getCharacterForToken(attackerToken)?.id };
        const rs = MapRange.spellRangeCells(spell);
        const rangeHint = rs.melee
          ? (rs.normal === 0 ? 'na siebie' : `dotyk (${rs.normalFt || 5} ft)`)
          : `${rs.normalFt || (rs.normal * 5)} ft`;
        showToast(`🪄 ${spell.namePl || spell.name}: ${rangeHint}. Kliknij cel`, 'info');
        BattleMap.render();
      });
    });
  },

  onAooTrigger(data) {
    if (App.currentCampaign?.role !== 'dm') return;
    if (!data?.attackerTokenId) return;
    this._aooQueue = this._aooQueue || [];
    this._aooQueue.push(data);
    if (!this._aooActive) this._showNextAoo();
  },

  onAooReactionResult(data) {
    if (data?.ok) showToast('Reakcja zużyta', 'info');
    else if (data?.reason === 'no_reaction') showToast('Token nie miał już reakcji', 'warning');
  },

  _showNextAoo() {
    if (!this._aooQueue?.length) {
      this._aooActive = false;
      return;
    }
    this._aooActive = true;
    const data = this._aooQueue.shift();
    const attacker = BattleMap.tokens.find((t) => t.id === data.attackerTokenId);
    const target = BattleMap.tokens.find((t) => t.id === data.targetTokenId);
    const attackerChar = attacker ? this.getCharacterForToken(attacker) : null;

    let defaultBonus = 0;
    let defaultDamage = '1d6';
    let defaultName = data.attackerName || 'Stwór';

    if (attackerChar) {
      const weapons = Dice.getCharacterWeapons(attackerChar);
      const melee = weapons.find((w) => !(w.properties || []).includes('ranged')) || weapons[0];
      if (melee) {
        defaultBonus = Dice.weaponAttackBonus(attackerChar, melee);
        const dmgBonus = Dice.weaponDamageBonus(attackerChar, melee);
        defaultDamage = `${melee.damage || '1d6'}${dmgBonus ? (dmgBonus >= 0 ? '+' : '') + dmgBonus : ''}`;
        defaultName = melee.name;
      }
    } else if (attacker?.stat_notes) {
      const m = attacker.stat_notes.match(/atak[:\s]*\+?(\-?\d+)/i);
      if (m) defaultBonus = parseInt(m[1], 10) || 0;
      const dm = attacker.stat_notes.match(/dmg[:\s]*([0-9d+\- ]+)/i);
      if (dm) defaultDamage = dm[1].trim() || '1d6';
    }

    const body = `
      <p class="info-text"><strong>${escapeHtml(data.attackerName)}</strong> dostaje atak okazyjny na uciekającego <strong>${escapeHtml(data.targetName)}</strong>.</p>
      <p class="sheet-hint">Cel wyszedł z zasięgu 5 ft. Atakuj jedną bronią walki w zwarciu (kosztem reakcji) lub pomiń.</p>
      <div class="aoo-form">
        <label>Broń / nazwa
          <input type="text" id="aoo-weapon-name" class="input-sm" value="${escapeHtml(defaultName)}">
        </label>
        <label>Modyfikator ataku
          <input type="number" id="aoo-attack-bonus" class="input-sm" value="${defaultBonus}">
        </label>
        <label>Obrażenia (kości)
          <input type="text" id="aoo-damage" class="input-sm" value="${escapeHtml(defaultDamage)}" placeholder="1d8+3">
        </label>
        <label class="aoo-flags">
          <input type="checkbox" id="aoo-advantage"> Przewaga
          <input type="checkbox" id="aoo-disadvantage"> Utrudnienie
        </label>
      </div>
      <div class="aoo-actions">
        <button type="button" id="btn-aoo-roll" class="btn btn-primary">🎲 Rzuć atak okazyjny</button>
        <button type="button" id="btn-aoo-skip" class="btn btn-secondary">Pomiń</button>
      </div>
    `;
    showGenericModal('⚔ Atak okazyjny!', body);

    const cleanup = () => {
      closeModal('generic-modal');
      this._aooActive = false;
      setTimeout(() => this._showNextAoo(), 50);
    };

    document.getElementById('btn-aoo-skip')?.addEventListener('click', cleanup);
    document.getElementById('btn-aoo-roll')?.addEventListener('click', () => {
      const wname = document.getElementById('aoo-weapon-name')?.value || 'AoO';
      const bonus = parseInt(document.getElementById('aoo-attack-bonus')?.value, 10) || 0;
      const dmgExpr = document.getElementById('aoo-damage')?.value?.trim() || '1d6';
      const adv = document.getElementById('aoo-advantage')?.checked;
      const dis = document.getElementById('aoo-disadvantage')?.checked;
      this._resolveAoo({
        attackerTokenId: data.attackerTokenId,
        targetTokenId: data.targetTokenId,
        attackerName: data.attackerName,
        targetName: data.targetName,
        weaponName: wname,
        attackBonus: bonus,
        damageExpr: dmgExpr,
        advantage: adv,
        disadvantage: dis,
      });
      cleanup();
    });
  },

  _rollD20() {
    return Math.floor(Math.random() * 20) + 1;
  },

  _rollExpr(expr) {
    let total = 0;
    const detail = [];
    const tokens = expr.replace(/\s+/g, '').match(/([+\-]?\d*d\d+|[+\-]?\d+)/gi) || [];
    for (const t of tokens) {
      const sign = t.startsWith('-') ? -1 : 1;
      const body = t.replace(/^[+\-]/, '');
      const m = body.match(/^(\d*)d(\d+)$/i);
      if (m) {
        const n = parseInt(m[1] || '1', 10);
        const sides = parseInt(m[2], 10);
        let sub = 0;
        const rolls = [];
        for (let i = 0; i < n; i++) {
          const r = Math.floor(Math.random() * sides) + 1;
          rolls.push(r);
          sub += r;
        }
        total += sign * sub;
        detail.push(`${sign < 0 ? '-' : ''}${n}d${sides}[${rolls.join(',')}]`);
      } else {
        const n = parseInt(body, 10) || 0;
        total += sign * n;
        detail.push(`${sign < 0 ? '-' : '+'}${n}`);
      }
    }
    return { total: Math.max(0, total), detail: detail.join(' ') };
  },

  _resolveAoo(opts) {
    const r1 = this._rollD20();
    const r2 = this._rollD20();
    let attackRoll;
    let rollLabel;
    if (opts.advantage && !opts.disadvantage) {
      attackRoll = Math.max(r1, r2);
      rollLabel = `${r1}/${r2}→${attackRoll} (Przewaga)`;
    } else if (opts.disadvantage && !opts.advantage) {
      attackRoll = Math.min(r1, r2);
      rollLabel = `${r1}/${r2}→${attackRoll} (Utrudnienie)`;
    } else {
      attackRoll = r1;
      rollLabel = `${r1}`;
    }
    const isCrit = attackRoll === 20;
    const isFumble = attackRoll === 1;
    const atkTotal = attackRoll + opts.attackBonus;

    let dmg = { total: 0, detail: '' };
    if (!isFumble) {
      dmg = this._rollExpr(opts.damageExpr);
      if (isCrit) {
        const extra = this._rollExpr(opts.damageExpr.replace(/([+\-]\d+)$/, ''));
        dmg.total += extra.total;
        dmg.detail += ` + KRYT(${extra.detail})`;
      }
    }

    const bonusStr = `${opts.attackBonus >= 0 ? '+' : ''}${opts.attackBonus}`;
    const atkExpr = `1d20${bonusStr} (AoO: ${opts.weaponName} → ${opts.targetName})`;
    App.socket?.emit('dice-roll', {
      expression: atkExpr,
      rolls: opts.advantage || opts.disadvantage ? [r1, r2] : [r1],
      total: atkTotal,
      rollType: isFumble ? 'PUDŁO' : (isCrit ? 'KRYT' : 'AoO'),
      characterName: opts.attackerName,
    });

    if (!isFumble && dmg.total > 0) {
      App.socket?.emit('dice-roll', {
        expression: `${opts.damageExpr}${isCrit ? ' KRYT' : ''} (obrażenia AoO → ${opts.targetName})`,
        rolls: [dmg.total],
        total: dmg.total,
        rollType: 'AoO obrażenia',
        characterName: opts.attackerName,
      });
    }

    const toastMsg = isFumble
      ? `⚔ AoO ${opts.attackerName} → ${opts.targetName}: PUDŁO (1)!`
      : `⚔ AoO ${opts.attackerName} → ${opts.targetName}: atak ${atkTotal}${isCrit ? ' KRYT!' : ''}, obrażenia ${dmg.total}`;
    showToast(toastMsg, isFumble ? 'warning' : 'info');

    App.socket?.emit('combat-aoo-spend-reaction', { attackerTokenId: opts.attackerTokenId });

    if (!isFumble && dmg.total > 0) {
      App.socket?.emit('combat-apply-damage', {
        attackerTokenId: opts.attackerTokenId,
        targetTokenId: opts.targetTokenId,
        amount: dmg.total,
      });
    }
  },

  startAttackFromSidebar() {
    const tokenId = this.getActiveTokenId();
    const token = BattleMap.tokens.find((t) => t.id === tokenId);
    if (!token) {
      showToast('Brak aktywnego tokena na mapie', 'warning');
      return;
    }
    this.startAttackTargeting(token);
  },

  startSpellFromSidebar() {
    const tokenId = this.getActiveTokenId();
    const token = BattleMap.tokens.find((t) => t.id === tokenId);
    if (!token) {
      showToast('Brak aktywnego tokena na mapie', 'warning');
      return;
    }
    this.startSpellTargeting(token);
  },

  startMapSpellAoe() {
    const tokenId = this.getActiveTokenId();
    const token = BattleMap.tokens.find((t) => t.id === tokenId);
    if (!token) {
      showToast('Wybierz aktywny token (inicjatywa)', 'warning');
      return;
    }
    const char = this.getCharacterForToken(token);
    let spells = [];
    if (char && typeof DndSpells !== 'undefined') {
      // Tylko czary, które postać zna i które mają obszar
      spells = DndSpells.parseSpellsKnown(char).filter((s) => {
        const a = DndSpells.parseAreaFromSpell(s);
        return a.aoeShape && (s.attackType === 'save' || s.damage);
      });
    }
    // Fallback dla MG sterujących NPC bez karty postaci: wybór z katalogu
    // (NPC nie ma slotów/akcji w sensie 5e — serwer pominie walidację)
    if (!spells.length && BattleMap.isDm() && typeof DndSpells !== 'undefined') {
      spells = DndSpells.SPELL_TEMPLATES.filter((t) => t.aoeShape && t.attackType === 'save')
        .map((t) => DndSpells.spellFromTemplate(t.id));
    }
    if (!spells.length) {
      showToast(char ? 'Brak czarów obszarowych na karcie postaci' : 'Brak czarów obszarowych', 'warning');
      return;
    }
    this.showSpellPicker(spells, token, char);
  },

  cancelTargeting() {
    this.targeting = null;
    BattleMap.render();
  },

  async handleTargetClick(targetToken) {
    if (!this.targeting) return false;
    const attacker = BattleMap.tokens.find((t) => t.id === this.targeting.attackerTokenId);
    if (!attacker || !targetToken) return true;

    if (targetToken.id === attacker.id) {
      showToast('Nie możesz celować w siebie', 'warning');
      return true;
    }

    const requestId = `tgt-${++this._requestSeq}`;
    this.targeting.pendingRequestId = requestId;

    App.socket?.emit('combat-validate-target', {
      requestId,
      attackerTokenId: attacker.id,
      targetTokenId: targetToken.id,
      weapon: this.targeting.weapon || null,
      spell: this.targeting.spell || null,
      characterId: this.targeting.characterId || null,
      weaponId: this.targeting.weapon?.id || this.targeting.weapon?.templateId || null,
      spendAction: true
    });
    return true;
  },

  onTargetResult(data) {
    if (this.targeting?.pendingRequestId && data.requestId !== this.targeting.pendingRequestId) return;

    if (!data.ok) {
      const msg = data.reason === 'out_of_range'
        ? 'Cel poza zasięgiem'
        : data.reason === 'no_los'
          ? 'Brak linii wzroku'
          : data.reason === 'action_used'
            ? 'Akcja już wykorzystana'
            : data.reason === 'not_your_turn'
              ? 'To nie twoja tura'
              : 'Nie można zaatakować tego celu';
      showToast(msg, 'warning');
      return;
    }

    const attacker = BattleMap.tokens.find((t) => t.id === this.targeting.attackerTokenId);
    const target = BattleMap.tokens.find((t) => t.id === data.target?.id || data.targetTokenId);
    const targetToken = target || BattleMap.tokens.find((t) => t.id === data.target?.id);

    const ctx = {
      attackerTokenId: attacker?.id,
      targetTokenId: targetToken?.id,
      targetName: targetToken?.entity_name
    };

    // 5e: w długim zasięgu broni dystansowej atak ma utrudnienie
    const longRange = data?.rangeCheck?.band === 'long';
    if (longRange) {
      showToast('Długi zasięg — atak z utrudnieniem', 'warning');
    }

    if (this.targeting.mode === 'attack') {
      const char = this.getCharacterForToken(attacker);
      if (char && this.targeting.weapon) {
        Dice.executeWeaponAttack(char, this.targeting.weapon, { mapContext: ctx, forceDisadvantage: longRange });
      }
    } else if (this.targeting.mode === 'spell' && this.targeting.spell) {
      const char = this.getCharacterForToken(attacker);
      if (char) {
        const mode = this.targeting.spell.attackType === 'save' ? 'save' : 'attack';
        Dice.rollSpell(char, this.targeting.spell, mode);
      }
    }

    const fxType = MapTactics.attackAnimationType(this.targeting.weapon, this.targeting.spell);
    this.emitAttackFx(attacker, targetToken, fxType);
    this.cancelTargeting();
    this.load();
  },

  emitAttackFx(attacker, target, type) {
    if (!attacker || !target || !App.socket) return;
    App.socket.emit('combat-attack-fx', {
      type,
      fromTokenId: attacker.id,
      toTokenId: target.id
    });
    this.playAttackFx({
      type,
      fromTokenId: attacker.id,
      toTokenId: target.id
    }, true);
  },

  playAttackFx(data, localOnly) {
    const from = BattleMap.tokens.find((t) => t.id === data.fromTokenId);
    const to = BattleMap.tokens.find((t) => t.id === data.toTokenId);
    if (!from || !to) return;
    const gs = BattleMap.settings?.grid_size || 40;
    const a = MapTactics.tokenAnchor(from);
    const b = MapTactics.tokenAnchor(to);
    this.attackEffects.push({
      type: data.type || 'melee',
      x1: a.x * gs + gs / 2,
      y1: a.y * gs + gs / 2,
      x2: b.x * gs + gs / 2,
      y2: b.y * gs + gs / 2,
      expires: Date.now() + 700,
      miss: !!data.miss
    });
    BattleMap.render();
  },

  drawEffects(ctx) {
    const now = Date.now();
    this.attackEffects = this.attackEffects.filter((fx) => fx.expires > now);
    this.attackEffects.forEach((fx) => {
      const t = 1 - (fx.expires - now) / 700;
      ctx.save();
      if (fx.type === 'ranged') {
        ctx.strokeStyle = `rgba(201, 162, 39, ${0.9 - t * 0.5})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fx.x1, fx.y1);
        ctx.lineTo(fx.x2 + (fx.x2 - fx.x1) * t * 0.1, fx.y2 + (fx.y2 - fx.y1) * t * 0.1);
        ctx.stroke();
      } else if (fx.type === 'magic') {
        ctx.fillStyle = `rgba(120, 80, 200, ${0.6 - t * 0.4})`;
        ctx.beginPath();
        ctx.arc(fx.x2, fx.y2, 8 + t * 20, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = `rgba(166, 61, 47, ${0.9 - t * 0.5})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(fx.x2, fx.y2, 6 + t * 14, -0.5, 1.2);
        ctx.stroke();
      }
      if (fx.miss) {
        ctx.fillStyle = '#a63d2f';
        ctx.font = 'bold 14px Cinzel, serif';
        ctx.fillText('MISS', fx.x2, fx.y2 - 10);
      }
      ctx.restore();
    });
  },

  drawRangeOverlay(ctx, gs) {
    if (this.targeting) {
      this._drawAttackRange(ctx, gs);
      return;
    }
    this.drawMovementRange(ctx, gs);
  },

  _drawAttackRange(ctx, gs) {
    const attacker = BattleMap.tokens.find((t) => t.id === this.targeting.attackerTokenId);
    if (!attacker) return;

    let normalCells = 1;
    let longCells = 0;
    let isMelee = true;
    if (this.targeting.weapon) {
      const r = MapRange.weaponRangeCells(this.targeting.weapon);
      normalCells = r.normal || 1;
      longCells = r.long || 0;
      isMelee = !!r.melee;
    } else if (this.targeting.spell) {
      const r = MapRange.spellRangeCells(this.targeting.spell);
      normalCells = r.normal || 6;
      longCells = 0;
      isMelee = !!r.melee;
    }

    // Klamruj zasięg do rozmiarów siatki — ranged weapons w 5e mogą mieć 600ft = 120 kratek,
    // a rysowanie 241x241 = 58k komórek per frame zawiesza przeglądarkę.
    const gw = BattleMap.settings?.grid_width || 25;
    const gh = BattleMap.settings?.grid_height || 18;
    const maxDim = Math.max(gw, gh);
    const drawNormal = Math.min(normalCells, maxDim);
    const drawLong = longCells ? Math.min(longCells, maxDim) : 0;
    const drawMax = Math.max(drawNormal, drawLong);

    const anchor = MapTactics.tokenAnchor(attacker);
    const minX = Math.max(0, anchor.x - drawMax);
    const maxX = Math.min(gw - 1, anchor.x + drawMax);
    const minY = Math.max(0, anchor.y - drawMax);
    const maxY = Math.min(gh - 1, anchor.y + drawMax);

    ctx.save();
    // 5e: w długim zasięgu atakujesz z utrudnieniem → inny kolor
    const normalFill = isMelee ? 'rgba(166, 61, 47, 0.18)' : 'rgba(70, 200, 120, 0.16)';
    const normalStroke = isMelee ? 'rgba(166, 61, 47, 0.45)' : 'rgba(70, 200, 120, 0.5)';
    const longFill = 'rgba(220, 170, 70, 0.10)';
    const longStroke = 'rgba(220, 170, 70, 0.35)';

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = Math.abs(x - anchor.x);
        const dy = Math.abs(y - anchor.y);
        const d = Math.max(dx, dy);
        if (d === 0) continue;
        if (d <= drawNormal) {
          ctx.fillStyle = normalFill;
          ctx.strokeStyle = normalStroke;
        } else if (d <= drawLong) {
          ctx.fillStyle = longFill;
          ctx.strokeStyle = longStroke;
        } else {
          continue;
        }
        ctx.fillRect(x * gs, y * gs, gs, gs);
        ctx.strokeRect(x * gs + 0.5, y * gs + 0.5, gs - 1, gs - 1);
      }
    }

    // Podświetl wrogie tokeny w zasięgu (zielony obrys w normalnym, żółty w długim)
    BattleMap.tokens.forEach((t) => {
      if (t.id === attacker.id) return;
      const ta = MapTactics.tokenAnchor(t);
      const dx = Math.abs(ta.x - anchor.x);
      const dy = Math.abs(ta.y - anchor.y);
      const d = Math.max(dx, dy);
      if (d > drawLong && d > drawNormal) return;
      const inLong = drawLong && d > drawNormal && d <= drawLong;
      ctx.strokeStyle = inLong ? 'rgba(255, 210, 80, 0.95)' : 'rgba(80, 220, 120, 0.95)';
      ctx.lineWidth = 3;
      const size = (t.size || 1) * gs;
      ctx.beginPath();
      ctx.arc(t.x * gs + size / 2, t.y * gs + size / 2, size * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  },

  drawMovementRange(ctx, gs) {
    if (!this.isMovementLimited()) return;

    const activeId = this.getActiveTokenId();
    const token = activeId
      ? BattleMap.tokens.find((t) => t.id === activeId)
      : BattleMap.tokens.find((t) => t.id === BattleMap.selectedTokenId);
    if (!token) return;

    const isDm = App.currentCampaign?.role === 'dm';
    const showForActive = this.isTokenTurn(token.id) || isDm;
    if (!showForActive) return;

    const rangeCells = this.getMovementRangeCells(token.id);
    if (rangeCells <= 0) return;

    const anchor = MapTactics.tokenAnchor(token);
    const gw = BattleMap.settings?.grid_width || 25;
    const gh = BattleMap.settings?.grid_height || 18;
    const isDragging = BattleMap.isDragging && BattleMap.dragToken?.id === token.id;

    ctx.save();
    ctx.fillStyle = isDragging ? 'rgba(76, 175, 80, 0.22)' : 'rgba(76, 175, 80, 0.14)';
    ctx.strokeStyle = isDragging ? 'rgba(76, 175, 80, 0.55)' : 'rgba(76, 175, 80, 0.35)';
    ctx.lineWidth = 1;

    for (let dy = -rangeCells; dy <= rangeCells; dy++) {
      for (let dx = -rangeCells; dx <= rangeCells; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) > rangeCells) continue;
        const x = anchor.x + dx;
        const y = anchor.y + dy;
        if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        ctx.fillRect(x * gs, y * gs, gs, gs);
        ctx.strokeRect(x * gs + 0.5, y * gs + 0.5, gs - 1, gs - 1);
      }
    }

    if (BattleMap.isDragging && BattleMap.dragToken?.id === token.id && BattleMap.dragStartX != null) {
      const fromX = BattleMap.dragStartX;
      const fromY = BattleMap.dragStartY;
      const toX = token.x;
      const toY = token.y;
      const cost = typeof MapZones !== 'undefined' && MapZones.zones?.length
        ? MapZones.movementCostFt(fromX, fromY, toX, toY)
        : MapTactics.cellsToFeet(MapTactics.chebyshevCells(fromX, fromY, toX, toY));
      const remaining = this.getRemainingMovementFt(token.id) ?? 0;
      ctx.fillStyle = cost > remaining ? 'rgba(166, 61, 47, 0.85)' : 'rgba(201, 162, 39, 0.9)';
      ctx.font = 'bold 12px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${cost} ft`, toX * gs + gs / 2, toY * gs - 4);
      ctx.textAlign = 'start';
    }

    ctx.restore();
  },

  drawBlocking(ctx, gs) {
    if (!this.blocking.size) return;
    ctx.save();
    ctx.fillStyle = 'rgba(60, 40, 30, 0.55)';
    this.blocking.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      ctx.fillRect(x * gs, y * gs, gs, gs);
    });
    ctx.restore();
  },

  rollSave(ability, token) {
    const char = token
      ? this.getCharacterForToken(token)
      : (Characters.activeCharacter || Characters.myCampaignCharacter);
    if (!char) {
      showToast('Brak postaci do rzutu obronnego', 'warning');
      return;
    }
    const ab = ability || 'dexterity';
    Dice.rollSavingThrow(ab, char);
  },

  applyDamageToTarget(targetTokenId, amount) {
    App.socket?.emit('combat-apply-damage', {
      targetTokenId,
      amount,
      attackerTokenId: this.getActiveTokenId()
    });
  }
};
