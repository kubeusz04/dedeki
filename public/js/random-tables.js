// ===== Losowe Tabele — zakładka sesji (lampa dżina) =====
const RandomTables = {
  tables: null,
  _panelBound: false,

  init() {},

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  openTab() {
    document.querySelector('.session-tab[data-panel="random-tables-panel"]')?.click();
  },

  open() {
    if (!App.currentCampaign) return;
    if (!this.isDm()) {
      showToast('Losowe tabele są dostępne tylko dla MG', 'warning');
      return;
    }
    this.openTab();
  },

  onPanelActivate() {
    if (!App.currentCampaign) return;
    if (!this.isDm()) {
      showToast('Losowe tabele są dostępne tylko dla MG', 'warning');
      return;
    }
    this._loadTables();
    this._renderPanel();
  },

  _loadTables() {
    this.tables = JSON.parse(JSON.stringify(
      typeof DndRandomTables !== 'undefined' ? DndRandomTables.TABLES : {}
    ));
  },

  _getMount() {
    return document.getElementById('random-tables-panel-root');
  },

  _isUiMounted() {
    return !!document.getElementById('random-tables-root');
  },

  _categoryCount() {
    return Object.keys(this.tables || {}).length;
  },

  _renderPanel() {
    const mount = this._getMount();
    if (!mount) return;
    const n = this._categoryCount();
    mount.innerHTML = `
      <div class="genie-chamber genie-chamber--panel" role="region" aria-label="Losowe tabele — lampa dżina">
        <div class="genie-chamber__stars" aria-hidden="true"></div>
        <div class="genie-chamber__mist" aria-hidden="true"></div>
        <header class="genie-chamber__head">
          <div class="genie-lamp" id="genie-lamp" aria-hidden="true">
            <span class="genie-lamp__glow"></span>
            <span class="genie-lamp__body">🪔</span>
            <span class="genie-lamp__smoke"></span>
          </div>
          <div class="genie-chamber__titles">
            <h2 class="genie-chamber__title">Dżin Losowych Tabel</h2>
            <p class="genie-chamber__tagline" id="genie-count-line">${n} kategorii · rub lampę · rzuć życzenie</p>
          </div>
        </header>
        <section class="genie-wish-stage" id="genie-wish-stage" aria-live="polite">
          <p class="genie-wish-stage__label">Ostatnie życzenie</p>
          <p class="genie-wish-stage__hint">Wybierz pergamin i naciśnij „Życzenie”, by dżin wylosował inspirację.</p>
          <p class="genie-wish-stage__text" id="genie-wish-text"></p>
        </section>
        <div class="genie-toolbar">
          <label class="genie-hint-wrap">
            <span class="genie-hint-wrap__icon" aria-hidden="true">💨</span>
            <input type="text" class="genie-hint random-tables-hint" placeholder="Szept do dżina: klimat, region, ton kampanii…">
          </label>
          <button type="button" class="btn btn-sm genie-btn-pack" id="btn-ai-random-pack">✨ Nowa tabela (AI)</button>
        </div>
        <div class="genie-scrolls-wrap">
          <div id="random-tables-root" class="genie-scrolls random-tables-root"></div>
        </div>
      </div>`;
    this._renderGrid();
    this._bindPanelEvents();
  },

  _updateCountLine() {
    const line = document.getElementById('genie-count-line');
    if (line) line.textContent = `${this._categoryCount()} kategorii · rub lampę · rzuć życzenie`;
  },

  _bindPanelEvents() {
    const mount = this._getMount();
    if (!mount || mount.dataset.bound === '1') return;
    mount.dataset.bound = '1';

    mount.addEventListener('click', (e) => {
      const rollBtn = e.target.closest('[data-roll-table]');
      if (rollBtn) {
        const tid = rollBtn.dataset.rollTable;
        const tableName = this._tableNameFromId(tid);
        const options = tableName ? this.tables[tableName] : null;
        if (options) this.rollTable(tid, options, tableName);
        return;
      }
      const aiBtn = e.target.closest('[data-ai-table]');
      if (aiBtn && typeof AISuggest !== 'undefined') {
        const tableId = aiBtn.dataset.aiTable;
        const tableName = this._tableNameFromId(tableId) || tableId;
        const existing = this.tables[tableName] || [];
        (async () => {
          const hint = mount.querySelector('.random-tables-hint')?.value?.trim() || '';
          const r = await AISuggest.request('random_table_entry', {
            tableName,
            existing,
            hint,
            _btn: aiBtn
          });
          if (r?.entry) {
            existing.push(r.entry);
            this._renderGrid();
            showToast('Dżin dodał wpis do pergaminu', 'success');
          }
        })();
      }
    });

    mount.querySelector('#btn-ai-random-pack')?.addEventListener('click', async () => {
      if (typeof AISuggest === 'undefined') return;
      const hint = mount.querySelector('.random-tables-hint')?.value?.trim() || '';
      const btn = mount.querySelector('#btn-ai-random-pack');
      const pack = await AISuggest.request('random_table_pack', { hint, _btn: btn });
      if (!pack?.tableName || !pack.options?.length) return;
      this.tables[pack.tableName] = pack.options.slice();
      this._renderGrid();
      this._updateCountLine();
      showToast(`Nowy pergamin: ${pack.tableName}`, 'success');
    });
  },

  _tableNameFromId(tableId) {
    return Object.keys(this.tables || {}).find((k) => k.replace(/\s+/g, '-') === tableId);
  },

  _renderGrid() {
    const root = document.getElementById('random-tables-root');
    if (!root || !this.tables) return;
    let html = '';
    for (const [tableName, options] of Object.entries(this.tables)) {
      const tableId = tableName.replace(/\s+/g, '-');
      html += `
        <article class="genie-scroll random-table-block" data-table-id="${escapeHtml(tableId)}">
          <div class="genie-scroll__seal" aria-hidden="true">☪</div>
          <div class="random-table-header genie-scroll__head">
            <strong class="random-table-title genie-scroll__title">${escapeHtml(tableName)}</strong>
            <span class="random-table-count genie-scroll__count">${options.length} wpisów</span>
            <div class="random-table-actions genie-scroll__actions">
              <button type="button" class="btn btn-xs btn-ai-suggest genie-scroll__ai" data-ai-table="${escapeHtml(tableId)}" title="Dodaj wpis przez AI">✨</button>
              <button type="button" class="btn btn-sm genie-btn-wish" data-roll-table="${escapeHtml(tableId)}">🌟 Życzenie</button>
            </div>
          </div>
          <div class="random-table-result genie-scroll__result" data-result-for="${escapeHtml(tableId)}"></div>
        </article>`;
    }
    root.innerHTML = html || '<p class="genie-scrolls-empty">Brak pergaminów — poproś dżina o nową tabelę (AI).</p>';
  },

  _pulseLamp() {
    const lamp = document.getElementById('genie-lamp');
    if (!lamp) return;
    lamp.classList.remove('genie-lamp--granting');
    void lamp.offsetWidth;
    lamp.classList.add('genie-lamp--granting');
    lamp.addEventListener('animationend', () => lamp.classList.remove('genie-lamp--granting'), { once: true });
  },

  _showWish(tableName, result) {
    const stage = document.getElementById('genie-wish-stage');
    const text = document.getElementById('genie-wish-text');
    if (stage) stage.classList.add('genie-wish-stage--active');
    if (text) {
      text.innerHTML = `<span class="genie-wish-stage__from">${escapeHtml(tableName)}</span> ${escapeHtml(result)}`;
    }
  },

  rollTable(tableId, options, tableName) {
    if (!options?.length) return;
    this._pulseLamp();
    const idx = Math.floor(Math.random() * options.length);
    const result = options[idx];
    const name = tableName || this._tableNameFromId(tableId) || tableId;

    const el = document.querySelector(`[data-result-for="${tableId}"]`);
    const block = document.querySelector(`.genie-scroll[data-table-id="${tableId}"]`);
    if (block) {
      block.classList.remove('genie-scroll--revealed');
      void block.offsetWidth;
      block.classList.add('genie-scroll--revealed');
    }
    if (el) {
      el.innerHTML = `<strong class="random-table-hit genie-scroll__hit">✨ ${escapeHtml(result)}</strong>`;
    }
    this._showWish(name, result);
  }
};
