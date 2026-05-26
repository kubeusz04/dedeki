// ===== Map Creator & Presets =====
const MapCreator = {
  presets: [],
  lootTables: [],
  draft: null,
  activePresetId: null,
  activeTab: 'general',
  _blockSet: new Set(),
  _meta: { name: '', description: '', tags: '' },
  _selectedPropTpl: 'water-barrel',

  init() {
    document.getElementById('btn-map-creator')?.addEventListener('click', () => this.open());
    document.getElementById('btn-map-save-preset')?.addEventListener('click', () => {
      this.draft = this.buildDraftFromBattleMap();
      this.activePresetId = null;
      this._meta = { name: 'Mapa z sesji', description: '', tags: '' };
      this.open();
    });
  },

  defaultDraft() {
    return {
      version: 1,
      settings: {
        grid_size: 40,
        grid_width: 25,
        grid_height: 18,
        background_color: '#3b2618',
        background_image: '',
        map_blocking: [],
        map_zones: [],
        fog_enabled: false,
        los_fog_blocks: true
      },
      tokens: [],
      pins: []
    };
  },

  buildDraftFromBattleMap() {
    if (typeof BattleMap === 'undefined' || !BattleMap.settings) {
      return this.defaultDraft();
    }
    let map_blocking = [];
    try {
      map_blocking = JSON.parse(BattleMap.settings.map_blocking || '[]');
    } catch (_e) { /* ignore */ }
    if (typeof MapTactics !== 'undefined') {
      map_blocking = MapTactics.blockingToArray(MapTactics.parseBlockingList(map_blocking));
    }

    return {
      version: 1,
      settings: {
        grid_size: BattleMap.settings.grid_size ?? 40,
        grid_width: BattleMap.settings.grid_width ?? 25,
        grid_height: BattleMap.settings.grid_height ?? 18,
        background_color: BattleMap.settings.background_color || '#3b2618',
        background_image: BattleMap.settings.background_image || '',
        map_blocking,
        map_zones: typeof MapZones !== 'undefined'
          ? [...MapZones.zones]
          : (() => {
            let z = BattleMap.settings?.map_zones;
            if (typeof z === 'string') { try { z = JSON.parse(z); } catch { z = []; } }
            return z || [];
          })(),
        fog_enabled: !!BattleMap.settings.fog_enabled,
        los_fog_blocks: BattleMap.settings.los_fog_blocks !== 0
      },
      tokens: (BattleMap.tokens || []).map((t) => ({
        entity_name: t.entity_name,
        entity_type: t.entity_type === 'player' ? 'npc' : t.entity_type,
        x: t.x, y: t.y, color: t.color, size: t.size || 1,
        hp_max: t.hp_max || 0, hp_current: t.hp_current ?? t.hp_max ?? 0,
        ac: t.ac || 0, stat_notes: t.stat_notes || '',
        image_url: t.image_url || '', is_visible: t.is_visible !== 0,
        is_locked: !!t.is_locked, npc_template_id: ''
      })),
      pins: (BattleMap.pins || []).map((p) => {
        let loot_table_id = '';
        let description = p.description || '';
        if (description.startsWith('{')) {
          try {
            const meta = JSON.parse(description);
            loot_table_id = meta.loot_table_id || '';
            description = meta.note || '';
          } catch (_e) { /* ignore */ }
        }
        return {
          x: p.x, y: p.y, pin_type: p.pin_type || 'note',
          label: p.label || '', description, color: p.color || '',
          is_visible: p.is_visible !== 0, loot_table_id
        };
      })
    };
  },

  syncBlockSetFromDraft() {
    this._blockSet = typeof MapTactics !== 'undefined'
      ? MapTactics.parseBlockingList(this.draft?.settings?.map_blocking || [])
      : new Set(this.draft?.settings?.map_blocking || []);
  },

  syncDraftBlocksFromSet() {
    if (!this.draft?.settings) return;
    this.draft.settings.map_blocking = typeof MapTactics !== 'undefined'
      ? MapTactics.blockingToArray(this._blockSet)
      : Array.from(this._blockSet);
  },

  async loadPresets() {
    if (!App.currentCampaign) return;
    try {
      this.presets = await apiFetch(`/campaigns/${App.currentCampaign.id}/map/presets`);
    } catch (_e) {
      this.presets = [];
    }
  },

  async loadLootTables() {
    if (!App.currentCampaign) return;
    try {
      this.lootTables = await apiFetch(`/campaigns/${App.currentCampaign.id}/loot-tables`);
    } catch (_e) {
      this.lootTables = [];
    }
  },

  async open(presetId = null) {
    if (App.currentCampaign?.role !== 'dm') {
      showToast('Tylko Mistrz Gry może używać kreatora map', 'warning');
      return;
    }
    await Promise.all([this.loadPresets(), this.loadLootTables()]);
    if (presetId) {
      await this.loadPreset(presetId);
    } else if (!this.draft) {
      this.draft = this.defaultDraft();
      this.activePresetId = null;
    }
    this.syncBlockSetFromDraft();
    this.renderModal();
  },

  async loadPreset(id) {
    const preset = await apiFetch(`/map/presets/${id}`);
    this.activePresetId = preset.id;
    this.draft = JSON.parse(JSON.stringify(preset.preset_data || this.defaultDraft()));
    this._meta = {
      name: preset.name,
      description: preset.description || '',
      tags: (preset.tags || []).join(', ')
    };
  },

  renderModal() {
    const propN = this.draft.tokens.filter((t) => this.isPropToken(t)).length;
    const summary = {
      tokens: this.draft.tokens.length - propN,
      props: propN,
      pins: this.draft.pins.length,
      blocks: this._blockSet.size
    };

    const presetRows = this.presets.length
      ? this.presets.map((p) => `
        <button type="button" class="map-preset-row ${p.id === this.activePresetId ? 'active' : ''}" data-preset-id="${p.id}">
          <strong>${escapeHtml(p.name)}</strong>
          <span class="sheet-hint">${p.summary?.grid || ''} · ⚔ ${p.summary?.tokens || 0} · 📍 ${p.summary?.pins || 0} · 🧱 ${p.summary?.blocks || 0}${p.summary?.hasBackground ? ' · 🖼' : ''}</span>
        </button>`).join('')
      : '<p class="sheet-hint">Brak zapisanych presetów.</p>';

    const propCount = this.draft.tokens.filter((t) => typeof MapProps !== 'undefined' && MapProps.parseNotes(t.stat_notes)).length;
    const tabs = [
      ['general', '⚙ Ogólne'],
      ['background', '🖼 Tło'],
      ['blocking', '🧱 Przeszkody'],
      ['props', `📦 Rekwizyty (${propCount})`],
      ['enemies', '👹 Przeciwnicy'],
      ['pins', '📍 Pinezki & łup']
    ];

    const html = `
      <div class="map-creator-layout">
        <aside class="map-creator-sidebar">
          <div class="map-creator-sidebar-head">
            <h4>Presety map</h4>
            <button type="button" class="btn btn-sm btn-primary" id="mc-new-preset">+ Nowy</button>
          </div>
          <button type="button" class="btn btn-sm btn-secondary btn-full" id="mc-from-current">📥 Z obecnej mapy</button>
          <div class="map-preset-list" id="map-preset-list">${presetRows}</div>
        </aside>
        <div class="map-creator-main">
          <div class="map-creator-tabs">
            ${tabs.map(([id, label]) => `
              <button type="button" class="map-creator-tab ${this.activeTab === id ? 'active' : ''}" data-mc-tab="${id}">${label}</button>
            `).join('')}
          </div>
          <div class="map-creator-panel" id="map-creator-panel"></div>
          <div class="map-creator-footer">
            <span class="sheet-hint">Tokeny: ${summary.tokens} · Rekwizyty: ${summary.props} · Pinezki: ${summary.pins} · Blokady: ${summary.blocks}</span>
            <div class="map-creator-footer-actions">
              ${this.activePresetId ? `<button type="button" class="btn btn-sm btn-danger" id="mc-delete">Usuń</button>
              <button type="button" class="btn btn-sm btn-secondary" id="mc-duplicate">Duplikuj</button>` : ''}
              <button type="button" class="btn btn-sm btn-secondary" id="mc-save">💾 Zapisz preset</button>
              <button type="button" class="btn btn-sm btn-primary" id="mc-apply">🗺 Wczytaj na mapę</button>
            </div>
          </div>
        </div>
      </div>
      <input type="file" id="mc-bg-file" accept="image/*" class="sr-only-input" tabindex="-1">
    `;

    showGenericModal('🗺️ Kreator map i presety', html, 'modal-xl map-creator-modal');
    this.renderPanel();
    this.bindModalEvents();
  },

  bindModalEvents() {
    document.querySelectorAll('[data-mc-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.syncDraftFromForm();
        this.activeTab = btn.dataset.mcTab;
        document.querySelectorAll('.map-creator-tab').forEach((b) => {
          b.classList.toggle('active', b.dataset.mcTab === this.activeTab);
        });
        this.renderPanel();
      });
    });

    document.getElementById('mc-new-preset')?.addEventListener('click', () => {
      this.draft = this.defaultDraft();
      this.activePresetId = null;
      this._meta = { name: 'Nowa mapa', description: '', tags: '' };
      this.syncBlockSetFromDraft();
      this.renderModal();
    });

    document.getElementById('mc-from-current')?.addEventListener('click', () => {
      this.draft = this.buildDraftFromBattleMap();
      this.syncBlockSetFromDraft();
      showToast('Zaimportowano obecną mapę do kreatora', 'success');
      this.renderModal();
    });

    document.getElementById('map-preset-list')?.addEventListener('click', (e) => {
      const row = e.target.closest('[data-preset-id]');
      if (!row) return;
      this.loadPreset(row.dataset.presetId).then(() => {
        this.syncBlockSetFromDraft();
        this.renderModal();
      });
    });

    document.getElementById('mc-save')?.addEventListener('click', () => this.savePreset());
    document.getElementById('mc-apply')?.addEventListener('click', () => this.applyPreset());
    document.getElementById('mc-delete')?.addEventListener('click', () => this.deletePreset());
    document.getElementById('mc-duplicate')?.addEventListener('click', () => this.duplicatePreset());
  },

  syncDraftFromForm() {
    const nameEl = document.getElementById('mc-name');
    if (nameEl) {
      this._meta = {
        name: nameEl.value.trim(),
        description: (document.getElementById('mc-desc')?.value || '').trim(),
        tags: (document.getElementById('mc-tags')?.value || '').trim()
      };
    }
    const s = this.draft.settings;
    const gs = document.getElementById('mc-grid-size');
    if (gs) s.grid_size = parseInt(gs.value, 10) || 40;
    const gw = document.getElementById('mc-grid-w');
    if (gw) s.grid_width = Math.min(60, Math.max(5, parseInt(gw.value, 10) || 25));
    const gh = document.getElementById('mc-grid-h');
    if (gh) s.grid_height = Math.min(60, Math.max(5, parseInt(gh.value, 10) || 18));
    const bgc = document.getElementById('mc-bg-color');
    if (bgc) s.background_color = bgc.value;
    const fog = document.getElementById('mc-fog');
    if (fog) s.fog_enabled = fog.checked;
    this.syncDraftBlocksFromSet();
  },

  renderPanel() {
    const panel = document.getElementById('map-creator-panel');
    if (!panel) return;
    const meta = this._meta;
    const s = this.draft.settings;

    if (this.activeTab === 'general') {
      panel.innerHTML = `
        <div class="form-group"><label>Nazwa presetu</label><input type="text" id="mc-name" value="${escapeHtml(meta.name)}" maxlength="60"></div>
        <div class="form-group"><label>Opis</label><textarea id="mc-desc" rows="2">${escapeHtml(meta.description)}</textarea></div>
        <div class="form-group"><label>Tagi (przecinkami)</label><input type="text" id="mc-tags" value="${escapeHtml(meta.tags)}" placeholder="dungeon, las, boss"></div>
        <div class="form-row">
          <div class="form-group"><label>Szerokość (kratki)</label><input type="number" id="mc-grid-w" min="5" max="60" value="${s.grid_width}"></div>
          <div class="form-group"><label>Wysokość (kratki)</label><input type="number" id="mc-grid-h" min="5" max="60" value="${s.grid_height}"></div>
          <div class="form-group"><label>Rozmiar kratki (px)</label><input type="number" id="mc-grid-size" min="20" max="80" value="${s.grid_size}"></div>
        </div>
        <div class="form-group"><label>Kolor tła (bez grafiki)</label><input type="color" id="mc-bg-color" value="${escapeHtml(s.background_color || '#3b2618')}"></div>
        <label><input type="checkbox" id="mc-fog" ${s.fog_enabled ? 'checked' : ''}> Domyślnie włącz mgłę wojny po wczytaniu</label>
      `;
      return;
    }

    if (this.activeTab === 'background') {
      this.renderBackgroundPanel(panel, s);
      return;
    }

    if (this.activeTab === 'blocking') {
      this.renderBlockingPanel(panel, s);
      return;
    }

    if (this.activeTab === 'props') {
      this.renderPropsPanel(panel, s);
      return;
    }

    if (this.activeTab === 'enemies') {
      this.renderEnemiesPanel(panel, s);
      return;
    }

    if (this.activeTab === 'pins') {
      this.renderPinsPanel(panel);
    }
  },

  renderBackgroundPanel(panel, s) {
    const bg = s.background_image || '';
    panel.innerHTML = `
      <p class="sheet-hint">Tło jest powiązane z presetem — po zapisie zostaje skopiowane, żeby nie zginęło.</p>
      <div class="map-creator-bg-preview ${bg ? '' : 'empty'}">
        ${bg ? `<img src="${escapeHtml(bg)}" alt="Podgląd tła">` : '<span>Brak tła — kolor z zakładki Ogólne</span>'}
      </div>
      <div class="map-creator-bg-actions">
        <button type="button" class="btn btn-sm btn-primary" id="mc-upload-bg">${this.activePresetId ? '⬆ Wgraj tło presetu' : '💾 Zapisz preset, potem wgraj tło'}</button>
        ${bg ? '<button type="button" class="btn btn-sm btn-secondary" id="mc-clear-bg">Usuń tło</button>' : ''}
        ${!this.activePresetId ? '<button type="button" class="btn btn-sm btn-secondary" id="mc-use-map-bg">Użyj tła z obecnej mapy</button>' : ''}
      </div>`;
    document.getElementById('mc-upload-bg')?.addEventListener('click', () => {
      if (!this.activePresetId) {
        showToast('Najpierw zapisz preset', 'warning');
        return;
      }
      const input = document.getElementById('mc-bg-file');
      if (input) {
        input.onchange = (e) => this.uploadPresetBg(e);
        input.click();
      }
    });
    document.getElementById('mc-clear-bg')?.addEventListener('click', () => {
      s.background_image = '';
      this.renderPanel();
    });
    document.getElementById('mc-use-map-bg')?.addEventListener('click', () => {
      s.background_image = BattleMap.settings?.background_image || '';
      showToast('Skopiowano ścieżkę tła z mapy', 'info');
      this.renderPanel();
    });
  },

  renderBlockingPanel(panel, s) {
    const w = s.grid_width;
    const h = s.grid_height;
    let cells = '';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const key = `${x},${y}`;
        cells += `<button type="button" class="mc-block-cell ${this._blockSet.has(key) ? 'blocked' : ''}" data-block="${key}" title="${x}, ${y}"></button>`;
      }
    }
    panel.innerHTML = `
      <p class="sheet-hint">Kliknij kratki, aby dodać/usunąć przeszkody LoS. ${this._blockSet.size} zaznaczonych.</p>
      <div class="mc-block-toolbar">
        <button type="button" class="btn btn-sm btn-secondary" id="mc-block-clear">Wyczyść</button>
        <button type="button" class="btn btn-sm btn-secondary" id="mc-block-from-map">📥 Z obecnej mapy</button>
      </div>
      <div class="mc-block-grid" style="--mc-cols:${w}">${cells}</div>`;
    panel.querySelector('.mc-block-grid')?.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-block]');
      if (!cell) return;
      const key = cell.dataset.block;
      if (this._blockSet.has(key)) this._blockSet.delete(key);
      else this._blockSet.add(key);
      cell.classList.toggle('blocked');
      this.syncDraftBlocksFromSet();
    });
    document.getElementById('mc-block-clear')?.addEventListener('click', () => {
      this._blockSet.clear();
      this.syncDraftBlocksFromSet();
      this.renderPanel();
    });
    document.getElementById('mc-block-from-map')?.addEventListener('click', () => {
      if (BattleMap.settings?.map_blocking) {
        this._blockSet = MapTactics.parseBlockingList(BattleMap.settings.map_blocking);
        this.syncDraftBlocksFromSet();
      }
      this.renderPanel();
    });
  },

  isPropToken(t) {
    return typeof MapProps !== 'undefined' && !!MapProps.parseNotes(t.stat_notes);
  },

  renderPropsPanel(panel, s) {
    const w = s.grid_width;
    const h = s.grid_height;
    const tplId = this._selectedPropTpl || 'water-barrel';
    const templates = typeof MapPropTemplates !== 'undefined' ? MapPropTemplates.all() : [];
    const cards = templates.map((t) => `
      <button type="button" class="mc-prop-card ${tplId === t.id ? 'active' : ''}" data-prop-tpl="${t.id}" title="${escapeHtml(t.description)}">
        <span class="mc-prop-icon">${t.icon}</span>
        <span class="mc-prop-name">${escapeHtml(t.namePl)}</span>
      </button>`).join('');

    const propAt = new Map();
    this.draft.tokens.forEach((t, i) => {
      if (!this.isPropToken(t)) return;
      propAt.set(`${t.x},${t.y}`, { t, i });
    });

    let cells = '';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const key = `${x},${y}`;
        const placed = propAt.get(key);
        const label = placed ? (MapPropTemplates.get(MapProps.parseNotes(placed.t.stat_notes)?.templateId)?.icon || '📦') : '';
        cells += `<button type="button" class="mc-prop-cell ${placed ? 'has-prop' : ''}" data-prop-cell="${key}">${label}</button>`;
      }
    }

    panel.innerHTML = `
      <p class="sheet-hint">Beczki, skrzynie, zagrożenia — po trafieniu lub zniszczeniu tworzą strefy terenu na mapie (np. woda, ogień).</p>
      <div class="mc-prop-catalog">${cards}</div>
      <p class="sheet-hint">Kliknij kratkę: postaw wybrany rekwizyt. Kliknij ponownie na ikonie — usuń.</p>
      <div class="mc-prop-grid" style="--mc-cols:${w}">${cells}</div>
      <div class="mc-entity-list mc-prop-list">${this.renderPropTokenRows()}</div>`;

    panel.querySelectorAll('[data-prop-tpl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._selectedPropTpl = btn.dataset.propTpl;
        this.renderPanel();
      });
    });

    panel.querySelector('.mc-prop-grid')?.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-prop-cell]');
      if (!cell) return;
      const [x, y] = cell.dataset.propCell.split(',').map((n) => parseInt(n, 10));
      const existing = propAt.get(`${x},${y}`);
      if (existing) {
        this.draft.tokens.splice(existing.i, 1);
        this.renderPanel();
        return;
      }
      const token = MapProps.tokenFromTemplate(this._selectedPropTpl, x, y);
      if (token) this.draft.tokens.push(token);
      this.renderPanel();
    });

    panel.querySelectorAll('.mc-del-prop').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.draft.tokens.splice(parseInt(btn.dataset.tokenIdx, 10), 1);
        this.renderPanel();
      });
    });
  },

  renderPropTokenRows() {
    const props = this.draft.tokens.filter((t) => this.isPropToken(t));
    if (!props.length) return '<p class="sheet-hint">Brak rekwizytów na mapie.</p>';
    return props.map((t) => {
      const i = this.draft.tokens.indexOf(t);
      const meta = MapProps.parseNotes(t.stat_notes);
      const tpl = MapPropTemplates.get(meta?.templateId);
      return `<div class="mc-entity-row">
        <span>${tpl?.icon || '📦'} ${escapeHtml(t.entity_name)}</span>
        <span class="sheet-hint">(${t.x}, ${t.y}) · ${t.hp_max} PW</span>
        <button type="button" class="btn btn-sm btn-danger mc-del-prop" data-token-idx="${i}">✕</button>
      </div>`;
    }).join('');
  },

  renderEnemiesPanel(panel, s) {
    const tplOpts = typeof NpcTemplates !== 'undefined'
      ? NpcTemplates.getAll().filter((t) => t.category === 'monster').slice(0, 80).map((t) =>
        `<option value="${t.id}">${escapeHtml(t.namePl)} (CR ${t.cr || '?'})</option>`
      ).join('')
      : '';
    panel.innerHTML = `
      <div class="mc-add-row">
        <select id="mc-enemy-tpl" class="input-sm"><option value="">— szablon potwora —</option>${tplOpts}</select>
        <button type="button" class="btn btn-sm btn-primary" id="mc-add-enemy-tpl">+ Z szablonu</button>
        <button type="button" class="btn btn-sm btn-secondary" id="mc-add-enemy-manual">+ Ręcznie</button>
      </div>
      <p class="sheet-hint">X/Y = pozycja na siatce. Tokeny trafią na mapę po wczytaniu presetu.</p>
      <div class="mc-entity-list">${this.renderTokenRows()}</div>`;
    document.getElementById('mc-add-enemy-tpl')?.addEventListener('click', () => {
      const id = document.getElementById('mc-enemy-tpl')?.value;
      if (!id || typeof NpcTemplates === 'undefined') return;
      const t = NpcTemplates.getById(id);
      if (!t) return;
      this.draft.tokens.push({
        entity_name: t.namePl,
        entity_type: 'monster',
        x: Math.floor(Math.random() * Math.max(1, s.grid_width - 1)),
        y: Math.floor(Math.random() * Math.max(1, s.grid_height - 1)),
        color: '#5c1010',
        size: 1,
        hp_max: t.max_hp || 10,
        hp_current: t.max_hp || 10,
        ac: t.armor_class || 10,
        stat_notes: t.description || '',
        is_visible: true,
        is_locked: false,
        npc_template_id: t.id
      });
      this.renderPanel();
    });
    document.getElementById('mc-add-enemy-manual')?.addEventListener('click', () => {
      this.draft.tokens.push({
        entity_name: 'Potwór',
        entity_type: 'monster',
        x: 0, y: 0, color: '#5c1010', size: 1,
        hp_max: 10, hp_current: 10, ac: 12,
        stat_notes: '', is_visible: true, is_locked: false
      });
      this.renderPanel();
    });
    this.bindTokenRowEvents(panel);
  },

  renderPinsPanel(panel) {
    const lootOpts = this.lootTables.map((t) =>
      `<option value="${t.id}">${escapeHtml(t.name)}</option>`
    ).join('');
    const pinTypes = Object.entries(MAP_PIN_TYPES).map(([k, v]) =>
      `<option value="${k}">${v.icon} ${v.label}</option>`
    ).join('');
    panel.innerHTML = `
      <div class="mc-add-row">
        <select id="mc-pin-type" class="input-sm">${pinTypes}</select>
        <button type="button" class="btn btn-sm btn-primary" id="mc-add-pin">+ Pinezka</button>
      </div>
      <p class="sheet-hint">Typy: łup (z tabelą), pułapka, drzwi, sekret, zadanie.</p>
      <div class="mc-entity-list">${this.renderPinRows(lootOpts)}</div>`;
    document.getElementById('mc-add-pin')?.addEventListener('click', () => {
      const pt = document.getElementById('mc-pin-type')?.value || 'note';
      const pinMeta = MAP_PIN_TYPES[pt] || MAP_PIN_TYPES.note;
      this.draft.pins.push({
        x: 0, y: 0, pin_type: pt,
        label: pinMeta.label,
        description: '',
        color: pinMeta.color,
        is_visible: true,
        loot_table_id: pt === 'loot' ? (this.lootTables[0]?.id || '') : ''
      });
      this.renderPanel();
    });
    this.bindPinRowEvents(panel);
  },

  renderTokenRows() {
    const combat = this.draft.tokens.filter((t) => !this.isPropToken(t));
    if (!combat.length) {
      return '<p class="sheet-hint">Brak tokenów — dodaj przeciwników lub NPC.</p>';
    }
    return combat.map((t) => {
      const i = this.draft.tokens.indexOf(t);
      return `
      <div class="mc-entity-row" data-token-idx="${i}">
        <input type="text" class="input-sm mc-t-name" value="${escapeHtml(t.entity_name)}" placeholder="Nazwa">
        <select class="input-sm mc-t-type">
          <option value="monster" ${t.entity_type === 'monster' ? 'selected' : ''}>Potwór</option>
          <option value="npc" ${t.entity_type === 'npc' ? 'selected' : ''}>NPC</option>
          <option value="object" ${t.entity_type === 'object' ? 'selected' : ''}>Obiekt</option>
        </select>
        <input type="number" class="input-sm mc-t-x" value="${t.x}" min="0" title="X">
        <input type="number" class="input-sm mc-t-y" value="${t.y}" min="0" title="Y">
        <input type="number" class="input-sm mc-t-hp" value="${t.hp_max}" min="0" title="HP">
        <input type="number" class="input-sm mc-t-ac" value="${t.ac}" min="0" title="AC">
        <button type="button" class="btn btn-sm btn-danger mc-del" data-del-token="${i}">✕</button>
      </div>
    `;
    }).join('');
  },

  renderPinRows(lootOpts) {
    if (!this.draft.pins.length) {
      return '<p class="sheet-hint">Brak pinezek — dodaj łup, pułapki, drzwi itd.</p>';
    }
    return this.draft.pins.map((p, i) => {
      const lootSelect = p.pin_type === 'loot'
        ? `<select class="input-sm mc-p-loot"><option value="">— tabela —</option>${this.lootTables.map((t) =>
          `<option value="${t.id}" ${p.loot_table_id === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
        ).join('')}</select>`
        : '';
      return `
      <div class="mc-entity-row mc-pin-row" data-pin-idx="${i}">
        <select class="input-sm mc-p-type">
          ${Object.entries(MAP_PIN_TYPES).map(([k, v]) =>
            `<option value="${k}" ${p.pin_type === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`
          ).join('')}
        </select>
        <input type="text" class="input-sm mc-p-label" value="${escapeHtml(p.label)}" placeholder="Etykieta">
        <input type="number" class="input-sm mc-p-x" value="${p.x}" min="0">
        <input type="number" class="input-sm mc-p-y" value="${p.y}" min="0">
        ${lootSelect}
        <button type="button" class="btn btn-sm btn-danger mc-del" data-del-pin="${i}">✕</button>
      </div>`;
    }).join('');
  },

  bindTokenRowEvents(panel) {
    panel.querySelectorAll('[data-del-token]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.draft.tokens.splice(parseInt(btn.dataset.delToken, 10), 1);
        this.renderPanel();
      });
    });
    panel.querySelectorAll('[data-token-idx]').forEach((row) => {
      const i = parseInt(row.dataset.tokenIdx, 10);
      const t = this.draft.tokens[i];
      row.querySelector('.mc-t-name')?.addEventListener('input', (e) => { t.entity_name = e.target.value; });
      row.querySelector('.mc-t-type')?.addEventListener('change', (e) => { t.entity_type = e.target.value; });
      row.querySelector('.mc-t-x')?.addEventListener('change', (e) => { t.x = parseInt(e.target.value, 10) || 0; });
      row.querySelector('.mc-t-y')?.addEventListener('change', (e) => { t.y = parseInt(e.target.value, 10) || 0; });
      row.querySelector('.mc-t-hp')?.addEventListener('change', (e) => {
        t.hp_max = parseInt(e.target.value, 10) || 0;
        t.hp_current = t.hp_max;
      });
      row.querySelector('.mc-t-ac')?.addEventListener('change', (e) => { t.ac = parseInt(e.target.value, 10) || 0; });
    });
  },

  bindPinRowEvents(panel) {
    panel.querySelectorAll('[data-del-pin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.draft.pins.splice(parseInt(btn.dataset.delPin, 10), 1);
        this.renderPanel();
      });
    });
    panel.querySelectorAll('[data-pin-idx]').forEach((row) => {
      const i = parseInt(row.dataset.pinIdx, 10);
      const p = this.draft.pins[i];
      row.querySelector('.mc-p-type')?.addEventListener('change', (e) => {
        p.pin_type = e.target.value;
        this.renderPanel();
      });
      row.querySelector('.mc-p-label')?.addEventListener('input', (e) => { p.label = e.target.value; });
      row.querySelector('.mc-p-x')?.addEventListener('change', (e) => { p.x = parseInt(e.target.value, 10) || 0; });
      row.querySelector('.mc-p-y')?.addEventListener('change', (e) => { p.y = parseInt(e.target.value, 10) || 0; });
      row.querySelector('.mc-p-loot')?.addEventListener('change', (e) => { p.loot_table_id = e.target.value; });
    });
  },

  async uploadPresetBg(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !this.activePresetId) return;
    try {
      const formData = new FormData();
      formData.append('background', file);
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/map/presets/${this.activePresetId}/background`, {
        method: 'POST',
        headers,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Błąd uploadu');
      this.draft.settings.background_image = data.preset_data?.settings?.background_image || '';
      showToast('Tło presetu zapisane', 'success');
      this.renderPanel();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async savePreset() {
    this.syncDraftFromForm();
    const meta = this._meta;
    const tags = (meta.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
    try {
      if (this.activePresetId) {
        await apiFetch(`/map/presets/${this.activePresetId}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: meta.name || 'Mapa',
            description: meta.description,
            tags,
            preset_data: this.draft
          })
        });
        showToast('Preset zaktualizowany', 'success');
      } else {
        const created = await apiFetch(`/campaigns/${App.currentCampaign.id}/map/presets`, {
          method: 'POST',
          body: JSON.stringify({
            name: meta.name || 'Nowa mapa',
            description: meta.description,
            tags,
            preset_data: this.draft
          })
        });
        this.activePresetId = created.id;
        this.draft = created.preset_data;
        showToast('Preset zapisany', 'success');
      }
      await this.loadPresets();
      this.renderModal();
    } catch (err) {
      showToast(err.message || 'Nie udało się zapisać', 'error');
    }
  },

  async applyPreset() {
    if (!this.activePresetId) {
      showToast('Najpierw zapisz preset', 'warning');
      return;
    }
    if (!confirm('Wczytać preset na mapę kampanii? Obecne tokeny i pinezki zostaną zastąpione.')) return;
    try {
      await apiFetch(`/campaigns/${App.currentCampaign.id}/map/presets/${this.activePresetId}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          clearTokens: true,
          clearPins: true,
          resetFog: true,
          resetInitiative: false
        })
      });
      closeModal('generic-modal');
      showToast('Mapa wczytana z presetu', 'success');
      BattleMap.loadMap();
    } catch (err) {
      showToast(err.message || 'Błąd wczytywania', 'error');
    }
  },

  async deletePreset() {
    if (!this.activePresetId || !confirm('Usunąć ten preset?')) return;
    try {
      await apiFetch(`/map/presets/${this.activePresetId}`, { method: 'DELETE' });
      this.activePresetId = null;
      this.draft = this.defaultDraft();
      this._meta = { name: '', description: '', tags: '' };
      await this.loadPresets();
      showToast('Preset usunięty', 'info');
      this.renderModal();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async duplicatePreset() {
    if (!this.activePresetId) return;
    try {
      const copy = await apiFetch(`/map/presets/${this.activePresetId}/duplicate`, { method: 'POST' });
      await this.loadPresets();
      await this.loadPreset(copy.id);
      this.syncBlockSetFromDraft();
      showToast('Duplikat utworzony', 'success');
      this.renderModal();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
};
