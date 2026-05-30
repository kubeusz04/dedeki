// ===== Characters Module =====
const Characters = {
  activeCharacter: null,
  myCampaignCharacter: null,
  sheetCharacter: null,
  sheetBound: false,
  conditionsRef: null,

  init() {
    document.getElementById('btn-assign-character')?.addEventListener('click', () => this.showAssignDialog());
    document.getElementById('btn-import-character')?.addEventListener('click', () => this.promptImport());
    document.getElementById('char-import-file')?.addEventListener('change', (e) => this.handleImportFile(e));
    this.loadConditionsRef();
  },

  async loadConditionsRef() {
    try {
      this.conditionsRef = await apiFetch('/conditions');
    } catch (_err) {
      this.conditionsRef = [];
    }
  },

  async loadCampaignCharacters() {
    if (!App.currentCampaign) return;
    try {
      const characters = await apiFetch(`/campaigns/${App.currentCampaign.id}/characters`);
      this.campaignCharacters = characters;
      this.renderCampaignCharacters(characters);
      if (typeof Initiative !== 'undefined' && Initiative.entries?.length) Initiative.render();
      if (typeof PlayerHud !== 'undefined') PlayerHud.render();
      if (typeof Chat !== 'undefined') Chat.renderCombatants();
      if (App.currentCampaign?.role === 'dm' && typeof DMPanel !== 'undefined') {
        DMPanel.loadPartyOverview();
      }
    } catch (err) {
      showToast('Błąd ładowania postaci: ' + err.message, 'error');
    }
  },

  renderCampaignCharacters(characters) {
    const container = document.getElementById('campaign-characters');
    if (characters.length === 0) {
      container.innerHTML = '<p style="color:var(--text-secondary);padding:20px;">Brak postaci w kampanii. Przypisz swoją postać!</p>';
      this.updateActiveLabel();
      return;
    }
    container.innerHTML = characters.map(c => this.renderCard(c, true)).join('');
    container.querySelectorAll('.character-card').forEach(card => {
      card.addEventListener('click', () => {
        const c = characters.find(ch => ch.id === card.dataset.id);
        if (c) this.setActiveCharacter(c);
        this.openSheet(card.dataset.id);
      });
    });

    const myChar = characters.find(c => c.user_id === getUser()?.id);
    this.myCampaignCharacter = myChar || null;
    if (typeof Initiative !== 'undefined') Initiative.updateTurnUi();
    if (myChar && (!this.activeCharacter || this.activeCharacter.user_id === getUser()?.id)) {
      this.setActiveCharacter(myChar);
    } else {
      this.updateActiveCardHighlight();
      this.updateActiveLabel();
    }
  },

  setActiveCharacter(c) {
    this.activeCharacter = c;
    if (c) {
      Dice.updateAbilityButtons(c);
      Dice.updateRollTemplates(c);
    } else {
      document.getElementById('char-select-info')?.style && (document.getElementById('char-select-info').style.display = '');
    }
    this.updateActiveCardHighlight();
    this.updateActiveLabel();
    if (typeof PlayerHud !== 'undefined') PlayerHud.render();
  },

  updateActiveCardHighlight() {
    document.querySelectorAll('.character-card').forEach(card => {
      card.classList.toggle('active', this.activeCharacter && card.dataset.id === this.activeCharacter.id);
    });
  },

  updateActiveLabel() {
    const label = document.getElementById('active-character-label');
    if (!label) return;
    if (this.activeCharacter) {
      label.textContent = `Aktywna postać: ${this.activeCharacter.name}`;
      label.classList.remove('hidden');
    } else {
      label.textContent = 'Brak aktywnej postaci — kliknij kartę';
      label.classList.remove('hidden');
    }
  },

  async applyDerivedRules(char, options = {}) {
    const { updates, derived } = DndRules.applyDerivedToCharacter(char, {
      setMaxHp: options.setMaxHp,
      fullHealOnCreate: options.fullHealOnCreate
    });
    const payload = { ...updates };
    if (options.promptMaxHp && derived.suggestedMaxHp > (char.max_hp || 0)) {
      const apply = confirm(
        `Nowe max HP według poziomu: ${derived.suggestedMaxHp}. Zastosować?`
      );
      if (apply) {
        payload.max_hp = derived.suggestedMaxHp;
        if (options.healToMax) payload.current_hp = derived.suggestedMaxHp;
      }
    }
    return { payload, derived };
  },

  canEditCharacter(c) {
    const user = getUser();
    if (!user) return false;
    if (c.user_id === user.id) return true;
    return App.currentCampaign?.role === 'dm';
  },

  renderAvatar(c, sizeClass = '') {
    const extra = sizeClass ? ` ${sizeClass}` : '';
    if (c.avatar_url) {
      return `<img src="${escapeHtml(c.avatar_url)}" alt="${escapeHtml(c.name)}" class="char-avatar-img${extra}" loading="lazy">`;
    }
    const letter = (c.name || '?').charAt(0).toUpperCase();
    return `<div class="char-avatar-fallback${extra}" aria-hidden="true">${escapeHtml(letter)}</div>`;
  },

  renderVisualSection(c, canEdit) {
    return `
      <div class="sheet-section char-visual-section char-sheet-full" id="char-visual-section">
        <h3>🖼 Wygląd postaci</h3>
        <div class="char-visual-layout">
          <div class="char-portrait-panel">
            <span class="char-visual-label">Ilustracja (cała postać)</span>
            <div class="char-portrait-frame">
              ${c.portrait_url
                ? `<img src="${escapeHtml(c.portrait_url)}" alt="Ilustracja: ${escapeHtml(c.name)}" class="char-portrait-img">`
                : `<div class="char-portrait-placeholder"><span>Brak ilustracji</span><small>PNG, JPG, WebP, GIF · max 5 MB</small></div>`}
            </div>
            ${canEdit ? `<div class="char-visual-actions">
              <button type="button" class="btn btn-sm btn-primary" data-action="upload-portrait">📷 Wgraj ilustrację</button>
              ${c.portrait_url ? '<button type="button" class="btn btn-sm btn-secondary" data-action="remove-portrait">Usuń</button>' : ''}
            </div>` : ''}
          </div>
          <div class="char-avatar-panel">
            <span class="char-visual-label">Awatar (portret)</span>
            <div class="char-avatar-frame">
              ${this.renderAvatar(c, 'char-avatar-lg')}
            </div>
            ${canEdit ? `<div class="char-visual-actions">
              <button type="button" class="btn btn-sm btn-primary" data-action="upload-avatar">📷 Wgraj awatar</button>
              ${c.avatar_url ? '<button type="button" class="btn btn-sm btn-secondary" data-action="remove-avatar">Usuń</button>' : ''}
            </div>` : ''}
            <p class="sheet-hint">Awatar pojawia się na liście postaci i w panelu przy czacie.</p>
          </div>
        </div>
        <input type="file" id="sheet-avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only-input" tabindex="-1">
        <input type="file" id="sheet-portrait-file" accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only-input" tabindex="-1">
      </div>`;
  },

  async onCharacterImageSelected(type, file) {
    if (!file || !this.sheetCharacter) return;
    try {
      const updated = await uploadCharacterImage(this.sheetCharacter.id, type, file);
      this.sheetCharacter = updated;
      if (this.activeCharacter?.id === updated.id) this.setActiveCharacter(updated);
      this.renderSheet(updated);
      this.bindSheetActions(updated, this.canEditCharacter(updated));
      if (App.currentCampaign) await this.loadCampaignCharacters();
      showToast(type === 'portrait' ? 'Ilustracja zapisana' : 'Awatar zapisany', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async removeCharacterImage(type) {
    const c = this.sheetCharacter;
    if (!c) return;
    const endpoint = type === 'portrait' ? `/characters/${c.id}/portrait` : `/characters/${c.id}/avatar`;
    try {
      const updated = await apiFetch(endpoint, { method: 'DELETE' });
      this.sheetCharacter = updated;
      if (this.activeCharacter?.id === updated.id) this.setActiveCharacter(updated);
      this.renderSheet(updated);
      this.bindSheetActions(updated, this.canEditCharacter(updated));
      if (App.currentCampaign) await this.loadCampaignCharacters();
      showToast('Obraz usunięty', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  getDeathSaveCounts(c) {
    const successes = parseInt(c?.death_save_successes, 10);
    const failures = parseInt(c?.death_save_failures, 10);
    return {
      successes: Math.max(0, Math.min(3, Number.isNaN(successes) ? 0 : successes)),
      failures: Math.max(0, Math.min(3, Number.isNaN(failures) ? 0 : failures))
    };
  },

  applyDeathSaveUpdate(charId, updated) {
    if (this.sheetCharacter?.id === charId) {
      this.sheetCharacter = updated;
      this.refreshDeathSavePips(updated);
    }
    if (this.activeCharacter?.id === charId) {
      this.activeCharacter = updated;
      if (typeof PlayerHud !== 'undefined') PlayerHud.render();
    }
  },

  async resetDeathSaves(charId) {
    const updated = await this.patchCharacterFields(charId, {
      death_save_successes: 0,
      death_save_failures: 0
    }, false);
    this.applyDeathSaveUpdate(charId, updated);
    showToast('Rzuty ratunkowe wyzerowane', 'success');
    return updated;
  },

  renderStatStepper(field, value, min, max, defaultVal) {
    const v = value ?? defaultVal ?? min;
    const def = defaultVal ?? min;
    return `<div class="stat-stepper">
      <button type="button" class="stat-step" data-field="${field}" data-delta="-1" data-min="${min}" data-max="${max}" data-default="${def}" aria-label="Zmniejsz">−</button>
      <input type="text" inputmode="numeric" value="${v}" data-field="${field}" class="stat-stepper-input" maxlength="3" autocomplete="off">
      <button type="button" class="stat-step" data-field="${field}" data-delta="1" data-min="${min}" data-max="${max}" data-default="${def}" aria-label="Zwiększ">+</button>
    </div>`;
  },

  async patchCharacterHp(charId, payload) {
    const updated = await apiFetch(`/characters/${charId}/hp`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    if (this.activeCharacter?.id === charId) this.activeCharacter = updated;
    if (this.myCampaignCharacter?.id === charId) this.myCampaignCharacter = updated;
    if (this.sheetCharacter?.id === charId) {
      this.sheetCharacter = updated;
      const hpEl = document.querySelector('#character-sheet-content [data-field="current_hp"]');
      const maxEl = document.querySelector('#character-sheet-content [data-field="max_hp"]');
      const tempEl = document.querySelector('#character-sheet-content [data-field="temp_hp"]');
      if (hpEl) hpEl.value = updated.current_hp;
      if (maxEl && payload.max_hp !== undefined) maxEl.value = updated.max_hp;
      if (tempEl && payload.temp_hp !== undefined) tempEl.value = updated.temp_hp;
    }
    if (typeof PlayerHud !== 'undefined') PlayerHud.refreshFromCharacter(updated);
    if (App.currentCampaign) {
      await this.loadCampaignCharacters();
    }
    return updated;
  },

  getHpValues(charId) {
    if (this.sheetCharacter?.id === charId) {
      const hpEl = document.querySelector('#character-sheet-content [data-field="current_hp"]');
      const maxEl = document.querySelector('#character-sheet-content [data-field="max_hp"]');
      if (hpEl) {
        return {
          current: parseInt(hpEl.value, 10) || 0,
          max: parseInt(maxEl?.value, 10) || 0
        };
      }
    }
    const c = [this.activeCharacter, this.myCampaignCharacter, this.sheetCharacter]
      .find((ch) => ch?.id === charId);
    if (c) return { current: c.current_hp || 0, max: c.max_hp || 0 };
    return null;
  },

  readHpAmountInput(container) {
    const input = container?.querySelector('.hp-delta-input');
    const raw = parseInt(input?.value, 10);
    if (Number.isNaN(raw) || raw <= 0) {
      showToast('Wpisz dodatnią liczbę HP', 'warning');
      return null;
    }
    return raw;
  },

  async applyHpDelta(charId, delta) {
    try {
      const change = parseInt(delta, 10);
      if (Number.isNaN(change) || change === 0) {
        showToast('Podaj liczbę HP', 'warning');
        return;
      }
      let vals = this.getHpValues(charId);
      if (!vals) {
        const c = await apiFetch(`/characters/${charId}`);
        vals = { current: c.current_hp || 0, max: c.max_hp || 0 };
      }
      const cap = vals.max > 0 ? vals.max : 99999;
      const next = Math.max(0, Math.min(vals.current + change, cap));
      const updated = await this.patchCharacterHp(charId, { current_hp: next });
      showToast(change < 0 ? `Odejmowano ${Math.abs(change)} HP` : `Dodano ${change} HP`, 'info');
      return updated;
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async applyHpFromCard(charId, mode) {
    const card = document.querySelector(`.character-card[data-id="${charId}"]`);
    const amount = this.readHpAmountInput(card);
    if (amount == null) return;
    await this.applyHpDelta(charId, mode === 'damage' ? -amount : amount);
    const input = card?.querySelector('.hp-delta-input');
    if (input) input.value = '';
  },

  async applyHpFromSheet(charId, mode) {
    const sheet = document.getElementById('character-sheet-content');
    const amount = this.readHpAmountInput(sheet);
    if (amount == null) return;
    await this.applyHpDelta(charId, mode === 'damage' ? -amount : amount);
    const input = sheet?.querySelector('.hp-delta-input');
    if (input) input.value = '';
  },

  async setQuickHp(charId, field, value) {
    try {
      const num = parseInt(value, 10);
      if (Number.isNaN(num)) return;
      const payload = {};
      payload[field] = Math.max(0, num);
      await this.patchCharacterHp(charId, payload);
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async toggleCondition(charId, conditionName) {
    try {
      const c = await apiFetch(`/characters/${charId}`);
      const list = this.parseJSON(c.conditions);
      const idx = list.indexOf(conditionName);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(conditionName);
      await this.patchCharacterHp(charId, { conditions: JSON.stringify(list) });
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async addConditionPrompt(charId) {
    if (!this.conditionsRef?.length) await this.loadConditionsRef();
    const name = prompt(
      'Dodaj stan (np. Poisoned):\n' +
      (this.conditionsRef || []).slice(0, 8).map(c => c.name).join(', ') +
      '…'
    );
    if (!name?.trim()) return;
    await this.toggleCondition(charId, name.trim());
  },

  renderCard(c, showPlayer) {
    const hpPercent = c.max_hp > 0 ? Math.round((c.current_hp / c.max_hp) * 100) : 100;
    const hpClass = hpPercent > 50 ? '' : hpPercent > 25 ? 'injured' : 'critical';
    const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
    const abShort = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
    const canEdit = this.canEditCharacter(c);
    const conditions = this.parseJSON(c.conditions);

    return `
      <div class="character-card" data-id="${c.id}" data-max-hp="${c.max_hp}">
        <div class="char-card-header">
          ${this.renderAvatar(c, 'char-card-avatar')}
          <div class="char-card-title">
            <h3>${escapeHtml(c.name)}</h3>
            <span class="char-level">Poziom ${c.level} ${escapeHtml(c.char_class)}</span>
          </div>
        </div>
        <div class="char-card-info">
          <span class="char-tag">${escapeHtml(c.race)}</span>
          <span class="char-tag">${escapeHtml(c.background)}</span>
          ${c.subclass ? `<span class="char-tag" title="${escapeHtml(c.subclass)}">${escapeHtml(typeof DndSubclasses !== 'undefined' ? DndSubclasses.getLabel(c.subclass) : c.subclass)}</span>` : ''}
        </div>
        <div class="char-stats">
          ${abilities.map((ab, i) => {
            const score = c[ab];
            const mod = calcModifier(score);
            return `<div class="char-stat">
              <div class="stat-label">${abShort[i]}</div>
              <div class="stat-value">${score}</div>
              <div class="stat-mod">${modString(mod)}</div>
            </div>`;
          }).join('')}
        </div>
        <div class="char-hp-bar">
          <div class="hp-bar-container">
            <div class="hp-bar-fill ${hpClass}" style="width:${hpPercent}%"></div>
            <div class="hp-bar-text">${c.current_hp}/${c.max_hp} HP${c.temp_hp > 0 ? ` (+${c.temp_hp} temp)` : ''}</div>
          </div>
        </div>
        ${canEdit ? `
        <div class="char-hp-quick" onclick="event.stopPropagation()">
          <input type="number" class="hp-delta-input input-sm" min="1" placeholder="HP" title="Ilość do odejmowania lub leczenia">
          <button type="button" class="btn btn-sm btn-danger" onclick="Characters.applyHpFromCard('${c.id}', 'damage')">Odejmij</button>
          <button type="button" class="btn btn-sm btn-success" onclick="Characters.applyHpFromCard('${c.id}', 'heal')">Dodaj</button>
          <span class="hp-quick-sep">|</span>
          <input type="number" class="hp-quick-current input-sm" value="${c.current_hp}" min="0" max="${c.max_hp}"
            title="Aktualne HP" onchange="Characters.setQuickHp('${c.id}', 'current_hp', this.value)">
          <label class="hp-temp-label">Temp</label>
          <input type="number" class="input-sm" value="${c.temp_hp}" min="0"
            onchange="Characters.setQuickHp('${c.id}', 'temp_hp', this.value)">
        </div>` : ''}
        <div class="char-conditions-row" onclick="event.stopPropagation()">
          ${conditions.map(cond => `
            <span class="char-tag char-condition-tag" ${canEdit ? `onclick='Characters.toggleCondition("${c.id}", ${JSON.stringify(cond)})'` : ''}
              title="${canEdit ? 'Kliknij, aby usunąć' : ''}">${escapeHtml(cond)}</span>
          `).join('')}
          ${canEdit ? `<button type="button" class="btn btn-sm btn-secondary" onclick="Characters.addConditionPrompt('${c.id}')">+ stan</button>` : ''}
        </div>
        ${showPlayer && c.player_name ? `<div class="char-card-player">🎮 ${escapeHtml(c.player_name)}</div>` : ''}
      </div>`;
  },

  async openSheet(charId) {
    try {
      const c = await apiFetch(`/characters/${charId}`);
      this.setActiveCharacter(c);
      this.sheetCharacter = c;
      this.renderSheet(c);
      this.bindSheetActions(c, this.canEditCharacter(c));
      openModal('character-modal');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  renderSheet(c) {
    const isOwner = c.user_id === getUser()?.id;
    const isDm = App.currentCampaign && App.currentCampaign.role === 'dm';
    const canEdit = isOwner || isDm;
    const title = document.getElementById('char-modal-title');
    const subLabel = c.subclass && typeof DndSubclasses !== 'undefined'
      ? ` (${DndSubclasses.getLabel(c.subclass)})`
      : (c.subclass ? ` (${c.subclass})` : '');
    title.textContent = `${c.name} - ${c.race} ${c.char_class}${subLabel} ${c.level}`;

    const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
    const proficiencies = this.parseJSON(c.skill_proficiencies);
    const expertises = this.parseJSON(c.skill_expertises);
    const saveProficiencies = this.parseJSON(c.saving_throw_proficiencies);
    const equipment = this.parseJSON(c.equipment);
    const weapons = this.parseJSON(c.weapons);
    const features = this.parseJSON(c.features);
    const spellsKnown = this.parseJSON(c.spells_known);
    const conditions = this.parseJSON(c.conditions);

    const container = document.getElementById('character-sheet-content');
    container.innerHTML = `
      <div class="char-sheet" data-char-id="${c.id}">
        <div id="sheet-last-roll" class="sheet-last-roll hidden" aria-live="polite"></div>
        ${this.renderVisualSection(c, canEdit)}
        <!-- Basic Info -->
        <div class="sheet-section char-sheet-full">
          <h3>📋 Informacje Podstawowe</h3>
          <div class="form-row">
            <div class="form-group"><label>Imię</label><input type="text" value="${escapeHtml(c.name)}" data-field="name" ${canEdit ? '' : 'disabled'}></div>
            <div class="form-group"><label>Rasa</label>
              <select data-field="race" ${canEdit ? '' : 'disabled'}>
                ${DND_RACES.map(r => `<option ${r === c.race ? 'selected' : ''}>${r}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Klasa</label>
              <select data-field="char_class" ${canEdit ? '' : 'disabled'}>
                ${DND_CLASSES.map(cl => `<option ${cl === c.char_class ? 'selected' : ''}>${cl}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Podklasa</label>
              ${typeof DndSubclasses !== 'undefined'
                ? DndSubclasses.renderSelectHtml(c.char_class, c.subclass || '', canEdit, { level: c.level })
                : `<input type="text" value="${escapeHtml(c.subclass || '')}" data-field="subclass" ${canEdit ? '' : 'disabled'}>`}
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Poziom</label><input type="number" value="${c.level}" min="1" max="20" data-field="level" ${canEdit ? '' : 'disabled'}></div>
            <div class="form-group"><label>PD</label><input type="number" value="${c.experience_points}" min="0" data-field="experience_points" ${canEdit ? '' : 'disabled'}></div>
            <div class="form-group"><label>Charakter</label>
              <select data-field="alignment" ${canEdit ? '' : 'disabled'}>
                ${DND_ALIGNMENTS.map(a => `<option ${a === c.alignment ? 'selected' : ''}>${a}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Pochodzenie</label>
              <select data-field="background" ${canEdit ? '' : 'disabled'}>
                ${DND_BACKGROUNDS.map(b => `<option ${b === c.background ? 'selected' : ''}>${b}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Abilities -->
        <div class="sheet-section char-sheet-full">
          <h3>💪 Cechy</h3>
          <div class="sheet-abilities">
            ${abilities.map(ab => {
              const score = c[ab];
              const mod = calcModifier(score);
              return `<div class="ability-box" data-ability="${ab}">
                <div class="ab-label rollable" data-roll="ability" data-ability="${ab}" title="Kliknij, aby rzucić test cechy">${ABILITY_SHORT[ab]}</div>
                <div class="ab-score">
                  ${canEdit ? this.renderStatStepper(ab, score, 1, 30, 10) : score}
                </div>
                <div class="ab-mod rollable" data-roll="ability" data-ability="${ab}" title="Kliknij, aby rzucić test cechy">${modString(mod)}</div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Combat Stats -->
        <div class="sheet-section">
          <h3>⚔️ Statystyki Bojowe</h3>
          <div class="sheet-combat-stats">
            <div class="combat-stat">
              <div class="cs-label">KP (AC)</div>
              <div class="cs-value cs-value-stepper">${canEdit ? this.renderStatStepper('armor_class', c.armor_class, 0, 30, 10) : c.armor_class}</div>
            </div>
            <div class="combat-stat">
              <div class="cs-label">Inicjatywa</div>
              <div class="cs-value">${modString(calcModifier(c.dexterity) + (c.initiative_bonus || 0))}</div>
            </div>
            <div class="combat-stat">
              <div class="cs-label">Szybkość</div>
              <div class="cs-value cs-value-stepper">${canEdit ? `${this.renderStatStepper('speed', c.speed, 0, 999, 30)}<span class="cs-unit">ft</span>` : `${c.speed} ft`}</div>
            </div>
            <div class="combat-stat">
              <div class="cs-label">Biegłość</div>
              <div class="cs-value">+${c.proficiency_bonus}</div>
            </div>
          </div>

          <!-- HP -->
          <div style="margin-top:16px;">
            <label>Punkty Życia</label>
            <div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
              <input type="number" value="${c.current_hp}" data-field="current_hp" style="width:70px;" ${canEdit ? '' : 'disabled'}>
              <span>/</span>
              <input type="number" value="${c.max_hp}" data-field="max_hp" style="width:70px;" ${canEdit ? '' : 'disabled'}>
              <span>Temp:</span>
              <input type="number" value="${c.temp_hp}" data-field="temp_hp" style="width:60px;" ${canEdit ? '' : 'disabled'}>
            </div>
            ${canEdit ? `<div class="hp-adjust-row" style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap;">
              <input type="number" class="hp-delta-input input-sm" min="1" placeholder="ilość" style="width:72px;" title="Ilość HP">
              <button type="button" class="btn btn-sm btn-danger" onclick="Characters.applyHpFromSheet('${c.id}', 'damage')">Odejmij HP</button>
              <button type="button" class="btn btn-sm btn-success" onclick="Characters.applyHpFromSheet('${c.id}', 'heal')">Dodaj HP</button>
              <button type="button" class="btn btn-sm btn-warning" onclick="Characters.fullHeal('${c.id}')">Pełne leczenie</button>
            </div>` : ''}
          </div>

          <!-- Death Saves -->
          <div class="death-saves-section" style="margin-top:12px;">
            <label>Rzuty ratujące przed śmiercią</label>
            <p class="sheet-hint">Użyj przycisku — losowy d20 (≥10 sukces, 1 lub 20 = podwójna porażka/sukces).${canEdit ? ' Ctrl+klik na pipie = ręczna korekta (MG).' : ''}</p>
            <div class="death-saves" id="death-saves-pips">
              <span>✅ Sukcesy:</span>
              <div class="death-save-group" data-ds-type="success">
                ${[0, 1, 2].map((i) => {
                  const ds = this.getDeathSaveCounts(c);
                  return `<div class="death-save-pip ${canEdit ? 'pip-manual' : ''} ${i < ds.successes ? 'success' : ''}" data-ds="success" data-ds-index="${i}"${canEdit ? ' title="Ctrl+klik: ręczna korekta"' : ''}></div>`;
                }).join('')}
              </div>
              <span>❌ Porażki:</span>
              <div class="death-save-group" data-ds-type="failure">
                ${[0, 1, 2].map((i) => {
                  const ds = this.getDeathSaveCounts(c);
                  return `<div class="death-save-pip ${canEdit ? 'pip-manual' : ''} ${i < ds.failures ? 'failure' : ''}" data-ds="failure" data-ds-index="${i}"${canEdit ? ' title="Ctrl+klik: ręczna korekta"' : ''}></div>`;
                }).join('')}
              </div>
            </div>
            ${canEdit ? `<div class="death-save-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-sm btn-primary" data-action="death-roll">🎲 Rzuć rzut ratunkowy (d20)</button>
              <button type="button" class="btn btn-sm btn-secondary" data-action="death-reset">Zresetuj pipy</button>
            </div>` : '<p class="sheet-hint">Tylko właściciel postaci lub MG może rzucać i resetować.</p>'}
          </div>

          <!-- Hit Dice -->
          <div style="margin-top:12px;">
            <label>Kości Życia: ${escapeHtml(c.hit_dice)} (Pozostało: ${c.hit_dice_remaining})</label>
          </div>
        </div>

        <!-- Saving Throws & Skills -->
        <div class="sheet-section">
          <h3>🎯 Rzuty Obronne</h3>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${abilities.map(ab => {
              const mod = calcModifier(c[ab]);
              const prof = saveProficiencies.includes(ab);
              const total = mod + (prof ? c.proficiency_bonus : 0);
              return `<div class="skill-row rollable" data-roll="save" data-ability="${ab}" title="Klik: rzut · Ctrl+klik: biegłość">
                <div class="skill-prof ${prof ? 'proficient' : ''}"></div>
                <span class="skill-mod">${modString(total)}</span>
                <span class="skill-name">${ABILITY_NAMES_PL[ab]}</span>
              </div>`;
            }).join('')}
          </div>

          <h3 style="margin-top:16px;">📊 Umiejętności</h3>
          <div class="sheet-skills">
            ${Object.entries(DND_SKILLS).map(([skill, ab]) => {
              const mod = calcModifier(c[ab]);
              const prof = proficiencies.includes(skill);
              const expert = expertises.includes(skill);
              const bonus = mod + (expert ? c.proficiency_bonus * 2 : prof ? c.proficiency_bonus : 0);
              return `<div class="skill-row rollable" data-roll="skill" data-skill="${skill}" title="Klik: rzut · Ctrl: biegłość · Ctrl×2: ekspertyza">
                <div class="skill-prof ${expert ? 'expertise' : prof ? 'proficient' : ''}"></div>
                <span class="skill-mod">${modString(bonus)}</span>
                <span class="skill-name">${DND_SKILL_NAMES_PL[skill] || skill}</span>
                <span class="skill-ability">(${ABILITY_SHORT[ab]})</span>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Weapons -->
        <div class="sheet-section sheet-weapons-section">
          <h3>⚔️ Bronie</h3>
          <div class="sheet-weapons-list" id="sheet-weapons-list">
            ${weapons.length ? weapons.map(w => this.renderWeaponRow(c, w, canEdit)).join('') : '<p class="sheet-empty">Brak broni</p>'}
          </div>
          ${canEdit ? `
          <details class="weapon-templates-details" style="margin-top:12px;">
            <summary>Dodaj z szablonu</summary>
            <div class="weapon-template-grid">
              ${DndRules.WEAPON_TEMPLATES.map(t => `
                <button type="button" class="btn btn-sm btn-secondary weapon-template-btn" data-template-id="${t.id}">${escapeHtml(t.namePl)}</button>
              `).join('')}
            </div>
            <button type="button" class="btn btn-sm btn-primary" data-action="weapon-custom" style="margin-top:8px;">Dodaj własną broń</button>
          </details>` : ''}
        </div>

        ${typeof Economy !== 'undefined' ? Economy.renderInventorySection(c, canEdit) : ''}

        <!-- Features -->
        <div class="sheet-section">
          <h3>✨ Cechy i Zdolności</h3>
          <div class="sheet-features-list">
            ${features.length > 0
              ? features.map(f => `<div class="feature-item"><strong>${escapeHtml(typeof f === 'string' ? f : f.name || '')}</strong>${f.description ? `<br><span style="color:var(--text-secondary);font-size:0.85rem;">${escapeHtml(f.description)}</span>` : ''}</div>`).join('')
              : '<p style="color:var(--text-muted);">Brak cech</p>'}
          </div>
          ${canEdit ? `<div style="margin-top:8px;">
            <input type="text" id="new-feature-name" placeholder="Nazwa cechy..." style="margin-bottom:4px;">
            <textarea id="new-feature-desc" placeholder="Opis..." rows="2"></textarea>
            <button class="btn btn-sm btn-primary" style="margin-top:4px;"
              onclick="Characters.addFeature('${c.id}')">➕ Dodaj Cechę</button>
          </div>` : ''}
        </div>

        ${this.renderClassResourcesSection(c, canEdit)}

        ${this.renderSpellsSection(c, canEdit)}

        <!-- Personality & Backstory -->
        <div class="sheet-section char-sheet-full">
          <h3>📖 Osobowość i Historia</h3>
          <div class="form-row">
            <div class="form-group"><label>Cechy osobowości</label><textarea data-field="personality_traits" rows="2" ${canEdit ? '' : 'disabled'}>${escapeHtml(c.personality_traits || '')}</textarea></div>
            <div class="form-group"><label>Ideały</label><textarea data-field="ideals" rows="2" ${canEdit ? '' : 'disabled'}>${escapeHtml(c.ideals || '')}</textarea></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Więzi</label><textarea data-field="bonds" rows="2" ${canEdit ? '' : 'disabled'}>${escapeHtml(c.bonds || '')}</textarea></div>
            <div class="form-group"><label>Wady</label><textarea data-field="flaws" rows="2" ${canEdit ? '' : 'disabled'}>${escapeHtml(c.flaws || '')}</textarea></div>
          </div>
          <div class="form-group"><label>Historia postaci</label><textarea data-field="backstory" rows="4" ${canEdit ? '' : 'disabled'}>${escapeHtml(c.backstory || '')}</textarea></div>
        </div>

        <!-- Conditions -->
        <div class="sheet-section">
          <h3>⚠️ Stany</h3>
          <div id="char-conditions" style="display:flex;flex-wrap:wrap;gap:4px;">
            ${conditions.length > 0
              ? conditions.map(cond => `<span class="char-tag char-condition-tag">${escapeHtml(cond)}</span>`).join('')
              : '<span style="color:var(--text-muted);">Brak stanów</span>'}
          </div>
          ${canEdit ? `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
            <select id="condition-add-select" style="flex:1;min-width:160px;">
              <option value="">— wybierz stan —</option>
              ${(Characters.conditionsRef || []).map(ref => `<option value="${escapeHtml(ref.name)}">${escapeHtml(ref.name)}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-sm btn-primary" onclick="Characters.addConditionFromSelect('${c.id}')">Dodaj</button>
          </div>` : ''}
        </div>

        ${this.renderInspirationSection(c, canEdit)}

        <!-- Roll templates -->
        <div class="sheet-section">
          <h3>🎲 Szablony rzutów</h3>
          <div id="char-roll-templates-list">
            ${this.renderRollTemplatesList(c)}
          </div>
          ${canEdit ? `<div class="form-row" style="margin-top:8px;">
            <input type="text" id="new-template-name" placeholder="Nazwa (np. Atak mieczem)" style="flex:1;">
            <input type="text" id="new-template-expr" placeholder="1d20+5" style="flex:1;">
            <button type="button" class="btn btn-sm btn-primary" onclick="Characters.addRollTemplate('${c.id}')">Dodaj</button>
          </div>` : ''}
        </div>

        <!-- Notes -->
        <div class="sheet-section">
          <h3>📝 Notatki</h3>
          <textarea data-field="notes" rows="4" ${canEdit ? '' : 'disabled'}>${escapeHtml(c.notes || '')}</textarea>
        </div>

        <!-- Actions -->
        ${canEdit ? `<div class="sheet-section char-sheet-full" style="text-align:center;">
          <button class="btn btn-primary btn-large" onclick="Characters.saveSheet('${c.id}')">💾 Zapisz Postać</button>
          ${isOwner ? `<button class="btn btn-secondary" style="margin-left:12px;" onclick="Characters.exportCharacter('${c.id}')">📤 Eksportuj JSON</button>` : ''}
          ${isOwner ? `<button class="btn btn-danger" style="margin-left:12px;" onclick="Characters.deleteCharacter('${c.id}')">🗑️ Usuń Postać</button>` : ''}
        </div>` : ''}
      </div>
    `;
  },

  parseSheetNumberField(key, raw) {
    const n = parseInt(raw, 10);
    if (key === 'level') {
      if (Number.isNaN(n)) return 1;
      return Math.max(1, Math.min(20, n));
    }
    return Number.isNaN(n) ? 0 : n;
  },

  async saveSheet(charId) {
    this.clampStatSteppers();
    const fields = document.querySelectorAll('#character-sheet-content [data-field]');
    const data = {};
    fields.forEach(field => {
      const key = field.dataset.field;
      if (field.type === 'number' || field.classList.contains('stat-stepper-input')) {
        data[key] = this.parseSheetNumberField(key, field.value);
      } else {
        data[key] = field.value;
      }
    });

    const sc = this.sheetCharacter;
    if (sc?.id === charId) {
      if (sc.equipment !== undefined) {
        data.equipment = typeof sc.equipment === 'string' ? sc.equipment : JSON.stringify(sc.equipment);
      }
      if (sc.weapons !== undefined) {
        data.weapons = typeof sc.weapons === 'string' ? sc.weapons : JSON.stringify(sc.weapons);
      }
      if (sc.spells_known !== undefined) {
        data.spells_known = typeof sc.spells_known === 'string' ? sc.spells_known : JSON.stringify(sc.spells_known);
      }
      if (sc.avatar_url !== undefined) data.avatar_url = sc.avatar_url;
      if (sc.portrait_url !== undefined) data.portrait_url = sc.portrait_url;
    }

    const merged = { ...sc, ...data };
    const prevLevel = parseInt(sc?.level, 10) || 1;
    const newLevel = this.parseSheetNumberField('level', merged.level);

    try {
      const { payload: derived } = await this.applyDerivedRules(merged, {
        promptMaxHp: newLevel > prevLevel,
        healToMax: false
      });
      const body = {
        ...data,
        ...derived,
        level: newLevel,
        char_class: merged.char_class,
        subclass: merged.subclass || '',
        background: merged.background
      };

      const updated = await apiFetch(`/characters/${charId}`, { method: 'PUT', body: JSON.stringify(body) });
      this.sheetCharacter = updated;
      this.setActiveCharacter(updated);
      this.renderSheet(updated);
      this.bindSheetActions(updated, this._sheetCanEdit);
      showToast('Postać zapisana!', 'success');
      if (App.currentCampaign) {
        await this.loadCampaignCharacters();
      }
      if (body.current_hp !== undefined && App.socket) {
        App.socket.emit('character-hp-update', {
          characterId: charId,
          currentHp: body.current_hp,
          maxHp: body.max_hp,
          tempHp: body.temp_hp
        });
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async fullHeal(charId) {
    try {
      const maxHpInput = document.querySelector('#character-sheet-content [data-field="max_hp"]');
      const maxHp = parseInt(maxHpInput?.value, 10);
      if (Number.isNaN(maxHp) || maxHp < 1) {
        showToast('Ustaw poprawne max HP', 'warning');
        return;
      }
      await this.patchCharacterHp(charId, { current_hp: maxHp });
      showToast('Pełne leczenie', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  adjustCurrency(field, amount) {
    const input = document.querySelector(`#character-sheet-content [data-field="${field}"]`);
    if (!input) return;
    const current = parseInt(input.value || 0, 10);
    input.value = Math.max(0, current + amount);
  },

  async addEquipment(charId) {
    const input = document.getElementById('new-equipment-item');
    if (!input || !input.value.trim()) return;
    const c = await apiFetch(`/characters/${charId}`);
    const equipment = this.parseJSON(c.equipment);
    equipment.push({ name: input.value.trim(), quantity: 1 });
    await apiFetch(`/characters/${charId}`, { method: 'PUT', body: JSON.stringify({ equipment: JSON.stringify(equipment) }) });
    showToast('Przedmiot dodany!', 'success');
    this.openSheet(charId);
  },

  async addFeature(charId) {
    const nameInput = document.getElementById('new-feature-name');
    const descInput = document.getElementById('new-feature-desc');
    if (!nameInput || !nameInput.value.trim()) return;
    const c = await apiFetch(`/characters/${charId}`);
    const features = this.parseJSON(c.features);
    features.push({ name: nameInput.value.trim(), description: descInput?.value.trim() || '' });
    await apiFetch(`/characters/${charId}`, { method: 'PUT', body: JSON.stringify({ features: JSON.stringify(features) }) });
    showToast('Cecha dodana!', 'success');
    this.openSheet(charId);
  },

  renderSpellsSection(c, canEdit) {
    const spellAb = DndSpells.getSpellcastingAbility(c);
    const hasCasting = !!spellAb;
    const maxSpellLvl = DndSpells.getMaxSpellLevel(c.char_class, c.level);
    const spells = DndSpells.parseSpellsKnown(c);
    const dc = c.spell_save_dc || DndSpells.getSpellSaveDc(c);
    const atk = c.spell_attack_bonus ?? DndSpells.getSpellAttackBonus(c);

    if (!hasCasting && maxSpellLvl === 0) {
      return `<div class="sheet-section sheet-spells-section" id="sheet-spells-root" data-character-id="${escapeHtml(c.id)}">
        <h3>🔮 Czary</h3>
        <p class="sheet-empty">Klasa ${escapeHtml(c.char_class)} nie rzuca standardowych czarów (wyjątek: podklasa).</p>
        <div class="spell-rest-buttons">
          <button type="button" class="btn btn-sm btn-secondary" data-spellbook-open title="Pełny katalog czarów 5e z filtrami">📖 Spellbook (katalog)</button>
        </div>
      </div>`;
    }

    const byLevel = {};
    for (let lv = 0; lv <= 9; lv++) byLevel[lv] = [];
    spells.forEach((sp) => {
      const lvl = sp.level ?? 0;
      if (!byLevel[lvl]) byLevel[lvl] = [];
      byLevel[lvl].push(sp);
    });

    const listHtml = spells.length
      ? Object.keys(byLevel).sort((a, b) => a - b).map((lv) => {
          const group = byLevel[lv];
          if (!group.length) return '';
          return `<div class="spell-level-group">
            <h4 class="spell-level-heading">${DndSpells.levelLabel(parseInt(lv, 10))}</h4>
            ${group.map((sp) => this.renderSpellRow(c, sp, canEdit)).join('')}
          </div>`;
        }).join('')
      : '<p class="sheet-empty">Brak znanych czarów — dodaj z katalogu poniżej.</p>';

    const available = DndSpells.getAvailableTemplates(c.char_class, c.level);
    const catalogByLevel = {};
    available.forEach((t) => {
      const lv = t.level ?? 0;
      if (!catalogByLevel[lv]) catalogByLevel[lv] = [];
      catalogByLevel[lv].push(t);
    });

    const catalogHtml = canEdit ? `
      <details class="spell-catalog-details" open>
        <summary>📚 Katalog czarów (${escapeHtml(c.char_class)}, max ${DndSpells.levelLabel(maxSpellLvl).replace('Poziom ', 'poz. ')})</summary>
        <p class="sheet-hint">${available.length} dostępnych szablonów dla twojego poziomu.</p>
        ${Object.keys(catalogByLevel).sort((a, b) => a - b).map((lv) => {
          const items = catalogByLevel[lv];
          if (!items.length) return '';
          const knownIds = new Set(spells.map((s) => s.templateId || s.id));
          return `<div class="spell-catalog-level">
            <strong>${DndSpells.levelLabel(parseInt(lv, 10))}</strong>
            <div class="spell-template-grid">
              ${items.map((t) => {
                const has = knownIds.has(t.id);
                return `<button type="button" class="btn btn-sm ${has ? 'btn-secondary' : 'btn-primary'} spell-template-btn"
                  data-spell-template="${t.id}" ${has ? 'disabled title="Już na liście"' : ''}>${escapeHtml(t.namePl)}</button>`;
              }).join('')}
            </div>
          </div>`;
        }).join('')}
      </details>` : '';

    const maxSlots = DndSpells.getMaxSpellSlots(c.char_class, c.level);
    const remaining = DndSpells.getRemainingSlots(c);
    const slotsBar = Object.keys(maxSlots).length
      ? `<div class="spell-slots-bar">
          <strong>Sloty:</strong>
          ${Object.keys(maxSlots).sort().map((lv) => {
            const rem = remaining[lv] || 0;
            const max = maxSlots[lv] || 0;
            const dots = Array.from({ length: max }, (_, i) =>
              `<button type="button" class="slot-dot ${i < rem ? 'is-full' : 'is-used'}" ${canEdit ? `data-slot-toggle="${lv}" data-slot-idx="${i}"` : 'disabled'} title="Slot ${lv}"></button>`
            ).join('');
            return `<span class="spell-slot-group" title="Sloty poziom ${lv}">
              <span class="slot-level-label">${lv}</span>
              ${dots}
              <small>${rem}/${max}</small>
            </span>`;
          }).join('')}
        </div>` : '';

    const restButtons = canEdit
      ? `<div class="spell-rest-buttons">
          <button type="button" class="btn btn-sm btn-secondary" data-spellbook-open title="Pełny katalog czarów z filtrami i opcją 'Przygotowane dziś'">📖 Spellbook</button>
          <button type="button" class="btn btn-sm btn-secondary" data-rest="short" title="Krótki odpoczynek (1h) — Warlock odzyskuje sloty">🛌 Krótki odp.</button>
          <button type="button" class="btn btn-sm btn-primary" data-rest="long" title="Długi odpoczynek (8h) — pełne HP i sloty">😴 Długi odp.</button>
        </div>`
      : `<div class="spell-rest-buttons">
          <button type="button" class="btn btn-sm btn-secondary" data-spellbook-open title="Spellbook (read-only)">📖 Spellbook</button>
        </div>`;

    return `<div class="sheet-section sheet-spells-section" id="sheet-spells-root" data-character-id="${escapeHtml(c.id)}">
      <h3>🔮 Czary</h3>
      <div class="spell-stats-bar">
        <span><small>Cecha</small><br><strong>${escapeHtml(ABILITY_NAMES_PL[spellAb] || spellAb)}</strong></span>
        <span><small>ST</small><br><strong>${dc}</strong></span>
        <span><small>Atak czarem</small><br><strong>${modString(atk)}</strong></span>
        <span><small>Max poziom</small><br><strong>${maxSpellLvl === 0 ? 'Cantrip' : maxSpellLvl}</strong></span>
      </div>
      ${slotsBar}
      ${restButtons}
      <div class="sheet-spells-list">${listHtml}</div>
      ${catalogHtml}
    </div>`;
  },

  renderSpellRow(c, spell, canEdit) {
    const sp = DndSpells.normalizeSpell(spell);
    const school = DndSpells.SCHOOLS_PL[sp.school] || sp.school || '';
    const conc = sp.concentration ? '🔵' : '';
    const ritual = sp.ritual ? '📜' : '';
    const meta = [sp.castingTime, sp.range, school].filter(Boolean).join(' · ');
    const sid = sp.id || sp.templateId || '';
    const atkBtn = sp.attackType === 'attack' ? `<button type="button" class="btn btn-xs btn-primary" data-spell-roll="attack" data-spell-id="${escapeHtml(sid)}">Atak</button>` : '';
    const dmgBtn = sp.damage ? `<button type="button" class="btn btn-xs btn-secondary" data-spell-roll="damage" data-spell-id="${escapeHtml(sid)}">Obrażenia</button>` : '';
    const saveBtn = sp.attackType === 'save' ? `<button type="button" class="btn btn-xs btn-secondary" data-spell-roll="save" data-spell-id="${escapeHtml(sid)}">ST + dmg</button>` : '';
    const healBtn = sp.healing || sp.attackType === 'heal' ? `<button type="button" class="btn btn-xs btn-success" data-spell-roll="heal" data-spell-id="${escapeHtml(sid)}">Leczenie</button>` : '';
    return `<div class="spell-row" data-spell-id="${escapeHtml(sid)}">
      <div class="spell-row-main">
        <span class="spell-row-name">${conc}${ritual} <strong>${escapeHtml(sp.name)}</strong></span>
        <span class="spell-row-meta">${escapeHtml(meta)}</span>
        ${sp.description ? `<span class="spell-row-desc">${escapeHtml(sp.description)}</span>` : ''}
        ${sp.damage ? `<span class="spell-row-dmg">${escapeHtml(sp.damage)} ${escapeHtml(sp.damageType || '')}</span>` : ''}
        ${sp.healing ? `<span class="spell-row-dmg">Leczy: ${escapeHtml(sp.healing)}</span>` : ''}
      </div>
      <div class="spell-row-actions">
        ${atkBtn}${saveBtn}${dmgBtn}${healBtn}
        ${canEdit ? `<button type="button" class="btn btn-xs btn-danger" data-spell-remove="${escapeHtml(sid)}">✕</button>` : ''}
      </div>
    </div>`;
  },

  getSpellById(char, spellId) {
    return DndSpells.parseSpellsKnown(char).find((s) => (s.id || s.templateId) === spellId);
  },

  async addSpellFromTemplate(charId, templateId) {
    const spell = DndSpells.spellFromTemplate(templateId);
    if (!spell) return;
    const c = await apiFetch(`/characters/${charId}`);
    const spells = this.parseJSON(c.spells_known);
    if (spells.some((s) => (typeof s === 'object' && s.templateId === templateId) || s === spell.name)) {
      showToast('Ten czar jest już na liście', 'warning');
      return;
    }
    spells.push(spell);
    await this.patchCharacterFields(charId, { spells_known: JSON.stringify(spells) }, false);
    showToast(`Dodano: ${spell.name}`, 'success');
    await this.openSheet(charId);
  },

  async removeSpell(charId, spellId) {
    const c = await apiFetch(`/characters/${charId}`);
    let spells = this.parseJSON(c.spells_known);
    spells = spells.filter((s) => {
      const o = typeof s === 'object' ? s : { id: s };
      return (o.id || o.templateId) !== spellId;
    });
    await this.patchCharacterFields(charId, { spells_known: JSON.stringify(spells) }, false);
    showToast('Czar usunięty', 'success');
    await this.openSheet(charId);
  },

  bindSpellSheetActions(c, canEdit) {
    const root = document.getElementById('sheet-spells-root');
    if (!root) return;
    root.querySelectorAll('.spell-template-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.addSpellFromTemplate(c.id, btn.dataset.spellTemplate));
    });
    root.querySelectorAll('[data-spellbook-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof Spellbook !== 'undefined') Spellbook.openForCharacter(c.id);
      });
    });
    root.querySelectorAll('[data-spell-roll]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const spell = this.getSpellById(c, btn.dataset.spellId);
        if (spell) Dice.rollSpell(c, spell, btn.dataset.spellRoll);
      });
    });
    if (canEdit) {
      root.querySelectorAll('[data-spell-remove]').forEach((btn) => {
        btn.addEventListener('click', () => this.removeSpell(c.id, btn.dataset.spellRemove));
      });
      root.querySelectorAll('[data-slot-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => this.toggleSpellSlot(c.id, parseInt(btn.dataset.slotToggle, 10), parseInt(btn.dataset.slotIdx, 10)));
      });
      root.querySelectorAll('[data-rest]').forEach((btn) => {
        btn.addEventListener('click', () => this.takeRest(c.id, btn.dataset.rest));
      });
    }
  },

  async toggleSpellSlot(charId, slotLevel, slotIdx) {
    const c = await apiFetch(`/characters/${charId}`);
    if (!c) return;
    const max = DndSpells.getMaxSpellSlots(c.char_class, c.level);
    if (!(max[slotLevel] || 0)) return;
    const state = DndSpells.parseSlotsState(c);
    const used = parseInt(state.used[slotLevel] || 0, 10);
    const isCurrentlyFull = slotIdx < (max[slotLevel] - used);
    if (isCurrentlyFull) {
      state.used[slotLevel] = Math.min(max[slotLevel], used + 1);
    } else {
      state.used[slotLevel] = Math.max(0, used - 1);
    }
    App.socket?.emit('character-set-slots', { characterId: charId, slots: state });
    // optymistyczna aktualizacja widoku
    await this.openSheet(charId);
  },

  async takeRest(charId, type) {
    const label = type === 'long' ? 'długi' : 'krótki';
    if (!confirm(`Wykonać ${label} odpoczynek? Sloty${type === 'long' ? ' + HP' : (await this._isWarlock(charId)) ? '' : ' (tylko Warlock odzyskuje sloty)'} zostaną odnowione.`)) return;
    if (type === 'long') {
      App.socket?.emit('character-long-rest', { characterId: charId });
    } else {
      const hd = parseInt(prompt('Ile Kości Życia spędzić na leczenie? (0 = tylko odpoczynek)', '0') || '0', 10);
      App.socket?.emit('character-short-rest', { characterId: charId, hitDiceSpent: hd });
    }
    setTimeout(() => this.openSheet(charId), 300);
  },

  async _isWarlock(charId) {
    try {
      const c = await apiFetch(`/characters/${charId}`);
      return c?.char_class === 'Warlock';
    } catch (_e) { return false; }
  },

  // ===== Inspiration (5e) =====
  renderInspirationSection(c, canEdit) {
    const insp = parseInt(c.inspiration, 10) || 0;
    const armed = (typeof Inspiration !== 'undefined') && Inspiration.isArmedFor(c.id);
    const isDm = App.currentCampaign?.role === 'dm';
    const stars = insp > 0
      ? '⭐'.repeat(Math.min(insp, 8)) + (insp > 8 ? ` ×${insp}` : '')
      : '<span style="opacity:0.5;">— brak —</span>';
    return `<div class="sheet-section sheet-inspiration ${armed ? 'is-armed' : ''}" id="sheet-inspiration-root" data-character-id="${escapeHtml(c.id)}">
      <h3>⭐ Inspiracja
        <small class="sheet-hint" style="font-weight:400;">— wydaj 1 by uzyskać przewagę na dowolnym rzucie d20</small>
      </h3>
      <div class="inspiration-display">
        <div class="inspiration-count" title="Aktualna liczba inspiracji">${stars}</div>
        <div class="inspiration-actions">
          ${canEdit && insp > 0 ? `
            <button type="button" class="btn btn-sm ${armed ? 'btn-warning' : 'btn-primary'}" data-insp-action="${armed ? 'disarm' : 'arm'}">
              ${armed ? '✕ Anuluj uzbrojenie' : '⚡ Użyj na następny rzut'}
            </button>` : ''}
          ${isDm ? `
            <button type="button" class="btn btn-sm btn-secondary" data-insp-action="dm-add" title="Daj +1 (MG)">+1</button>
            <button type="button" class="btn btn-sm btn-secondary" data-insp-action="dm-sub" ${insp <= 0 ? 'disabled' : ''} title="Odejmij 1 (MG)">−1</button>
            <button type="button" class="btn btn-sm btn-secondary" data-insp-action="dm-set" title="Ustaw dokładną wartość (MG)">⚙ Ustaw</button>` : ''}
        </div>
      </div>
    </div>`;
  },

  bindInspirationSection(c, canEdit) {
    const root = document.getElementById('sheet-inspiration-root');
    if (!root) return;
    root.querySelectorAll('[data-insp-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.inspAction;
        if (typeof Inspiration === 'undefined') return;
        if (action === 'arm') Inspiration.arm(c);
        else if (action === 'disarm') Inspiration.disarm();
        else if (action === 'dm-add') Inspiration.grantOne(c.id);
        else if (action === 'dm-sub') Inspiration.removeOne(c.id);
        else if (action === 'dm-set') {
          const v = prompt(`Ustaw Inspirację dla ${c.name}:`, String(c.inspiration || 0));
          if (v !== null) Inspiration.setExact(c.id, parseInt(v, 10) || 0);
        }
      });
    });
  },

  // ===== Class Resources (Rage, Ki, Bardic Inspiration, ...) =====
  parseClassResources(c) {
    if (typeof ClassResources === 'undefined') return [];
    return ClassResources.parse(c?.class_resources);
  },

  renderClassResourcesSection(c, canEdit) {
    if (typeof ClassResources === 'undefined') return '';
    const resources = this.parseClassResources(c);
    const klass = String(c.char_class || '').trim();
    const hasTpl = ClassResources.TEMPLATES[klass] && ClassResources.TEMPLATES[klass].length > 0;
    const isEmpty = resources.length === 0;
    const headerActions = canEdit ? `
      <div class="class-res-actions">
        ${hasTpl ? `<button type="button" class="btn btn-xs btn-secondary" data-class-res="auto" title="Wypełnij wg klasy i poziomu">✨ Auto wg klasy</button>` : ''}
        <button type="button" class="btn btn-xs btn-primary" data-class-res="add">➕ Dodaj zasób</button>
        ${resources.length ? `<button type="button" class="btn btn-xs btn-secondary" data-class-res="reset-all" title="Przywróć wszystkie do max">🔄 Pełne</button>` : ''}
      </div>` : '';
    const body = isEmpty
      ? `<p class="sheet-hint">${canEdit ? (hasTpl ? `Brak zasobów. Kliknij <strong>✨ Auto wg klasy</strong>, aby dodać domyślne dla klasy <em>${escapeHtml(klass || '—')}</em>, albo <strong>➕ Dodaj zasób</strong>, aby zdefiniować własny.` : 'Brak zasobów dla tej klasy. Możesz dodać własny.') : 'Brak zasobów klasowych.'}</p>`
      : `<div class="class-res-list">${resources.map((r) => this.renderClassResource(r, canEdit)).join('')}</div>`;
    return `<div class="sheet-section sheet-class-resources" id="sheet-class-res-root" data-character-id="${escapeHtml(c.id)}">
      <h3>🎯 Zasoby klasowe ${headerActions}</h3>
      ${body}
    </div>`;
  },

  renderClassResource(r, canEdit) {
    const max = parseInt(r.max, 10) || 0;
    const cur = Math.max(0, Math.min(max, parseInt(r.current, 10) || 0));
    const recoveryLabel = ClassResources.recoveryLabel(r.recoversOn);
    const useDots = max > 0 && max <= 12;
    let trackerHtml = '';
    if (useDots) {
      const dots = Array.from({ length: max }, (_, i) =>
        `<button type="button" class="res-dot ${i < cur ? 'is-full' : 'is-used'}" ${canEdit ? `data-res-toggle="${escapeHtml(r.id)}" data-res-idx="${i}"` : 'disabled'} title="Użyj/przywróć"></button>`
      ).join('');
      trackerHtml = `<div class="res-dots">${dots}</div>`;
    } else if (max > 0) {
      const pct = Math.round((cur / max) * 100);
      trackerHtml = `<div class="res-bar"><div class="res-bar-fill" style="width:${pct}%"></div><span class="res-bar-label">${cur} / ${max}</span></div>`;
    } else {
      trackerHtml = `<div class="res-bar"><span class="res-bar-label">${cur}</span></div>`;
    }
    const editButtons = canEdit ? `
      <div class="res-controls">
        <button type="button" class="btn btn-xs btn-secondary" data-res-step="-1" data-res-id="${escapeHtml(r.id)}" title="-1">−</button>
        <button type="button" class="btn btn-xs btn-secondary" data-res-step="1" data-res-id="${escapeHtml(r.id)}" title="+1">+</button>
        <button type="button" class="btn btn-xs btn-secondary" data-res-reset="${escapeHtml(r.id)}" title="Pełne">⤴</button>
        <button type="button" class="btn btn-xs btn-secondary" data-res-edit="${escapeHtml(r.id)}" title="Edytuj">✏️</button>
        <button type="button" class="btn btn-xs btn-danger" data-res-remove="${escapeHtml(r.id)}" title="Usuń">✕</button>
      </div>` : '';
    return `<div class="class-res-row" data-res-id="${escapeHtml(r.id)}">
      <div class="class-res-head">
        <span class="class-res-name"><span class="class-res-emoji">${escapeHtml(r.emoji || '🎯')}</span> ${escapeHtml(r.name)}</span>
        <span class="class-res-meta" title="Odnowienie">↻ ${escapeHtml(recoveryLabel)}</span>
      </div>
      ${trackerHtml}
      ${editButtons}
    </div>`;
  },

  bindClassResourcesActions(c, canEdit) {
    const root = document.getElementById('sheet-class-res-root');
    if (!root) return;
    const onClick = (sel, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener('click', () => fn(el)));

    if (canEdit) {
      onClick('[data-class-res="auto"]', () => this.autoFillClassResources(c.id));
      onClick('[data-class-res="add"]', () => this.openClassResourceEditor(c.id, null));
      onClick('[data-class-res="reset-all"]', () => this.resetAllClassResources(c.id));
      onClick('[data-res-toggle]', (btn) => this.toggleClassResourceDot(c.id, btn.dataset.resToggle, parseInt(btn.dataset.resIdx, 10)));
      onClick('[data-res-step]', (btn) => this.stepClassResource(c.id, btn.dataset.resId, parseInt(btn.dataset.resStep, 10)));
      onClick('[data-res-reset]', (btn) => this.resetClassResource(c.id, btn.dataset.resReset));
      onClick('[data-res-edit]', (btn) => this.openClassResourceEditor(c.id, btn.dataset.resEdit));
      onClick('[data-res-remove]', (btn) => this.removeClassResource(c.id, btn.dataset.resRemove));
    }
  },

  async _saveResources(charId, resources) {
    App.socket?.emit('character-set-resources', { characterId: charId, resources });
    // optymistyczna lokalna mutacja: odśwież arkusz po krótkim czasie
    setTimeout(() => {
      // odśwież lokalnie z DB tylko jeśli arkusz jest otwarty
      const open = document.querySelector(`#sheet-class-res-root[data-character-id="${charId}"]`);
      if (open) this.openSheet(charId);
    }, 200);
  },

  async _getResources(charId) {
    const c = await apiFetch(`/characters/${charId}`);
    return { c, list: this.parseClassResources(c) };
  },

  async toggleClassResourceDot(charId, resId, idx) {
    const { list } = await this._getResources(charId);
    const r = list.find((x) => x.id === resId);
    if (!r) return;
    // dot na pozycji idx jest "pełny" gdy idx < r.current; klik przełącza
    if (idx < r.current) r.current = idx;
    else r.current = Math.min(r.max, idx + 1);
    await this._saveResources(charId, list);
  },

  async stepClassResource(charId, resId, delta) {
    const { list } = await this._getResources(charId);
    const r = list.find((x) => x.id === resId);
    if (!r) return;
    r.current = Math.max(0, Math.min(r.max, (parseInt(r.current, 10) || 0) + delta));
    await this._saveResources(charId, list);
  },

  async resetClassResource(charId, resId) {
    const { list } = await this._getResources(charId);
    const r = list.find((x) => x.id === resId);
    if (!r) return;
    r.current = parseInt(r.max, 10) || 0;
    await this._saveResources(charId, list);
  },

  async resetAllClassResources(charId) {
    const { list } = await this._getResources(charId);
    list.forEach((r) => { r.current = parseInt(r.max, 10) || 0; });
    await this._saveResources(charId, list);
    showToast('Zasoby przywrócone do max', 'success');
  },

  async removeClassResource(charId, resId) {
    if (!confirm('Usunąć ten zasób?')) return;
    const { list } = await this._getResources(charId);
    const next = list.filter((r) => r.id !== resId);
    await this._saveResources(charId, next);
  },

  async autoFillClassResources(charId) {
    if (typeof ClassResources === 'undefined') return;
    const { c, list } = await this._getResources(charId);
    const generated = ClassResources.generateForCharacter(c);
    if (!generated.length) {
      showToast('Brak domyślnych zasobów dla tej klasy/poziomu', 'warning');
      return;
    }
    // dopisz tylko te, których jeszcze nie ma (po nazwie)
    const haveNames = new Set(list.map((r) => r.name.toLowerCase()));
    const additions = generated.filter((g) => !haveNames.has(String(g.name).toLowerCase()));
    if (!additions.length) {
      showToast('Wszystkie domyślne zasoby już są dodane', 'info');
      return;
    }
    const merged = list.concat(additions);
    await this._saveResources(charId, merged);
    showToast(`Dodano ${additions.length} zasobów`, 'success');
  },

  openClassResourceEditor(charId, resId) {
    const isEdit = !!resId;
    let existing = null;
    if (isEdit) {
      const root = document.getElementById('sheet-class-res-root');
      if (root) {
        // Bierzemy postać ze sheetCharacter — najświeższa lokalna kopia
        const list = this.parseClassResources(this.sheetCharacter || {});
        existing = list.find((r) => r.id === resId);
      }
    }
    const r = existing || { name: '', emoji: '🎯', max: 1, current: 1, recoversOn: 'long' };
    const modalHtml = `
      <div class="modal-overlay" id="class-res-editor-overlay">
        <div class="modal class-res-editor">
          <div class="modal-header">
            <h3>${isEdit ? 'Edytuj zasób' : 'Nowy zasób klasowy'}</h3>
            <button type="button" class="modal-close" data-action="close">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-row">
              <div class="form-group" style="flex:0 0 90px;">
                <label>Emoji</label>
                <input type="text" id="cre-emoji" maxlength="4" value="${escapeHtml(r.emoji)}">
              </div>
              <div class="form-group" style="flex:1;">
                <label>Nazwa</label>
                <input type="text" id="cre-name" maxlength="60" value="${escapeHtml(r.name)}" placeholder="np. Szały, Punkty Ki">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Maks.</label>
                <input type="number" id="cre-max" min="0" max="999" value="${parseInt(r.max, 10) || 0}">
              </div>
              <div class="form-group">
                <label>Aktualnie</label>
                <input type="number" id="cre-cur" min="0" max="999" value="${parseInt(r.current, 10) || 0}">
              </div>
              <div class="form-group">
                <label>Odnowienie</label>
                <select id="cre-recover">
                  <option value="long" ${r.recoversOn === 'long' ? 'selected' : ''}>Długi odpoczynek</option>
                  <option value="short" ${r.recoversOn === 'short' ? 'selected' : ''}>Krótki odpoczynek</option>
                  <option value="none" ${r.recoversOn === 'none' ? 'selected' : ''}>Manualnie / nigdy</option>
                </select>
              </div>
            </div>
            ${typeof ClassResources !== 'undefined' && ClassResources.GENERIC?.length ? `
              <div class="form-group">
                <label>Lub wybierz szablon</label>
                <div class="cre-presets">
                  ${ClassResources.GENERIC.map((g) => `<button type="button" class="btn btn-xs btn-secondary" data-cre-preset='${escapeHtml(JSON.stringify(g))}'>${escapeHtml(g.emoji)} ${escapeHtml(g.name)}</button>`).join('')}
                </div>
              </div>` : ''}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-action="close">Anuluj</button>
            <button type="button" class="btn btn-primary" id="cre-save">${isEdit ? 'Zapisz' : 'Dodaj'}</button>
          </div>
        </div>
      </div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = modalHtml;
    const overlay = wrap.firstElementChild;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-action="close"]').forEach((b) => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelectorAll('[data-cre-preset]').forEach((b) => b.addEventListener('click', () => {
      try {
        const preset = JSON.parse(b.dataset.crePreset);
        overlay.querySelector('#cre-emoji').value = preset.emoji || '🎯';
        overlay.querySelector('#cre-name').value = preset.name || '';
        overlay.querySelector('#cre-max').value = parseInt(preset.max, 10) || 1;
        overlay.querySelector('#cre-cur').value = parseInt(preset.max, 10) || 1;
        overlay.querySelector('#cre-recover').value = preset.recoversOn || 'long';
      } catch (_e) {}
    }));

    overlay.querySelector('#cre-save').addEventListener('click', async () => {
      const emoji = overlay.querySelector('#cre-emoji').value.trim() || '🎯';
      const name = overlay.querySelector('#cre-name').value.trim();
      const max = Math.max(0, parseInt(overlay.querySelector('#cre-max').value, 10) || 0);
      const cur = Math.max(0, Math.min(max, parseInt(overlay.querySelector('#cre-cur').value, 10) || 0));
      const recoversOn = overlay.querySelector('#cre-recover').value;
      if (!name) { showToast('Podaj nazwę zasobu', 'error'); return; }
      const { list } = await this._getResources(charId);
      if (isEdit) {
        const idx = list.findIndex((x) => x.id === resId);
        if (idx >= 0) list[idx] = { ...list[idx], emoji, name, max, current: cur, recoversOn };
      } else {
        list.push({
          id: `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          emoji, name, max, current: cur, recoversOn
        });
      }
      await this._saveResources(charId, list);
      close();
      showToast(isEdit ? 'Zasób zaktualizowany' : 'Zasób dodany', 'success');
    });
  },

  refreshOpenSheetIfMatches(charId) {
    if (!charId) return;
    const open = document.querySelector(`#sheet-spells-root[data-character-id="${charId}"]`)
      || document.querySelector(`#sheet-class-res-root[data-character-id="${charId}"]`)
      || document.querySelector(`#sheet-inspiration-root[data-character-id="${charId}"]`);
    if (open) this.openSheet(charId);
  },

  async deleteCharacter(charId) {
    if (!confirm('Czy na pewno chcesz usunąć tę postać? Tej operacji nie można cofnąć!')) return;
    try {
      await apiFetch(`/characters/${charId}`, { method: 'DELETE' });
      closeModal('character-modal');
      showToast('Postać usunięta', 'success');
      if (App.currentCampaign) this.loadCampaignCharacters();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  safeFileName(name) {
    return (name || 'postac').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60) || 'postac';
  },

  async exportCharacter(charId) {
    try {
      const bundle = await apiFetch(`/characters/${charId}/export`);
      const fileName = `${this.safeFileName(bundle.sourceName || bundle.character?.name)}.dedeki.json`;
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      showToast('Postać wyeksportowana', 'success');
    } catch (err) {
      showToast(err.message || 'Nie udało się wyeksportować postaci', 'error');
    }
  },

  promptImport() {
    this.showImportDialog();
  },

  showImportDialog() {
    const inCampaign = !!App.currentCampaign;
    const html = `
      <p class="sheet-hint">Wybierz plik <strong>.dedeki.json</strong> wyeksportowany z Roll 1 (lub kompatybilny JSON postaci).</p>
      ${inCampaign ? `<label style="display:block;margin:12px 0;"><input type="checkbox" id="char-import-assign" checked> Przypisz do bieżącej kampanii (${escapeHtml(App.currentCampaign.name)})</label>` : ''}
      <button type="button" class="btn btn-primary btn-full" id="char-import-pick">📂 Wybierz plik JSON</button>
    `;
    showGenericModal('📥 Import postaci', html);
    document.getElementById('char-import-pick')?.addEventListener('click', () => {
      this._importAssignToCampaign = document.getElementById('char-import-assign')?.checked ?? false;
      document.getElementById('char-import-file')?.click();
    });
  },

  async handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      const body = { bundle };
      if (this._importAssignToCampaign && App.currentCampaign) {
        body.assignToCampaign = true;
        body.campaignId = App.currentCampaign.id;
      }
      const created = await apiFetch('/characters/import', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      closeModal('generic-modal');
      showToast(`Zaimportowano postać: ${created.name}`, 'success');
      if (App.currentCampaign) {
        await this.loadCampaignCharacters();
      }
      this.openSheet(created.id);
    } catch (err) {
      showToast(err.message || 'Nie udało się zaimportować postaci', 'error');
    }
  },

  renderRollTemplatesList(c) {
    const templates = this.parseJSON(c.roll_templates);
    if (!templates.length) {
      return '<p style="color:var(--text-muted);">Brak szablonów</p>';
    }
    return templates.map((t, i) => {
      const name = typeof t === 'string' ? t : t.name || 'Rzut';
      const expr = typeof t === 'string' ? t : t.expression || '';
      return `<div class="roll-template-item">
        <strong>${escapeHtml(name)}</strong>: <code>${escapeHtml(expr)}</code>
        ${this.canEditCharacter(c) ? `<button type="button" class="btn btn-sm btn-danger" onclick='Characters.removeRollTemplate("${c.id}", ${i})'>✕</button>` : ''}
      </div>`;
    }).join('');
  },

  async addRollTemplate(charId) {
    const name = document.getElementById('new-template-name')?.value.trim();
    const expr = document.getElementById('new-template-expr')?.value.trim();
    if (!name || !expr) return;
    const c = await apiFetch(`/characters/${charId}`);
    const templates = this.parseJSON(c.roll_templates);
    templates.push({ name, expression: expr });
    await apiFetch(`/characters/${charId}`, {
      method: 'PUT',
      body: JSON.stringify({ roll_templates: JSON.stringify(templates) })
    });
    showToast('Szablon dodany', 'success');
    this.openSheet(charId);
    if (this.activeCharacter?.id === charId) {
      const updated = await apiFetch(`/characters/${charId}`);
      this.activeCharacter = updated;
      Dice.updateRollTemplates(updated);
    }
  },

  async removeRollTemplate(charId, index) {
    const c = await apiFetch(`/characters/${charId}`);
    const templates = this.parseJSON(c.roll_templates);
    templates.splice(index, 1);
    await apiFetch(`/characters/${charId}`, {
      method: 'PUT',
      body: JSON.stringify({ roll_templates: JSON.stringify(templates) })
    });
    this.openSheet(charId);
  },

  async addConditionFromSelect(charId) {
    const select = document.getElementById('condition-add-select');
    if (!select?.value) return;
    const c = await apiFetch(`/characters/${charId}`);
    const list = this.parseJSON(c.conditions);
    if (!list.includes(select.value)) list.push(select.value);
    await this.patchCharacterHp(charId, { conditions: JSON.stringify(list) });
    this.openSheet(charId);
  },

  showCreateForm(campaignId) {
    const html = `
      <form id="create-char-form">
        <div class="form-row">
          <div class="form-group"><label>Imię</label><input type="text" id="new-char-name" required></div>
          <div class="form-group"><label>Rasa</label>
            <select id="new-char-race">${DND_RACES.map(r => `<option>${r}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Klasa</label>
            <select id="new-char-class">${DND_CLASSES.map(c => `<option>${c}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label>Podklasa</label>
            <select id="new-char-subclass"><option value="">— Nie wybrano —</option></select>
            <span class="sheet-hint" id="new-char-subclass-hint"></span>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Poziom</label>
            <input type="number" id="new-char-level" value="1" min="1" max="20">
          </div>
          <div class="form-group"><label>Pochodzenie</label>
            <select id="new-char-bg">${DND_BACKGROUNDS.map(b => `<option>${b}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label>Charakter</label>
            <select id="new-char-align">${DND_ALIGNMENTS.map(a => `<option>${a}</option>`).join('')}</select>
          </div>
        </div>
        <h4 style="margin:16px 0 8px;">Cechy (Ability Scores)</h4>
        <div class="form-row">
          <div class="form-group"><label>STR</label><input type="number" id="new-char-str" value="10" min="1" max="30"></div>
          <div class="form-group"><label>DEX</label><input type="number" id="new-char-dex" value="10" min="1" max="30"></div>
          <div class="form-group"><label>CON</label><input type="number" id="new-char-con" value="10" min="1" max="30"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>INT</label><input type="number" id="new-char-int" value="10" min="1" max="30"></div>
          <div class="form-group"><label>WIS</label><input type="number" id="new-char-wis" value="10" min="1" max="30"></div>
          <div class="form-group"><label>CHA</label><input type="number" id="new-char-cha" value="10" min="1" max="30"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Max HP</label><input type="number" id="new-char-hp" value="10" min="1"></div>
          <div class="form-group"><label>AC</label><input type="number" id="new-char-ac" value="10" min="0"></div>
          <div class="form-group"><label>Szybkość (ft)</label><input type="number" id="new-char-speed" value="30" min="0"></div>
        </div>
        <button type="submit" class="btn btn-primary btn-full" style="margin-top:12px;">🛡️ Utwórz Postać</button>
      </form>
    `;
    showGenericModal('🛡️ Nowa Postać', html);

    const syncCreateSubclassSelect = () => {
      const classEl = document.getElementById('new-char-class');
      const subEl = document.getElementById('new-char-subclass');
      const hintEl = document.getElementById('new-char-subclass-hint');
      const levelEl = document.getElementById('new-char-level');
      if (!classEl || !subEl || typeof DndSubclasses === 'undefined') return;
      const prev = subEl.value;
      DndSubclasses.fillSelectElement(subEl, classEl.value, prev);
      const lvl = parseInt(levelEl?.value, 10) || 1;
      const unlock = DndSubclasses.getUnlockLevel(classEl.value);
      if (hintEl) {
        hintEl.textContent = lvl < unlock ? `Wybór podklasy od poziomu ${unlock}.` : '';
      }
    };
    document.getElementById('new-char-class')?.addEventListener('change', syncCreateSubclassSelect);
    document.getElementById('new-char-level')?.addEventListener('change', syncCreateSubclassSelect);
    syncCreateSubclassSelect();

    document.getElementById('create-char-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const data = {
          name: document.getElementById('new-char-name').value.trim(),
          race: document.getElementById('new-char-race').value,
          char_class: document.getElementById('new-char-class').value,
          subclass: document.getElementById('new-char-subclass')?.value || '',
          level: parseInt(document.getElementById('new-char-level').value),
          background: document.getElementById('new-char-bg').value,
          alignment: document.getElementById('new-char-align').value,
          strength: parseInt(document.getElementById('new-char-str').value),
          dexterity: parseInt(document.getElementById('new-char-dex').value),
          constitution: parseInt(document.getElementById('new-char-con').value),
          intelligence: parseInt(document.getElementById('new-char-int').value),
          wisdom: parseInt(document.getElementById('new-char-wis').value),
          charisma: parseInt(document.getElementById('new-char-cha').value),
          max_hp: parseInt(document.getElementById('new-char-hp').value),
          current_hp: parseInt(document.getElementById('new-char-hp').value),
          armor_class: parseInt(document.getElementById('new-char-ac').value),
          speed: parseInt(document.getElementById('new-char-speed').value)
        };
        if (campaignId) data.campaign_id = campaignId;
        const draft = {
          ...data,
          constitution: data.constitution,
          char_class: data.char_class,
          level: data.level,
          background: data.background
        };
        const { payload } = await Characters.applyDerivedRules(draft, {
          setMaxHp: true,
          fullHealOnCreate: true
        });
        const created = await apiFetch('/characters', { method: 'POST', body: JSON.stringify(data) });
        await apiFetch(`/characters/${created.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...payload,
            level: draft.level,
            char_class: draft.char_class,
            subclass: draft.subclass || '',
            background: draft.background,
            weapons: '[]'
          })
        });
        closeModal('generic-modal');
        showToast('Postać utworzona!', 'success');
        if (App.currentCampaign) this.loadCampaignCharacters();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },

  async showAssignDialog() {
    if (!App.currentCampaign) return;
    try {
      const myChars = await apiFetch('/characters');
      const unassigned = myChars.filter(c => !c.campaign_id || c.campaign_id === App.currentCampaign.id);
      let html = '';
      if (unassigned.length === 0) {
        html = `<p>Nie masz wolnych postaci. <button class="btn btn-primary" id="btn-create-from-assign">Utwórz nową</button></p>`;
      } else {
        html = `<p style="margin-bottom:12px;">Wybierz postać do przypisania:</p>`;
        unassigned.forEach(c => {
          html += `<div class="campaign-card" style="cursor:pointer;margin-bottom:8px;" data-assign-id="${c.id}">
            <div class="campaign-card-info">
              <h3>${escapeHtml(c.name)}</h3>
              <p>${escapeHtml(c.race)} ${escapeHtml(c.char_class)} Poz.${c.level}</p>
            </div>
          </div>`;
        });
        html += `<hr style="margin:12px 0;border-color:var(--border-color);">
          <button class="btn btn-primary" id="btn-create-from-assign">➕ Utwórz Nową Postać</button>`;
      }
      showGenericModal('Przypisz Postać', html);
      document.querySelectorAll('[data-assign-id]').forEach(el => {
        el.addEventListener('click', async () => {
          try {
            await apiFetch(`/characters/${el.dataset.assignId}`, {
              method: 'PUT',
              body: JSON.stringify({ campaign_id: App.currentCampaign.id })
            });
            closeModal('generic-modal');
            showToast('Postać przypisana!', 'success');
            this.loadCampaignCharacters();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
      document.getElementById('btn-create-from-assign')?.addEventListener('click', () => {
        closeModal('generic-modal');
        this.showCreateForm(App.currentCampaign.id);
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  renderWeaponRow(c, weapon, canEdit) {
    const ab = DndRules.attackAbility(c, weapon);
    const mod = calcModifier(c[ab]);
    const pb = weapon.isProficient !== false ? (c.proficiency_bonus || 2) : 0;
    const atkBonus = mod + pb + (weapon.attackBonus || 0);
    const dmgBonus = mod + (weapon.damageBonus || 0);
    const wid = weapon.id || weapon.templateId || 'w';
    return `<div class="weapon-row" data-weapon-id="${escapeHtml(wid)}">
      <div class="weapon-row-info">
        <strong>${escapeHtml(weapon.name)}</strong>
        <span class="weapon-meta">${escapeHtml(weapon.damage)} ${escapeHtml(weapon.damageType || '')} · ${ABILITY_SHORT[ab]}</span>
      </div>
      <div class="weapon-row-actions">
        <button type="button" class="btn btn-sm btn-primary" data-roll="weapon-attack" data-weapon-id="${escapeHtml(wid)}">Atak ${modString(atkBonus)}</button>
        <button type="button" class="btn btn-sm btn-secondary" data-roll="weapon-damage" data-weapon-id="${escapeHtml(wid)}">Obrażenia ${modString(dmgBonus)}/${escapeHtml(weapon.damage)}</button>
        ${canEdit ? `<button type="button" class="btn btn-sm btn-danger" data-action="weapon-remove" data-weapon-id="${escapeHtml(wid)}">✕</button>` : ''}
      </div>
    </div>`;
  },

  getWeaponById(char, weaponId) {
    const weapons = this.parseJSON(char.weapons);
    return weapons.find(w => (w.id || w.templateId) === weaponId);
  },

  bindSheetActions(c, canEdit) {
    const container = document.getElementById('character-sheet-content');
    if (!container) return;

    if (!this.sheetBound) {
      this.sheetBound = true;
      container.addEventListener('click', (e) => this.onSheetClick(e));
      container.addEventListener('change', (e) => this.onSheetChange(e));
      container.addEventListener('input', (e) => this.onSheetInput(e));
      container.addEventListener('blur', (e) => {
        if (e.target.classList?.contains('stat-stepper-input')) this.clampStatSteppers();
      }, true);
      container.addEventListener('change', (e) => {
        if (e.target.id === 'sheet-avatar-file' && e.target.files?.[0]) {
          this.onCharacterImageSelected('avatar', e.target.files[0]);
          e.target.value = '';
        }
        if (e.target.id === 'sheet-portrait-file' && e.target.files?.[0]) {
          this.onCharacterImageSelected('portrait', e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    this._sheetCanEdit = canEdit;
    this._sheetCharId = c.id;
    if (typeof Economy !== 'undefined') Economy.bindInventoryActions(c, canEdit);
    this.bindSpellSheetActions(c, canEdit);
    this.bindClassResourcesActions(c, canEdit);
    this.bindInspirationSection(c, canEdit);
  },

  async onSheetClick(e) {
    const c = this.sheetCharacter;
    if (!c) return;
    const canEdit = this._sheetCanEdit;

    const stepBtn = e.target.closest('.stat-step');
    if (stepBtn && canEdit) {
      e.preventDefault();
      const field = stepBtn.dataset.field;
      const min = parseInt(stepBtn.dataset.min, 10);
      const max = parseInt(stepBtn.dataset.max, 10);
      const def = parseInt(stepBtn.dataset.default, 10) || min;
      const input = document.querySelector(`#character-sheet-content [data-field="${field}"]`);
      if (input) {
        let v = parseInt(input.value, 10);
        if (Number.isNaN(v)) v = def;
        v = Math.max(min, Math.min(max, v + parseInt(stepBtn.dataset.delta, 10)));
        input.value = String(v);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }

    const pip = e.target.closest('.death-save-pip.pip-manual');
    if (pip && canEdit && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      await this.onDeathSavePipClick(c, pip);
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.action;
      if (action === 'death-roll' && canEdit) {
        await Dice.rollDeathSave(this.sheetCharacter || c);
        return;
      }
      if (action === 'death-reset' && canEdit) {
        await this.resetDeathSaves(c.id);
        return;
      }
      if (action === 'weapon-custom' && canEdit) {
        await this.addCustomWeapon(c.id);
        return;
      }
      if (action === 'weapon-remove' && canEdit) {
        await this.removeWeapon(c.id, actionBtn.dataset.weaponId);
        return;
      }
      if (action === 'upload-avatar' && canEdit) {
        document.getElementById('sheet-avatar-file')?.click();
        return;
      }
      if (action === 'upload-portrait' && canEdit) {
        document.getElementById('sheet-portrait-file')?.click();
        return;
      }
      if (action === 'remove-avatar' && canEdit) {
        await this.removeCharacterImage('avatar');
        return;
      }
      if (action === 'remove-portrait' && canEdit) {
        await this.removeCharacterImage('portrait');
        return;
      }
    }

    const templateBtn = e.target.closest('.weapon-template-btn');
    if (templateBtn && canEdit) {
      await this.addWeaponFromTemplate(c.id, templateBtn.dataset.templateId);
      return;
    }

    if (e.target.closest('input, select, textarea, option')) return;

    const rollEl = e.target.closest('[data-roll]');
    if (!rollEl) return;

    const rollType = rollEl.dataset.roll;
    const ctrl = e.ctrlKey || e.metaKey;

    if (rollType === 'ability' && rollEl.dataset.ability) {
      Dice.rollForCharacter(c, 'ability', { ability: rollEl.dataset.ability });
      return;
    }
    if (rollType === 'save' && rollEl.dataset.ability) {
      if (ctrl && canEdit) {
        await this.toggleSaveProficiency(c, rollEl.dataset.ability);
        return;
      }
      Dice.rollForCharacter(c, 'save', { ability: rollEl.dataset.ability });
      return;
    }
    if (rollType === 'skill' && rollEl.dataset.skill) {
      if (ctrl && canEdit) {
        await this.toggleSkillProficiency(c, rollEl.dataset.skill, e.shiftKey);
        return;
      }
      Dice.rollForCharacter(c, 'skill', { skill: rollEl.dataset.skill });
      return;
    }
    if (rollType === 'weapon-attack' && rollEl.dataset.weaponId) {
      const weapon = this.getWeaponById(c, rollEl.dataset.weaponId);
      if (weapon) Dice.rollForCharacter(c, 'weapon-attack', { weapon });
      return;
    }
    if (rollType === 'weapon-damage' && rollEl.dataset.weaponId) {
      const weapon = this.getWeaponById(c, rollEl.dataset.weaponId);
      if (weapon) Dice.rollForCharacter(c, 'weapon-damage', { weapon });
    }
  },

  onSheetInput(e) {
    const field = e.target.dataset?.field;
    if (!field || !e.target.classList.contains('stat-stepper-input')) return;
    const stepBtn = e.target.closest('.stat-stepper')?.querySelector('.stat-step');
    const maxLen = field === 'speed' ? 3 : 2;
    const digits = String(e.target.value).replace(/\D/g, '').slice(0, maxLen);
    e.target.value = digits;
    const def = parseInt(stepBtn?.dataset.default, 10) || 10;
    const score = digits === '' ? def : parseInt(digits, 10);
    const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
    if (abilities.includes(field)) {
      const modEl = e.target.closest('.ability-box')?.querySelector('.ab-mod');
      if (modEl) modEl.textContent = modString(calcModifier(score));
    }
  },

  clampStatSteppers() {
    document.querySelectorAll('#character-sheet-content .stat-stepper-input').forEach((input) => {
      const field = input.dataset.field;
      const stepBtn = input.closest('.stat-stepper')?.querySelector('.stat-step');
      if (!stepBtn) return;
      const min = parseInt(stepBtn.dataset.min, 10);
      const max = parseInt(stepBtn.dataset.max, 10);
      const def = parseInt(stepBtn.dataset.default, 10) || min;
      let v = parseInt(input.value, 10);
      if (Number.isNaN(v)) v = def;
      v = Math.max(min, Math.min(max, v));
      input.value = String(v);
      const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
      if (abilities.includes(field)) {
        const modEl = input.closest('.ability-box')?.querySelector('.ab-mod');
        if (modEl) modEl.textContent = modString(calcModifier(v));
      }
    });
  },

  async onSheetChange(e) {
    const field = e.target.dataset?.field;
    if (!field || !this.sheetCharacter || !this._sheetCanEdit) return;

    if (field === 'subclass') {
      const subclass = e.target.value || '';
      try {
        const updated = await this.patchCharacterFields(this.sheetCharacter.id, { subclass }, false);
        this.sheetCharacter = updated;
        this.setActiveCharacter(updated);
        showToast('Podklasa zapisana', 'success');
        if (App.currentCampaign) await this.loadCampaignCharacters();
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }

    if (field !== 'level' && field !== 'char_class' && field !== 'background') return;

    const c = { ...this.sheetCharacter };
    if (field === 'level') c.level = parseInt(e.target.value, 10) || 1;
    if (field === 'char_class') {
      c.char_class = e.target.value;
      if (typeof DndSubclasses !== 'undefined' && !DndSubclasses.isValidForClass(c.char_class, c.subclass)) {
        c.subclass = '';
      }
    }
    if (field === 'background') c.background = e.target.value;

    const prevLevel = parseInt(this.sheetCharacter.level, 10) || 1;
    c.level = this.parseSheetNumberField('level', c.level);
    const { payload } = await this.applyDerivedRules(c, {
      promptMaxHp: field === 'level' && c.level > prevLevel,
      healToMax: false
    });
    payload.level = c.level;
    payload.char_class = c.char_class;
    payload.subclass = c.subclass || '';
    payload.background = c.background;

    try {
      const updated = await this.patchCharacterFields(this.sheetCharacter.id, payload, false);
      this.sheetCharacter = updated;
      this.setActiveCharacter(updated);
      this.renderSheet(updated);
      this.bindSheetActions(updated, this._sheetCanEdit);
      showToast(
        field === 'char_class' ? 'Zaktualizowano klasę i statystyki' : 'Zaktualizowano statystyki z poziomu/klasy',
        'success'
      );
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async onDeathSavePipClick(c, pip) {
    const type = pip.dataset.ds;
    const index = parseInt(pip.dataset.dsIndex, 10);
    const counts = this.getDeathSaveCounts(c);
    let { successes, failures } = counts;
    if (type === 'success') {
      successes = successes === index + 1 ? index : index + 1;
    } else {
      failures = failures === index + 1 ? index : index + 1;
    }
    const updated = await this.patchCharacterFields(c.id, {
      death_save_successes: successes,
      death_save_failures: failures
    }, false);
    this.applyDeathSaveUpdate(c.id, updated);
  },

  refreshDeathSavePips(c) {
    const container = document.getElementById('death-saves-pips');
    if (!container) return;
    const { successes, failures } = this.getDeathSaveCounts(c);
    container.querySelectorAll('.death-save-pip[data-ds="success"]').forEach((pip, i) => {
      pip.classList.remove('failure');
      pip.classList.toggle('success', i < successes);
    });
    container.querySelectorAll('.death-save-pip[data-ds="failure"]').forEach((pip, i) => {
      pip.classList.remove('success');
      pip.classList.toggle('failure', i < failures);
    });
  },

  async toggleSaveProficiency(c, ability) {
    const list = this.parseJSON(c.saving_throw_proficiencies);
    const idx = list.indexOf(ability);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(ability);
    const updated = await this.patchCharacterFields(c.id, {
      saving_throw_proficiencies: JSON.stringify(list)
    });
    this.renderSheet(updated);
    this.bindSheetActions(updated, this._sheetCanEdit);
  },

  async toggleSkillProficiency(c, skill, useExpertise) {
    const proficiencies = this.parseJSON(c.skill_proficiencies);
    const expertises = this.parseJSON(c.skill_expertises);
    const profIdx = proficiencies.indexOf(skill);
    const expIdx = expertises.indexOf(skill);

    if (useExpertise) {
      if (expIdx >= 0) expertises.splice(expIdx, 1);
      else {
        expertises.push(skill);
        if (profIdx < 0) proficiencies.push(skill);
      }
    } else {
      if (profIdx >= 0) {
        proficiencies.splice(profIdx, 1);
        if (expIdx >= 0) expertises.splice(expIdx, 1);
      } else proficiencies.push(skill);
    }

    const updated = await this.patchCharacterFields(c.id, {
      skill_proficiencies: JSON.stringify(proficiencies),
      skill_expertises: JSON.stringify(expertises)
    });
    this.renderSheet(updated);
    this.bindSheetActions(updated, this._sheetCanEdit);
  },

  async patchCharacterFields(charId, fields, reloadList = true) {
    const updated = await apiFetch(`/characters/${charId}`, {
      method: 'PUT',
      body: JSON.stringify(fields)
    });
    if (this.sheetCharacter?.id === charId) {
      this.sheetCharacter = updated;
      if ('death_save_successes' in fields || 'death_save_failures' in fields) {
        this.refreshDeathSavePips(updated);
      }
    }
    if (this.activeCharacter?.id === charId) this.setActiveCharacter(updated);
    if (reloadList && App.currentCampaign) await this.loadCampaignCharacters();
    return updated;
  },

  async addWeaponFromTemplate(charId, templateId) {
    const weapon = DndRules.weaponFromTemplate(templateId);
    if (!weapon) return;
    const c = await apiFetch(`/characters/${charId}`);
    const weapons = this.parseJSON(c.weapons);
    weapons.push(weapon);
    await this.patchCharacterFields(charId, { weapons: JSON.stringify(weapons) });
    showToast('Broń dodana', 'success');
    await this.openSheet(charId);
  },

  async addCustomWeapon(charId) {
    const name = prompt('Nazwa broni:');
    if (!name?.trim()) return;
    const damage = prompt('Obrażenia (np. 1d8):', '1d8') || '1d8';
    const c = await apiFetch(`/characters/${charId}`);
    const weapons = this.parseJSON(c.weapons);
    weapons.push({
      id: `w-${Date.now()}`,
      name: name.trim(),
      damage,
      damageType: 'slashing',
      ability: 'strength',
      properties: [],
      attackBonus: 0,
      damageBonus: 0,
      isProficient: true
    });
    await this.patchCharacterFields(charId, { weapons: JSON.stringify(weapons) });
    showToast('Broń dodana', 'success');
    await this.openSheet(charId);
  },

  async removeWeapon(charId, weaponId) {
    const c = await apiFetch(`/characters/${charId}`);
    let weapons = this.parseJSON(c.weapons);
    weapons = weapons.filter(w => (w.id || w.templateId) !== weaponId);
    await this.patchCharacterFields(charId, { weapons: JSON.stringify(weapons) });
    showToast('Broń usunięta', 'success');
    await this.openSheet(charId);
  },

  parseJSON(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
  }
};
