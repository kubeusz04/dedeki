// Map props: encode on tokens, effects on hit/destroy
const MapProps = {
  encodeNotes(templateId, extra = {}) {
    return JSON.stringify({
      _prop: true,
      templateId,
      triggered: false,
      ...extra
    });
  },

  parseNotes(statNotes) {
    if (!statNotes || typeof statNotes !== 'string') return null;
    if (!statNotes.trim().startsWith('{')) return null;
    try {
      const o = JSON.parse(statNotes);
      if (o && o._prop && o.templateId) return o;
    } catch (_e) { /* ignore */ }
    return null;
  },

  getTemplateForToken(token) {
    const meta = this.parseNotes(token?.stat_notes);
    if (!meta || meta.triggered) return null;
    return typeof MapPropTemplates !== 'undefined'
      ? MapPropTemplates.get(meta.templateId)
      : null;
  },

  displayHint(token) {
    const tpl = this.getTemplateForToken(token);
    if (!tpl) return token?.stat_notes || '';
    return tpl.description || tpl.namePl;
  },

  tokenFromTemplate(templateId, x, y) {
    const tpl = MapPropTemplates.get(templateId);
    if (!tpl) return null;
    return {
      entity_name: tpl.namePl,
      entity_type: 'object',
      x: x ?? 0,
      y: y ?? 0,
      color: tpl.color || '#6b4a2a',
      size: tpl.size || 1,
      hp_max: tpl.hp ?? 5,
      hp_current: tpl.hp ?? 5,
      ac: tpl.ac ?? 10,
      stat_notes: this.encodeNotes(templateId),
      image_url: '',
      is_visible: true,
      is_locked: true,
      prop_template_id: templateId
    };
  },

  buildZonesFromEffects(effects, token, gw, gh) {
    const anchor = MapTactics.tokenAnchor(token);
    const zones = [];
    (effects || []).forEach((eff) => {
      if (eff.type === 'terrain_zone') {
        const zone = {
          id: `z-prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: 'terrain',
          shape: eff.shape || 'circle',
          origin: { x: anchor.x, y: anchor.y },
          terrainType: eff.terrainType || 'difficult',
          label: eff.label || '',
          radiusCells: eff.radiusCells,
          sizeCells: eff.sizeCells,
          lengthCells: eff.lengthCells
        };
        zone.cells = MapTactics.resolveZoneCells(zone, gw, gh);
        zones.push(zone);
      }
      if (eff.type === 'blocking' && eff.cellsRadius === 0) {
        zones.push({
          id: `z-rubble-${Date.now()}`,
          kind: 'terrain',
          shape: 'cells',
          cells: [MapTactics.cellKey(anchor.x, anchor.y)],
          terrainType: 'difficult',
          label: 'Gruz'
        });
      }
    });
    return zones;
  },

  buildBlockingFromEffects(effects, token) {
    const cells = [];
    const anchor = MapTactics.tokenAnchor(token);
    (effects || []).forEach((eff) => {
      if (eff.type === 'blocking') {
        const r = eff.cellsRadius ?? 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            cells.push(MapTactics.cellKey(anchor.x + dx, anchor.y + dy));
          }
        }
      }
    });
    return cells;
  },

  drawTokenOverlay(ctx, token) {
    const tpl = this.getTemplateForToken(token);
    if (!tpl) return;
    const tl = typeof BattleMap !== 'undefined' && BattleMap.cellTopLeftPx
      ? BattleMap.cellTopLeftPx(token.x, token.y)
      : { x: token.x * 40, y: token.y * 40 };
    const tx = tl.x;
    const ty = tl.y;
    const cell = typeof BattleMap !== 'undefined' && BattleMap.cellSizePx
      ? BattleMap.cellSizePx()
      : { w: 40, h: 40 };
    const sizeW = (token.size || 1) * cell.w;
    const sizeH = (token.size || 1) * cell.h;
    ctx.save();
    ctx.font = `${Math.floor(Math.min(sizeW, sizeH) * 0.55)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tpl.icon || '📦', tx + sizeW / 2, ty + sizeH / 2);
    ctx.restore();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapProps;
}
