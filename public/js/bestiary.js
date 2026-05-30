// ===== Bestiariusz: własne potwory =====
// MG tworzy stat-blocki (AC, HP, ataki, cechy, akcje, akcje legendarne).
// Można je przeglądać, edytować, usuwać i "spawnować" jako NPC w kampanii.
const Bestiary = {
  monsters: [],
  _filter: { query: '', type: '', crMax: '' },

  TYPE_ICONS: {
    aberration: '👁️', beast: '🐺', celestial: '✨', construct: '⚙️', dragon: '🐲',
    elemental: '🔥', fey: '🧚', fiend: '😈', giant: '🦶', humanoid: '🧍',
    monstrosity: '🦑', ooze: '🫧', plant: '🌿', undead: '💀'
  },

  TYPE_LABELS_PL: {
    aberration: 'aberracja', beast: 'bestia', celestial: 'niebianin', construct: 'konstrukt',
    dragon: 'smok', elemental: 'żywiołak', fey: 'wróżka', fiend: 'czart', giant: 'olbrzym',
    humanoid: 'humanoid', monstrosity: 'monstrum', ooze: 'maź', plant: 'roślina', undead: 'nieumarły'
  },

  init() {
    /* otwarcie przez zakładkę sesji Bestiariusz */
  },

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  async load() {
    if (!App.currentCampaign) return;
    try {
      this.monsters = await apiFetch(`/campaigns/${App.currentCampaign.id}/bestiary`);
    } catch (err) {
      console.error('bestiary load', err);
      this.monsters = [];
    }
  },

  openTab() {
    document.querySelector('.session-tab[data-panel="bestiary-panel"]')?.click();
  },

  async onPanelActivate() {
    if (!App.currentCampaign) return;
    if (!this.isDm()) {
      showToast('Tylko Mistrz Gry może otwierać bestiariusz', 'warning');
      return;
    }
    await this.load();
    this._renderPanel();
  },

  open() {
    if (!this.isDm()) {
      showToast('Tylko Mistrz Gry może otwierać bestiariusz', 'warning');
      return;
    }
    this.openTab();
  },

  _getMount() {
    return document.getElementById('bestiary-panel-root');
  },

  _wpisLabel(n) {
    return `${n} ${n === 1 ? 'wpis' : n < 5 ? 'wpisy' : 'wpisów'}`;
  },

  _panelEyebrow() {
    return 'Rejestr polowania · kampania';
  },

  _panelSub(filteredCount) {
    const total = this.monsters.length;
    const n = filteredCount ?? (document.getElementById('bestiary-grid') ? this._filteredMonsters().length : total);
    if (!total) return 'Pusty rejestr · dodaj pierwszy trop stat blocku';
    if (n === total) return `${this._wpisLabel(total)} w rejestrze · stat blocki, duplikaty i spawn na mapę`;
    return `${n} z ${total} po filtrach · ${this._wpisLabel(total)} łącznie w kampanii`;
  },

  _updateHeaderMeta() {
    const n = document.getElementById('bestiary-grid') ? this._filteredMonsters().length : this.monsters.length;
    const brow = document.getElementById('bestiary-eyebrow');
    const sub = document.getElementById('bestiary-sub-line');
    if (brow) brow.textContent = this._panelEyebrow();
    if (sub) sub.textContent = this._panelSub(n);
  },

  _filteredMonsters() {
    let list = this.monsters.slice();
    const f = this._filter;
    if (f.type) list = list.filter((m) => m.monster_type === f.type);
    if (f.crMax !== '' && f.crMax != null) {
      const max = parseFloat(f.crMax);
      if (!Number.isNaN(max)) list = list.filter((m) => this._crToNum(m.cr) <= max);
    }
    if (f.query) {
      const q = f.query.toLowerCase();
      list = list.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        m.monster_type.toLowerCase().includes(q) ||
        m.size.toLowerCase().includes(q) ||
        (m.notes || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => this._crToNum(a.cr) - this._crToNum(b.cr) || a.name.localeCompare(b.name, 'pl'));
  },

  _renderPanelHeader() {
    const sub = this._panelSub();
    return `
      <header class="dm-feature-header bestiary-header">
        <span class="dm-feature-header__icon" aria-hidden="true">🎯</span>
        <div class="dm-feature-header__titles">
          <p class="bestiary-header__eyebrow" id="bestiary-eyebrow">${escapeHtml(this._panelEyebrow())}</p>
          <h3>Bestiariusz łowcy</h3>
          <p class="dm-feature-header__sub" id="bestiary-sub-line">${escapeHtml(sub)}</p>
        </div>
      </header>`;
  },

  // ===== Panel sesji: rejestr potworów =====
  _renderPanel() {
    const mount = this._getMount();
    if (!mount) return;
    mount.innerHTML = `
      <div class="bestiary-tome bestiary-tome--panel" role="region" aria-label="Bestiariusz łowcy">
        <div class="bestiary-spine" aria-hidden="true"><span class="bestiary-spine__marks">⚔ 🎯 ⚔</span></div>
        <div class="bestiary-volume">
          <div class="bestiary-cover">
            ${this._renderPanelHeader()}
          </div>
          <div class="dm-feature-toolbar bestiary-toolbar">
            <span class="bestiary-toolbar__label" aria-hidden="true">Tropy</span>
            <input type="search" class="bestiary-search" placeholder="Szukaj po nazwie, typie, notatkach…" value="${escapeHtml(this._filter.query)}">
            <select class="bestiary-type" title="Typ stworzenia">
              <option value="">Wszystkie typy</option>
              ${Object.entries(this.TYPE_LABELS_PL).map(([k, label]) =>
                `<option value="${k}" ${this._filter.type === k ? 'selected' : ''}>${this.TYPE_ICONS[k] || '🐾'} ${escapeHtml(label)}</option>`).join('')}
            </select>
            <select class="bestiary-cr" title="Maks. stopień wyzwania">
              <option value="" ${this._filter.crMax === '' ? 'selected' : ''}>CR: dowolne</option>
              ${[['0.25', '1/4'], ['1', '1'], ['3', '3'], ['5', '5'], ['10', '10'], ['15', '15'], ['20', '20']].map(([v, label]) =>
                `<option value="${v}" ${String(this._filter.crMax) === v ? 'selected' : ''}>CR ≤ ${label}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-primary bestiary-btn-new" data-action="new">🐾 Nowy trop</button>
          </div>
          <div class="bestiary-folio">
            <div class="bestiary-folio__stain" aria-hidden="true"></div>
            <div class="bestiary-folio__wax" aria-hidden="true"></div>
            <div class="modal-body dm-feature-body bestiary-body">
              <p class="bestiary-motto dm-feature-intro">Polowanie zaczyna się od <strong>notatek w terenie</strong> — zapisuj stat blocki, trop i puść stwora na mapę jednym kliknięciem.</p>
              <div class="bestiary-grid" id="bestiary-grid"></div>
            </div>
          </div>
        </div>
      </div>`;

    mount.querySelector('[data-action="new"]')?.addEventListener('click', () => this.openEditor(null));
    mount.querySelector('.bestiary-search')?.addEventListener('input', (e) => {
      this._filter.query = e.target.value;
      this._renderGrid();
    });
    mount.querySelector('.bestiary-type')?.addEventListener('change', (e) => {
      this._filter.type = e.target.value;
      this._renderGrid();
    });
    mount.querySelector('.bestiary-cr')?.addEventListener('change', (e) => {
      this._filter.crMax = e.target.value;
      this._renderGrid();
    });
    this._renderGrid();
  },

  _renderGrid() {
    const grid = document.getElementById('bestiary-grid');
    if (!grid) return;
    const list = this._filteredMonsters();

    if (!list.length) {
      const emptyMsg = this.monsters.length
        ? 'Żaden trop nie pasuje do filtrów.<br>Zmień wyszukiwanie lub kryteria CR / typu.'
        : 'Rejestr jest pusty — żaden trop nie został jeszcze zapisany.<br>Kliknij <strong>🐾 Nowy trop</strong>, by dodać pierwszego potwora.';
      grid.innerHTML = `<div class="bestiary-empty dm-feature-empty">
        <span class="dm-feature-empty__icon" aria-hidden="true">🎯</span>
        <p>${emptyMsg}</p>
      </div>`;
      this._updateHeaderMeta();
      return;
    }
    grid.innerHTML = list.map((m) => this._renderCard(m)).join('');
    this._updateHeaderMeta();
    grid.querySelectorAll('[data-act]').forEach((btn) => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (act === 'edit') this.openEditor(id);
        else if (act === 'view') this.viewStatBlock(id);
        else if (act === 'spawn') this.spawn(id);
        else if (act === 'delete') this.delete(id);
        else if (act === 'duplicate') this.duplicate(id);
      });
    });
  },

  _renderCard(m) {
    const typeKey = (m.monster_type || 'beast').toLowerCase().replace(/\s+/g, '');
    const typeNorm = Object.keys(this.TYPE_ICONS).find((k) => typeKey.includes(k)) || 'beast';
    const typeIcon = this.TYPE_ICONS[typeNorm] || '🐾';
    const typeLabel = this.TYPE_LABELS_PL[typeNorm] || m.monster_type;
    return `<article class="bestiary-entry bestiary-entry--${typeNorm}" data-type="${escapeHtml(typeNorm)}">
      <div class="bestiary-entry__mark" aria-hidden="true"></div>
      <header class="bestiary-card-head">
        <div class="bestiary-card-title">
          <span class="bestiary-type-sigil" title="${escapeHtml(typeLabel)}">${typeIcon}</span>
          <strong>${escapeHtml(m.name)}</strong>
          <span class="bestiary-cr-badge" title="Stopień wyzwania">CR ${escapeHtml(m.cr || '0')}</span>
        </div>
        <div class="bestiary-card-sub">${escapeHtml(m.size)} ${escapeHtml(typeLabel)} · ${escapeHtml(m.alignment)}</div>
      </header>
      <div class="bestiary-card-stats">
        <span class="bestiary-stat-pip" title="Klasa Pancerza"><b>AC</b> ${m.ac}</span>
        <span class="bestiary-stat-pip" title="Punkty Życia"><b>HP</b> ${m.hp_max}</span>
        <span class="bestiary-stat-pip" title="Szybkość"><b>SPD</b> ${escapeHtml(m.speed)}</span>
        <span class="bestiary-stat-pip" title="Ataki"><b>⚔</b> ${(m.attacks || []).length}</span>
      </div>
      <footer class="bestiary-card-actions">
        <button type="button" class="btn btn-xs btn-secondary" data-act="view" data-id="${escapeHtml(m.id)}" title="Stat block">📋</button>
        <button type="button" class="btn btn-xs btn-secondary" data-act="edit" data-id="${escapeHtml(m.id)}" title="Edytuj">✏️</button>
        <button type="button" class="btn btn-xs btn-secondary" data-act="duplicate" data-id="${escapeHtml(m.id)}" title="Duplikuj">📑</button>
        <button type="button" class="btn btn-xs btn-primary bestiary-btn-spawn" data-act="spawn" data-id="${escapeHtml(m.id)}" title="Spawnuj jako NPC">🎯 Na mapę</button>
        <button type="button" class="btn btn-xs btn-danger" data-act="delete" data-id="${escapeHtml(m.id)}" title="Usuń">✕</button>
      </footer>
    </article>`;
  },

  _crToNum(cr) {
    if (cr == null) return 0;
    const s = String(cr).replace(',', '.');
    if (s.includes('/')) {
      const [a, b] = s.split('/').map(Number);
      return b ? a / b : 0;
    }
    return parseFloat(s) || 0;
  },

  // ===== Stat block view =====
  viewStatBlock(id) {
    const m = this.monsters.find((x) => x.id === id);
    if (!m) return;
    const stats = m.stats || {};
    const mod = (s) => Math.floor((parseInt(s, 10) - 10) / 2);
    const fmt = (s) => `${s} (${mod(s) >= 0 ? '+' : ''}${mod(s)})`;
    const sect = (label, items, formatItem) => items?.length
      ? `<section><h4>${escapeHtml(label)}</h4>${items.map(formatItem).join('')}</section>` : '';

    const typeKey = (m.monster_type || '').toLowerCase();
    const typeNorm = Object.keys(this.TYPE_ICONS).find((k) => typeKey.includes(k)) || 'beast';
    const typeIcon = this.TYPE_ICONS[typeNorm] || '🐾';
    const html = `
      <div class="statblock statblock--hunter">
        <div class="statblock-hunter__stamp" aria-hidden="true">Łowca · trop potwierdzony</div>
        <header class="statblock-hunter__head">
          <span class="statblock-hunter__sigil" aria-hidden="true">${typeIcon}</span>
          <div>
            <h2>${escapeHtml(m.name)}</h2>
            <p><em>${escapeHtml(m.size)} ${escapeHtml(m.monster_type)}, ${escapeHtml(m.alignment)}</em></p>
          </div>
        </header>
        <div class="statblock-divider"></div>
        <div class="statblock-meta">
          <p><strong>Klasa Pancerza</strong> ${m.ac}</p>
          <p><strong>Punkty Życia</strong> ${m.hp_max}${m.hp_formula ? ` (${escapeHtml(m.hp_formula)})` : ''}</p>
          <p><strong>Szybkość</strong> ${escapeHtml(m.speed)}</p>
        </div>
        <div class="statblock-divider"></div>
        <table class="statblock-stats">
          <tr><th>SIŁ</th><th>ZRĘ</th><th>KON</th><th>INT</th><th>MĄD</th><th>CHA</th></tr>
          <tr><td>${fmt(stats.str || 10)}</td><td>${fmt(stats.dex || 10)}</td><td>${fmt(stats.con || 10)}</td><td>${fmt(stats.int || 10)}</td><td>${fmt(stats.wis || 10)}</td><td>${fmt(stats.cha || 10)}</td></tr>
        </table>
        <div class="statblock-divider"></div>
        <div class="statblock-meta">
          ${m.saving_throws?.length ? `<p><strong>Rzuty obronne</strong> ${escapeHtml(m.saving_throws.join(', '))}</p>` : ''}
          ${m.skills?.length ? `<p><strong>Umiejętności</strong> ${escapeHtml(m.skills.join(', '))}</p>` : ''}
          ${m.damage_resistances ? `<p><strong>Odporności</strong> ${escapeHtml(m.damage_resistances)}</p>` : ''}
          ${m.damage_immunities ? `<p><strong>Niewrażliwości</strong> ${escapeHtml(m.damage_immunities)}</p>` : ''}
          ${m.condition_immunities ? `<p><strong>Niewrażliwości na stany</strong> ${escapeHtml(m.condition_immunities)}</p>` : ''}
          ${m.senses ? `<p><strong>Zmysły</strong> ${escapeHtml(m.senses)}</p>` : ''}
          ${m.languages ? `<p><strong>Języki</strong> ${escapeHtml(m.languages)}</p>` : ''}
          <p><strong>Stopień wyzwania</strong> ${escapeHtml(m.cr || '0')}</p>
        </div>
        <div class="statblock-divider"></div>
        ${sect('Cechy', m.traits, (t) => `<p><strong><em>${escapeHtml(t.name)}.</em></strong> ${escapeHtml(t.desc || '')}</p>`)}
        ${sect('Akcje', m.actions, (t) => `<p><strong><em>${escapeHtml(t.name)}.</em></strong> ${escapeHtml(t.desc || '')}</p>`)}
        ${m.attacks?.length ? `<section><h4>Ataki</h4>${m.attacks.map((a) => `
          <p><strong><em>${escapeHtml(a.name || 'Atak')}.</em></strong>
          <em>${escapeHtml(a.kind || 'Atak bronią wręcz')}.</em>
          ${a.toHit ? `+${String(a.toHit).replace(/^\+/, '')} do trafienia, ` : ''}
          zasięg ${escapeHtml(a.range || '5 ft')}, jeden cel.
          <em>Trafienie:</em> ${escapeHtml(a.damage || '1d4')}${a.damageType ? ` ${escapeHtml(a.damageType)}` : ''}${a.special ? `. ${escapeHtml(a.special)}` : ''}.</p>
        `).join('')}</section>` : ''}
        ${sect('Reakcje', m.reactions, (t) => `<p><strong><em>${escapeHtml(t.name)}.</em></strong> ${escapeHtml(t.desc || '')}</p>`)}
        ${m.legendary_actions?.length ? `<section><h4>Akcje legendarne</h4>
          <p><em>${escapeHtml(m.name)} może wykonać 3 akcje legendarne, jedną na turę po cudzej.</em></p>
          ${m.legendary_actions.map((t) => `<p><strong><em>${escapeHtml(t.name)}${t.cost ? ` (${escapeHtml(t.cost)})` : ''}.</em></strong> ${escapeHtml(t.desc || '')}</p>`).join('')}
        </section>` : ''}
        ${m.notes ? `<div class="statblock-divider"></div><section><h4>Notatki</h4><p>${escapeHtml(m.notes).replace(/\n/g, '<br>')}</p></section>` : ''}
      </div>`;
    const typeLine = [m.size, m.monster_type].filter(Boolean).join(' ');
    const footerHtml = `
      <button type="button" class="btn btn-primary" data-action="spawn">🎯 Spawnuj jako NPC</button>
      <button type="button" class="btn btn-secondary" data-action="edit">✏️ Edytuj</button>
      <button type="button" class="btn btn-secondary" data-action="close">Zamknij</button>`;
    const overlay = createStackedFeatureOverlay('bestiary-view-overlay', buildFeatureModalHtml({
      icon: '🎯',
      title: m.name,
      meta: `CR ${m.cr || '0'}${typeLine ? ` · ${typeLine}` : ''} · trop potwierdzony`,
      modalClass: 'bestiary-view-modal bestiary-journal-view modal-xl',
      bodyHtml: html,
      footerHtml
    }));
    const close = () => overlay.remove();
    overlay.querySelector('[data-action="spawn"]')?.addEventListener('click', () => { close(); this.spawn(id); });
    overlay.querySelector('[data-action="edit"]')?.addEventListener('click', () => { close(); this.openEditor(id); });
    overlay.querySelector('[data-action="close"]')?.addEventListener('click', close);
  },

  // ===== Editor =====
  openEditor(id) {
    const isEdit = !!id;
    const m = isEdit ? this.monsters.find((x) => x.id === id) : null;
    const data = m ? JSON.parse(JSON.stringify(m)) : {
      name: '', size: 'Średni', monster_type: 'humanoid', alignment: 'neutralny',
      cr: '1', ac: 12, hp_max: 10, hp_formula: '', speed: '9 m',
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      saving_throws: [], skills: [],
      damage_resistances: '', damage_immunities: '', condition_immunities: '',
      senses: '', languages: '',
      attacks: [], traits: [], actions: [], legendary_actions: [], reactions: [],
      notes: '', image_url: ''
    };

    const html = `
      <form id="bestiary-editor-form" class="bestiary-editor">
        <div class="form-row">
          <div class="form-group" style="flex:2;"><label>Nazwa</label><input type="text" id="be-name" required value="${escapeHtml(data.name)}"></div>
          <div class="form-group"><label>CR</label><input type="text" id="be-cr" value="${escapeHtml(data.cr)}" placeholder="1/4, 1, 5, 17..."></div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Rozmiar</label>
            <select id="be-size">
              ${['Drobny', 'Mały', 'Średni', 'Duży', 'Wielki', 'Gargantuiczny'].map((s) => `<option ${data.size === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Typ</label>
            <select id="be-type">
              ${[
                ['aberration','Aberracja'],['beast','Bestia'],['celestial','Niebianin'],['construct','Konstrukt'],
                ['dragon','Smok'],['elemental','Żywiołak'],['fey','Wróżka'],['fiend','Czart'],
                ['giant','Olbrzym'],['humanoid','Humanoid'],['monstrosity','Monstrum'],['ooze','Maź'],
                ['plant','Roślina'],['undead','Nieumarły']
              ].map(([k, v]) => `<option value="${k}" ${data.monster_type === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Charakter</label><input type="text" id="be-alignment" value="${escapeHtml(data.alignment)}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>AC</label><input type="number" id="be-ac" min="0" max="40" value="${data.ac}"></div>
          <div class="form-group"><label>HP max</label><input type="number" id="be-hp" min="1" max="9999" value="${data.hp_max}"></div>
          <div class="form-group"><label>Formuła HP</label><input type="text" id="be-hpformula" value="${escapeHtml(data.hp_formula)}" placeholder="np. 8d10+24"></div>
          <div class="form-group" style="flex:2;"><label>Szybkość</label><input type="text" id="be-speed" value="${escapeHtml(data.speed)}" placeholder="9 m, lot 18 m, pływanie 6 m"></div>
        </div>
        <fieldset class="be-fieldset"><legend>Cechy (statystyki)</legend>
          <div class="be-stats-grid">
            ${['str','dex','con','int','wis','cha'].map((k) => `
              <div class="form-group">
                <label>${k.toUpperCase()}</label>
                <input type="number" id="be-stat-${k}" min="1" max="30" value="${data.stats[k] || 10}">
              </div>`).join('')}
          </div>
        </fieldset>
        <div class="form-row">
          <div class="form-group"><label>Rzuty obronne <small>(np. SIŁ +5)</small></label><input type="text" id="be-saves" value="${escapeHtml((data.saving_throws || []).join(', '))}"></div>
          <div class="form-group"><label>Umiejętności <small>(np. Skradanie +6)</small></label><input type="text" id="be-skills" value="${escapeHtml((data.skills || []).join(', '))}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Odporności</label><input type="text" id="be-dr" value="${escapeHtml(data.damage_resistances)}"></div>
          <div class="form-group"><label>Niewrażliwości na obrażenia</label><input type="text" id="be-di" value="${escapeHtml(data.damage_immunities)}"></div>
          <div class="form-group"><label>Niewrażliwości na stany</label><input type="text" id="be-ci" value="${escapeHtml(data.condition_immunities)}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Zmysły</label><input type="text" id="be-senses" value="${escapeHtml(data.senses)}" placeholder="ciemnowidzenie 18 m, percepcja 13"></div>
          <div class="form-group"><label>Języki</label><input type="text" id="be-langs" value="${escapeHtml(data.languages)}"></div>
        </div>

        <fieldset class="be-fieldset"><legend>⚔️ Ataki</legend>
          <div id="be-attacks-list"></div>
          <button type="button" class="btn btn-sm btn-secondary" id="be-add-attack">➕ Dodaj atak</button>
        </fieldset>

        <fieldset class="be-fieldset"><legend>🌟 Cechy</legend>
          <div id="be-traits-list"></div>
          <button type="button" class="btn btn-sm btn-secondary" id="be-add-trait">➕ Dodaj cechę</button>
        </fieldset>

        <fieldset class="be-fieldset"><legend>🎯 Akcje</legend>
          <div id="be-actions-list"></div>
          <button type="button" class="btn btn-sm btn-secondary" id="be-add-action">➕ Dodaj akcję</button>
        </fieldset>

        <fieldset class="be-fieldset"><legend>⚡ Reakcje</legend>
          <div id="be-reactions-list"></div>
          <button type="button" class="btn btn-sm btn-secondary" id="be-add-reaction">➕ Dodaj reakcję</button>
        </fieldset>

        <fieldset class="be-fieldset"><legend>👑 Akcje legendarne</legend>
          <div id="be-legendary-list"></div>
          <button type="button" class="btn btn-sm btn-secondary" id="be-add-legendary">➕ Dodaj akcję legendarną</button>
        </fieldset>

        <div class="form-group"><label>Notatki / opis / lore</label><textarea id="be-notes" rows="4">${escapeHtml(data.notes)}</textarea></div>
        <div class="form-group"><label>Obraz (URL)</label><input type="text" id="be-image" value="${escapeHtml(data.image_url)}" placeholder="opcjonalnie"></div>
      </form>`;
    const footerHtml = `
      ${isEdit ? '<button type="button" class="btn btn-danger" data-action="delete">🗑️ Usuń</button>' : ''}
      <button type="button" class="btn btn-secondary" data-action="close">Anuluj</button>
      <button type="submit" form="bestiary-editor-form" class="btn btn-primary">${isEdit ? '💾 Zapisz trop' : '🐾 Zapisz w rejestrze'}</button>`;
    const bodyHtml = `
      <p class="bestiary-edit-intro dm-feature-intro">${isEdit
        ? 'Popraw wpis w <strong>dzienniku łowcy</strong> — stat block, ataki i cechy legendarnie.'
        : 'Nowa strona w rejestrze — opisz trop, statystyki i puść potwora na mapę po zapisie.'}</p>
      ${html}`;
    const overlay = createStackedFeatureOverlay('bestiary-edit-overlay', buildFeatureModalHtml({
      icon: '🎯',
      title: isEdit ? (data.name || 'Edytuj trop') : 'Nowy trop',
      meta: isEdit ? 'Bestiariusz łowcy' : 'Zapis w rejestrze kampanii',
      modalClass: 'bestiary-editor-modal bestiary-journal-edit modal-xl',
      bodyHtml,
      footerHtml
    }));
    const close = () => overlay.remove();

    // dynamic lists
    const renderList = (key, holder, fields) => {
      const root = document.getElementById(holder);
      if (!root) return;
      root.innerHTML = (data[key] || []).map((it, idx) => `
        <div class="be-row" data-row="${idx}">
          ${fields.map((f) => `
            <div class="form-group">
              <label>${escapeHtml(f.label)}</label>
              ${f.type === 'textarea'
                ? `<textarea data-field="${f.key}" rows="2">${escapeHtml(it[f.key] || '')}</textarea>`
                : `<input type="text" data-field="${f.key}" value="${escapeHtml(it[f.key] || '')}" placeholder="${escapeHtml(f.placeholder || '')}">`}
            </div>`).join('')}
          <button type="button" class="btn btn-xs btn-danger be-remove">✕</button>
        </div>`).join('');
      root.querySelectorAll('.be-row').forEach((row) => {
        const idx = parseInt(row.dataset.row, 10);
        row.querySelectorAll('[data-field]').forEach((inp) => {
          inp.addEventListener('input', () => { data[key][idx][inp.dataset.field] = inp.value; });
        });
        row.querySelector('.be-remove').addEventListener('click', () => {
          data[key].splice(idx, 1);
          renderList(key, holder, fields);
        });
      });
    };

    const attackFields = [
      { key: 'name', label: 'Nazwa', placeholder: 'Pazury' },
      { key: 'kind', label: 'Typ', placeholder: 'Atak bronią wręcz' },
      { key: 'toHit', label: 'Bonus do trafienia', placeholder: '+5' },
      { key: 'range', label: 'Zasięg', placeholder: '5 ft' },
      { key: 'damage', label: 'Obrażenia', placeholder: '2d6+3' },
      { key: 'damageType', label: 'Typ obrażeń', placeholder: 'sieczne' },
      { key: 'special', label: 'Efekt dodatkowy', placeholder: 'np. ST KON 15...' }
    ];
    const namedDescFields = [
      { key: 'name', label: 'Nazwa', placeholder: 'Atak wielokrotny' },
      { key: 'desc', label: 'Opis', placeholder: 'Potwór wykonuje dwa ataki...', type: 'textarea' }
    ];
    const legendaryFields = [
      { key: 'name', label: 'Nazwa', placeholder: 'Atak ogonem' },
      { key: 'cost', label: 'Koszt', placeholder: '1, 2 lub 3 akcje' },
      { key: 'desc', label: 'Opis', placeholder: '', type: 'textarea' }
    ];

    renderList('attacks', 'be-attacks-list', attackFields);
    renderList('traits', 'be-traits-list', namedDescFields);
    renderList('actions', 'be-actions-list', namedDescFields);
    renderList('reactions', 'be-reactions-list', namedDescFields);
    renderList('legendary_actions', 'be-legendary-list', legendaryFields);

    const rerenderAll = () => {
      renderList('attacks', 'be-attacks-list', attackFields);
      renderList('traits', 'be-traits-list', namedDescFields);
      renderList('actions', 'be-actions-list', namedDescFields);
      renderList('reactions', 'be-reactions-list', namedDescFields);
      renderList('legendary_actions', 'be-legendary-list', legendaryFields);
    };
    const editorBody = overlay.querySelector('.dm-feature-body');
    if (editorBody && typeof AISuggest !== 'undefined' && !editorBody.querySelector('.ai-suggest-bar')) {
      AISuggest.attachToElement(editorBody, 'bestiary_monster', () => ({
        name: overlay.querySelector('#be-name')?.value,
        cr: overlay.querySelector('#be-cr')?.value,
        monster_type: overlay.querySelector('#be-type')?.value
      }), (r) => AISuggest.applyBestiary(r, { ...data, _rerenderLists: rerenderAll }));
    }

    overlay.querySelector('#be-add-attack')?.addEventListener('click', () => {
      data.attacks = data.attacks || [];
      data.attacks.push({ name: '', kind: 'Atak bronią wręcz', toHit: '', range: '5 ft', damage: '', damageType: '', special: '' });
      renderList('attacks', 'be-attacks-list', attackFields);
    });
    overlay.querySelector('#be-add-trait')?.addEventListener('click', () => {
      data.traits = data.traits || [];
      data.traits.push({ name: '', desc: '' });
      renderList('traits', 'be-traits-list', namedDescFields);
    });
    overlay.querySelector('#be-add-action')?.addEventListener('click', () => {
      data.actions = data.actions || [];
      data.actions.push({ name: '', desc: '' });
      renderList('actions', 'be-actions-list', namedDescFields);
    });
    overlay.querySelector('#be-add-reaction')?.addEventListener('click', () => {
      data.reactions = data.reactions || [];
      data.reactions.push({ name: '', desc: '' });
      renderList('reactions', 'be-reactions-list', namedDescFields);
    });
    overlay.querySelector('#be-add-legendary')?.addEventListener('click', () => {
      data.legendary_actions = data.legendary_actions || [];
      data.legendary_actions.push({ name: '', cost: '', desc: '' });
      renderList('legendary_actions', 'be-legendary-list', legendaryFields);
    });

    overlay.querySelector('[data-action="close"]')?.addEventListener('click', close);
    overlay.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
      if (confirm(`Usunąć potwora "${data.name}"?`)) {
        this.delete(id);
        close();
      }
    });

    overlay.querySelector('#bestiary-editor-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const splitCsv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
      const payload = {
        name: overlay.querySelector('#be-name').value.trim(),
        size: overlay.querySelector('#be-size').value,
        monster_type: overlay.querySelector('#be-type').value,
        alignment: overlay.querySelector('#be-alignment').value.trim(),
        cr: overlay.querySelector('#be-cr').value.trim(),
        ac: parseInt(overlay.querySelector('#be-ac').value, 10) || 10,
        hp_max: parseInt(overlay.querySelector('#be-hp').value, 10) || 1,
        hp_formula: overlay.querySelector('#be-hpformula').value.trim(),
        speed: overlay.querySelector('#be-speed').value.trim(),
        stats: ['str','dex','con','int','wis','cha'].reduce((acc, k) => {
          acc[k] = parseInt(overlay.querySelector(`#be-stat-${k}`).value, 10) || 10;
          return acc;
        }, {}),
        saving_throws: splitCsv(overlay.querySelector('#be-saves').value),
        skills: splitCsv(overlay.querySelector('#be-skills').value),
        damage_resistances: overlay.querySelector('#be-dr').value.trim(),
        damage_immunities: overlay.querySelector('#be-di').value.trim(),
        condition_immunities: overlay.querySelector('#be-ci').value.trim(),
        senses: overlay.querySelector('#be-senses').value.trim(),
        languages: overlay.querySelector('#be-langs').value.trim(),
        attacks: data.attacks || [],
        traits: data.traits || [],
        actions: data.actions || [],
        legendary_actions: data.legendary_actions || [],
        reactions: data.reactions || [],
        notes: overlay.querySelector('#be-notes').value,
        image_url: overlay.querySelector('#be-image').value.trim()
      };
      try {
        if (isEdit) {
          await apiFetch(`/bestiary/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          showToast(`Zapisano: ${payload.name}`, 'success');
        } else {
          await apiFetch(`/campaigns/${App.currentCampaign.id}/bestiary`, { method: 'POST', body: JSON.stringify(payload) });
          showToast(`Utworzono: ${payload.name}`, 'success');
        }
        close();
        await this.load();
        this._renderGrid();
      } catch (err) {
        showToast(err.message || 'Błąd zapisu', 'error');
      }
    });
  },

  async duplicate(id) {
    const m = this.monsters.find((x) => x.id === id);
    if (!m) return;
    try {
      const copy = JSON.parse(JSON.stringify(m));
      copy.name = `${m.name} (kopia)`;
      delete copy.id;
      delete copy.campaign_id;
      delete copy.created_at;
      await apiFetch(`/campaigns/${App.currentCampaign.id}/bestiary`, { method: 'POST', body: JSON.stringify(copy) });
      showToast('Skopiowano potwora', 'success');
      await this.load();
      this._renderGrid();
    } catch (err) {
      showToast(err.message || 'Nie udało się skopiować', 'error');
    }
  },

  async delete(id) {
    const m = this.monsters.find((x) => x.id === id);
    if (!m) return;
    if (!confirm(`Usunąć "${m.name}" z bestiariusza? Tej operacji nie można cofnąć.`)) return;
    try {
      await apiFetch(`/bestiary/${id}`, { method: 'DELETE' });
      showToast('Usunięto', 'success');
      await this.load();
      this._renderGrid();
    } catch (err) {
      showToast(err.message || 'Błąd usuwania', 'error');
    }
  },

  async spawn(id) {
    const m = this.monsters.find((x) => x.id === id);
    if (!m) return;
    const visible = confirm(`Spawnować "${m.name}" jako NPC?\n\nOK = widoczny dla graczy\nAnuluj = ukryty (tylko MG)`);
    try {
      const npc = await apiFetch(`/bestiary/${id}/spawn`, {
        method: 'POST',
        body: JSON.stringify({ is_visible: visible })
      });
      showToast(`🎯 Spawnowano: ${npc.name}`, 'success');
      if (typeof Chat !== 'undefined' && Chat.onNpcCreated) Chat.onNpcCreated(npc);
      if (typeof DMPanel !== 'undefined' && DMPanel.loadNpcs) DMPanel.loadNpcs();
    } catch (err) {
      showToast(err.message || 'Błąd spawnowania', 'error');
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Bestiary;
}
