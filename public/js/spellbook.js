// ===== Spellbook view =====
// Pełny katalog czarów 5e z filtrami: szkoła, poziom, klasa, fraza
// + toggle "Przygotowane dziś" dla klas, które przygotowują czary.
const Spellbook = {
  // Klasy, które każdego ranka wybierają subset znanych jako "przygotowane"
  PREPARING_CLASSES: ['Wizard', 'Cleric', 'Druid', 'Paladin', 'Artificer'],

  state: {
    charId: null,
    char: null,
    canEdit: false,
    filter: {
      query: '',
      school: '',
      level: 'all',          // 'all' | number (0..9)
      classFilter: '',       // '' | className
      onlyKnown: false,
      onlyPrepared: false,
      onlyAvailable: true    // domyślnie pokaż tylko możliwe do nauki dla klasy postaci
    }
  },

  init() { /* panel w sesji — bez modala */ },

  openTab() {
    document.querySelector('.session-tab[data-panel="spellbook-panel"]')?.click();
  },

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  async onPanelActivate() {
    if (!App.currentCampaign) return;
    if (!this.state.charId && !this.isDm()) {
      await this._maybeAutoSelectCharacter();
    }
    if (this.state.charId && !this.state.char) {
      await this._refreshChar();
      this.state.canEdit = (typeof Characters !== 'undefined' && Characters.canEditCharacter)
        ? Characters.canEditCharacter(this.state.char)
        : true;
    }
    this._renderPanel();
  },

  async _maybeAutoSelectCharacter() {
    const user = typeof getUser === 'function' ? getUser() : null;
    const chars = (typeof Characters !== 'undefined' && Characters.campaignCharacters) || [];
    const mine = user ? chars.filter((c) => c.user_id === user.id) : [];
    if (mine.length === 1) {
      await this._bindCharacter(mine[0].id, mine[0], false);
    }
  },

  async _bindCharacter(charId, char = null, rerender = true) {
    let c = char;
    if (!c) {
      try { c = await apiFetch(`/characters/${charId}`); } catch (_e) { c = null; }
    }
    if (!c) {
      showToast('Nie udało się pobrać postaci', 'error');
      return;
    }
    this.state.charId = charId;
    this.state.char = c;
    this.state.canEdit = (typeof Characters !== 'undefined' && Characters.canEditCharacter)
      ? Characters.canEditCharacter(c)
      : true;
    this.state.filter.classFilter = c.char_class || '';
    this.state.filter.onlyAvailable = true;
    if (rerender) this._renderPanel();
  },

  _setCatalogMode() {
    this.state.charId = null;
    this.state.char = null;
    this.state.canEdit = false;
    this.state.filter.classFilter = '';
    this.state.filter.onlyAvailable = false;
    this.state.filter.onlyKnown = false;
    this.state.filter.onlyPrepared = false;
  },

  // ===== Otwarcie z karty postaci =====
  async openForCharacter(charId) {
    await this._bindCharacter(charId, null, false);
    this.openTab();
  },

  // ===== Pełny katalog (MG) =====
  openCatalog() {
    this._setCatalogMode();
    this.openTab();
  },

  _getMount() {
    return document.getElementById('spellbook-panel-root');
  },

  _isUiMounted() {
    return !!document.getElementById('spellbook-list');
  },

  _panelTitle() {
    if (this.state.char) return `Księga zaklęć — ${this.state.char.name}`;
    if (this.isDm()) return 'Księga zaklęć — katalog MG';
    return 'Księga zaklęć';
  },

  _panelEyebrow() {
    if (this.state.char) {
      const cls = this.state.char.char_class || '?';
      return `${cls} · ${this.state.char.name}`;
    }
    if (this.isDm()) return 'Katalog mistrza gry';
    return 'Biblioteka zaklęć';
  },

  _panelSub(filteredCount) {
    const total = (typeof DndSpells !== 'undefined' && DndSpells.SPELL_TEMPLATES)
      ? DndSpells.SPELL_TEMPLATES.length
      : 0;
    const n = filteredCount ?? (this._isUiMounted() ? this._filterTemplates().length : total);
    if (this.state.char) {
      return `${n} z ${total} w indeksie · znane, przygotowane i dostępne dla klasy`;
    }
    if (this.isDm()) {
      return `${n} z ${total} zaklęć · pełny katalog D&D 5e`;
    }
    return 'Wybierz postać w pasku indeksu lub otwórz Spellbook z karty bohatera';
  },

  _updateHeaderMeta() {
    const n = this._isUiMounted() ? this._filterTemplates().length : 0;
    const brow = document.getElementById('spellbook-eyebrow');
    const sub = document.getElementById('spellbook-sub-line');
    if (brow) brow.textContent = this._panelEyebrow();
    if (sub) sub.textContent = this._panelSub(n);
  },

  _renderCharacterPicker() {
    const user = typeof getUser === 'function' ? getUser() : null;
    const chars = (typeof Characters !== 'undefined' && Characters.campaignCharacters) || [];
    const mine = user ? chars.filter((c) => c.user_id === user.id) : [];
    if (!mine.length) return '';
    const opts = mine.map((c) =>
      `<option value="${c.id}" ${String(this.state.charId) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(c.char_class || '?')})</option>`
    ).join('');
    return `
      <div class="spellbook-char-pick spellbook-toolbar__pick">
        <label for="spellbook-char-select">Postać</label>
        <select id="spellbook-char-select" class="spellbook-char-select">
          <option value="">— Katalog MG —</option>
          ${opts}
        </select>
        ${this.isDm() ? '<button type="button" class="btn btn-xs btn-secondary" data-action="catalog-mode" title="Pełny katalog bez przypisanej postaci">📚 Katalog MG</button>' : ''}
      </div>`;
  },

  _renderPanelHeader() {
    const sub = this._panelSub();
    return `
      <header class="dm-feature-header spellbook-header">
        <span class="dm-feature-header__icon" aria-hidden="true">📖</span>
        <div class="dm-feature-header__titles">
          <p class="spellbook-header__eyebrow" id="spellbook-eyebrow">${escapeHtml(this._panelEyebrow())}</p>
          <h3>Księga zaklęć</h3>
          <p class="dm-feature-header__sub" id="spellbook-sub-line">${escapeHtml(sub)}</p>
        </div>
      </header>`;
  },

  // ===== Render panelu sesji =====
  _renderPanel() {
    const mount = this._getMount();
    if (!mount) return;
    mount.innerHTML = `
      <div class="spellbook-tome spellbook-tome--panel" role="region" aria-label="${escapeHtml(this._panelTitle())}">
        <div class="spellbook-spine" aria-hidden="true"><span class="spellbook-spine__runes">✦ ◈ ✧ ◈ ✦</span></div>
        <div class="spellbook-volume">
          <div class="spellbook-cover">
            ${this._renderPanelHeader()}
          </div>
          <div class="dm-feature-toolbar spellbook-toolbar">
            <span class="spellbook-toolbar__label" aria-hidden="true">Indeks</span>
            <input type="search" class="spellbook-search" placeholder="Szukaj zaklęcia…" value="${escapeHtml(this.state.filter.query)}">
            <select class="spellbook-school" title="Szkoła magii">
              <option value="">Wszystkie szkoły</option>
              ${Object.entries(DndSpells.SCHOOLS_PL).map(([k, v]) => `<option value="${k}" ${this.state.filter.school === k ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}
            </select>
            <select class="spellbook-level" title="Poziom czaru">
              <option value="all">Wszystkie poziomy</option>
              <option value="0" ${this.state.filter.level === '0' || this.state.filter.level === 0 ? 'selected' : ''}>Cantrip</option>
              ${Array.from({ length: 9 }, (_, i) => i + 1).map((lv) => `<option value="${lv}" ${String(this.state.filter.level) === String(lv) ? 'selected' : ''}>Poziom ${lv}</option>`).join('')}
            </select>
            <select class="spellbook-class" title="Klasa">
              <option value="">Wszystkie klasy</option>
              ${this._classOptions().map((c) => `<option value="${c}" ${this.state.filter.classFilter === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
            <div class="spellbook-toolbar__actions">${this._renderCharacterPicker()}</div>
          </div>
          <div class="spellbook-page">
            <div class="spellbook-page__corner spellbook-page__corner--tl" aria-hidden="true"></div>
            <div class="spellbook-page__corner spellbook-page__corner--tr" aria-hidden="true"></div>
            <div class="modal-body dm-feature-body spellbook-body">
              <div id="spellbook-flags-slot">${this._renderFlagsRow()}</div>
              <div id="spellbook-stats-slot">${this._renderStatsRow()}</div>
              <div class="spellbook-list" id="spellbook-list"></div>
            </div>
            <div class="spellbook-page__corner spellbook-page__corner--bl" aria-hidden="true"></div>
            <div class="spellbook-page__corner spellbook-page__corner--br" aria-hidden="true"></div>
          </div>
          <footer class="spellbook-panel-footer">
            <div class="spellbook-footer">${this._renderFooter()}</div>
          </footer>
        </div>
      </div>`;

    mount.querySelector('.spellbook-search')?.addEventListener('input', (e) => {
      this.state.filter.query = e.target.value;
      this._renderList();
    });
    mount.querySelector('.spellbook-school')?.addEventListener('change', (e) => {
      this.state.filter.school = e.target.value;
      this._renderList();
    });
    mount.querySelector('.spellbook-level')?.addEventListener('change', (e) => {
      this.state.filter.level = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
      this._renderList();
    });
    mount.querySelector('.spellbook-class')?.addEventListener('change', (e) => {
      this.state.filter.classFilter = e.target.value;
      this._renderList();
    });

    mount.querySelectorAll('[data-flag]').forEach((cb) => {
      cb.addEventListener('change', () => {
        this.state.filter[cb.dataset.flag] = cb.checked;
        this._renderList();
      });
    });

    mount.querySelector('[data-action="prepare-rest"]')?.addEventListener('click', () => this._clearPrepared());
    mount.querySelector('[data-action="prepare-all-known"]')?.addEventListener('click', () => this._prepareAllKnown());

    mount.querySelector('#spellbook-char-select')?.addEventListener('change', async (e) => {
      const id = e.target.value;
      if (!id) {
        if (this.isDm()) {
          this._setCatalogMode();
          this._renderPanel();
        } else {
          this.state.charId = null;
          this.state.char = null;
          this.state.canEdit = false;
          const flags = mount.querySelector('#spellbook-flags-slot');
          const stats = mount.querySelector('#spellbook-stats-slot');
          if (flags) flags.innerHTML = '';
          if (stats) stats.innerHTML = '';
          this._renderList();
        }
        return;
      }
      await this._bindCharacter(id);
    });

    mount.querySelector('[data-action="catalog-mode"]')?.addEventListener('click', () => {
      this._setCatalogMode();
      this._renderPanel();
    });

    this._renderList();
  },

  _classOptions() {
    const set = new Set();
    DndSpells.SPELL_TEMPLATES.forEach((t) => (t.classes || []).forEach((c) => set.add(c)));
    return Array.from(set).sort();
  },

  _renderFlagsRow() {
    const f = this.state.filter;
    const isPlayer = !!this.state.char;
    const klass = this.state.char?.char_class || '';
    const canPrepare = isPlayer && this.PREPARING_CLASSES.includes(klass);
    return `<div class="dm-feature-subbar spellbook-flags spellbook-ink-filters">
      ${isPlayer ? `<label><input type="checkbox" data-flag="onlyKnown" ${f.onlyKnown ? 'checked' : ''}> 📓 Tylko znane</label>` : ''}
      ${canPrepare ? `<label><input type="checkbox" data-flag="onlyPrepared" ${f.onlyPrepared ? 'checked' : ''}> 🌅 Przygotowane dziś</label>` : ''}
      ${isPlayer ? `<label><input type="checkbox" data-flag="onlyAvailable" ${f.onlyAvailable ? 'checked' : ''}> 🎯 Dostępne dla mnie (klasa + poziom)</label>` : ''}
    </div>`;
  },

  _renderStatsRow() {
    if (!this.state.char) return '';
    const c = this.state.char;
    const known = this._knownIds();
    const prepared = this._preparedIds();
    const max = DndSpells.getMaxSpellLevel(c.char_class, c.level);
    const klass = c.char_class || '';
    const canPrepare = this.PREPARING_CLASSES.includes(klass);
    let prepBadge = '';
    if (canPrepare) {
      const limit = this._preparedLimit(c);
      prepBadge = `<span class="sb-stat" title="Przygotowane / sugerowany limit (mod cechy + poziom)">🌅 ${prepared.length} / ${limit}</span>`;
    }
    return `<div class="spellbook-stats spellbook-ribbon">
      <span class="sb-stat">📓 Znane: <strong>${known.length}</strong></span>
      ${prepBadge}
      <span class="sb-stat">🎯 Max poziom: <strong>${max === 0 ? 'cantrip' : max}</strong></span>
    </div>`;
  },

  _renderFooter() {
    if (!this.state.char) return '';
    const klass = this.state.char.char_class || '';
    const canPrepare = this.PREPARING_CLASSES.includes(klass);
    if (!canPrepare || !this.state.canEdit) return '';
    return `
      <button type="button" class="btn btn-secondary" data-action="prepare-rest" title="Wyzeruj listę przygotowanych — np. po długim odpoczynku">🌙 Wyzeruj przygotowane</button>
      <button type="button" class="btn btn-secondary" data-action="prepare-all-known" title="Oznacz wszystkie znane jako przygotowane">⭐ Wszystkie znane</button>
    `;
  },

  // ===== Filtering & list =====
  _knownIds() {
    if (!this.state.char) return [];
    const arr = DndSpells.parseSpellsKnown(this.state.char);
    return arr.map((s) => s.templateId || s.id).filter(Boolean);
  },

  _preparedIds() {
    if (!this.state.char) return [];
    let arr = [];
    try { arr = JSON.parse(this.state.char.prepared_spells || '[]'); } catch { arr = []; }
    return Array.isArray(arr) ? arr.map((x) => (typeof x === 'string' ? x : x?.id || x?.templateId)).filter(Boolean) : [];
  },

  _preparedLimit(char) {
    if (!char) return 0;
    const klass = char.char_class || '';
    const lvl = parseInt(char.level, 10) || 1;
    const ab = DndSpells.getSpellcastingAbility(char);
    const mod = ab ? Math.floor(((parseInt(char[ab], 10) || 10) - 10) / 2) : 0;
    // Wizard/Cleric/Druid/Artificer = mod + level (Artificer = mod + lvl/2)
    if (klass === 'Artificer') return Math.max(1, mod + Math.floor(lvl / 2));
    // Paladin = mod + lvl/2
    if (klass === 'Paladin') return Math.max(1, mod + Math.floor(lvl / 2));
    return Math.max(1, mod + lvl);
  },

  _filterTemplates() {
    const f = this.state.filter;
    const c = this.state.char;
    const known = new Set(this._knownIds());
    const prepared = new Set(this._preparedIds());
    const q = (f.query || '').trim().toLowerCase();

    return DndSpells.SPELL_TEMPLATES.filter((t) => {
      if (f.school && t.school !== f.school) return false;
      if (f.level !== 'all' && Number(t.level) !== Number(f.level)) return false;
      if (f.classFilter && !(t.classes || []).includes(f.classFilter)) return false;
      if (q) {
        const hay = `${t.namePl} ${t.id} ${t.school} ${t.damageType || ''} ${t.description || ''} ${t.castingTime || ''} ${t.range || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (c) {
        if (f.onlyKnown && !known.has(t.id)) return false;
        if (f.onlyPrepared && !prepared.has(t.id)) return false;
        if (f.onlyAvailable) {
          if (!DndSpells.canLearnSpell(t, c.char_class || '', c.level || 1)) return false;
        }
      }
      return true;
    }).sort((a, b) => (a.level - b.level) || a.namePl.localeCompare(b.namePl, 'pl'));
  },

  _renderList() {
    const root = document.getElementById('spellbook-list');
    if (!root) return;
    const items = this._filterTemplates();
    if (!items.length) {
      root.innerHTML = `<div class="spellbook-empty dm-feature-empty">
        <span class="dm-feature-empty__icon" aria-hidden="true">📖</span>
        <p>Na tych kartach nie ma zaklęcia pasującego do wyszukiwania.<br>Zmień filtry lub szukaj inną frazą.</p>
      </div>`;
      this._updateHeaderMeta();
      return;
    }
    // grupuj wg poziomu
    const byLevel = {};
    items.forEach((t) => {
      const k = String(t.level);
      (byLevel[k] = byLevel[k] || []).push(t);
    });
    const known = new Set(this._knownIds());
    const prepared = new Set(this._preparedIds());
    const c = this.state.char;
    const canPrepare = c && this.PREPARING_CLASSES.includes(c.char_class || '');
    const html = Object.keys(byLevel).sort((a, b) => Number(a) - Number(b)).map((lv) => {
      const list = byLevel[lv];
      const lvNum = parseInt(lv, 10);
      return `<section class="sb-level-group" data-level="${lvNum}">
        <h4 class="spellbook-chapter"><span class="spellbook-chapter__sigil" aria-hidden="true">${lvNum === 0 ? '◇' : '✦'}</span>${DndSpells.levelLabel(lvNum)} <small>(${list.length})</small></h4>
        <div class="sb-cards">
          ${list.map((t) => this._renderCard(t, known, prepared, canPrepare)).join('')}
        </div>
      </section>`;
    }).join('');
    // refresh stats too (prepared count may have changed)
    const flagsSlot = document.getElementById('spellbook-flags-slot');
    if (flagsSlot) flagsSlot.innerHTML = this._renderFlagsRow();
    const statsSlot = document.getElementById('spellbook-stats-slot');
    if (statsSlot) statsSlot.innerHTML = this._renderStatsRow();
    root.innerHTML = html;
    this._updateHeaderMeta();
    this._bindCardEvents(root);
  },

  _renderCard(t, knownSet, preparedSet, canPrepare) {
    const isKnown = knownSet.has(t.id);
    const isPrepared = preparedSet.has(t.id);
    const schoolPl = DndSpells.SCHOOLS_PL[t.school] || t.school;
    const meta = [t.castingTime, t.range, schoolPl].filter(Boolean).join(' · ');
    const conc = t.concentration ? '<span class="sb-tag sb-conc" title="Koncentracja">🔵 K</span>' : '';
    const ritual = t.ritual ? '<span class="sb-tag sb-ritual" title="Rytuał">📜 R</span>' : '';
    const dmg = t.damage ? `<span class="sb-tag sb-dmg">${escapeHtml(t.damage)} ${escapeHtml(t.damageType || '')}</span>` : '';
    const heal = t.healing ? `<span class="sb-tag sb-heal">+ ${escapeHtml(t.healing)}</span>` : '';
    const aoe = t.aoeShape ? `<span class="sb-tag sb-aoe">${escapeHtml(t.aoeShape)} ${t.aoeSizeFt || 0}ft</span>` : '';
    const classes = (t.classes || []).map((cl) => `<span class="sb-class-tag">${escapeHtml(cl)}</span>`).join('');
    const c = this.state.char;
    const canEdit = !!this.state.canEdit && !!c;
    const actions = [];
    if (canEdit) {
      if (isKnown) {
        actions.push(`<button type="button" class="btn btn-xs btn-secondary" data-sb-action="forget" data-template-id="${escapeHtml(t.id)}">Zapomnij</button>`);
        if (canPrepare) {
          actions.push(`<button type="button" class="btn btn-xs ${isPrepared ? 'btn-warning' : 'btn-primary'}" data-sb-action="toggle-prepare" data-template-id="${escapeHtml(t.id)}">${isPrepared ? '🌅 Przygotowany ✕' : '🌅 Przygotuj'}</button>`);
        }
      } else {
        actions.push(`<button type="button" class="btn btn-xs btn-primary" data-sb-action="learn" data-template-id="${escapeHtml(t.id)}">📓 Naucz się</button>`);
      }
    }
    if (c && isKnown) {
      if (t.attackType === 'attack') actions.push(`<button type="button" class="btn btn-xs btn-secondary" data-sb-action="roll" data-roll-type="attack" data-template-id="${escapeHtml(t.id)}">🎯 Atak</button>`);
      if (t.attackType === 'save') actions.push(`<button type="button" class="btn btn-xs btn-secondary" data-sb-action="roll" data-roll-type="save" data-template-id="${escapeHtml(t.id)}">🛡️ ST</button>`);
      if (t.damage) actions.push(`<button type="button" class="btn btn-xs btn-secondary" data-sb-action="roll" data-roll-type="damage" data-template-id="${escapeHtml(t.id)}">💥 Dmg</button>`);
      if (t.healing) actions.push(`<button type="button" class="btn btn-xs btn-success" data-sb-action="roll" data-roll-type="heal" data-template-id="${escapeHtml(t.id)}">❤️ Heal</button>`);
    }

    const schoolKey = t.school || 'evocation';
    return `<article class="sb-card sb-card--${escapeHtml(schoolKey)} ${isKnown ? 'is-known' : ''} ${isPrepared ? 'is-prepared' : ''}" data-template-id="${escapeHtml(t.id)}" data-school="${escapeHtml(schoolKey)}">
      <div class="sb-card-ornament" aria-hidden="true"></div>
      <header class="sb-card-head">
        <div class="sb-card-title">
          <span class="sb-card-level" title="Poziom ${t.level}">${t.level === 0 ? '◇' : t.level}</span>
          <h5>${escapeHtml(t.namePl)}</h5>
          ${isKnown ? '<span class="sb-tag sb-known" title="Znany">📓</span>' : ''}
          ${isPrepared ? '<span class="sb-tag sb-prepared" title="Przygotowany">🌅</span>'  : ''}
          ${conc}${ritual}
        </div>
        <div class="sb-card-school">${escapeHtml(schoolPl)}</div>
      </header>
      <div class="sb-card-meta">${escapeHtml(meta)}</div>
      <div class="sb-card-tags">${dmg}${heal}${aoe}</div>
      ${t.description ? `<p class="sb-card-desc">${escapeHtml(t.description)}</p>` : ''}
      <div class="sb-card-classes">${classes}</div>
      ${actions.length ? `<footer class="sb-card-actions">${actions.join('')}</footer>` : ''}
    </article>`;
  },

  _bindCardEvents(root) {
    root.querySelectorAll('[data-sb-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.sbAction;
        const tplId = btn.dataset.templateId;
        if (!tplId) return;
        if (action === 'learn') return this._learn(tplId);
        if (action === 'forget') return this._forget(tplId);
        if (action === 'toggle-prepare') return this._togglePrepare(tplId);
        if (action === 'roll') return this._rollSpell(tplId, btn.dataset.rollType);
      });
    });
  },

  // ===== Mutations =====
  async _refreshChar() {
    if (!this.state.charId) return;
    try {
      this.state.char = await apiFetch(`/characters/${this.state.charId}`);
    } catch (_e) {}
  },

  async _learn(templateId) {
    if (!this.state.charId) return;
    if (typeof Characters === 'undefined' || !Characters.addSpellFromTemplate) {
      showToast('Brak modułu Characters', 'error');
      return;
    }
    // dodaj bez zamykania spellbooka
    const spell = DndSpells.spellFromTemplate(templateId);
    if (!spell) return;
    const c = await apiFetch(`/characters/${this.state.charId}`);
    const spells = Characters.parseJSON(c.spells_known);
    if (spells.some((s) => (typeof s === 'object' && s.templateId === templateId))) {
      showToast('Już znasz ten czar', 'warning');
      return;
    }
    spells.push(spell);
    await Characters.patchCharacterFields(this.state.charId, { spells_known: JSON.stringify(spells) }, false);
    showToast(`📓 Nauczono: ${spell.name}`, 'success');
    await this._refreshChar();
    this._renderList();
  },

  async _forget(templateId) {
    if (!this.state.charId) return;
    if (!confirm('Usunąć ten czar z listy znanych?')) return;
    const c = await apiFetch(`/characters/${this.state.charId}`);
    let spells = Characters.parseJSON(c.spells_known);
    spells = spells.filter((s) => {
      const o = typeof s === 'object' ? s : { id: s };
      return (o.templateId || o.id) !== templateId;
    });
    // pochodne: usuń też z prepared
    let prepared = this._preparedIds().filter((id) => id !== templateId);
    await Characters.patchCharacterFields(this.state.charId, {
      spells_known: JSON.stringify(spells),
      prepared_spells: JSON.stringify(prepared)
    }, false);
    showToast('Czar zapomniany', 'info');
    await this._refreshChar();
    this._renderList();
  },

  async _togglePrepare(templateId) {
    if (!this.state.charId) return;
    const known = new Set(this._knownIds());
    if (!known.has(templateId)) {
      showToast('Najpierw naucz się tego czaru', 'warning');
      return;
    }
    const prepared = this._preparedIds();
    const idx = prepared.indexOf(templateId);
    if (idx >= 0) prepared.splice(idx, 1);
    else prepared.push(templateId);
    // soft warning, nie blokuje
    if (this.state.char) {
      const limit = this._preparedLimit(this.state.char);
      if (prepared.length > limit) {
        showToast(`Uwaga: ${prepared.length}/${limit} — przekraczasz limit przygotowanych`, 'warning');
      }
    }
    await Characters.patchCharacterFields(this.state.charId, {
      prepared_spells: JSON.stringify(prepared)
    }, false);
    await this._refreshChar();
    this._renderList();
  },

  async _clearPrepared() {
    if (!this.state.charId) return;
    if (!confirm('Wyzerować listę przygotowanych? (zwykle robi się to po długim odpoczynku, gdy wybierasz nowy zestaw)')) return;
    await Characters.patchCharacterFields(this.state.charId, {
      prepared_spells: JSON.stringify([])
    }, false);
    showToast('🌙 Lista przygotowanych wyczyszczona', 'success');
    await this._refreshChar();
    this._renderList();
  },

  async _prepareAllKnown() {
    if (!this.state.charId) return;
    const known = this._knownIds();
    const limit = this.state.char ? this._preparedLimit(this.state.char) : known.length;
    if (known.length > limit) {
      if (!confirm(`Masz ${known.length} znanych czarów, ale Twój limit to ${limit}. Mimo to oznaczyć wszystkie?`)) return;
    }
    await Characters.patchCharacterFields(this.state.charId, {
      prepared_spells: JSON.stringify(known)
    }, false);
    showToast(`⭐ Przygotowano ${known.length} czarów`, 'success');
    await this._refreshChar();
    this._renderList();
  },

  _rollSpell(templateId, rollType) {
    if (!this.state.char) return;
    const spell = DndSpells.spellFromTemplate(templateId);
    if (!spell) return;
    if (typeof Dice !== 'undefined' && Dice.rollSpell) {
      Dice.rollSpell(this.state.char, spell, rollType);
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Spellbook;
}
