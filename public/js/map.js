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

  init() {
    this.canvas = document.getElementById('battle-map');
    this.viewport = document.getElementById('map-viewport');
    this.ctx = this.canvas.getContext('2d');

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
    document.getElementById('map-grid-size')?.addEventListener('change', (e) => {
      if (App.socket && App.currentCampaign) {
        App.socket.emit('map-update-settings', { grid_size: parseInt(e.target.value, 10) });
      }
    });
    document.getElementById('map-bg-file')?.addEventListener('change', (e) => this.onBackgroundFileSelected(e));
    document.getElementById('token-image-file')?.addEventListener('change', (e) => this.onTokenImageSelected(e));

    document.querySelectorAll('[data-map-tool]').forEach((btn) => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.mapTool));
    });

    this.viewport?.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        this.setZoom(this.zoom + delta);
      }
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
  },

  isDm() {
    return App.currentCampaign?.role === 'dm';
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
      select: 'Przeciągnij tokeny. Prawy przycisk (MG) = opcje tokenu.',
      pointer: 'Kliknij mapę — wszyscy zobaczą wskaźnik. Alt+klik działa zawsze.',
      measure: 'Kliknij start i koniec — odległość w kratkach (D&D).',
      'fog-reveal': 'Przeciągnij po mapie, aby odsłonić mgłę. Włącz mgłę przyciskiem „Mgła”.',
      'fog-hide': 'Przeciągnij, aby zakryć obszar ponownie.',
      pin: 'Kliknij komórkę, aby dodać pinezkę (MG).',
      block: 'Maluj ściany/blokady LoS (MG). Kliknij ponownie, aby wyłączyć.',
      'block-erase': 'Usuń blokady LoS (MG).'
    };
    const hintEl = document.getElementById('map-tool-hint');
    if (hintEl) hintEl.textContent = hints[mode] || hints.select;
    if (mode !== 'measure') {
      this.measureStart = null;
      this.measureEnd = null;
    }
    this.render();
  },

  setZoom(value) {
    this.zoom = Math.max(0.4, Math.min(2.5, value));
    this.applyZoom();
    this.render();
  },

  applyZoom() {
    if (!this.settings || !this.canvas) return;
    const gs = this.settings.grid_size;
    const w = this.settings.grid_width * gs;
    const h = this.settings.grid_height * gs;
    this.canvas.style.width = `${w * this.zoom}px`;
    this.canvas.style.height = `${h * this.zoom}px`;
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
    App.socket?.emit('get-map');
  },

  updateMap(data) {
    const allTokens = data.tokens || [];
    const allPins = data.pins || [];
    this.tokens = this.isDm() ? allTokens : allTokens.filter((t) => t.is_visible);
    this.pins = this.isDm() ? allPins : allPins.filter((p) => p.is_visible);
    const prevBackground = this.settings?.background_image || '';
    this.settings = data.settings || {
      grid_size: 40,
      grid_width: 25,
      grid_height: 18,
      background_color: '#3b2618',
      fog_enabled: 0,
      fog_revealed: '[]',
      movement_trails: '{}',
      trails_enabled: 1
    };
    if (!this.isDm() && this.settings) {
      delete this.settings.last_token_move;
    }
    this.parseFogRevealed(this.settings);
    this.parseMovementTrails(this.settings);
    if (data.combat && typeof MapCombat !== 'undefined') {
      MapCombat.update(data.combat);
    }

    if (document.getElementById('map-grid-size')) {
      document.getElementById('map-grid-size').value = this.settings.grid_size;
    }

    const nextBackground = this.settings.background_image || '';
    if (nextBackground !== prevBackground) {
      this.loadBackgroundImage(nextBackground);
    } else {
      this.applyZoom();
      this.preloadTokenImages();
      this.renderSidebar();
      this.render();
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
    const gs = this.settings?.grid_size || 40;
    const entry = {
      x: data.x * gs + gs / 2,
      y: data.y * gs + gs / 2,
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
      this.render();
      return;
    }
    if (this.backgroundImageObj && this.backgroundImageSrc === src) {
      this.applyZoom();
      this.render();
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (this.backgroundImageSrc !== src) return;
      this.backgroundImageObj = image;
      this.applyZoom();
      this.render();
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
    if (char) {
      return {
        name: char.name,
        hpCurrent: char.current_hp,
        hpMax: char.max_hp,
        ac: char.armor_class,
        notes: '',
        fromCharacter: true
      };
    }
    return {
      name: token.entity_name,
      hpCurrent: token.hp_current || 0,
      hpMax: token.hp_max || 0,
      ac: token.ac || 0,
      notes: token.stat_notes || '',
      fromCharacter: false
    };
  },

  render() {
    if (!this.settings) return;
    const gs = this.settings.grid_size;
    const w = this.settings.grid_width * gs;
    const h = this.settings.grid_height * gs;

    this.canvas.width = w;
    this.canvas.height = h;

    const ctx = this.ctx;
    const fogEnabled = !!this.settings.fog_enabled;
    const isDm = this.isDm();

    ctx.fillStyle = this.settings.background_color || '#3b2618';
    ctx.fillRect(0, 0, w, h);

    if (this.backgroundImageObj) {
      ctx.drawImage(this.backgroundImageObj, 0, 0, w, h);
    }

    this.drawMovementTrails(ctx, gs);
    this.drawGrid(ctx, w, h, gs);

    if (fogEnabled && isDm) {
      this.drawDmFogPreview(ctx, gs, w, h);
    }

    if (fogEnabled && !isDm) {
      this.drawPlayerFog(ctx, gs, w, h);
    }

    this.visiblePins().forEach((pin) => this.drawPin(ctx, pin, gs));
    if (typeof MapCombat !== 'undefined') {
      MapCombat.drawBlocking(ctx, gs);
      MapCombat.drawRangeOverlay(ctx, gs);
    }
    this.visibleTokens().forEach((token) => this.drawToken(ctx, token, gs));

    this.drawMeasureLine(ctx, gs);
    this.drawPointers(ctx);
    this.drawFogEditOverlay(ctx, gs);
    if (typeof MapCombat !== 'undefined') MapCombat.drawEffects(ctx);
  },

  focusToken(tokenId) {
    const token = this.tokens.find((t) => t.id === tokenId);
    if (!token || !this.viewport) return;
    const gs = this.settings?.grid_size || 40;
    const cx = (token.x + (token.size || 1) / 2) * gs * this.zoom;
    const cy = (token.y + (token.size || 1) / 2) * gs * this.zoom;
    this.viewport.scrollLeft = Math.max(0, cx - this.viewport.clientWidth / 2);
    this.viewport.scrollTop = Math.max(0, cy - this.viewport.clientHeight / 2);
  },

  selectToken(id) {
    this.selectedTokenId = id;
    this.selectedPinId = null;
    this.renderSidebar();
    this.render();
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

  drawGrid(ctx, w, h, gs) {
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += gs) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += gs) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(201, 178, 140, 0.35)';
    ctx.font = '10px Crimson Pro, Georgia, serif';
    for (let x = 0; x < this.settings.grid_width; x++) {
      ctx.fillText(String.fromCharCode(65 + (x % 26)), x * gs + 3, 12);
    }
    for (let y = 0; y < this.settings.grid_height; y++) {
      ctx.fillText((y + 1).toString(), 3, y * gs + gs - 3);
    }
  },

  drawPlayerFog(ctx, gs, w, h) {
    ctx.fillStyle = 'rgba(10, 6, 4, 0.88)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    for (const key of this.fogRevealed) {
      const [x, y] = key.split(',').map(Number);
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        ctx.fillRect(x * gs, y * gs, gs, gs);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  drawDmFogPreview(ctx, gs, w, h) {
    ctx.fillStyle = 'rgba(10, 6, 4, 0.55)';
    for (let y = 0; y < this.settings.grid_height; y++) {
      for (let x = 0; x < this.settings.grid_width; x++) {
        const key = `${x},${y}`;
        if (!this.fogRevealed.has(key)) {
          ctx.fillRect(x * gs, y * gs, gs, gs);
        }
      }
    }
  },

  drawFogEditOverlay(ctx, gs) {
    if (!this.isDm() || !this.settings.fog_enabled) return;
    if (this.toolMode !== 'fog-reveal' && this.toolMode !== 'fog-hide') return;
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.35)';
    ctx.setLineDash([3, 3]);
    for (const key of this.fogRevealed) {
      const [x, y] = key.split(',').map(Number);
      ctx.strokeRect(x * gs + 1, y * gs + 1, gs - 2, gs - 2);
    }
    ctx.setLineDash([]);
  },

  drawMovementTrails(ctx, gs) {
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
        const px = pt.x * gs + gs / 2;
        const py = pt.y * gs + gs / 2;
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
      ctx.moveTo(seg.fromX * gs + gs / 2, seg.fromY * gs + gs / 2);
      ctx.lineTo(seg.toX * gs + gs / 2, seg.toY * gs + gs / 2);
      ctx.stroke();
    });
    ctx.restore();
  },

  drawPin(ctx, pin, gs) {
    const px = pin.x * gs + gs / 2;
    const py = pin.y * gs + gs / 2;
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
      ctx.strokeText(pin.label, px, py + gs * 0.55);
      ctx.fillText(pin.label, px, py + gs * 0.55);
    }
  },

  drawMeasureLine(ctx, gs) {
    if (!this.measureStart) return;
    const end = this.measureEnd || this.measureStart;
    const x1 = this.measureStart.x * gs + gs / 2;
    const y1 = this.measureStart.y * gs + gs / 2;
    const x2 = end.x * gs + gs / 2;
    const y2 = end.y * gs + gs / 2;
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

  drawToken(ctx, token, gs) {
    const tx = token.x * gs;
    const ty = token.y * gs;
    const size = (token.size || 1) * gs;
    const cx = tx + size / 2;
    const cy = ty + size / 2;
    const radius = (size / 2) - 3;

    const stats = this.getTokenStats(token);
    if (stats.hpMax > 0) {
      const ratio = Math.max(0, Math.min(1, stats.hpCurrent / stats.hpMax));
      const barW = size - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(tx + 4, ty + 2, barW, 5);
      ctx.fillStyle = ratio > 0.5 ? '#4a6b3a' : ratio > 0.25 ? '#c9a227' : '#a63d2f';
      ctx.fillRect(tx + 4, ty + 2, barW * ratio, 5);
    }

    const img = token.image_url ? this.tokenImageCache.get(token.image_url) : null;
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, tx + 3, ty + 3, size - 6, size - 6);
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
    else ctx.fillText(shortName, cx, ty + size - 8);
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
      ctx.arc(tx + size - 6, ty + 6, 5, 0, Math.PI * 2);
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
        ctx.strokeRect(tx + 1, ty + 1, size - 2, size - 2);
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
    const gs = this.settings.grid_size;
    const x = Math.floor(mx / gs);
    const y = Math.floor(my / gs);
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
    const gs = this.settings.grid_size;
    const list = this.visibleTokens();
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      const size = (t.size || 1) * gs;
      const tx = t.x * gs;
      const ty = t.y * gs;
      if (mx >= tx && mx < tx + size && my >= ty && my < ty + size) return t;
    }
    return null;
  },

  getPinAt(mx, my) {
    const gs = this.settings.grid_size;
    for (let i = this.visiblePins().length - 1; i >= 0; i--) {
      const p = this.visiblePins()[i];
      const px = p.x * gs + gs / 2;
      const py = p.y * gs + gs / 2;
      if (Math.hypot(mx - px, my - py) < gs * 0.45) return p;
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
      const gs = this.settings.grid_size;
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
        this.dragOffset.x = mx - token.x * gs;
        this.dragOffset.y = my - token.y * gs;
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

    if (this.isPaintingFog) {
      this.paintFogAt(mx, my, this.toolMode === 'fog-reveal');
      return;
    }

    if (this.isPaintingBlock) {
      this.paintBlockAt(mx, my, this.toolMode === 'block-erase');
      return;
    }

    if (this.toolMode === 'measure' && this.measureStart && !this.measureEnd) {
      const cell = this.cellAt(mx, my);
      this.measureEnd = { x: cell.x, y: cell.y };
      this.render();
      return;
    }

    if (!this.isDragging || !this.dragToken) return;
    const gs = this.settings.grid_size;
    const maxX = this.settings.grid_width - (this.dragToken.size || 1);
    const maxY = this.settings.grid_height - (this.dragToken.size || 1);
    let nx = Math.max(0, Math.min(maxX,
      Math.floor((mx - this.dragOffset.x + gs / 2) / gs)));
    let ny = Math.max(0, Math.min(maxY,
      Math.floor((my - this.dragOffset.y + gs / 2) / gs)));

    if (this.dragMaxFt != null && this.dragStartX != null && typeof MapTactics !== 'undefined') {
      const maxCells = MapTactics.feetToCells(this.dragMaxFt);
      const clamped = MapTactics.clampChebyshev(this.dragStartX, this.dragStartY, nx, ny, maxCells);
      nx = Math.max(0, Math.min(maxX, clamped.x));
      ny = Math.max(0, Math.min(maxY, clamped.y));
    }

    this.dragToken.x = nx;
    this.dragToken.y = ny;
    this.render();
  },

  onMouseUp(e) {
    if (this.isPaintingFog) {
      this.isPaintingFog = false;
      return;
    }
    if (this.isPaintingBlock) {
      this.isPaintingBlock = false;
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
    const gs = this.settings.grid_size;
    const x = pin.x * gs * this.zoom;
    const y = pin.y * gs * this.zoom;
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
    const action = prompt(
      `Token: ${token.entity_name}\n` +
      '1 = usuń, 2 = zablokuj/odblokuj, 3 = grafika, 4 = powiąż postać/NPC, 5 = statystyki, 6 = inicjatywa',
      ''
    );
    if (action === '1') {
      if (confirm(`Usunąć token "${token.entity_name}"?`)) {
        App.socket?.emit('map-remove-token', { id: token.id });
      }
    } else if (action === '2') {
      App.socket?.emit('map-update-token', { id: token.id, is_locked: !token.is_locked });
    } else if (action === '3') {
      this.pendingTokenImageId = token.id;
      document.getElementById('token-image-file')?.click();
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
    }
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
    const html = `
      <form id="map-token-stats-form">
        <div class="form-row">
          <div class="form-group"><label>HP (teraz)</label><input type="number" id="map-ts-hp" value="${token.hp_current || 0}" min="0"></div>
          <div class="form-group"><label>HP (max)</label><input type="number" id="map-ts-hpmax" value="${token.hp_max || 0}" min="0"></div>
        </div>
        <div class="form-group"><label>AC</label><input type="number" id="map-ts-ac" value="${token.ac || 0}" min="0"></div>
        <div class="form-group"><label>Prędkość (ft, 0 = z karty postaci)</label><input type="number" id="map-ts-speed" value="${token.speed_ft || 0}" min="0" step="5"></div>
        <div class="form-group"><label>Notatki MG</label><textarea id="map-ts-notes" rows="3">${escapeHtml(token.stat_notes || '')}</textarea></div>
        <button type="submit" class="btn btn-primary btn-full">Zapisz</button>
      </form>
    `;
    showGenericModal(`Statystyki: ${escapeHtml(token.entity_name)}`, html);
    document.getElementById('map-token-stats-form').addEventListener('submit', (e) => {
      e.preventDefault();
      App.socket?.emit('map-update-token', {
        id: token.id,
        hp_current: parseInt(document.getElementById('map-ts-hp').value, 10) || 0,
        hp_max: parseInt(document.getElementById('map-ts-hpmax').value, 10) || 0,
        ac: parseInt(document.getElementById('map-ts-ac').value, 10) || 0,
        speed_ft: parseInt(document.getElementById('map-ts-speed').value, 10) || 0,
        stat_notes: document.getElementById('map-ts-notes').value.trim()
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
