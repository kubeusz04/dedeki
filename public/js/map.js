// ===== Battle Map Module =====
const MAP_PIN_TYPES = {
  note: { icon: '📝', label: 'Notatka', color: '#c9a227' },
  loot: { icon: '💰', label: 'Łup', color: '#d4a84a' },
  trap: { icon: '⚠️', label: 'Pułapka', color: '#a63d2f' },
  secret: { icon: '🔮', label: 'Sekret', color: '#5c4a6e' },
  door: { icon: '🚪', label: 'Drzwi', color: '#7d6a4a' },
  quest: { icon: '❗', label: 'Zadanie', color: '#4a6b3a' }
};

const BattleMap = {
  canvas: null,
  ctx: null,
  viewport: null,
  tokens: [],
  pins: [],
  settings: null,
  movementTrails: {},
  dragToken: null,
  dragOffset: { x: 0, y: 0 },
  dragStartX: null,
  dragStartY: null,
  dragMaxFt: null,
  isDragging: false,
  isPaintingFog: false,
  isPaintingBlock: false,
  isPaintingTerrain: false,
  backgroundImageObj: null,
  backgroundImageSrc: '',
  tokenImageCache: new Map(),
  zoom: 1,
  fogRevealed: new Set(),
  toolMode: 'select',
  selectedTokenId: null,
  selectedPinId: null,
  pendingTokenImageId: null,
  activePointers: [],
  measureStart: null,
  measureEnd: null,
  localTrailSegments: [],
  _gridAlignDrag: null,
  _mapCampaignId: null,
  _initialMapFitDone: false,
  _pendingGridAlign: null,

  init() {
    this.canvas = document.getElementById('battle-map');
    this.viewport = document.getElementById('map-viewport');
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
    }

    document.getElementById('btn-add-token')?.addEventListener('click', () => this.showAddTokenDialog());
    document.getElementById('btn-upload-map-bg')?.addEventListener('click', () => {
      document.getElementById('map-bg-file')?.click();
    });
    document.getElementById('btn-remove-map-bg')?.addEventListener('click', () => this.removeBackground());
    document.getElementById('btn-clear-map')?.addEventListener('click', () => {
      if (confirm('Wyczyścić wszystkie tokeny z mapy?')) {
        App.socket?.emit('map-clear');
      }
    });
    document.getElementById('btn-map-undo')?.addEventListener('click', () => {
      App.socket?.emit('map-undo-move');
    });
    document.getElementById('btn-fog-toggle')?.addEventListener('click', () => this.toggleFogEnabled());
    document.getElementById('btn-fog-reveal-all')?.addEventListener('click', () => this.revealAllFog());
    document.getElementById('btn-fog-hide-all')?.addEventListener('click', () => this.hideAllFog());
    document.getElementById('btn-map-clear-trails')?.addEventListener('click', () => {
      if (confirm('Wyczyścić ślady ruchu na mapie?')) {
        App.socket?.emit('map-clear-trails');
      }
    });
    document.getElementById('btn-map-toggle-trails')?.addEventListener('click', () => this.toggleTrails());
    document.getElementById('btn-map-zoom-in')?.addEventListener('click', () => this.setZoom(this.zoom + 0.15));
    document.getElementById('btn-map-zoom-out')?.addEventListener('click', () => this.setZoom(this.zoom - 0.15));
    document.getElementById('map-grid-cell-width')?.addEventListener('change', (e) => {
      this.commitGridCellSizeFromInputs();
    });
    document.getElementById('map-grid-cell-height')?.addEventListener('change', (e) => {
      this.commitGridCellSizeFromInputs();
    });
    document.getElementById('map-grid-cell-width')?.addEventListener('input', () => {
      this.onGridCellSizeInput();
    });
    document.getElementById('map-grid-cell-height')?.addEventListener('input', () => {
      this.onGridCellSizeInput();
    });
    this.bindGridAlignControls();
    document.getElementById('map-resolution-preset')?.addEventListener('change', (e) => {
      const preset = e.target.value;
      if (!preset) return;
      const dims = this.resolutionPresetDims(preset);
      if (!dims || !App.socket || !App.currentCampaign) return;
      this._userZoomLocked = false;
      App.socket.emit('map-update-settings', {
        grid_width: dims.w,
        grid_height: dims.h,
        grid_size: dims.gs,
        grid_cell_width: dims.gs,
        grid_cell_height: dims.gs,
      });
    });

    this._gridOpacityDebounce = null;
    const opacitySlider = document.getElementById('map-grid-opacity');
    const opacityOut = document.getElementById('map-grid-opacity-value');
    opacitySlider?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      if (opacityOut) opacityOut.textContent = `${v}%`;
      if (this.settings) {
        this.settings.grid_opacity = v;
        this.render();
      }
      if (!this.isDm() || !App.socket) return;
      clearTimeout(this._gridOpacityDebounce);
      this._gridOpacityDebounce = setTimeout(() => {
        App.socket.emit('map-update-settings', { grid_opacity: v });
      }, 180);
    });
    document.getElementById('map-bg-file')?.addEventListener('change', (e) => this.onBackgroundFileSelected(e));
    document.getElementById('token-image-file')?.addEventListener('change', (e) => this.onTokenImageSelected(e));

    document.querySelectorAll('[data-map-tool]').forEach((btn) => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.mapTool));
    });

    this.viewport?.addEventListener('wheel', (e) => {
      if (this.toolMode === 'grid-align' && this.isDm()) {
        e.preventDefault();
        this.handleGridAlignWheel(e);
        return;
      }
      if (e.shiftKey) return;
      e.preventDefault();
      const step = e.ctrlKey || e.metaKey ? 0.2 : 0.1;
      const delta = e.deltaY > 0 ? -step : step;
      this.zoomAtPoint(this.zoom * (1 + delta), e.clientX, e.clientY);
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.onMouseLeave());
    this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onRightClick(e);
    });
    this.canvas.addEventListener('auxclick', (e) => {
      if (e.button === 1) e.preventDefault();
    });
    this.bindPanning();

    document.getElementById('map-pins-list')?.addEventListener('click', (e) => {
      const row = e.target.closest('[data-pin-id]');
      if (!row) return;
      this.selectPin(row.dataset.pinId);
      this.scrollToPin(row.dataset.pinId);
    });

    document.getElementById('map-tokens-list')?.addEventListener('click', (e) => {
      const row = e.target.closest('[data-token-id]');
      if (!row) return;
      this.selectToken(row.dataset.tokenId);
    });

    this.setTool('select');
    if (typeof MapFullscreen !== 'undefined') MapFullscreen.init();
    if (typeof MapZones !== 'undefined') MapZones.init();
    document.getElementById('btn-map-place-prop')?.addEventListener('click', () => this.openPropPlacementPicker());
    document.getElementById('btn-map-fit')?.addEventListener('click', () => this.fitToViewport());
    this.bindAutoFitResize();
  },

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  normalizeGridOffsets(settings) {
    if (!settings) return;
    settings.grid_offset_x = Math.round(Number(settings.grid_offset_x) || 0);
    settings.grid_offset_y = Math.round(Number(settings.grid_offset_y) || 0);
  },

  _gridAlignStorageKey() {
    const id = App.currentCampaign?.id;
    return id ? `dedeki-map-grid-align:${id}` : '';
  },

  readStoredGridAlign() {
    const key = this._gridAlignStorageKey();
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        const legacyKey = key.replace('grid-align', 'grid-offset');
        const legacyRaw = localStorage.getItem(legacyKey);
        if (!legacyRaw) return null;
        const legacy = JSON.parse(legacyRaw);
        return {
          x: Math.round(Number(legacy.x) || 0),
          y: Math.round(Number(legacy.y) || 0),
          gsW: null,
          gsH: null
        };
      }
      const p = JSON.parse(raw);
      return {
        x: Math.round(Number(p.x) || 0),
        y: Math.round(Number(p.y) || 0),
        gsW: p.gsW != null ? this.clampGridCellSize(p.gsW) : null,
        gsH: p.gsH != null ? this.clampGridCellSize(p.gsH) : null
      };
    } catch (_e) {
      return null;
    }
  },

  writeStoredGridAlign(x, y, gsW, gsH) {
    const key = this._gridAlignStorageKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify({
      x: Math.round(Number(x) || 0),
      y: Math.round(Number(y) || 0),
      gsW: this.clampGridCellSize(gsW),
      gsH: this.clampGridCellSize(gsH)
    }));
  },

  mergeGridAlignFromSources(settings) {
    if (!settings || !this.isDm()) return;
    this.normalizeGridOffsets(settings);
    this.normalizeCellSizes(settings);

    if (this._pendingGridAlign) {
      const p = this._pendingGridAlign;
      const matches = settings.grid_offset_x === p.x
        && settings.grid_offset_y === p.y
        && settings.grid_cell_width === p.gsW
        && settings.grid_cell_height === p.gsH;
      if (matches) {
        this._pendingGridAlign = null;
        this.writeStoredGridAlign(p.x, p.y, p.gsW, p.gsH);
      } else {
        settings.grid_offset_x = p.x;
        settings.grid_offset_y = p.y;
        settings.grid_cell_width = p.gsW;
        settings.grid_cell_height = p.gsH;
        settings.grid_size = Math.max(p.gsW, p.gsH);
      }
      return;
    }

    const stored = this.readStoredGridAlign();
    let restored = false;
    if (stored) {
      if (settings.grid_offset_x === 0 && settings.grid_offset_y === 0
        && (stored.x !== 0 || stored.y !== 0)) {
        settings.grid_offset_x = stored.x;
        settings.grid_offset_y = stored.y;
        restored = true;
      }
      const base = parseInt(settings.grid_size, 10) || 40;
      if (stored.gsW && stored.gsH
        && settings.grid_cell_width === base && settings.grid_cell_height === base
        && (stored.gsW !== base || stored.gsH !== base)) {
        settings.grid_cell_width = stored.gsW;
        settings.grid_cell_height = stored.gsH;
        settings.grid_size = Math.max(stored.gsW, stored.gsH);
        restored = true;
      }
      if (restored && App.socket?.connected) {
        this._pendingGridAlign = {
          x: settings.grid_offset_x,
          y: settings.grid_offset_y,
          gsW: settings.grid_cell_width,
          gsH: settings.grid_cell_height
        };
        App.socket.emit('map-update-settings', {
          grid_offset_x: settings.grid_offset_x,
          grid_offset_y: settings.grid_offset_y,
          grid_cell_width: settings.grid_cell_width,
          grid_cell_height: settings.grid_cell_height,
          grid_size: settings.grid_size
        });
      } else {
        this.writeStoredGridAlign(
          settings.grid_offset_x,
          settings.grid_offset_y,
          settings.grid_cell_width,
          settings.grid_cell_height
        );
      }
    } else if (settings.grid_offset_x !== 0 || settings.grid_offset_y !== 0
      || settings.grid_cell_width !== 40 || settings.grid_cell_height !== 40) {
      this.writeStoredGridAlign(
        settings.grid_offset_x,
        settings.grid_offset_y,
        settings.grid_cell_width,
        settings.grid_cell_height
      );
    }
  },

  normalizeCellSizes(settings) {
    if (!settings) return;
    const base = parseInt(settings.grid_size, 10) || 40;
    const w = parseInt(settings.grid_cell_width, 10);
    const h = parseInt(settings.grid_cell_height, 10);
    settings.grid_cell_width = w > 0 ? w : base;
    settings.grid_cell_height = h > 0 ? h : base;
  },

  gridMetrics() {
    this.normalizeCellSizes(this.settings);
    const gsW = this.settings?.grid_cell_width || 40;
    const gsH = this.settings?.grid_cell_height || 40;
    const ox = Math.round(Number(this.settings?.grid_offset_x) || 0);
    const oy = Math.round(Number(this.settings?.grid_offset_y) || 0);
    const gs = Math.max(gsW, gsH);
    return { gsW, gsH, gs, ox, oy };
  },

  cellSizePx() {
    const { gsW, gsH } = this.gridMetrics();
    return { w: gsW, h: gsH };
  },

  gridAreaPixelSize() {
    const gw = this.settings?.grid_width || 25;
    const gh = this.settings?.grid_height || 18;
    const { gsW, gsH } = this.gridMetrics();
    return { w: gw * gsW, h: gh * gsH };
  },

  backgroundPixelSize() {
    if (!this.backgroundImageObj) return null;
    const w = this.backgroundImageObj.naturalWidth;
    const h = this.backgroundImageObj.naturalHeight;
    if (!w || !h) return null;
    return { w, h };
  },

  mapPixelSize() {
    const grid = this.gridAreaPixelSize();
    const bg = this.backgroundPixelSize();
    if (!bg) return grid;
    return {
      w: Math.max(grid.w, bg.w),
      h: Math.max(grid.h, bg.h)
    };
  },

  clampGridCellSize(n) {
    const v = Math.round(Number(n) || 40);
    return Math.max(20, Math.min(200, v));
  },

  setGridCellSize(gsW, gsH, opts = {}) {
    if (!this.settings) return;
    const w = this.clampGridCellSize(gsW);
    const h = this.clampGridCellSize(gsH);
    this.settings.grid_cell_width = w;
    this.settings.grid_cell_height = h;
    this.settings.grid_size = Math.max(w, h);
    this.syncGridCellSizeUi();
    this.applyZoom();
    this.render();
    if (opts.persist) {
      if (!this.isDm()) return;
      const { ox, oy } = this.gridMetrics();
      this._pendingGridAlign = { x: ox, y: oy, gsW: w, gsH: h };
      this.writeStoredGridAlign(ox, oy, w, h);
      if (!App.socket || !App.currentCampaign) {
        showToast('Zapisano lokalnie (brak połączenia z serwerem)', 'warning');
        return;
      }
      App.socket.emit('map-update-settings', {
        grid_cell_width: w,
        grid_cell_height: h,
        grid_size: this.settings.grid_size
      });
    }
  },

  emitGridCellSizeUpdate(partial) {
    if (!App.socket || !App.currentCampaign) return;
    const { gsW, gsH } = this.gridMetrics();
    this.setGridCellSize(partial.width ?? gsW, partial.height ?? gsH, { persist: true });
  },

  onGridCellSizeInput() {
    if (!this.isDm()) return;
    const w = parseInt(document.getElementById('map-grid-cell-width')?.value, 10);
    const h = parseInt(document.getElementById('map-grid-cell-height')?.value, 10);
    this.setGridCellSize(
      Number.isNaN(w) ? this.settings?.grid_cell_width || 40 : w,
      Number.isNaN(h) ? this.settings?.grid_cell_height || 40 : h,
      { persist: false }
    );
    clearTimeout(this._gridSizeDebounce);
    this._gridSizeDebounce = setTimeout(() => this.commitGridCellSizeFromInputs(), 350);
  },

  commitGridCellSizeFromInputs() {
    clearTimeout(this._gridSizeDebounce);
    const w = parseInt(document.getElementById('map-grid-cell-width')?.value, 10);
    const h = parseInt(document.getElementById('map-grid-cell-height')?.value, 10);
    this.setGridCellSize(
      Number.isNaN(w) ? 40 : w,
      Number.isNaN(h) ? 40 : h,
      { persist: true }
    );
  },

  handleGridAlignWheel(e) {
    const { gsW, gsH } = this.gridMetrics();
    const step = e.deltaY > 0 ? -2 : 2;
    if (e.ctrlKey || e.metaKey) {
      this.setGridCellSize(gsW + step, gsH, { persist: false });
    } else if (e.altKey) {
      this.setGridCellSize(gsW, gsH + step, { persist: false });
    } else {
      this.setGridCellSize(gsW + step, gsH + step, { persist: false });
    }
    clearTimeout(this._gridSizeDebounce);
    this._gridSizeDebounce = setTimeout(() => this.commitGridCellSizeFromInputs(), 250);
  },

  syncGridCellSizeUi() {
    if (!this.settings) return;
    this.normalizeCellSizes(this.settings);
    const wEl = document.getElementById('map-grid-cell-width');
    const hEl = document.getElementById('map-grid-cell-height');
    if (wEl) wEl.value = this.settings.grid_cell_width;
    if (hEl) hEl.value = this.settings.grid_cell_height;
  },

  bindGridAlignControls() {
    const panel = document.getElementById('map-panel');
    if (!panel || panel.dataset.gridAlignBound) return;
    panel.dataset.gridAlignBound = '1';

    panel.addEventListener('click', (e) => {
      const nudge = e.target.closest('[data-grid-nudge]');
      if (nudge) {
        e.preventDefault();
        const parts = (nudge.dataset.gridNudge || '0,0').split(',').map((n) => parseInt(n, 10) || 0);
        this.nudgeGridOffset(parts[0], parts[1]);
        return;
      }
      if (e.target.closest('#btn-grid-offset-reset')) {
        e.preventDefault();
        this.setGridOffset(0, 0, { persist: true });
      }
    });

    const onOffsetChange = () => this.commitGridOffsetFromInputs();
    const onOffsetInput = () => {
      const x = parseInt(document.getElementById('map-grid-offset-x')?.value, 10) || 0;
      const y = parseInt(document.getElementById('map-grid-offset-y')?.value, 10) || 0;
      this.setGridOffset(x, y, { persist: false });
      clearTimeout(this._gridOffsetDebounce);
      this._gridOffsetDebounce = setTimeout(() => this.commitGridOffsetFromInputs(), 350);
    };
    document.getElementById('map-grid-offset-x')?.addEventListener('change', onOffsetChange);
    document.getElementById('map-grid-offset-y')?.addEventListener('change', onOffsetChange);
    document.getElementById('map-grid-offset-x')?.addEventListener('input', onOffsetInput);
    document.getElementById('map-grid-offset-y')?.addEventListener('input', onOffsetInput);
  },

  isGridAlignMode(e) {
    return this.toolMode === 'grid-align' || (this.isDm() && this.toolMode === 'select' && !!e?.shiftKey);
  },

  startGridAlignDrag(mx, my, e) {
    if (!this.settings) {
      showToast('Mapa jeszcze się ładuje — poczekaj chwilę', 'warning');
      return;
    }
    this._userZoomLocked = true;
    const { gsW, gsH, ox, oy } = this.gridMetrics();
    const resize = !!(e?.ctrlKey || e?.metaKey);
    this._gridAlignDrag = {
      startMx: mx,
      startMy: my,
      startOx: ox,
      startOy: oy,
      startGsW: gsW,
      startGsH: gsH,
      mode: resize ? 'resize' : 'move'
    };
    if (this._gridAlignWinBound) return;
    this._gridAlignWinBound = true;
    this._onGridAlignMove = (ev) => {
      if (!this._gridAlignDrag) return;
      const coords = this.canvasCoords(ev);
      const d = this._gridAlignDrag;
      if (d.mode === 'resize') {
        this.setGridCellSize(
          d.startGsW + Math.round(coords.mx - d.startMx),
          d.startGsH + Math.round(coords.my - d.startMy),
          { persist: false }
        );
      } else {
        this.setGridOffset(
          d.startOx + Math.round(coords.mx - d.startMx),
          d.startOy + Math.round(coords.my - d.startMy),
          { persist: false }
        );
      }
    };
    this._onGridAlignUp = () => this.finishGridAlignDrag();
    window.addEventListener('mousemove', this._onGridAlignMove);
    window.addEventListener('mouseup', this._onGridAlignUp);
  },

  finishGridAlignDrag() {
    if (!this._gridAlignDrag) return;
    const wasResize = this._gridAlignDrag.mode === 'resize';
    this._gridAlignDrag = null;
    if (this._onGridAlignMove) {
      window.removeEventListener('mousemove', this._onGridAlignMove);
      this._onGridAlignMove = null;
    }
    if (this._onGridAlignUp) {
      window.removeEventListener('mouseup', this._onGridAlignUp);
      this._onGridAlignUp = null;
    }
    this._gridAlignWinBound = false;
    const { ox, oy, gsW, gsH } = this.gridMetrics();
    if (wasResize) {
      this.setGridCellSize(gsW, gsH, { persist: true });
    } else {
      this.setGridOffset(ox, oy, { persist: true });
    }
  },

  cellTopLeftPx(cx, cy) {
    const { gsW, gsH, ox, oy } = this.gridMetrics();
    return { x: ox + cx * gsW, y: oy + cy * gsH };
  },

  cellCenterPx(cx, cy) {
    const { gsW, gsH, ox, oy } = this.gridMetrics();
    return { x: ox + cx * gsW + gsW / 2, y: oy + cy * gsH + gsH / 2 };
  },

  syncGridOffsetUi() {
    const { ox, oy } = this.gridMetrics();
    const elX = document.getElementById('map-grid-offset-x');
    const elY = document.getElementById('map-grid-offset-y');
    if (elX) elX.value = ox;
    if (elY) elY.value = oy;
  },

  setGridOffset(x, y, opts = {}) {
    clearTimeout(this._gridOffsetDebounce);
    if (!this.settings) {
      if (opts.persist) showToast('Mapa nie jest jeszcze załadowana', 'warning');
      return;
    }
    const ox = Math.round(Number(x) || 0);
    const oy = Math.round(Number(y) || 0);
    const { gsW, gsH } = this.gridMetrics();
    this.settings.grid_offset_x = ox;
    this.settings.grid_offset_y = oy;
    this.writeStoredGridAlign(ox, oy, gsW, gsH);
    this.syncGridOffsetUi();
    this.render();
    if (opts.persist) {
      if (!this.isDm()) return;
      this._pendingGridAlign = { x: ox, y: oy, gsW, gsH };
      if (!App.socket || !App.currentCampaign) {
        showToast('Zapisano lokalnie (brak połączenia z serwerem)', 'warning');
        return;
      }
      App.socket.emit('map-update-settings', { grid_offset_x: ox, grid_offset_y: oy });
    }
  },

  nudgeGridOffset(dx, dy) {
    if (!this.isDm()) return;
    clearTimeout(this._gridOffsetDebounce);
    const { ox, oy } = this.gridMetrics();
    this.setGridOffset(ox + dx, oy + dy, { persist: true });
  },

  commitGridOffsetFromInputs() {
    clearTimeout(this._gridOffsetDebounce);
    const x = parseInt(document.getElementById('map-grid-offset-x')?.value, 10);
    const y = parseInt(document.getElementById('map-grid-offset-y')?.value, 10);
    this.setGridOffset(
      Number.isNaN(x) ? 0 : x,
      Number.isNaN(y) ? 0 : y,
      { persist: true }
    );
  },

  visibleTokens() {
    if (this.isDm()) return this.tokens;
    return this.tokens.filter((t) => t.is_visible);
  },

  visiblePins() {
    if (this.isDm()) return this.pins;
    return this.pins.filter((p) => p.is_visible);
  },

  setTool(mode) {
    this.toolMode = mode;
    document.querySelectorAll('[data-map-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mapTool === mode);
    });
    if (this.canvas) {
      this.canvas.className = `map-tool-${mode}`;
    }
    const hints = {
      select: 'Przeciągnij tokeny. MG: Shift+przeciągnij = wyrównanie siatki do tła. Prawy przycisk = opcje tokenu.',
      pointer: 'Kliknij mapę — wszyscy zobaczą wskaźnik. Alt+klik działa zawsze.',
      measure: 'Kliknij start i koniec — odległość w kratkach (D&D).',
      'fog-reveal': 'Przeciągnij po mapie, aby odsłonić mgłę. Włącz mgłę przyciskiem „Mgła”.',
      'fog-hide': 'Przeciągnij, aby zakryć obszar ponownie.',
      pin: 'Kliknij komórkę, aby dodać pinezkę (MG).',
      block: 'Maluj ściany/blokady LoS (MG). Kliknij ponownie, aby wyłączyć.',
      'block-erase': 'Usuń blokady LoS (MG).',
      'terrain-paint': 'Maluj trudny teren / efekt (MG).',
      'terrain-erase': 'Gumka terenu (MG).',
      'zone-square': 'Strefa kwadratowa — kliknij i przeciągnij (MG).',
      'prop-place': 'Kliknij mapę, aby postawić wybrany rekwizyt (MG).',
      'grid-align': 'Przeciągnij = przesuń linie względem tła · Ctrl+przeciągnij = odstęp linii · kółko = skala · Alt/Ctrl+kółko = jedna oś. Tło JPG nie jest rozciągane.'
    };
    const hintEl = document.getElementById('map-tool-hint');
    if (hintEl) hintEl.textContent = hints[mode] || hints.select;
    if (mode !== 'measure') {
      this.measureStart = null;
      this.measureEnd = null;
    }
    if (typeof MapZones !== 'undefined') MapZones.cancelPlacement();
    if (mode === 'grid-align' && this.isDm()) {
      this._userZoomLocked = true;
      showToast('⊞ Przesuń siatkę na tło · Ctrl+przeciągnij = odstęp linii · kółko = skala', 'info');
    }
    this.render();
  },

  setZoom(value, opts = {}) {
    this.zoom = Math.max(0.15, Math.min(3, value));
    this._userZoomLocked = !opts.fromAutoFit;
    this.applyZoom();
    this.render();
  },

  zoomAtPoint(value, clientX, clientY) {
    if (!this.canvas || !this.viewport) return this.setZoom(value);
    const clamped = Math.max(0.15, Math.min(3, value));
    if (clamped === this.zoom) return;
    const rectBefore = this.canvas.getBoundingClientRect();
    const worldX = (clientX - rectBefore.left) / this.zoom;
    const worldY = (clientY - rectBefore.top) / this.zoom;
    this.zoom = clamped;
    this._userZoomLocked = true;
    this.applyZoom();
    const rectAfter = this.canvas.getBoundingClientRect();
    const desiredScreenX = rectAfter.left + worldX * this.zoom;
    const desiredScreenY = rectAfter.top + worldY * this.zoom;
    this.viewport.scrollLeft += desiredScreenX - clientX;
    this.viewport.scrollTop += desiredScreenY - clientY;
    this.render();
  },

  applyZoom() {
    if (!this.settings || !this.canvas) return;
    const { w, h } = this.mapPixelSize();
    this.canvas.style.width = `${w * this.zoom}px`;
    this.canvas.style.height = `${h * this.zoom}px`;
  },

  resolutionPresetDims(preset) {
    const presets = {
      '720':  { w: 32, h: 18, gs: 40 },
      '1080': { w: 32, h: 18, gs: 60 },
      '1440': { w: 32, h: 18, gs: 80 },
      '2160': { w: 32, h: 18, gs: 120 },
    };
    return presets[String(preset)] || null;
  },

  detectResolutionPreset(w, h, gsW, gsH) {
    if (w !== 32 || h !== 18) return '';
    if (gsW !== gsH) return '';
    const map = { 40: '720', 60: '1080', 80: '1440', 120: '2160' };
    return map[gsW] || '';
  },

  syncResolutionSelect() {
    const sel = document.getElementById('map-resolution-preset');
    if (!sel || !this.settings) return;
    this.normalizeCellSizes(this.settings);
    const preset = this.detectResolutionPreset(
      this.settings.grid_width,
      this.settings.grid_height,
      this.settings.grid_cell_width,
      this.settings.grid_cell_height
    );
    sel.value = preset;
  },

  fitToViewport() {
    if (!this.settings || !this.canvas || !this.viewport) return;
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const { w: mapW, h: mapH } = this.mapPixelSize();
    const padding = 16;
    const scaleX = (rect.width - padding) / mapW;
    const scaleY = (rect.height - padding) / mapH;
    const target = Math.max(0.15, Math.min(3, Math.min(scaleX, scaleY)));
    this.zoom = target;
    this._userZoomLocked = false;
    this.applyZoom();
    this.render();
  },

  scheduleAutoFit() {
    if (this._userZoomLocked) return;
    if (this.toolMode === 'grid-align') return;
    if (this._gridAlignDrag) return;
    if (this._autoFitTimer) cancelAnimationFrame(this._autoFitTimer);
    this._autoFitTimer = requestAnimationFrame(() => {
      this._autoFitTimer = null;
      if (this._userZoomLocked) return;
      this.fitToViewport();
    });
  },

  bindPanning() {
    if (this._panningBound) return;
    this._panningBound = true;
    this._spacePan = false;

    this.canvas.addEventListener('mousedown', (e) => {
      const wantsPan = e.button === 1 || (e.button === 0 && this._spacePan);
      if (!wantsPan || !this.viewport) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this._isPanning = true;
      this._panStart = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: this.viewport.scrollLeft,
        scrollTop: this.viewport.scrollTop,
      };
      this._userZoomLocked = true;
      document.body.classList.add('map-panning');
    }, true);

    const onMove = (e) => {
      if (!this._isPanning) return;
      const dx = e.clientX - this._panStart.x;
      const dy = e.clientY - this._panStart.y;
      this.viewport.scrollLeft = this._panStart.scrollLeft - dx;
      this.viewport.scrollTop = this._panStart.scrollTop - dy;
    };
    const onUp = () => {
      if (!this._isPanning) return;
      this._isPanning = false;
      document.body.classList.remove('map-panning');
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseup', onUp, { passive: true });
    window.addEventListener('blur', onUp);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this._isInputFocused()) {
        if (!this._spacePan) {
          this._spacePan = true;
          document.body.classList.add('map-space-pan');
        }
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this._spacePan = false;
        document.body.classList.remove('map-space-pan');
      }
    });
  },

  _isInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  },

  bindAutoFitResize() {
    if (this._resizeBound) return;
    this._resizeBound = true;
    const onResize = () => {
      if (this._resizeDebounce) clearTimeout(this._resizeDebounce);
      this._resizeDebounce = setTimeout(() => this.scheduleAutoFit(), 80);
    };
    window.addEventListener('resize', onResize);
    if (this.viewport && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(onResize);
      ro.observe(this.viewport);
    }
  },

  parseFogRevealed(settings) {
    this.fogRevealed = new Set();
    if (!settings?.fog_revealed) return;
    try {
      const arr = typeof settings.fog_revealed === 'string'
        ? JSON.parse(settings.fog_revealed)
        : settings.fog_revealed;
      if (Array.isArray(arr)) arr.forEach((key) => this.fogRevealed.add(key));
    } catch (_err) { /* ignore */ }
  },

  parseMovementTrails(settings) {
    this.movementTrails = {};
    if (!settings?.movement_trails) return;
    try {
      const parsed = typeof settings.movement_trails === 'string'
        ? JSON.parse(settings.movement_trails)
        : settings.movement_trails;
      if (parsed && typeof parsed === 'object') this.movementTrails = parsed;
    } catch (_err) { /* ignore */ }
  },

  loadMap() {
    const now = Date.now();
    if (this._lastMapLoadAt && now - this._lastMapLoadAt < 250) return;
    this._lastMapLoadAt = now;
    App.socket?.emit('get-map');
  },

  updateMap(data) {
    const campId = App.currentCampaign?.id;
    if (campId !== this._mapCampaignId) {
      this._mapCampaignId = campId;
      this._initialMapFitDone = false;
      this._userZoomLocked = false;
      this._pendingGridAlign = null;
    }
    const allTokens = data.tokens || [];
    const allPins = data.pins || [];
    this.tokens = this.isDm() ? allTokens : allTokens.filter((t) => t.is_visible);
    this.pins = this.isDm() ? allPins : allPins.filter((p) => p.is_visible);
    this.syncTokenHpToCharacterCache(this.tokens);
    if (typeof MapConditions !== 'undefined') {
      MapConditions.startAnimation();
      MapConditions.onTokensRefreshed();
    }
    const prevBackground = this.settings?.background_image || '';
    this.settings = data.settings || {
      grid_size: 40,
      grid_cell_width: 40,
      grid_cell_height: 40,
      grid_width: 25,
      grid_height: 18,
      background_color: '#3b2618',
      fog_enabled: 0,
      fog_revealed: '[]',
      movement_trails: '{}',
      trails_enabled: 1,
      grid_opacity: 100,
      grid_offset_x: 0,
      grid_offset_y: 0
    };
    this.normalizeCellSizes(this.settings);
    this.mergeGridAlignFromSources(this.settings);
    if (!this.isDm() && this.settings) {
      delete this.settings.last_token_move;
    }
    this.parseFogRevealed(this.settings);
    this.parseMovementTrails(this.settings);
    if (data.combat && typeof MapCombat !== 'undefined') {
      MapCombat.update(data.combat);
    }
    if (typeof MapZones !== 'undefined') {
      let zones = data.settings?.map_zones;
      if (typeof zones === 'string') {
        try { zones = JSON.parse(zones); } catch { zones = []; }
      }
      MapZones.load(zones || []);
    }

    this.syncGridCellSizeUi();
    this.syncResolutionSelect();
    const opacitySlider = document.getElementById('map-grid-opacity');
    const opacityOut = document.getElementById('map-grid-opacity-value');
    const opacity = this.settings.grid_opacity ?? 100;
    if (opacitySlider) opacitySlider.value = opacity;
    if (opacityOut) opacityOut.textContent = `${opacity}%`;
    this.syncGridOffsetUi();

    const nextBackground = this.settings.background_image || '';
    if (nextBackground !== prevBackground) {
      this._initialMapFitDone = false;
      this.loadBackgroundImage(nextBackground);
    } else {
      this.applyZoom();
      this.preloadTokenImages();
      this.renderSidebar();
      this.scheduleRender();
    }
    if (!this._initialMapFitDone && !this._userZoomLocked && this.toolMode !== 'grid-align') {
      this.scheduleAutoFit();
      this._initialMapFitDone = true;
    }
  },

  moveToken(data) {
    const token = this.tokens.find((t) => t.id === data.id);
    if (!token) return;
    if (data.trailsEnabled && data.prevX != null && data.prevY != null) {
      this.localTrailSegments.push({
        fromX: data.prevX,
        fromY: data.prevY,
        toX: data.x,
        toY: data.y,
        tokenId: data.id,
        at: Date.now()
      });
      if (!this.movementTrails[data.id]) this.movementTrails[data.id] = [];
      const path = this.movementTrails[data.id];
      if (!path.length || path[path.length - 1].x !== data.prevX || path[path.length - 1].y !== data.prevY) {
        path.push({ x: data.prevX, y: data.prevY });
      }
      path.push({ x: data.x, y: data.y });
    }
    token.x = data.x;
    token.y = data.y;
    this.renderSidebar();
    this.render();
  },

  showPointer(data) {
    const c = this.cellCenterPx(data.x, data.y);
    const entry = {
      x: c.x,
      y: c.y,
      label: data.displayName || '?',
      color: data.color || '#c9a227',
      expires: Date.now() + 3500
    };
    this.activePointers.push(entry);
    this.render();
    setTimeout(() => {
      this.activePointers = this.activePointers.filter((p) => p.expires > Date.now());
      this.render();
    }, 3600);
  },

  preloadTokenImages() {
    this.tokens.forEach((token) => {
      if (token.image_url) this.loadTokenImage(token.image_url);
    });
  },

  loadTokenImage(src) {
    if (!src || this.tokenImageCache.has(src)) return;
    const img = new Image();
    img.onload = () => {
      this.tokenImageCache.set(src, img);
      this.render();
    };
    img.onerror = () => this.tokenImageCache.delete(src);
    img.src = src;
  },

  loadBackgroundImage(src) {
    if (!src) {
      this.backgroundImageObj = null;
      this.backgroundImageSrc = '';
      this.applyZoom();
      this.renderSidebar();
      this.scheduleRender();
      return;
    }
    if (this.backgroundImageObj && this.backgroundImageSrc === src) {
      this.applyZoom();
      this.scheduleRender();
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (this.backgroundImageSrc !== src) return;
      this.backgroundImageObj = image;
      this.applyZoom();
      this.render();
      if (!this._initialMapFitDone && !this._userZoomLocked && this.toolMode !== 'grid-align') {
        this.scheduleAutoFit();
        this._initialMapFitDone = true;
      }
    };
    image.onerror = () => {
      if (this.backgroundImageSrc !== src) return;
      this.backgroundImageObj = null;
      showToast('Nie udało się wczytać tła mapy', 'warning');
      this.render();
    };
    this.backgroundImageSrc = src;
    this.backgroundImageObj = null;
    image.src = src;
  },

  getCharacterForToken(token) {
    if (!token?.entity_id || token.entity_type !== 'player') return null;
    return (Characters.campaignCharacters || []).find((c) => c.id === token.entity_id) || null;
  },

  getTokenStats(token) {
    const char = this.getCharacterForToken(token);
    const tokenHpMax = parseInt(token.hp_max, 10) || 0;
    const tokenHpCurrent = parseInt(token.hp_current, 10);
    if (char) {
      const hpMax = tokenHpMax > 0 ? tokenHpMax : (char.max_hp || 0);
      const hpCurrent = tokenHpMax > 0 && Number.isFinite(tokenHpCurrent)
        ? tokenHpCurrent
        : (char.current_hp ?? 0);
      return {
        name: char.name,
        hpCurrent,
        hpMax,
        ac: char.armor_class,
        notes: '',
        fromCharacter: true
      };
    }
    return {
      name: token.entity_name,
      hpCurrent: Number.isFinite(tokenHpCurrent) ? tokenHpCurrent : 0,
      hpMax: tokenHpMax,
      ac: token.ac || 0,
      notes: token.stat_notes || '',
      fromCharacter: false
    };
  },

  syncTokenHpToCharacterCache(tokens = this.tokens) {
    if (typeof Characters === 'undefined' || !Array.isArray(tokens)) return;
    for (const token of tokens) {
      if (token.entity_type !== 'player' || !token.entity_id) continue;
      const char = Characters.campaignCharacters?.find((c) => c.id === token.entity_id);
      if (!char) continue;
      const hpMax = parseInt(token.hp_max, 10) || 0;
      if (hpMax > 0) {
        char.max_hp = hpMax;
        char.current_hp = parseInt(token.hp_current, 10) ?? char.current_hp;
      }
    }
  },

  scheduleRender() {
    if (this._renderRaf) return;
    this._renderRaf = requestAnimationFrame(() => {
      this._renderRaf = null;
      this.render();
    });
  },

  render() {
    if (!this.settings) return;
    if (this._renderRaf) {
      cancelAnimationFrame(this._renderRaf);
      this._renderRaf = null;
    }
    const { w, h } = this.mapPixelSize();

    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    if (this.ctx) {
      // Reset all 2D context state so leftover globalCompositeOperation, transforms,
      // line dashes etc. from prior frames cannot wipe pixels or corrupt the next frame.
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.globalAlpha = 1;
      this.ctx.setLineDash([]);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
    }

    const ctx = this.ctx;
    const fogEnabled = !!this.settings.fog_enabled;
    const isDm = this.isDm();

    ctx.fillStyle = this.settings.background_color || '#3b2618';
    ctx.fillRect(0, 0, w, h);

    if (this.backgroundImageObj) {
      const bg = this.backgroundPixelSize();
      if (bg) {
        ctx.drawImage(this.backgroundImageObj, 0, 0, bg.w, bg.h);
      }
    }

    this.drawMovementTrails(ctx);
    this.drawGrid(ctx, w, h);

    if (typeof MapZones !== 'undefined') {
      MapZones.draw(ctx);
    }

    if (fogEnabled && isDm) {
      this.drawDmFogPreview(ctx, w, h);
    }

    if (fogEnabled && !isDm) {
      this.drawPlayerFog(ctx, w, h);
    }

    this.visiblePins().forEach((pin) => this.drawPin(ctx, pin));
    if (typeof MapCombat !== 'undefined') {
      MapCombat.drawBlocking(ctx);
      MapCombat.drawRangeOverlay(ctx);
    }
    this.visibleTokens().forEach((token) => this.drawToken(ctx, token));

    this.drawMeasureLine(ctx);
    this.drawPointers(ctx);
    this.drawFogEditOverlay(ctx);
    if (typeof MapCombat !== 'undefined') MapCombat.drawEffects(ctx);
  },

  focusToken(tokenId) {
    const token = this.tokens.find((t) => t.id === tokenId);
    if (!token || !this.viewport) return;
    const { gsW, gsH, ox, oy } = this.gridMetrics();
    const cx = (ox + (token.x + (token.size || 1) / 2) * gsW) * this.zoom;
    const cy = (oy + (token.y + (token.size || 1) / 2) * gsH) * this.zoom;
    this.viewport.scrollLeft = Math.max(0, cx - this.viewport.clientWidth / 2);
    this.viewport.scrollTop = Math.max(0, cy - this.viewport.clientHeight / 2);
  },

  selectToken(id) {
    this.selectedTokenId = id;
    this.selectedPinId = null;
    this.renderSidebar();
    this.render();
    if (typeof MapCombat !== 'undefined') MapCombat.renderOverlay?.();
  },

  pushBlockingUpdate() {
    if (!App.socket) return;
    const cells = typeof MapCombat !== 'undefined'
      ? MapTactics.blockingToArray(MapCombat.blocking)
      : [];
    App.socket.emit('map-update-blocking', { cells });
  },

  paintBlockAt(mx, my, erase) {
    const cell = this.cellAt(mx, my);
    const r = this.getFogBrushRadius();
    if (typeof MapCombat === 'undefined') return;
    MapCombat.blocking = erase
      ? (() => {
        const set = new Set(MapCombat.blocking);
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (r && dx * dx + dy * dy > r * r) continue;
            set.delete(`${cell.x + dx},${cell.y + dy}`);
          }
        }
        return set;
      })()
      : MapLos.paintBlockingAt(MapCombat.blocking, cell.x, cell.y, r);
    this.pushBlockingUpdate();
    this.render();
  },

  drawGrid(ctx, w, h) {
    const raw = this.settings.grid_opacity;
    const opacityPct = raw === undefined || raw === null ? 100 : parseInt(raw, 10);
    if (opacityPct <= 0) return;

    const { gsW, gsH, ox, oy } = this.gridMetrics();
    const aligning = this.toolMode === 'grid-align' || !!this._gridAlignDrag;
    const alpha = Math.max(0, Math.min(100, opacityPct)) / 100;
    const lineAlpha = (aligning ? 0.35 : 0.12) * alpha;
    ctx.strokeStyle = `rgba(201, 162, 39, ${lineAlpha})`;
    ctx.lineWidth = aligning ? 1.5 : 1;
    const startX = ox - Math.ceil(Math.max(0, -ox) / gsW) * gsW;
    const startY = oy - Math.ceil(Math.max(0, -oy) / gsH) * gsH;
    for (let x = startX; x <= w + gsW; x += gsW) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = startY; y <= h + gsH; y += gsH) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(201, 178, 140, ${(aligning ? 0.55 : 0.35) * alpha})`;
    ctx.font = '10px Crimson Pro, Georgia, serif';
    for (let gx = 0; gx < this.settings.grid_width; gx++) {
      const px = ox + gx * gsW;
      if (px + gsW < 0 || px > w) continue;
      ctx.fillText(String.fromCharCode(65 + (gx % 26)), px + 3, Math.max(12, oy + 12));
    }
    for (let gy = 0; gy < this.settings.grid_height; gy++) {
      const py = oy + gy * gsH;
      if (py + gsH < 0 || py > h) continue;
      ctx.fillText((gy + 1).toString(), Math.max(3, ox + 3), py + gsH - 3);
    }
  },

  drawPlayerFog(ctx, w, h) {
    const { w: cw, h: ch } = this.cellSizePx();
    ctx.fillStyle = 'rgba(10, 6, 4, 0.88)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    for (const key of this.fogRevealed) {
      const [x, y] = key.split(',').map(Number);
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        const tl = this.cellTopLeftPx(x, y);
        ctx.fillRect(tl.x, tl.y, cw, ch);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  drawDmFogPreview(ctx, w, h) {
    const { w: cw, h: ch } = this.cellSizePx();
    ctx.fillStyle = 'rgba(10, 6, 4, 0.55)';
    for (let y = 0; y < this.settings.grid_height; y++) {
      for (let x = 0; x < this.settings.grid_width; x++) {
        const key = `${x},${y}`;
        if (!this.fogRevealed.has(key)) {
          const tl = this.cellTopLeftPx(x, y);
          ctx.fillRect(tl.x, tl.y, cw, ch);
        }
      }
    }
  },

  drawFogEditOverlay(ctx) {
    if (!this.isDm() || !this.settings.fog_enabled) return;
    if (this.toolMode !== 'fog-reveal' && this.toolMode !== 'fog-hide') return;
    const { w: cw, h: ch } = this.cellSizePx();
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.35)';
    ctx.setLineDash([3, 3]);
    for (const key of this.fogRevealed) {
      const [x, y] = key.split(',').map(Number);
      const tl = this.cellTopLeftPx(x, y);
      ctx.strokeRect(tl.x + 1, tl.y + 1, cw - 2, ch - 2);
    }
    ctx.setLineDash([]);
  },

  drawMovementTrails(ctx) {
    if (!this.settings.trails_enabled) return;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    Object.entries(this.movementTrails).forEach(([tokenId, path]) => {
      if (!Array.isArray(path) || path.length < 2) return;
      const token = this.tokens.find((t) => t.id === tokenId);
      ctx.strokeStyle = token?.color ? `${token.color}99` : 'rgba(201, 162, 39, 0.55)';
      ctx.beginPath();
      path.forEach((pt, i) => {
        const c = this.cellCenterPx(pt.x, pt.y);
        const px = c.x;
        const py = c.y;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });
    const now = Date.now();
    this.localTrailSegments = this.localTrailSegments.filter((s) => now - s.at < 800);
    this.localTrailSegments.forEach((seg) => {
      ctx.strokeStyle = 'rgba(201, 162, 39, 0.7)';
      ctx.beginPath();
      const from = this.cellCenterPx(seg.fromX, seg.fromY);
      const to = this.cellCenterPx(seg.toX, seg.toY);
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });
    ctx.restore();
  },

  drawPin(ctx, pin) {
    const center = this.cellCenterPx(pin.x, pin.y);
    const px = center.x;
    const py = center.y;
    const { gsH } = this.gridMetrics();
    const meta = MAP_PIN_TYPES[pin.pin_type] || MAP_PIN_TYPES.note;
    const selected = pin.id === this.selectedPinId;

    ctx.beginPath();
    ctx.arc(px, py, selected ? 14 : 11, 0, Math.PI * 2);
    ctx.fillStyle = pin.color || meta.color;
    ctx.fill();
    ctx.strokeStyle = selected ? '#fff' : 'rgba(0,0,0,0.4)';
    ctx.lineWidth = selected ? 3 : 2;
    ctx.stroke();
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.icon, px, py - 1);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    if (pin.label) {
      ctx.font = 'bold 10px Crimson Pro, Georgia, serif';
      ctx.fillStyle = '#f5efe4';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(pin.label, px, py + gsH * 0.55);
      ctx.fillText(pin.label, px, py + gsH * 0.55);
    }
  },

  drawMeasureLine(ctx) {
    if (!this.measureStart) return;
    const end = this.measureEnd || this.measureStart;
    const c1 = this.cellCenterPx(this.measureStart.x, this.measureStart.y);
    const c2 = this.cellCenterPx(end.x, end.y);
    const x1 = c1.x;
    const y1 = c1.y;
    const x2 = c2.x;
    const y2 = c2.y;
    const dist = Math.max(Math.abs(end.x - this.measureStart.x), Math.abs(end.y - this.measureStart.y));
    const feet = dist * 5;

    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(42, 26, 16, 0.85)';
    ctx.fillRect((x1 + x2) / 2 - 36, (y1 + y2) / 2 - 22, 72, 20);
    ctx.fillStyle = '#f5efe4';
    ctx.font = 'bold 11px Cinzel, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${dist} kr · ${feet} ft`, (x1 + x2) / 2, (y1 + y2) / 2 - 8);
    ctx.textAlign = 'start';
    ctx.restore();
  },

  drawPointers(ctx) {
    const now = Date.now();
    this.activePointers = this.activePointers.filter((p) => p.expires > now);
    this.activePointers.forEach((p) => {
      const pulse = 1 + 0.15 * Math.sin(now / 120);
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = `${p.color}44`;
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = 'bold 11px Cinzel, Georgia, serif';
      ctx.fillStyle = '#f5efe4';
      ctx.textAlign = 'center';
      ctx.fillText(p.label, p.x, p.y - 24);
      ctx.restore();
    });
  },

  drawHpBar(ctx, token, stats, tx, ty, sizeW, sizeH, gs) {
    if (!stats || stats.hpMax <= 0) return;
    const ratio = Math.max(0, Math.min(1, stats.hpCurrent / stats.hpMax));
    const barH = Math.max(7, Math.round(Math.min(sizeH, gs) * 0.18));
    const barW = sizeW - 6;
    const barX = tx + 3;
    const aboveY = ty - barH - 3;
    const barY = aboveY >= 0 ? aboveY : ty + 2;
    ctx.save();
    ctx.fillStyle = 'rgba(20, 12, 6, 0.85)';
    this._roundRect(ctx, barX, barY, barW, barH, 3);
    ctx.fill();
    let fillColor;
    if (ratio > 0.6) fillColor = '#3f8b3f';
    else if (ratio > 0.3) fillColor = '#c9a227';
    else if (ratio > 0) fillColor = '#a63d2f';
    else fillColor = '#444';
    ctx.fillStyle = fillColor;
    this._roundRect(ctx, barX + 1, barY + 1, Math.max(0, (barW - 2) * ratio), barH - 2, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232, 220, 200, 0.55)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, barX + 0.5, barY + 0.5, barW - 1, barH - 1, 3);
    ctx.stroke();
    const isDm = this.isDm();
    const isOwnChar = !isDm && stats.fromCharacter;
    if (isDm || isOwnChar) {
      const txt = `${stats.hpCurrent}/${stats.hpMax}`;
      ctx.fillStyle = '#f5efe4';
      ctx.font = `bold ${Math.max(9, Math.round(barH * 0.85))}px Cinzel, Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 2;
      ctx.fillText(txt, barX + barW / 2, barY + barH / 2 + 0.5);
      ctx.shadowBlur = 0;
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  },

  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  },

  drawToken(ctx, token) {
    const { gsW, gsH, gs } = this.gridMetrics();
    const tl = this.cellTopLeftPx(token.x, token.y);
    const tx = tl.x;
    const ty = tl.y;
    const sizeW = (token.size || 1) * gsW;
    const sizeH = (token.size || 1) * gsH;
    const cx = tx + sizeW / 2;
    const cy = ty + sizeH / 2;
    const radius = Math.min(sizeW, sizeH) / 2 - 3;

    const stats = this.getTokenStats(token);
    this.drawHpBar(ctx, token, stats, tx, ty, sizeW, sizeH, gs);

    const img = token.image_url ? this.tokenImageCache.get(token.image_url) : null;
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, tx + 3, ty + 3, sizeW - 6, sizeH - 6);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = token.id === this.selectedTokenId ? 'rgba(201, 162, 39, 0.95)' : 'rgba(232, 220, 200, 0.55)';
      ctx.lineWidth = token.id === this.selectedTokenId ? 3 : 2;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = token.color || '#8b6914';
      ctx.fill();
      ctx.strokeStyle = token.id === this.selectedTokenId ? 'rgba(201, 162, 39, 0.95)' : 'rgba(232, 220, 200, 0.55)';
      ctx.lineWidth = token.id === this.selectedTokenId ? 3 : 2;
      ctx.stroke();
    }

    ctx.fillStyle = '#f5efe4';
    ctx.font = `bold ${Math.max(10, gs / 4)}px Cinzel, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const name = token.entity_name || '?';
    const shortName = name.length > 5 ? name.substring(0, 5) : name;
    if (!img) ctx.fillText(shortName, cx, cy);
    else ctx.fillText(shortName, cx, ty + sizeH - 8);
    if (typeof MapProps !== 'undefined') MapProps.drawTokenOverlay(ctx, token);
    if (typeof MapConditions !== 'undefined') MapConditions.drawForToken(ctx, token);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    if (token.is_locked) {
      ctx.fillStyle = 'rgba(201, 162, 39, 0.9)';
      ctx.font = '12px sans-serif';
      ctx.fillText('🔒', tx + 4, ty + 14);
    }
    if (token.entity_type === 'npc' || token.entity_type === 'monster') {
      ctx.fillStyle = 'rgba(166, 61, 47, 0.85)';
      ctx.beginPath();
      ctx.arc(tx + sizeW - 6, ty + 6, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    const activeId = typeof Initiative !== 'undefined' ? Initiative.getActiveEntry?.()?.map_token_id : '';
    if (token.id === activeId) {
      ctx.save();
      ctx.strokeStyle = 'rgba(201, 162, 39, 0.95)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (typeof MapCombat !== 'undefined' && MapCombat.targeting) {
      const isEnemy = token.id !== MapCombat.targeting.attackerTokenId;
      if (isEnemy) {
        ctx.strokeStyle = 'rgba(166, 61, 47, 0.7)';
        ctx.lineWidth = 2;
        ctx.strokeRect(tx + 1, ty + 1, sizeW - 2, sizeH - 2);
      }
    }
  },

  canvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / this.zoom;
    const my = (e.clientY - rect.top) / this.zoom;
    return { mx, my };
  },

  cellAt(mx, my) {
    const { gsW, gsH, ox, oy } = this.gridMetrics();
    const x = Math.floor((mx - ox) / gsW);
    const y = Math.floor((my - oy) / gsH);
    return { x, y, key: `${x},${y}` };
  },

  getFogBrushRadius() {
    return parseInt(document.getElementById('map-fog-brush')?.value || '2', 10);
  },

  paintFogAt(mx, my, reveal) {
    const cell = this.cellAt(mx, my);
    const r = this.getFogBrushRadius();
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const cx = cell.x + dx;
        const cy = cell.y + dy;
        if (cx < 0 || cy < 0 || cx >= this.settings.grid_width || cy >= this.settings.grid_height) continue;
        const key = `${cx},${cy}`;
        if (reveal) this.fogRevealed.add(key);
        else this.fogRevealed.delete(key);
      }
    }
    this.pushFogUpdate();
    this.render();
  },

  getTokenAt(mx, my) {
    const { gsW, gsH } = this.gridMetrics();
    const list = this.visibleTokens();
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      const sizeW = (t.size || 1) * gsW;
      const sizeH = (t.size || 1) * gsH;
      const tl = this.cellTopLeftPx(t.x, t.y);
      if (mx >= tl.x && mx < tl.x + sizeW && my >= tl.y && my < tl.y + sizeH) return t;
    }
    return null;
  },

  getPinAt(mx, my) {
    const { gsW, gsH } = this.gridMetrics();
    const hitR = Math.min(gsW, gsH) * 0.45;
    for (let i = this.visiblePins().length - 1; i >= 0; i--) {
      const p = this.visiblePins()[i];
      const c = this.cellCenterPx(p.x, p.y);
      if (Math.hypot(mx - c.x, my - c.y) < hitR) return p;
    }
    return null;
  },

  emitPointer(cell) {
    App.socket?.emit('map-pointer', { x: cell.x, y: cell.y });
  },

  onMouseDown(e) {
    if (e.button !== 0) return;
    const { mx, my } = this.canvasCoords(e);
    const cell = this.cellAt(mx, my);

    if (e.altKey || this.toolMode === 'pointer') {
      this.emitPointer(cell);
      return;
    }

    if (this.isGridAlignMode(e)) {
      this.startGridAlignDrag(mx, my, e);
      return;
    }

    if (this.isDm() && (this.toolMode === 'fog-reveal' || this.toolMode === 'fog-hide')) {
      if (!this.settings.fog_enabled) {
        showToast('Włącz mgłę przyciskiem „Mgła”', 'warning');
        return;
      }
      this.isPaintingFog = true;
      this.paintFogAt(mx, my, this.toolMode === 'fog-reveal');
      return;
    }

    if (this.isDm() && (this.toolMode === 'block' || this.toolMode === 'block-erase')) {
      this.isPaintingBlock = true;
      this.paintBlockAt(mx, my, this.toolMode === 'block-erase');
      return;
    }

    if (this.isDm() && (this.toolMode === 'terrain-paint' || this.toolMode === 'terrain-erase')) {
      this.isPaintingTerrain = true;
      const r = this.getFogBrushRadius();
      if (this.toolMode === 'terrain-paint') MapZones.paintTerrainCell(cell.x, cell.y, r);
      else MapZones.eraseTerrainCell(cell.x, cell.y, r);
      this.render();
      return;
    }

    if (this.isDm() && this.toolMode === 'zone-square') {
      MapZones.startPlacement('square', { sizeCells: 2 });
      MapZones.onMouseDown(cell);
      return;
    }

    if (typeof MapZones !== 'undefined' && MapZones.placement) {
      if (MapZones.onMouseDown(cell)) return;
    }

    if (this.toolMode === 'prop-place' && this.isDm()) {
      this.placePropAt(cell);
      return;
    }

    if (this.toolMode === 'measure') {
      if (!this.measureStart) {
        this.measureStart = { x: cell.x, y: cell.y };
        this.measureEnd = null;
      } else {
        this.measureEnd = { x: cell.x, y: cell.y };
      }
      this.render();
      return;
    }

    if (this.toolMode === 'pin' && this.isDm()) {
      this.showAddPinDialog(cell.x, cell.y);
      return;
    }

    const pin = this.getPinAt(mx, my);
    if (pin) {
      this.selectPin(pin.id);
      this.render();
      return;
    }

    const token = this.getTokenAt(mx, my);
    if (token) {
      if (typeof MapCombat !== 'undefined' && MapCombat.targeting) {
        MapCombat.handleTargetClick(token);
        return;
      }
      this.selectToken(token.id);
      if (Number(token.is_locked)) {
        this.render();
        return;
      }
      const { gsW, gsH, ox, oy } = this.gridMetrics();
      const char = this.getCharacterForToken(token);
      const isOwnToken = char && char.user_id === getUser()?.id;
      const canDrag = this.isDm() || isOwnToken;
      if (canDrag) {
        if (typeof MapCombat !== 'undefined' && !MapCombat.canMoveToken(token)) {
          showToast('To nie twoja tura — nie możesz się teraz ruszyć', 'warning');
          this.render();
          return;
        }
        this.dragToken = token;
        this.dragStartX = token.x;
        this.dragStartY = token.y;
        if (typeof MapCombat !== 'undefined' && MapCombat.isMovementLimited()) {
          this.dragMaxFt = MapCombat.getRemainingMovementFt(token.id);
        } else {
          this.dragMaxFt = null;
        }
        this.dragOffset.x = mx - (ox + token.x * gsW);
        this.dragOffset.y = my - (oy + token.y * gsH);
        this.isDragging = true;
      }
      this.render();
    } else {
      this.selectedTokenId = null;
      this.selectedPinId = null;
      this.renderSidebar();
      this.render();
    }
  },

  onMouseMove(e) {
    const { mx, my } = this.canvasCoords(e);

    if (this._gridAlignDrag) return;

    if (this.isPaintingFog) {
      this.paintFogAt(mx, my, this.toolMode === 'fog-reveal');
      return;
    }

    if (this.isPaintingBlock) {
      this.paintBlockAt(mx, my, this.toolMode === 'block-erase');
      return;
    }

    if (this.isPaintingTerrain) {
      const cell = this.cellAt(mx, my);
      const r = this.getFogBrushRadius();
      if (this.toolMode === 'terrain-paint') MapZones.paintTerrainCell(cell.x, cell.y, r);
      else MapZones.eraseTerrainCell(cell.x, cell.y, r);
      this.render();
      return;
    }

    if (typeof MapZones !== 'undefined' && MapZones.placement) {
      const cell = this.cellAt(mx, my);
      MapZones.onMouseMove(cell);
      return;
    }

    if (this.toolMode === 'measure' && this.measureStart && !this.measureEnd) {
      const cell = this.cellAt(mx, my);
      this.measureEnd = { x: cell.x, y: cell.y };
      this.render();
      return;
    }

    if (!this.isDragging || !this.dragToken) return;
    const { gsW, gsH, ox, oy } = this.gridMetrics();
    const maxX = this.settings.grid_width - (this.dragToken.size || 1);
    const maxY = this.settings.grid_height - (this.dragToken.size || 1);
    let nx = Math.max(0, Math.min(maxX,
      Math.floor((mx - this.dragOffset.x - ox + gsW / 2) / gsW)));
    let ny = Math.max(0, Math.min(maxY,
      Math.floor((my - this.dragOffset.y - oy + gsH / 2) / gsH)));

    if (this.dragMaxFt != null && this.dragStartX != null && typeof MapTactics !== 'undefined') {
      let clamped;
      if (typeof MapZones !== 'undefined' && MapZones.zones?.length) {
        clamped = MapZones.clampDrag(this.dragStartX, this.dragStartY, nx, ny, this.dragMaxFt);
      } else {
        const maxCells = MapTactics.feetToCells(this.dragMaxFt);
        clamped = MapTactics.clampChebyshev(this.dragStartX, this.dragStartY, nx, ny, maxCells);
      }
      nx = Math.max(0, Math.min(maxX, clamped.x));
      ny = Math.max(0, Math.min(maxY, clamped.y));
    }

    this.dragToken.x = nx;
    this.dragToken.y = ny;
    this.render();
  },

  onMouseUp(e) {
    if (this._gridAlignDrag) {
      this.finishGridAlignDrag();
      return;
    }
    if (this.isPaintingFog) {
      this.isPaintingFog = false;
      return;
    }
    if (this.isPaintingBlock) {
      this.isPaintingBlock = false;
      return;
    }
    if (this.isPaintingTerrain) {
      this.isPaintingTerrain = false;
      MapZones.onMouseUp();
      return;
    }
    if (this.isDragging && this.dragToken && App.socket) {
      App.socket.emit('map-move-token', {
        id: this.dragToken.id,
        x: this.dragToken.x,
        y: this.dragToken.y
      });
    }
    this.isDragging = false;
    this.dragToken = null;
    this.dragStartX = null;
    this.dragStartY = null;
    this.dragMaxFt = null;
  },

  onMouseLeave() {
    this.isPaintingFog = false;
    this.isDragging = false;
    this.dragToken = null;
    this.dragStartX = null;
    this.dragStartY = null;
    this.dragMaxFt = null;
  },

  onDoubleClick(e) {
    const { mx, my } = this.canvasCoords(e);
    const token = this.getTokenAt(mx, my);
    if (token) {
      if (typeof MapCombat !== 'undefined' && MapCombat.canActOnToken(token)) {
        const rect = this.canvas.getBoundingClientRect();
        MapCombat.showActionWheel(e.clientX, e.clientY, token);
        return;
      }
      Initiative.highlightByMapToken(token.id);
      return;
    }
    const pin = this.getPinAt(mx, my);
    if (pin) this.showPinDetails(pin);
  },

  onRightClick(e) {
    const { mx, my } = this.canvasCoords(e);
    const pin = this.getPinAt(mx, my);
    if (pin && this.isDm()) {
      this.showPinContextMenu(pin);
      return;
    }
    const token = this.getTokenAt(mx, my);
    if (!token || !this.isDm()) return;
    this.showTokenContextMenu(token);
  },

  selectPin(id) {
    this.selectedPinId = id;
    this.selectedTokenId = null;
    this.renderSidebar();
    this.render();
  },

  scrollToPin(pinId) {
    const pin = this.pins.find((p) => p.id === pinId);
    if (!pin || !this.viewport) return;
    const c = this.cellCenterPx(pin.x, pin.y);
    const x = c.x * this.zoom;
    const y = c.y * this.zoom;
    this.viewport.scrollTo({ left: x - 80, top: y - 80, behavior: 'smooth' });
  },

  renderSidebar() {
    this.renderSelectionPanel();
    this.renderPinsList();
    this.renderTokensList();
  },

  renderSelectionPanel() {
    const el = document.getElementById('map-selection-stats');
    if (!el) return;

    if (this.selectedTokenId) {
      const token = this.tokens.find((t) => t.id === this.selectedTokenId);
      if (!token) {
        el.innerHTML = '<p class="map-sidebar-empty">Kliknij token lub pinezkę</p>';
        return;
      }
      const s = this.getTokenStats(token);
      const ratio = s.hpMax > 0 ? s.hpCurrent / s.hpMax : 0;
      const hpClass = ratio > 0.5 ? '' : ratio > 0.25 ? 'low' : 'critical';
      el.innerHTML = `
        <div class="map-stat-row"><span>Token</span><strong>${escapeHtml(s.name)}</strong></div>
        <div class="map-stat-row"><span>Typ</span><span>${escapeHtml(token.entity_type)}</span></div>
        ${EntityLink.linkLabel(token) ? `<div class="map-stat-row"><span>Powiązanie</span><strong>${escapeHtml(EntityLink.linkLabel(token))}</strong></div>` : ''}
        ${EntityLink.findInitiativeEntry(token.entity_type, token.entity_id, token.id) ? '<div class="map-stat-row"><span>Inicjatywa</span><span>⚔️ w kolejce</span></div>' : ''}
        ${s.hpMax > 0 ? `
        <div class="map-hp-bar-wrap">
          <div class="map-stat-row"><span>HP</span><strong>${s.hpCurrent} / ${s.hpMax}</strong></div>
          <div class="map-hp-bar"><div class="map-hp-bar-fill ${hpClass}" style="width:${Math.round(ratio * 100)}%"></div></div>
        </div>` : ''}
        ${s.ac ? `<div class="map-stat-row"><span>AC</span><strong>${s.ac}</strong></div>` : ''}
        <div class="map-stat-row"><span>Pozycja</span><span>${token.x}, ${token.y}</span></div>
        ${typeof MapCombat !== 'undefined' && MapCombat.isMovementLimited() ? (() => {
          const turn = MapCombat.getTurnState(token.id);
          if (!turn) return '<div class="map-stat-row"><span>Ruch</span><span class="sheet-hint">Poza tura</span></div>';
          const remaining = (turn.movementRemainingFt ?? 0) + (turn.dashBonusFt ?? 0);
          const max = turn.movementMaxFt ?? remaining;
          const moveRatio = max > 0 ? remaining / max : 0;
          const moveClass = moveRatio > 0.5 ? '' : moveRatio > 0.25 ? 'low' : 'critical';
          return `<div class="map-hp-bar-wrap">
            <div class="map-stat-row"><span>Ruch</span><strong>${remaining} / ${max} ft</strong></div>
            <div class="map-hp-bar"><div class="map-hp-bar-fill ${moveClass}" style="width:${Math.round(moveRatio * 100)}%"></div></div>
            <p class="sheet-hint">${MapTactics.feetToCells(remaining)} kratek pozostalo</p>
          </div>
          ${MapCombat.isCombatEnabled() ? `<div class="map-stat-row"><span>Akcje</span><span>${turn.actionUsed ? 'Akcja ✓' : 'Akcja —'} · ${turn.bonusUsed ? 'Bonus ✓' : 'Bonus —'}</span></div>` : ''}`;
        })() : ''}
        ${s.notes ? `<p class="map-stat-notes">${escapeHtml(s.notes)}</p>` : ''}
        <div class="map-sidebar-actions">
          ${this.isDm() ? `
          <button type="button" class="btn btn-sm btn-primary" data-map-link="${token.id}">🔗 Powiąż</button>
          <button type="button" class="btn btn-sm btn-secondary" data-map-edit-stats="${token.id}">📊 Statystyki</button>
          <button type="button" class="btn btn-sm btn-secondary" data-map-init="${token.id}">⚔️ Init</button>` : ''}
          ${!this.isDm() && !token.entity_id && Characters.myCampaignCharacter ? `
          <button type="button" class="btn btn-sm btn-primary" data-map-claim="${token.id}">🔗 Moja postać</button>` : ''}
        </div>`;
      el.querySelector('[data-map-link]')?.addEventListener('click', () => this.showLinkTokenDialog(token));
      el.querySelector('[data-map-claim]')?.addEventListener('click', () => {
        const char = Characters.myCampaignCharacter;
        if (!char) return;
        App.socket?.emit('map-link-token', {
          tokenId: token.id,
          entityType: 'player',
          entityId: char.id,
          syncInitiative: true
        });
        showToast(`Powiązano z ${char.name}`, 'success');
      });
      el.querySelector('[data-map-edit-stats]')?.addEventListener('click', () => this.showTokenStatsDialog(token));
      el.querySelector('[data-map-init]')?.addEventListener('click', () => {
        Initiative.highlightByMapToken(token.id);
      });
      return;
    }

    if (this.selectedPinId) {
      const pin = this.pins.find((p) => p.id === this.selectedPinId);
      if (!pin) {
        el.innerHTML = '<p class="map-sidebar-empty">Kliknij token lub pinezkę</p>';
        return;
      }
      const meta = MAP_PIN_TYPES[pin.pin_type] || MAP_PIN_TYPES.note;
      el.innerHTML = `
        <div class="map-stat-row"><span>Pinezka</span><strong>${meta.icon} ${escapeHtml(pin.label || meta.label)}</strong></div>
        <div class="map-stat-row"><span>Typ</span><span>${escapeHtml(meta.label)}</span></div>
        <div class="map-stat-row"><span>Pozycja</span><span>${pin.x}, ${pin.y}</span></div>
        ${pin.description ? `<p class="map-stat-notes">${escapeHtml(pin.description)}</p>` : ''}
        <div class="map-sidebar-actions">
          <button type="button" class="btn btn-sm btn-primary" data-map-pin-open="${pin.id}">Szczegóły</button>
          ${pin.loot_grant_id && typeof Economy !== 'undefined' ? `<button type="button" class="btn btn-sm btn-warning" data-map-pin-loot="${pin.loot_grant_id}">🎁 Otwórz łup</button>` : ''}
          ${this.isDm() ? `<button type="button" class="btn btn-sm btn-danger" data-map-pin-del="${pin.id}">Usuń</button>` : ''}
        </div>`;
      el.querySelector('[data-map-pin-open]')?.addEventListener('click', () => this.showPinDetails(pin));
      el.querySelector('[data-map-pin-loot]')?.addEventListener('click', (ev) => {
        Economy.openLootPackage(ev.target.dataset.mapPinLoot);
      });
      el.querySelector('[data-map-pin-del]')?.addEventListener('click', () => {
        if (confirm('Usunąć pinezkę?')) App.socket?.emit('map-remove-pin', { id: pin.id });
      });
      return;
    }

    el.innerHTML = '<p class="map-sidebar-empty">Kliknij token lub pinezkę</p>';
  },

  renderPinsList() {
    const list = document.getElementById('map-pins-list');
    const count = document.getElementById('map-pin-count');
    if (!list) return;
    const pins = this.visiblePins();
    if (count) count.textContent = String(pins.length);
    if (!pins.length) {
      list.innerHTML = '<p class="map-sidebar-empty">Brak pinezek</p>';
      return;
    }
    list.innerHTML = pins.map((p) => {
      const meta = MAP_PIN_TYPES[p.pin_type] || MAP_PIN_TYPES.note;
      return `<div class="map-pin-row ${p.id === this.selectedPinId ? 'selected' : ''}" data-pin-id="${p.id}">
        <span class="map-pin-icon">${meta.icon}</span>
        <span class="map-pin-row-label">${escapeHtml(p.label || meta.label)}</span>
      </div>`;
    }).join('');
  },

  renderTokensList() {
    const list = document.getElementById('map-tokens-list');
    if (!list || !this.isDm()) return;
    const tokens = this.tokens;
    if (!tokens.length) {
      list.innerHTML = '<p class="map-sidebar-empty">Brak tokenów</p>';
      return;
    }
    list.innerHTML = tokens.map((t) => {
      const link = EntityLink.linkLabel(t);
      return `
      <div class="map-token-row ${t.id === this.selectedTokenId ? 'selected' : ''}" data-token-id="${t.id}">
        <span style="color:${escapeHtml(t.color || '#8b6914')}">●</span>
        <span class="map-pin-row-label">${escapeHtml(t.entity_name)}${link ? ` <span class="map-token-link-hint" title="${escapeHtml(link)}">🔗</span>` : ''}</span>
      </div>`;
    }).join('');
  },

  showPinDetails(pin) {
    const meta = MAP_PIN_TYPES[pin.pin_type] || MAP_PIN_TYPES.note;
    const html = `
      <p><strong>${meta.icon} ${escapeHtml(pin.label || meta.label)}</strong></p>
      <p class="sheet-hint">Pozycja: ${pin.x}, ${pin.y}</p>
      ${pin.description ? `<p>${escapeHtml(pin.description)}</p>` : '<p class="sheet-hint">Brak opisu.</p>'}
      ${pin.loot_grant_id ? '<p>💰 Powiązana paczka łupu — otwórz z panelu bocznego.</p>' : ''}
    `;
    showGenericModal('Pinezka na mapie', html);
  },

  showPinContextMenu(pin) {
    const action = prompt(
      `Pinezka: ${pin.label || pin.pin_type}\n1 = edytuj, 2 = usuń, 3 = przełącz widoczność`,
      '1'
    );
    if (action === '1') this.showEditPinDialog(pin);
    else if (action === '2' && confirm('Usunąć pinezkę?')) {
      App.socket?.emit('map-remove-pin', { id: pin.id });
    } else if (action === '3') {
      App.socket?.emit('map-update-pin', { id: pin.id, is_visible: !pin.is_visible });
    }
  },

  showTokenContextMenu(token) {
    const isProp = typeof MapProps !== 'undefined' && MapProps.getTemplateForToken(token);
    const propLine = isProp ? ', 7 = aktywuj efekt rekwizytu' : '';
    const action = prompt(
      `Token: ${token.entity_name}${isProp ? '\n' + MapProps.displayHint(token) : ''}\n` +
      `1 = usuń, 2 = zablokuj/odblokuj, 3 = grafika, 4 = powiąż postać/NPC, 5 = statystyki, 6 = inicjatywa, 8 = stany${propLine}`,
      ''
    );
    if (action === '1') {
      if (confirm(`Usunąć token "${token.entity_name}"?`)) {
        App.socket?.emit('map-remove-token', { id: token.id });
      }
    } else if (action === '2') {
      App.socket?.emit('map-update-token', { id: token.id, is_locked: !token.is_locked });
    } else if (action === '3') {
      if (typeof TokenLibrary !== 'undefined') {
        TokenLibrary.open(token.id);
      } else {
        this.pendingTokenImageId = token.id;
        document.getElementById('token-image-file')?.click();
      }
    } else if (action === '4') {
      this.showLinkTokenDialog(token);
    } else if (action === '5') {
      this.showTokenStatsDialog(token);
    } else if (action === '6') {
      Initiative.highlightByMapToken(token.id);
      if (!EntityLink.findInitiativeEntry(token.entity_type, token.entity_id, token.id)) {
        const roll = prompt('Wartość inicjatywy:', '10');
        if (roll === null) return;
        App.socket?.emit('initiative-add', {
          entityName: token.entity_name,
          entityType: token.entity_type,
          entityId: token.entity_id || '',
          initiativeRoll: parseInt(roll, 10) || 0,
          mapTokenId: token.id
        });
        showToast('Dodano do inicjatywy', 'success');
      }
    } else if (action === '7' && isProp && this.isDm()) {
      App.socket?.emit('map-trigger-prop', { tokenId: token.id });
      showToast('Aktywowano rekwizyt', 'info');
    } else if (action === '8') {
      if (typeof MapConditions !== 'undefined') MapConditions.openDialog(token);
    }
  },

  _pendingPropTemplate: null,

  openPropPlacementPicker() {
    if (!this.isDm()) return;
    const templates = typeof MapPropTemplates !== 'undefined' ? MapPropTemplates.all() : [];
    const rows = templates.map((t) =>
      `<button type="button" class="btn btn-secondary btn-full map-prop-pick" data-prop-id="${escapeHtml(t.id)}">${t.icon} ${escapeHtml(t.namePl)}</button>`
    ).join('');
    showGenericModal('Postaw rekwizyt', `<div class="map-prop-picks">${rows}</div><p class="sheet-hint">Potem kliknij mapę.</p>`);
    document.querySelectorAll('.map-prop-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._pendingPropTemplate = btn.dataset.propId;
        closeModal('generic-modal');
        this.setTool('prop-place');
        const tpl = MapPropTemplates.get(this._pendingPropTemplate);
        showToast(`Wybrano: ${tpl?.namePl || 'rekwizyt'} — kliknij mapę`, 'info');
      });
    });
  },

  placePropAt(cell) {
    if (!this._pendingPropTemplate || !App.socket) return;
    const token = MapProps.tokenFromTemplate(this._pendingPropTemplate, cell.x, cell.y);
    if (!token) return;
    App.socket.emit('map-add-token', {
      entity_name: token.entity_name,
      entity_type: 'object',
      color: token.color,
      x: token.x,
      y: token.y,
      size: token.size,
      is_visible: true,
      hp_max: token.hp_max,
      hp_current: token.hp_current,
      ac: token.ac,
      stat_notes: token.stat_notes,
      is_locked: true,
      sync_initiative: false
    });
    this._pendingPropTemplate = null;
    this.setTool('select');
    showToast('Rekwizyt dodany na mapę', 'success');
  },

  async showLinkTokenDialog(token) {
    const isDm = this.isDm();
    const entities = await EntityLink.loadEntities();
    if (!isDm) {
      const char = Characters.myCampaignCharacter;
      if (!char) {
        showToast('Brak przypisanej postaci', 'warning');
        return;
      }
      App.socket?.emit('map-link-token', {
        tokenId: token.id,
        entityType: 'player',
        entityId: char.id,
        syncInitiative: true
      });
      showToast(`Powiązano z ${char.name}`, 'success');
      return;
    }

    const selected = EntityLink.currentPickForToken(token);
    const html = `
      <form id="map-link-form">
        <p class="sheet-hint">Token: <strong>${escapeHtml(token.entity_name)}</strong></p>
        <div class="form-group">
          <label>Powiąż z</label>
          ${EntityLink.buildSelectHtml('map-link-entity', entities, { selectedPick: selected || '__manual__', includeNone: true, noneLabel: '— odłącz —' })}
        </div>
        <label style="display:block;margin:10px 0;"><input type="checkbox" id="map-link-init" checked> Dodaj / zaktualizuj inicjatywę</label>
        <div class="form-group">
          <label>Inicjatywa (opcjonalnie, puste = zachowaj / 10)</label>
          <input type="number" id="map-link-init-roll" placeholder="auto">
        </div>
        <button type="submit" class="btn btn-primary btn-full">🔗 Zapisz powiązanie</button>
      </form>
    `;
    showGenericModal('Powiąż token', html);
    document.getElementById('map-link-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const pick = document.getElementById('map-link-entity').value;
      const syncInitiative = document.getElementById('map-link-init').checked;
      const rollRaw = document.getElementById('map-link-init-roll').value.trim();
      const initiativeRoll = rollRaw ? parseInt(rollRaw, 10) : null;
      if (!pick) {
        App.socket?.emit('map-link-token', { tokenId: token.id, entityType: 'player', entityId: '', syncInitiative: false });
      } else {
        const { entityType, entityId } = EntityLink.decodePick(pick);
        App.socket?.emit('map-link-token', {
          tokenId: token.id,
          entityType,
          entityId,
          syncInitiative,
          initiativeRoll
        });
      }
      closeModal('generic-modal');
      showToast('Powiązanie zapisane', 'success');
    });
  },

  showTokenStatsDialog(token) {
    const propHint = typeof MapProps !== 'undefined' ? MapProps.displayHint(token) : '';
    const isProp = typeof MapProps !== 'undefined' && MapProps.getTemplateForToken(token);
    const html = `
      <form id="map-token-stats-form">
        ${isProp ? `<p class="sheet-hint">${escapeHtml(propHint)}</p>` : ''}
        <div class="form-row">
          <div class="form-group"><label>HP (teraz)</label><input type="number" id="map-ts-hp" value="${token.hp_current || 0}" min="0"></div>
          <div class="form-group"><label>HP (max)</label><input type="number" id="map-ts-hpmax" value="${token.hp_max || 0}" min="0"></div>
        </div>
        <div class="form-group"><label>AC</label><input type="number" id="map-ts-ac" value="${token.ac || 0}" min="0"></div>
        <div class="form-group"><label>Prędkość (ft, 0 = z karty postaci)</label><input type="number" id="map-ts-speed" value="${token.speed_ft || 0}" min="0" step="5"></div>
        <div class="form-group"><label>Notatki MG</label><textarea id="map-ts-notes" rows="3" ${isProp ? 'readonly' : ''}>${escapeHtml(isProp ? propHint : (token.stat_notes || ''))}</textarea></div>
        <button type="submit" class="btn btn-primary btn-full">Zapisz</button>
      </form>
    `;
    showGenericModal(`Statystyki: ${escapeHtml(token.entity_name)}`, html);
    document.getElementById('map-token-stats-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const keepPropNotes = typeof MapProps !== 'undefined' && MapProps.parseNotes(token.stat_notes);
      App.socket?.emit('map-update-token', {
        id: token.id,
        hp_current: parseInt(document.getElementById('map-ts-hp').value, 10) || 0,
        hp_max: parseInt(document.getElementById('map-ts-hpmax').value, 10) || 0,
        ac: parseInt(document.getElementById('map-ts-ac').value, 10) || 0,
        speed_ft: parseInt(document.getElementById('map-ts-speed').value, 10) || 0,
        stat_notes: keepPropNotes ? token.stat_notes : document.getElementById('map-ts-notes').value.trim()
      });
      closeModal('generic-modal');
      showToast('Statystyki tokenu zapisane', 'success');
    });
  },

  showAddPinDialog(x, y, existingPin = null) {
    const isEdit = !!existingPin;
    const typeOptions = Object.entries(MAP_PIN_TYPES).map(([k, v]) =>
      `<option value="${k}" ${existingPin?.pin_type === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`
    ).join('');
    const html = `
      <form id="map-pin-form">
        <div class="form-group"><label>Typ</label><select id="map-pin-type">${typeOptions}</select></div>
        <div class="form-group"><label>Etykieta</label><input type="text" id="map-pin-label" value="${escapeHtml(existingPin?.label || '')}" maxlength="40"></div>
        <div class="form-group"><label>Opis</label><textarea id="map-pin-desc" rows="3">${escapeHtml(existingPin?.description || '')}</textarea></div>
        <div class="form-group"><label>ID paczki łupu (opcjonalnie)</label><input type="text" id="map-pin-loot" value="${escapeHtml(existingPin?.loot_grant_id || '')}" placeholder="uuid z panelu MG"></div>
        <label><input type="checkbox" id="map-pin-visible" ${existingPin?.is_visible !== 0 ? 'checked' : ''}> Widoczna dla graczy</label>
        <button type="submit" class="btn btn-primary btn-full" style="margin-top:12px;">${isEdit ? 'Zapisz' : 'Dodaj pinezkę'}</button>
      </form>
    `;
    showGenericModal(isEdit ? 'Edytuj pinezkę' : 'Nowa pinezka', html);
    document.getElementById('map-pin-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const payload = {
        pin_type: document.getElementById('map-pin-type').value,
        label: document.getElementById('map-pin-label').value.trim(),
        description: document.getElementById('map-pin-desc').value.trim(),
        loot_grant_id: document.getElementById('map-pin-loot').value.trim(),
        is_visible: document.getElementById('map-pin-visible').checked,
        color: (MAP_PIN_TYPES[document.getElementById('map-pin-type').value] || MAP_PIN_TYPES.note).color
      };
      if (isEdit) {
        App.socket?.emit('map-update-pin', { id: existingPin.id, ...payload });
      } else {
        App.socket?.emit('map-add-pin', { x, y, ...payload });
      }
      closeModal('generic-modal');
    });
  },

  showEditPinDialog(pin) {
    this.showAddPinDialog(pin.x, pin.y, pin);
  },

  pushFogUpdate() {
    if (!App.socket || !this.isDm()) return;
    App.socket.emit('map-update-fog', {
      fogRevealed: Array.from(this.fogRevealed)
    });
  },

  toggleFogEnabled() {
    if (!this.isDm() || !App.socket) return;
    const next = !this.settings.fog_enabled;
    App.socket.emit('map-update-fog', {
      fogEnabled: next,
      fogRevealed: Array.from(this.fogRevealed)
    });
    showToast(next ? 'Mgła wojny włączona' : 'Mgła wojny wyłączona', 'info');
  },

  revealAllFog() {
    if (!this.isDm()) return;
    for (let y = 0; y < this.settings.grid_height; y++) {
      for (let x = 0; x < this.settings.grid_width; x++) {
        this.fogRevealed.add(`${x},${y}`);
      }
    }
    this.pushFogUpdate();
    this.render();
    showToast('Cała mapa odsłonięta', 'info');
  },

  hideAllFog() {
    if (!this.isDm()) return;
    this.fogRevealed.clear();
    this.pushFogUpdate();
    this.render();
    showToast('Cała mapa zakryta mgłą', 'info');
  },

  toggleTrails() {
    if (!this.isDm() || !App.socket) return;
    const next = !this.settings.trails_enabled;
    App.socket.emit('map-toggle-trails', { enabled: next });
    showToast(next ? 'Ślady ruchu włączone' : 'Ślady ruchu wyłączone', 'info');
  },

  async onTokenImageSelected(event) {
    const file = event.target.files?.[0];
    const tokenId = this.pendingTokenImageId;
    event.target.value = '';
    this.pendingTokenImageId = null;
    if (!file || !tokenId || !App.currentCampaign) return;
    try {
      const formData = new FormData();
      formData.append('image', file);
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/campaigns/${App.currentCampaign.id}/map/tokens/${tokenId}/image`, {
        method: 'POST',
        headers,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Błąd uploadu');
      this.updateMap(data);
      showToast('Grafika tokenu zaktualizowana', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async onBackgroundFileSelected(event) {
    const fileInput = event.target;
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (!this.isDm()) throw new Error('Tylko Mistrz Gry może zmieniać tło mapy');
      if (!file.type.startsWith('image/')) throw new Error('Wybierz plik graficzny (PNG/JPG/WEBP/GIF)');
      if (file.size > 8 * 1024 * 1024) throw new Error('Maksymalny rozmiar tła to 8 MB');
      const formData = new FormData();
      formData.append('background', file);
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/campaigns/${App.currentCampaign.id}/map/background`, {
        method: 'POST',
        headers,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Błąd zapisu tła mapy');
      this.updateMap(data);
      showToast('Tło mapy zaktualizowane', 'success');
    } catch (err) {
      showToast(err.message || 'Nie udało się dodać tła mapy', 'error');
    } finally {
      fileInput.value = '';
    }
  },

  async removeBackground() {
    try {
      if (!this.isDm()) throw new Error('Tylko Mistrz Gry może usuwać tło mapy');
      if (!confirm('Usunąć tło mapy?')) return;
      const headers = { 'Content-Type': 'application/json' };
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/campaigns/${App.currentCampaign.id}/map/background`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Błąd usuwania tła mapy');
      this.updateMap(data);
      showToast('Tło mapy usunięte', 'success');
    } catch (err) {
      showToast(err.message || 'Nie udało się usunąć tła mapy', 'error');
    }
  },

  async showAddTokenDialog() {
    const entities = await EntityLink.loadEntities();
    const colors = ['#8b6914', '#8b3a2a', '#4a6b3a', '#c9a227', '#5c4a6e', '#6a5a48', '#a67c2e', '#d9cbb0', '#4a4540'];
    const html = `
      <form id="add-token-form">
        <div class="form-group">
          <label>Powiąż z postacią / NPC (opcjonalnie)</label>
          ${EntityLink.buildSelectHtml('token-entity-pick', entities, { includeNone: true, manualOption: true })}
        </div>
        <div class="form-group">
          <label>Nazwa</label>
          <input type="text" id="token-name" required maxlength="40">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Typ</label>
            <select id="token-type">
              <option value="player">Gracz</option>
              <option value="npc">NPC</option>
              <option value="monster">Potwór</option>
              <option value="object">Obiekt</option>
            </select>
          </div>
          <div class="form-group">
            <label>Rozmiar (kratki)</label>
            <select id="token-size">
              <option value="1">Mały/Średni (1)</option>
              <option value="2">Duży (2)</option>
              <option value="3">Ogromny (3)</option>
              <option value="4">Gargantuiczny (4)</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>HP max</label><input type="number" id="token-hpmax" value="0" min="0"></div>
          <div class="form-group"><label>AC</label><input type="number" id="token-ac" value="0" min="0"></div>
        </div>
        <div class="form-group">
          <label>Kolor (gdy brak grafiki)</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${colors.map((c) => `<div class="color-pick" data-color="${c}" style="width:30px;height:30px;background:${c};border-radius:50%;cursor:pointer;border:2px solid transparent;" onclick="this.parentElement.querySelectorAll('.color-pick').forEach(el=>el.style.borderColor='transparent');this.style.borderColor='white';document.getElementById('token-color').value='${c}';"></div>`).join('')}
          </div>
          <input type="hidden" id="token-color" value="#8b6914">
        </div>
        <div class="form-row">
          <div class="form-group"><label>Pozycja X</label><input type="number" id="token-x" value="0" min="0"></div>
          <div class="form-group"><label>Pozycja Y</label><input type="number" id="token-y" value="0" min="0"></div>
        </div>
        <label><input type="checkbox" id="token-locked"> Zablokuj ruch</label>
        <label style="display:block;margin:8px 0;"><input type="checkbox" id="token-sync-init" checked> Dodaj do inicjatywy (gdy powiązany)</label>
        <div class="form-group">
          <label>Inicjatywa (opcjonalnie)</label>
          <input type="number" id="token-init-roll" placeholder="auto (10)">
        </div>
        <button type="submit" class="btn btn-primary btn-full" style="margin-top:12px;">➕ Dodaj Token</button>
      </form>
    `;
    showGenericModal('Dodaj Token na Mapę', html);

    const nameInput = document.getElementById('token-name');
    const typeSelect = document.getElementById('token-type');
    const hpInput = document.getElementById('token-hpmax');
    const acInput = document.getElementById('token-ac');
    EntityLink.wireSelect(document.getElementById('token-entity-pick'), {
      nameInput,
      typeSelect,
      onChange: (entity) => {
        if (!entity) return;
        const npc = entities.npcs.find((n) => n.id === entity.entityId);
        const char = entities.allCharacters?.find((c) => c.id === entity.entityId)
          || entities.characters.find((c) => c.id === entity.entityId);
        if (char) {
          hpInput.value = char.max_hp;
          acInput.value = char.armor_class;
        } else if (npc) {
          hpInput.value = npc.max_hp;
          acInput.value = npc.armor_class;
          if (entity.entityType === 'monster') {
            document.getElementById('token-color').value = '#5c1010';
          }
        }
      }
    });

    document.getElementById('add-token-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const hpMax = parseInt(hpInput.value, 10) || 0;
      const pick = document.getElementById('token-entity-pick').value;
      let entityId = '';
      let entityType = typeSelect.value;
      if (pick && pick !== '__manual__') {
        const decoded = EntityLink.decodePick(pick);
        entityId = decoded.entityId;
        entityType = decoded.entityType;
      }
      const initRollRaw = document.getElementById('token-init-roll').value.trim();
      const payload = {
        entity_name: nameInput.value.trim(),
        entity_type: entityType,
        entity_id: entityId,
        size: parseInt(document.getElementById('token-size').value, 10),
        color: document.getElementById('token-color').value,
        x: parseInt(document.getElementById('token-x').value, 10),
        y: parseInt(document.getElementById('token-y').value, 10),
        is_visible: true,
        is_locked: document.getElementById('token-locked').checked,
        hp_max: hpMax,
        hp_current: hpMax,
        ac: parseInt(acInput.value, 10) || 0,
        sync_initiative: document.getElementById('token-sync-init').checked && !!entityId
      };
      if (initRollRaw) payload.initiative_roll = parseInt(initRollRaw, 10);
      App.socket?.emit('map-add-token', payload);
      closeModal('generic-modal');
      showToast('Token dodany!', 'success');
    });
  }
};
