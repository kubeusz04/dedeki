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
      if (e.key === 'Escape') this.cancelTargeting();
    });
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
      return `<span class="${cls}" title="${escapeHtml(entry.entity_name)}">${escapeHtml(short)}</span>`;
    }).join('');

    const activeTokenId = active?.map_token_id || '';
    const turn = activeTokenId ? this.getTurnState(activeTokenId) : null;

    if (status && active) {
      let extra = '';
      if (turn) {
        extra = ` · Akcja: ${turn.actionUsed ? '✓' : '—'} · Bonus: ${turn.bonusUsed ? '✓' : '—'}`;
      }
      status.textContent = `Runda ${Initiative.round} — tura: ${active.entity_name}${extra}`;
    }

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

    wheel.classList.remove('hidden');
    const rect = BattleMap.viewport?.getBoundingClientRect() || { left: 0, top: 0 };
    wheel.style.left = `${Math.min(rect.width - 120, Math.max(8, screenX - rect.left - 90))}px`;
    wheel.style.top = `${Math.min(rect.height - 120, Math.max(8, screenY - rect.top - 90))}px`;
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
      showToast('Kliknij wroga w zasięgu', 'info');
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
    this.showSpellPicker(combatSpells, attackerToken);
  },

  showSpellPicker(spells, attackerToken) {
    const rows = spells.slice(0, 12).map((s) =>
      `<button type="button" class="btn btn-secondary btn-full map-spell-pick" data-spell-id="${escapeHtml(s.id)}">${escapeHtml(s.namePl || s.name)} <small>(${escapeHtml(s.range || '')})</small></button>`
    ).join('');
    showGenericModal('Wybierz czar', `<div class="map-spell-picks">${rows}</div>`);
    document.querySelectorAll('.map-spell-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        const spell = spells.find((s) => s.id === btn.dataset.spellId);
        closeModal('generic-modal');
        if (!spell) return;
        this.targeting = { mode: 'spell', attackerTokenId: attackerToken.id, spell, characterId: this.getCharacterForToken(attackerToken)?.id };
        showToast('Kliknij cel w zasięgu', 'info');
        BattleMap.render();
      });
    });
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

    if (this.targeting.mode === 'attack') {
      const char = this.getCharacterForToken(attacker);
      if (char && this.targeting.weapon) {
        Dice.executeWeaponAttack(char, this.targeting.weapon, { mapContext: ctx });
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
    let rangeCells = 1;
    if (this.targeting.weapon) {
      rangeCells = MapRange.weaponRangeCells(this.targeting.weapon).normal;
      const long = MapRange.weaponRangeCells(this.targeting.weapon).long;
      if (long) rangeCells = long;
    } else if (this.targeting.spell) {
      rangeCells = MapRange.spellRangeCells(this.targeting.spell).normal || 6;
    }
    const anchor = MapTactics.tokenAnchor(attacker);
    ctx.save();
    ctx.fillStyle = 'rgba(201, 162, 39, 0.12)';
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.35)';
    for (let dy = -rangeCells; dy <= rangeCells; dy++) {
      for (let dx = -rangeCells; dx <= rangeCells; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) > rangeCells) continue;
        const x = anchor.x + dx;
        const y = anchor.y + dy;
        ctx.fillRect(x * gs, y * gs, gs, gs);
        ctx.strokeRect(x * gs + 0.5, y * gs + 0.5, gs - 1, gs - 1);
      }
    }
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
      const cost = MapTactics.cellsToFeet(MapTactics.chebyshevCells(fromX, fromY, toX, toY));
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
