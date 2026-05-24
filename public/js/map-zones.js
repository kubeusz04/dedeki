// Map terrain zones + spell AoE placement
const MapZones = {
  zones: [],
  placement: null,
  isPaintingTerrain: false,
  _terrainType: 'difficult',
  _listEl: null,

  init() {
    this._listEl = document.getElementById('map-zones-list');
    document.getElementById('map-zone-terrain-select')?.addEventListener('change', (e) => {
      this._terrainType = e.target.value || 'difficult';
    });
    document.getElementById('btn-map-zones-clear')?.addEventListener('click', () => {
      if (!BattleMap.isDm()) return;
      if (!confirm('Usunąć wszystkie strefy z mapy?')) return;
      this.zones = [];
      this.commitZones();
    });
    document.getElementById('btn-map-spell-aoe')?.addEventListener('click', () => {
      if (!BattleMap.isDm()) return;
      MapCombat.startMapSpellAoe?.();
    });
    this._listEl?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-zone-action]');
      if (!btn) return;
      const id = btn.closest('[data-zone-id]')?.dataset?.zoneId;
      if (!id) return;
      if (btn.dataset.zoneAction === 'remove') {
        this.zones = this.zones.filter((z) => z.id !== id);
        this.commitZones();
      }
      if (btn.dataset.zoneAction === 'label') {
        const zone = this.zones.find((z) => z.id === id);
        const label = prompt('Etykieta strefy:', zone?.label || '');
        if (label == null) return;
        zone.label = label;
        this.commitZones();
      }
    });
  },

  load(zones) {
    this.zones = Array.isArray(zones) ? zones : MapTactics.parseZonesList(zones);
    this.renderList();
    if (typeof BattleMap !== 'undefined') BattleMap.render();
  },

  getTerrainIndex() {
    return MapTactics.buildTerrainIndex(this.zones);
  },

  movementCostFt(fromX, fromY, toX, toY) {
    return MapTactics.movementCostAlongPath(fromX, fromY, toX, toY, this.getTerrainIndex());
  },

  clampDrag(fromX, fromY, toX, toY, maxFt) {
    return MapTactics.clampByMovementCost(fromX, fromY, toX, toY, maxFt, this.getTerrainIndex());
  },

  commitZones() {
    if (!App.socket) return;
    App.socket.emit('map-update-zones', { zones: this.zones });
    this.renderList();
  },

  draw(ctx, gs) {
    const gw = BattleMap.settings?.grid_width || 25;
    const gh = BattleMap.settings?.grid_height || 18;

    this.zones.forEach((zone) => {
      const cells = zone.cells?.length
        ? zone.cells
        : MapTactics.resolveZoneCells(zone, gw, gh);
      let fill;
      let stroke;
      if (zone.kind === 'spell') {
        const colors = MapZoneTypes.getSpellColors(zone.spellMeta?.damageType);
        fill = colors.fill;
        stroke = colors.stroke;
      } else {
        const t = MapZoneTypes.getTerrain(zone.terrainType || 'difficult');
        fill = t.fill;
        stroke = t.stroke;
      }
      ctx.save();
      cells.forEach((key) => {
        const { x, y } = MapTactics.parseCellKey(key);
        ctx.fillStyle = fill;
        ctx.fillRect(x * gs, y * gs, gs, gs);
        ctx.strokeStyle = stroke;
        ctx.strokeRect(x * gs + 0.5, y * gs + 0.5, gs - 1, gs - 1);
      });
      if (zone.label && cells.length) {
        const { x, y } = MapTactics.parseCellKey(cells[0]);
        ctx.fillStyle = 'rgba(42, 26, 16, 0.75)';
        ctx.font = '10px EB Garamond, serif';
        ctx.fillText(zone.label, x * gs + 2, y * gs + 12);
      }
      ctx.restore();
    });

    if (this.placement) this._drawPlacementPreview(ctx, gs, gw, gh);
  },

  _previewCells(gw, gh) {
    const p = this.placement;
    if (!p) return [];
    const zone = {
      shape: p.shape,
      origin: p.origin,
      end: p.end,
      facing: p.facing,
      radiusCells: p.radiusCells,
      sizeCells: p.sizeCells,
      lengthCells: p.lengthCells,
      widthCells: p.widthCells,
      cells: p.cells
    };
    return MapTactics.resolveZoneCells(zone, gw, gh);
  },

  _drawPlacementPreview(ctx, gs, gw, gh) {
    const cells = this._previewCells(gw, gh);
    const spell = this.placement.spell;
    const colors = spell
      ? MapZoneTypes.getSpellColors(spell.damageType)
      : MapZoneTypes.getTerrain(this._terrainType);
    ctx.save();
    ctx.fillStyle = colors.fill.replace('0.35', '0.5').replace('0.4', '0.55');
    ctx.strokeStyle = colors.stroke;
    ctx.setLineDash([4, 4]);
    cells.forEach((key) => {
      const { x, y } = MapTactics.parseCellKey(key);
      ctx.fillRect(x * gs, y * gs, gs, gs);
      ctx.strokeRect(x * gs + 0.5, y * gs + 0.5, gs - 1, gs - 1);
    });
    ctx.restore();
  },

  startTerrainPaint() {
    this.placement = null;
    this.isPaintingTerrain = true;
  },

  stopTerrainPaint() {
    this.isPaintingTerrain = false;
  },

  paintTerrainCell(x, y) {
    const key = MapTactics.cellKey(x, y);
    let zone = this.zones.find((z) => z.kind === 'terrain' && z.terrainType === this._terrainType && z.shape === 'cells');
    if (!zone) {
      zone = {
        id: `z-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'terrain',
        shape: 'cells',
        terrainType: this._terrainType,
        cells: [],
        label: MapZoneTypes.getTerrain(this._terrainType).label
      };
      this.zones.push(zone);
    }
    if (!zone.cells.includes(key)) zone.cells.push(key);
  },

  eraseTerrainCell(x, y) {
    const key = MapTactics.cellKey(x, y);
    this.zones = this.zones.map((z) => {
      if (z.kind !== 'terrain' || z.shape !== 'cells' || !z.cells) return z;
      return { ...z, cells: z.cells.filter((c) => c !== key) };
    }).filter((z) => !(z.shape === 'cells' && (!z.cells || !z.cells.length)));
  },

  startPlacement(shape, options = {}) {
    this.isPaintingTerrain = false;
    this.placement = {
      shape,
      origin: null,
      end: null,
      facing: 0,
      spell: options.spell || null,
      radiusCells: options.radiusCells,
      sizeCells: options.sizeCells,
      lengthCells: options.lengthCells,
      widthCells: options.widthCells || 1,
      phase: 'origin'
    };
  },

  cancelPlacement() {
    this.placement = null;
    this.isPaintingTerrain = false;
    BattleMap?.render();
  },

  onMouseMove(cell) {
    if (!this.placement || !this.placement.origin) return;
    const p = this.placement;
    if (p.shape === 'cone' || p.shape === 'line') {
      p.facing = MapTactics.facingFromCells(p.origin.x, p.origin.y, cell.x, cell.y);
      if (p.shape === 'line') p.end = { x: cell.x, y: cell.y };
    } else if (p.shape === 'circle') {
      const dist = Math.max(Math.abs(cell.x - p.origin.x), Math.abs(cell.y - p.origin.y));
      p.radiusCells = Math.max(1, dist);
    } else if (p.shape === 'square') {
      const dist = Math.max(Math.abs(cell.x - p.origin.x), Math.abs(cell.y - p.origin.y));
      p.sizeCells = Math.max(1, dist * 2 + 1);
    }
    BattleMap.render();
  },

  onMouseDown(cell) {
    if (BattleMap.toolMode === 'terrain-paint') {
      this.startTerrainPaint();
      this.paintTerrainCell(cell.x, cell.y);
      return true;
    }
    if (BattleMap.toolMode === 'terrain-erase') {
      this.eraseTerrainCell(cell.x, cell.y);
      return true;
    }
    if (!this.placement) return false;

    const p = this.placement;
    if (p.phase === 'origin') {
      p.origin = { x: cell.x, y: cell.y };
      p.facing = 0;
      if (p.shape === 'circle' && p.radiusCells) {
        this.commitPlacement();
        return true;
      }
      if (p.shape === 'square' && p.sizeCells) {
        this.commitPlacement();
        return true;
      }
      p.phase = 'size';
      return true;
    }
    this.commitPlacement();
    return true;
  },

  onMouseUp() {
    if (this.isPaintingTerrain) {
      this.commitZones();
      return;
    }
  },

  commitPlacement() {
    const p = this.placement;
    if (!p?.origin) {
      this.cancelPlacement();
      return;
    }
    const gw = BattleMap.settings?.grid_width || 25;
    const gh = BattleMap.settings?.grid_height || 18;
    const zone = {
      id: `z-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: p.spell ? 'spell' : 'terrain',
      shape: p.shape,
      origin: { ...p.origin },
      end: p.end ? { ...p.end } : undefined,
      facing: p.facing ?? 0,
      radiusCells: p.radiusCells,
      sizeCells: p.sizeCells,
      lengthCells: p.lengthCells,
      widthCells: p.widthCells,
      terrainType: p.spell ? undefined : this._terrainType,
      label: p.spell ? (p.spell.name || p.spell.namePl) : MapZoneTypes.getTerrain(this._terrainType).label
    };
  zone.cells = MapTactics.resolveZoneCells(zone, gw, gh);

    if (p.spell && p.casterTokenId) {
      App.socket?.emit('combat-aoe-resolve', {
        zone,
        spell: p.spell,
        casterTokenId: p.casterTokenId
      });
      this.cancelPlacement();
      return;
    }

    this.zones.push(zone);
    this.commitZones();
    this.cancelPlacement();
  },

  startSpellPlacement(spell, casterTokenId) {
    const area = typeof DndSpells !== 'undefined'
      ? DndSpells.parseAreaFromSpell(spell)
      : { aoeShape: null };
    if (!area.aoeShape) {
      showToast('Ten czar nie ma szablonu obszaru — wybierz cel pojedynczo', 'warning');
      return false;
    }
    const shapeMap = { sphere: 'circle', cube: 'square', cone: 'cone', line: 'line' };
    const shape = shapeMap[area.aoeShape] || 'circle';
    this.startPlacement(shape, {
      spell,
      radiusCells: area.aoeShape === 'sphere' ? MapTactics.feetToCells(area.aoeSizeFt) : undefined,
      sizeCells: area.aoeShape === 'cube' ? MapTactics.feetToCells(area.aoeSizeFt) : undefined,
      lengthCells: area.aoeShape === 'cone' ? MapTactics.feetToCells(area.aoeSizeFt) : undefined,
      widthCells: area.aoeShape === 'line' ? MapTactics.feetToCells(area.aoeWidthFt || 5) : 1
    });
    this.placement.casterTokenId = casterTokenId;
    this.placement.lengthCells = this.placement.lengthCells
      || (shape === 'cone' ? 6 : undefined);
    showToast('Kliknij początek obszaru, potem kierunek / rozmiar', 'info');
    return true;
  },

  onAoeResolved(data) {
    if (data.zones) this.load(data.zones);
    else if (data.zone) {
      this.zones.push(data.zone);
      this.renderList();
    }
    if (typeof Dice !== 'undefined' && data.results) {
      Dice.displayAoeResults?.(data);
    }
    BattleMap.render();
  },

  renderList() {
    if (!this._listEl) return;
    if (!this.zones.length) {
      this._listEl.innerHTML = '<p class="sheet-hint">Brak stref na mapie.</p>';
      return;
    }
    this._listEl.innerHTML = this.zones.map((z) => {
      const label = escapeHtml(z.label || z.terrainType || z.kind || 'Strefa');
      const kind = z.kind === 'spell' ? '✨' : '🏔️';
      return `<div class="map-zone-row" data-zone-id="${escapeHtml(z.id)}">
        <span>${kind} ${label}</span>
        <span class="map-zone-actions">
          <button type="button" class="btn btn-xs btn-secondary" data-zone-action="label" title="Etykieta">✎</button>
          <button type="button" class="btn btn-xs btn-danger" data-zone-action="remove" title="Usuń">×</button>
        </span>
      </div>`;
    }).join('');
  }
};
