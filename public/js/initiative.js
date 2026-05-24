// ===== Initiative Module =====
const Initiative = {
  entries: [],
  round: 1,
  _wasMyTurn: false,
  _listClickBound: false,

  init() {
    document.getElementById('btn-roll-initiative').addEventListener('click', () => this.rollForCharacter());
    document.getElementById('btn-add-initiative').addEventListener('click', () => this.showAddDialog());
    document.getElementById('btn-end-turn').addEventListener('click', () => this.endTurn());
    document.getElementById('btn-next-turn')?.addEventListener('click', () => {
      App.socket?.emit('initiative-next');
    });
    document.getElementById('btn-clear-initiative').addEventListener('click', () => {
      if (confirm('Wyczyścić tracker inicjatywy?')) {
        App.socket?.emit('initiative-clear');
      }
    });

    const list = document.getElementById('initiative-list');
    if (list && !this._listClickBound) {
      this._listClickBound = true;
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-init-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.initAction === 'set-active') this.setActive(id);
        if (btn.dataset.initAction === 'remove') this.remove(id);
      });
    }
  },

  load() {
    App.socket?.emit('get-initiative');
  },

  update(payload) {
    if (Array.isArray(payload)) {
      this.entries = payload;
    } else {
      this.entries = payload.entries || [];
      this.round = payload.round ?? 1;
    }
    this.render();
    this.updateTurnUi();
  },

  getActiveEntry() {
    return this.entries.find((e) => e.is_active);
  },

  isDmTurn(entry) {
    return entry && entry.entity_type !== 'player';
  },

  isMyCharacterTurn(entry) {
    if (!entry || entry.entity_type !== 'player') return false;
    const myId = Characters.myCampaignCharacter?.id;
    return myId && entry.entity_id === myId;
  },

  canEndTurn() {
    const active = this.getActiveEntry();
    if (!active) return false;
    const isDm = App.currentCampaign?.role === 'dm';
    if (isDm) return true;
    return this.isMyCharacterTurn(active);
  },

  getCharacterForEntry(entry) {
    if (!entry || entry.entity_type !== 'player' || !entry.entity_id) return null;
    const list = Characters.campaignCharacters || [];
    return list.find((c) => c.id === entry.entity_id) || null;
  },

  entryAvatarHtml(entry, sizeClass = '') {
    const char = this.getCharacterForEntry(entry);
    if (char?.avatar_url) {
      return `<img src="${escapeHtml(char.avatar_url)}" alt="" class="${sizeClass}">`;
    }
    const icons = { player: '🎮', npc: '🧙', monster: '👹' };
    const letter = (entry.entity_name || '?').charAt(0).toUpperCase();
    const inner = icons[entry.entity_type] || letter;
    return `<span class="init-avatar-letter" aria-hidden="true">${inner}</span>`;
  },

  renderOrderTrack() {
    const track = document.getElementById('init-order-track');
    if (!track) return;
    if (!this.entries.length) {
      track.innerHTML = '';
      return;
    }
    const activeIdx = this.entries.findIndex((e) => e.is_active);
    const nextIdx = activeIdx >= 0 ? (activeIdx + 1) % this.entries.length : -1;
    track.innerHTML = this.entries.map((entry, i) => {
      const cls = [
        'init-order-chip',
        entry.is_active ? 'init-order-active' : '',
        i === nextIdx && !entry.is_active ? 'init-order-next' : ''
      ].filter(Boolean).join(' ');
      const short = entry.entity_name.length > 10
        ? `${escapeHtml(entry.entity_name.slice(0, 9))}…`
        : escapeHtml(entry.entity_name);
      return `<span class="${cls}" title="${escapeHtml(entry.entity_name)} (${entry.initiative_roll})">
        <span class="init-order-dot"></span>
        <span>${short}</span>
      </span>`;
    }).join('');
  },

  updateHero() {
    const active = this.getActiveEntry();
    const hero = document.getElementById('init-hero');
    const roundNum = document.getElementById('init-round-num');
    const heroStatus = document.getElementById('init-hero-status');
    const heroName = document.getElementById('init-hero-name');
    const heroPortrait = document.getElementById('init-hero-portrait');
    const roundEl = document.getElementById('current-round');
    const isPlayerTurn = active && this.isMyCharacterTurn(active);
    const isDm = App.currentCampaign?.role === 'dm';
    const dmControlsNpc = isDm && active && this.isDmTurn(active);

    if (roundNum) {
      roundNum.textContent = this.entries.length ? String(this.round) : '—';
    }
    if (roundEl) {
      if (active) {
        roundEl.textContent = `Runda ${this.round} · Tura: ${active.entity_name}`;
      } else {
        roundEl.textContent = this.entries.length ? `Runda ${this.round}` : 'Runda: —';
      }
    }

    if (hero) {
      hero.classList.remove('init-hero-idle', 'init-hero-active', 'init-hero-your-turn', 'init-hero-dm-turn');
      if (!this.entries.length) {
        hero.classList.add('init-hero-idle');
      } else if (isPlayerTurn) {
        hero.classList.add('init-hero-your-turn');
      } else if (dmControlsNpc) {
        hero.classList.add('init-hero-dm-turn');
      } else if (active) {
        hero.classList.add('init-hero-active');
      } else {
        hero.classList.add('init-hero-idle');
      }
    }

    if (heroStatus && heroName) {
      if (!this.entries.length) {
        heroStatus.textContent = 'Gotowość do walki';
        heroName.textContent = 'Dodaj uczestników do kolejki';
      } else if (isPlayerTurn) {
        heroStatus.textContent = 'Twoja tura';
        heroName.textContent = active.entity_name;
      } else if (dmControlsNpc) {
        heroStatus.textContent = 'Tura MG';
        heroName.textContent = active.entity_name;
      } else if (active) {
        heroStatus.textContent = 'Teraz gra';
        heroName.textContent = active.entity_name;
      } else {
        heroStatus.textContent = `Runda ${this.round}`;
        heroName.textContent = 'Wybierz aktywną postać (MG)';
      }
    }

    if (heroPortrait) {
      if (active) {
        heroPortrait.innerHTML = this.entryAvatarHtml(active);
      } else {
        heroPortrait.textContent = '⚔️';
      }
    }

    this.renderOrderTrack();
  },

  updateTurnUi() {
    const active = this.getActiveEntry();
    const isMyTurn = this.canEndTurn();
    const isPlayerTurn = active && this.isMyCharacterTurn(active);
    const isDm = App.currentCampaign?.role === 'dm';
    const dmControlsNpc = isDm && active && this.isDmTurn(active);

    const banner = document.getElementById('initiative-turn-banner');
    const endBtn = document.getElementById('btn-end-turn');
    const hintEl = document.getElementById('initiative-turn-hint');

    this.updateHero();

    if (banner) {
      if (isPlayerTurn) {
        banner.className = 'initiative-turn-banner your-turn';
        banner.textContent = '⚔️ Twoja tura! Zakończ turę, gdy skończysz akcje.';
      } else if (dmControlsNpc) {
        banner.className = 'initiative-turn-banner dm-turn';
        banner.textContent = `⚔️ Tura MG: ${active.entity_name} — zakończ turę, gdy NPC skończy.`;
      } else if (active) {
        banner.className = 'initiative-turn-banner waiting';
        banner.textContent = `⏳ Teraz gra: ${active.entity_name}`;
      } else {
        banner.className = 'initiative-turn-banner hidden';
        banner.textContent = '';
      }
    }

    if (endBtn) {
      endBtn.disabled = !isMyTurn;
      endBtn.classList.toggle('hidden', !active);
      endBtn.title = isMyTurn
        ? 'Przekaż turę następnej postaci w kolejce'
        : 'Przycisk aktywny tylko na twojej turze (gracz) lub turze MG (NPC)';
    }

    const nextBtn = document.getElementById('btn-next-turn');
    if (nextBtn) {
      nextBtn.classList.toggle('hidden', !isDm);
    }

    if (hintEl) {
      const isDmRole = App.currentCampaign?.role === 'dm';
      hintEl.textContent = isDmRole
        ? 'Gracze rzucają inicjatywę własną postacią. MG dodaje NPC/potwory i kończy ich tury.'
        : 'Rzuć inicjatywę swoją postacią (aktywna w panelu Postacie). Na swojej turze kliknij „Zakończ turę”.';
    }

    document.querySelectorAll('.initiative-entry').forEach((el) => {
      const id = el.dataset.id;
      const entry = this.entries.find((e) => e.id === id);
      el.classList.toggle('your-turn-entry', entry && this.isMyCharacterTurn(entry) && entry.is_active);
    });

    if (isPlayerTurn && !this._wasMyTurn) {
      showToast('Twoja tura!', 'success');
      document.querySelector('.session-tab[data-panel="map-panel"]')?.click();
    }
    this._wasMyTurn = isPlayerTurn;
    if (typeof PlayerHud !== 'undefined') PlayerHud.render();
  },

  render() {
    const container = document.getElementById('initiative-list');
    if (this.entries.length === 0) {
      container.innerHTML = `
        <div class="initiative-empty">
          <div class="init-empty-icon" aria-hidden="true">⚔️</div>
          <p><strong>Kolejka inicjatywy jest pusta</strong></p>
          <p class="sheet-hint">Każdy gracz rzuca inicjatywę swoją postacią. MG dodaje NPC i potwory do walki.</p>
        </div>`;
      this.updateTurnUi();
      return;
    }

    const isDm = App.currentCampaign?.role === 'dm';
    const myCharId = Characters.myCampaignCharacter?.id;
    const activeIdx = this.entries.findIndex((e) => e.is_active);
    const nextIdx = activeIdx >= 0 ? (activeIdx + 1) % this.entries.length : -1;

    container.innerHTML = this.entries.map((entry, index) => {
      const isMine = entry.entity_type === 'player' && entry.entity_id === myCharId;
      const active = entry.is_active;
      const isNext = index === nextIdx && !active;
      const typeClass = `type-${entry.entity_type || 'other'}`;
      const entryClasses = [
        'initiative-entry',
        active ? 'active' : '',
        isMine ? 'my-character' : '',
        isNext ? 'init-entry-next' : ''
      ].filter(Boolean).join(' ');

      return `
      <div class="${entryClasses}" data-id="${entry.id}" data-map-token="${entry.map_token_id || ''}">
        <div class="init-rank">${index + 1}</div>
        <div class="init-avatar ${typeClass}">${this.entryAvatarHtml(entry)}</div>
        <div class="init-body">
          <div class="init-name">
            <span>${escapeHtml(entry.entity_name)}</span>
            ${active ? '<span class="init-now-badge">Teraz</span>' : ''}
            ${isNext ? '<span class="init-next-badge">Następny</span>' : ''}
            ${isMine ? '<span class="init-you-badge">Ty</span>' : ''}
          </div>
          <div class="init-meta">
            <span class="init-type ${typeClass}">${this.typeLabel(entry.entity_type)}</span>
            ${entry.map_token_id ? '<span class="init-map-link" title="Token na mapie">🗺️ Mapa</span>' : ''}
          </div>
        </div>
        <div class="init-roll-badge" title="Wynik inicjatywy">
          <span class="init-roll-num">${entry.initiative_roll}</span>
          <span class="init-roll-lbl">init</span>
        </div>
        <div class="init-actions">
          ${isDm ? `
            <button type="button" class="btn btn-sm btn-secondary" data-init-action="set-active" data-id="${entry.id}" title="Ustaw aktywny">▶</button>
            <button type="button" class="btn btn-sm btn-danger" data-init-action="remove" data-id="${entry.id}" title="Usuń">✕</button>
          ` : ''}
        </div>
      </div>`;
    }).join('');

    this.updateTurnUi();
  },

  typeLabel(type) {
    switch (type) {
      case 'player': return 'Gracz';
      case 'npc': return 'NPC';
      case 'monster': return 'Potwór';
      default: return type;
    }
  },

  rollForCharacter() {
    const char = Characters.activeCharacter || Characters.myCampaignCharacter;
    if (!char) {
      showToast('Wybierz swoją postać w panelu Postacie', 'warning');
      return;
    }
    if (App.currentCampaign?.role !== 'dm' && char.user_id !== getUser()?.id) {
      showToast('Możesz rzucić inicjatywę tylko własną postacią', 'warning');
      return;
    }

    const dexMod = calcModifier(char.dexterity);
    const bonus = dexMod + (char.initiative_bonus || 0);
    const roll = Dice.rollDie(20);
    const total = roll + bonus;

    Dice.displayResult(`1d20${modString(bonus)} (Inicjatywa)`, [roll], total, 'Inicjatywa', 20);

    App.socket?.emit('initiative-add', {
      entityName: char.name,
      entityType: 'player',
      entityId: char.id,
      initiativeRoll: total,
      mapTokenId: (typeof BattleMap !== 'undefined'
        ? BattleMap.tokens.find((t) => t.entity_type === 'player' && t.entity_id === char.id)?.id
        : '') || ''
    });

    App.socket?.emit('dice-roll', {
      expression: `1d20${modString(bonus)}`,
      rolls: [roll],
      total,
      rollType: 'Inicjatywa',
      characterName: char.name
    });

    showToast(`Inicjatywa ${char.name}: ${total}`, 'success');
  },

  async showAddDialog() {
    const isDm = App.currentCampaign?.role === 'dm';
    const entities = isDm ? await EntityLink.loadEntities() : { characters: [], npcs: [] };

    const html = `
      <form id="add-init-form">
        ${isDm ? `
        <div class="form-group">
          <label>Powiąż z postacią / NPC</label>
          ${EntityLink.buildSelectHtml('init-entity-pick', entities, { includeNone: false, manualOption: true })}
        </div>` : ''}
        <div class="form-group">
          <label>Nazwa</label>
          <input type="text" id="init-name" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Typ</label>
            <select id="init-type">
              <option value="player">Gracz</option>
              <option value="npc">NPC</option>
              <option value="monster">Potwór</option>
            </select>
          </div>
          <div class="form-group">
            <label>Wartość inicjatywy</label>
            <input type="number" id="init-value" required value="10">
          </div>
        </div>
        ${isDm ? `<button type="button" class="btn btn-secondary btn-full" id="init-dm-roll" style="margin-bottom:8px;">🎲 Rzuć d20+DEX (postać gracza)</button>` : ''}
        <label style="display:block;margin:8px 0;"><input type="checkbox" id="init-sync-map" checked> Powiąż z tokenem na mapie (jeśli istnieje)</label>
        <button type="submit" class="btn btn-primary btn-full">⚔️ Dodaj do kolejki</button>
      </form>
    `;
    showGenericModal(isDm ? 'Dodaj do inicjatywy (MG)' : 'Dodaj do inicjatywy', html);

    const entityPick = document.getElementById('init-entity-pick');
    const nameInput = document.getElementById('init-name');
    const typeSelect = document.getElementById('init-type');
    EntityLink.wireSelect(entityPick, { nameInput, typeSelect });

    document.getElementById('init-dm-roll')?.addEventListener('click', async () => {
      const pick = entityPick?.value;
      if (!pick || pick === '__manual__') {
        showToast('Wybierz postać gracza z listy', 'warning');
        return;
      }
      const { entityType, entityId } = EntityLink.decodePick(pick);
      if (entityType !== 'player') {
        showToast('Wybierz postać gracza', 'warning');
        return;
      }
      const c = entities.characters.find((ch) => ch.id === entityId)
        || entities.allCharacters?.find((ch) => ch.id === entityId);
      if (!c) return;
      const bonus = calcModifier(c.dexterity) + (c.initiative_bonus || 0);
      const roll = Dice.rollDie(20);
      const total = roll + bonus;
      document.getElementById('init-value').value = total;
      nameInput.value = c.name;
      typeSelect.value = 'player';
      showToast(`Rzut: ${total}`, 'info');
    });

    document.getElementById('add-init-form').addEventListener('submit', (e) => {
      e.preventDefault();
      let entityId = '';
      let entityType = typeSelect.value;
      const pick = entityPick?.value;
      if (pick && pick !== '__manual__') {
        const decoded = EntityLink.decodePick(pick);
        entityId = decoded.entityId;
        entityType = decoded.entityType;
      }
      let mapTokenId = '';
      if (document.getElementById('init-sync-map')?.checked && entityId && typeof BattleMap !== 'undefined') {
        mapTokenId = BattleMap.tokens.find((t) => t.entity_id === entityId)?.id || '';
      }
      App.socket?.emit('initiative-add', {
        entityName: nameInput.value.trim(),
        entityType,
        entityId,
        initiativeRoll: parseInt(document.getElementById('init-value').value, 10),
        mapTokenId
      });
      closeModal('generic-modal');
    });
  },

  endTurn() {
    if (!this.canEndTurn()) {
      showToast('Nie możesz zakończyć cudzej tury', 'warning');
      return;
    }
    App.socket?.emit('initiative-end-turn');
  },

  setActive(id) {
    App.socket?.emit('initiative-set-active', { id });
  },

  remove(id) {
    App.socket?.emit('initiative-remove', { id });
  },

  highlightEntry(entryId) {
    document.querySelectorAll('.initiative-entry').forEach((el) => {
      el.classList.toggle('init-highlight', el.dataset.id === entryId);
    });
    const el = document.querySelector(`.initiative-entry[data-id="${entryId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  highlightByMapToken(mapTokenId) {
    let entry = this.entries.find((e) => e.map_token_id === mapTokenId);
    if (!entry && typeof BattleMap !== 'undefined') {
      const token = BattleMap.tokens.find((t) => t.id === mapTokenId);
      if (token?.entity_id) {
        entry = this.entries.find((e) => e.entity_id === token.entity_id);
      }
    }
    if (!entry) {
      showToast('Brak wpisu inicjatywy — użyj „Powiąż” na tokenie', 'info');
      return;
    }
    document.querySelector('.session-tab[data-panel="initiative-panel"]')?.click();
    this.highlightEntry(entry.id);
  }
};
