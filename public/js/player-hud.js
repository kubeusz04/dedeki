// ===== Player HUD (chat sidebar) =====
const PlayerHud = {
  init() {
    const hud = document.getElementById('player-hud');
    if (!hud) return;
    hud.addEventListener('click', (e) => this.onClick(e));
  },

  getCharacter() {
    return Characters.activeCharacter || Characters.myCampaignCharacter;
  },

  canEdit(c) {
    return c && Characters.canEditCharacter(c);
  },

  render() {
    const el = document.getElementById('player-hud');
    if (!el || !App.currentCampaign) return;

    const c = this.getCharacter();
    if (!c) {
      el.innerHTML = `
        <div class="hud-empty">
          <div class="hud-portrait hud-portrait-empty">?</div>
          <p class="hud-empty-title">Brak postaci</p>
          <p class="hud-empty-hint">Przypisz postać w zakładce <strong>Postacie</strong>, aby zobaczyć panel bohatera.</p>
        </div>`;
      return;
    }

    const canEdit = this.canEdit(c);
    const hpPct = c.max_hp > 0 ? Math.round((c.current_hp / c.max_hp) * 100) : 0;
    const hpClass = hpPct > 50 ? 'hp-ok' : hpPct > 25 ? 'hp-warn' : 'hp-crit';
    const conditions = Characters.parseJSON(c.conditions);
    const equipment = Characters.parseJSON(c.equipment);
    const weapons = Characters.parseJSON(c.weapons);
    const initMod = modString(calcModifier(c.dexterity) + (c.initiative_bonus || 0));
    const activeEntry = typeof Initiative !== 'undefined' ? Initiative.getActiveEntry() : null;
    const isMyTurn = typeof Initiative !== 'undefined' && Initiative.isMyCharacterTurn(activeEntry);
    const showDeath = (c.current_hp || 0) <= 0;
    const deathSaves = Characters.getDeathSaveCounts(c);

    const equipList = equipment.slice(0, 5).map((item) => {
      const name = typeof item === 'string' ? item : item.name || '?';
      const qty = item.quantity > 1 ? ` ×${item.quantity}` : '';
      return `<li>${escapeHtml(name)}${escapeHtml(qty)}</li>`;
    }).join('');

    const weaponList = weapons.slice(0, 3).map((w) => `
      <button type="button" class="hud-weapon-btn" data-hud-action="weapon-atk" data-weapon-id="${escapeHtml(w.id || '')}">
        ⚔ ${escapeHtml(w.name)} ${modString((w.isProficient !== false ? c.proficiency_bonus : 0) + calcModifier(c[DndRules.attackAbility(c, w)]))}
      </button>
    `).join('');

    el.innerHTML = `
      <div class="hud-frame ${isMyTurn ? 'hud-my-turn' : ''}">
        ${isMyTurn ? '<div class="hud-turn-alert">▶ TWOJA TURA</div>' : ''}
        <div class="hud-header">
          ${c.avatar_url
            ? `<img src="${escapeHtml(c.avatar_url)}" alt="" class="hud-portrait hud-portrait-img">`
            : `<div class="hud-portrait" title="${escapeHtml(c.name)}">${escapeHtml(c.name.charAt(0).toUpperCase())}</div>`}
          <div class="hud-title-block">
            <div class="hud-name">${escapeHtml(c.name)}</div>
            <div class="hud-sub">${escapeHtml(c.race)} · ${escapeHtml(c.char_class)} ${c.level}</div>
          </div>
        </div>

        <div class="hud-hp-block">
          <div class="hud-hp-labels">
            <span>❤️ Życie</span>
            <span class="hud-hp-numbers">${c.current_hp}/${c.max_hp}${c.temp_hp > 0 ? ` <em>+${c.temp_hp}</em>` : ''}</span>
          </div>
          <div class="hud-hp-bar" role="progressbar" aria-valuenow="${c.current_hp}" aria-valuemin="0" aria-valuemax="${c.max_hp}">
            <div class="hud-hp-fill ${hpClass}" style="width:${hpPct}%"></div>
          </div>
          ${canEdit ? `
          <div class="hud-hp-actions">
            <button type="button" class="hud-btn-sm" data-hud-action="hp" data-delta="-5">−5</button>
            <button type="button" class="hud-btn-sm" data-hud-action="hp" data-delta="-1">−1</button>
            <button type="button" class="hud-btn-sm" data-hud-action="hp" data-delta="1">+1</button>
            <button type="button" class="hud-btn-sm" data-hud-action="hp" data-delta="5">+5</button>
          </div>` : ''}
        </div>

        ${showDeath ? `
        <div class="hud-death">
          <span class="hud-death-label">Rzuty ratunkowe</span>
          <div class="hud-death-pips">
            <span title="Sukcesy">${'●'.repeat(deathSaves.successes)}${'○'.repeat(3 - deathSaves.successes)}</span>
            <span class="hud-death-sep">|</span>
            <span title="Porażki" class="hud-death-fail">${'●'.repeat(deathSaves.failures)}${'○'.repeat(3 - deathSaves.failures)}</span>
          </div>
        </div>` : ''}

        <div class="hud-stats-row">
          <div class="hud-stat" title="Klasa Pancerza"><span class="hud-stat-lbl">KP</span><span class="hud-stat-val">${c.armor_class}</span></div>
          <div class="hud-stat" title="Inicjatywa"><span class="hud-stat-lbl">INIT</span><span class="hud-stat-val">${initMod}</span></div>
          <div class="hud-stat" title="Szybkość"><span class="hud-stat-lbl">SPD</span><span class="hud-stat-val">${c.speed}</span></div>
          <div class="hud-stat" title="Biegłość"><span class="hud-stat-lbl">PB</span><span class="hud-stat-val">+${c.proficiency_bonus}</span></div>
        </div>

        <div class="hud-abilities" title="Modyfikatory cech">
          ${['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map((ab) => `
            <span class="hud-ab">${ABILITY_SHORT[ab]} ${modString(calcModifier(c[ab]))}</span>
          `).join('')}
        </div>

        ${conditions.length ? `
        <div class="hud-section">
          <div class="hud-section-title">Stany</div>
          <div class="hud-tags">
            ${conditions.map((cond) => `
              <span class="hud-tag ${canEdit ? 'hud-tag-click' : ''}" data-hud-action="cond" data-cond="${escapeHtml(cond)}">${escapeHtml(cond)}</span>
            `).join('')}
          </div>
        </div>` : ''}

        ${weapons.length ? `
        <div class="hud-section">
          <div class="hud-section-title">Broń</div>
          <div class="hud-weapons">${weaponList}</div>
        </div>` : ''}

        ${equipment.length ? `
        <div class="hud-section">
          <div class="hud-section-title">Ekwipunek</div>
          <ul class="hud-equip">${equipList}${equipment.length > 5 ? `<li class="hud-equip-more">+${equipment.length - 5} więcej…</li>` : ''}</ul>
        </div>` : ''}

        <div class="hud-actions">
          <button type="button" class="hud-btn" data-hud-action="sheet">📋 Karta</button>
          <button type="button" class="hud-btn" data-hud-action="init-roll">🎲 Init</button>
          ${isMyTurn ? '<button type="button" class="hud-btn hud-btn-turn" data-hud-action="end-turn">✓ Koniec tury</button>' : ''}
        </div>
      </div>
    `;
  },

  async onClick(e) {
    const c = this.getCharacter();
    if (!c) return;

    const btn = e.target.closest('[data-hud-action]');
    if (!btn) return;

    const action = btn.dataset.hudAction;

    if (action === 'hp' && this.canEdit(c)) {
      const delta = parseInt(btn.dataset.delta, 10);
      await Characters.quickHp(c.id, delta);
      const updated = await apiFetch(`/characters/${c.id}`);
      if (Characters.activeCharacter?.id === c.id) Characters.activeCharacter = updated;
      if (Characters.myCampaignCharacter?.id === c.id) Characters.myCampaignCharacter = updated;
      this.render();
      return;
    }

    if (action === 'sheet') {
      Characters.openSheet(c.id);
      return;
    }

    if (action === 'init-roll') {
      document.querySelector('.session-tab[data-panel="initiative-panel"]')?.click();
      Initiative.rollForCharacter();
      return;
    }

    if (action === 'end-turn') {
      Initiative.endTurn();
      return;
    }

    if (action === 'cond' && this.canEdit(c)) {
      await Characters.toggleCondition(c.id, btn.dataset.cond);
      const updated = await apiFetch(`/characters/${c.id}`);
      if (Characters.activeCharacter?.id === c.id) Characters.activeCharacter = updated;
      if (Characters.myCampaignCharacter?.id === c.id) Characters.myCampaignCharacter = updated;
      this.render();
      return;
    }

    if (action === 'weapon-atk') {
      const weapon = Characters.getWeaponById(c, btn.dataset.weaponId);
      if (weapon) Dice.rollForCharacter(c, 'weapon-attack', { weapon });
    }
  },

  refreshFromCharacter(c) {
    if (!c) {
      this.render();
      return;
    }
    if (Characters.activeCharacter?.id === c.id) Characters.activeCharacter = c;
    if (Characters.myCampaignCharacter?.id === c.id) Characters.myCampaignCharacter = c;
    this.render();
  }
};
