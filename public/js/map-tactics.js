// Grid tactics: distance, range, line of sight (browser + Node)
// In the browser MapZoneTypes is provided by a sibling <script>; in Node we eagerly
// require the module and attach it to globalThis so the rest of this file can use the
// bare identifier without re-declaring it (which would clash with the browser's const).
if (typeof globalThis.MapZoneTypes === 'undefined' && typeof require !== 'undefined') {
  try { globalThis.MapZoneTypes = require('./map-zone-types.js'); } catch (_e) { /* browser */ }
}

const MapTactics = {
  FT_PER_SQUARE: 5,

  chebyshevCells(x1, y1, x2, y2) {
    return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  },

  tokenAnchor(token) {
    const size = token.size || 1;
    return {
      x: token.x + Math.floor(size / 2),
      y: token.y + Math.floor(size / 2)
    };
  },

  distanceCells(tokenA, tokenB) {
    const a = this.tokenAnchor(tokenA);
    const b = this.tokenAnchor(tokenB);
    return this.chebyshevCells(a.x, a.y, b.x, b.y);
  },

  cellsToFeet(cells) {
    return cells * this.FT_PER_SQUARE;
  },

  feetToCells(ft) {
    return Math.ceil(Math.max(0, ft) / this.FT_PER_SQUARE);
  },

  /** Najbliższa kratka w zasięgu Chebyshev od punktu startowego. */
  clampChebyshev(fromX, fromY, toX, toY, maxCells) {
    if (maxCells <= 0) return { x: fromX, y: fromY };
    const dist = this.chebyshevCells(fromX, fromY, toX, toY);
    if (dist <= maxCells) return { x: toX, y: toY };
    let best = { x: fromX, y: fromY };
    let bestDist = Infinity;
    for (let dy = -maxCells; dy <= maxCells; dy++) {
      for (let dx = -maxCells; dx <= maxCells; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) > maxCells) continue;
        const cx = fromX + dx;
        const cy = fromY + dy;
        const d = this.chebyshevCells(cx, cy, toX, toY);
        if (d < bestDist) {
          bestDist = d;
          best = { x: cx, y: cy };
        }
      }
    }
    return best;
  },

  parseBlockingList(raw) {
    if (!raw) return new Set();
    let arr = raw;
    if (typeof raw === 'string') {
      try { arr = JSON.parse(raw); } catch { return new Set(); }
    }
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((c) => (typeof c === 'string' ? c : `${c.x},${c.y}`)));
  },

  blockingToArray(set) {
    return Array.from(set || []);
  },

  bresenhamLine(x0, y0, x1, y1) {
    const cells = [];
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      cells.push({ x, y });
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    return cells;
  },

  hasLineOfSight(fromToken, toToken, blockingSet, options = {}) {
    const fogRevealed = options.fogRevealed;
    const fogBlocks = options.fogBlocksLos;
    const a = this.tokenAnchor(fromToken);
    const b = this.tokenAnchor(toToken);
    const line = this.bresenhamLine(a.x, a.y, b.x, b.y);
    for (let i = 1; i < line.length - 1; i++) {
      const key = `${line[i].x},${line[i].y}`;
      if (blockingSet?.has(key)) return { ok: false, blockedAt: line[i] };
      if (fogBlocks && fogRevealed && !fogRevealed.has(key)) {
        return { ok: false, blockedAt: line[i], reason: 'fog' };
      }
    }
    return { ok: true };
  },

  weaponRangeCells(weapon) {
    if (!weapon) return { normal: 1, long: 0, melee: true };
    const props = weapon.properties || [];
    const hasReach = props.includes('reach');
    const rangeStr = weapon.range || '';
    if (rangeStr && /\d/.test(rangeStr)) {
      const parts = String(rangeStr).split('/').map((s) => parseInt(s.trim(), 10));
      const normalFt = parts[0] || 0;
      const longFt = parts[1] || 0;
      return {
        melee: false,
        normal: this.feetToCells(normalFt),
        long: longFt ? this.feetToCells(longFt) : 0,
        normalFt,
        longFt
      };
    }
    if (props.includes('thrown')) {
      return { melee: true, normal: 4, long: 8, normalFt: 20, longFt: 60 };
    }
    return {
      melee: true,
      normal: hasReach ? 2 : 1,
      long: 0,
      normalFt: hasReach ? 10 : 5,
      longFt: 0
    };
  },

  spellRangeCells(spell) {
    const r = (spell?.range || '').trim();
    if (!r || r === 'Ty') return { normal: 0, melee: true };
    if (r === 'Dotyk') return { normal: 1, melee: true };
    const mMatch = r.match(/([\d,]+)\s*m/i);
    if (mMatch) {
      const meters = parseFloat(mMatch[1].replace(',', '.'));
      const ft = meters * 3.28084;
      return { normal: this.feetToCells(ft), melee: false, normalFt: Math.round(ft) };
    }
    const ftMatch = r.match(/([\d,]+)\s*ft/i);
    if (ftMatch) {
      const ft = parseFloat(ftMatch[1].replace(',', '.'));
      return { normal: this.feetToCells(ft), melee: false, normalFt: Math.round(ft) };
    }
    const kmMatch = r.match(/([\d,]+)\s*km/i);
    if (kmMatch) {
      const ft = parseFloat(kmMatch[1].replace(',', '.')) * 3280.84;
      return { normal: this.feetToCells(ft), melee: false, normalFt: Math.round(ft) };
    }
    return { normal: 24, melee: false };
  },

  inWeaponRange(attacker, target, weapon, opts = {}) {
    const dist = this.distanceCells(attacker, target);
    const range = this.weaponRangeCells(weapon);
    if (range.melee && dist <= range.normal) {
      return { ok: true, dist, range };
    }
    if (!range.melee) {
      if (dist <= range.normal) return { ok: true, dist, range, band: 'normal' };
      if (range.long && dist <= range.long) return { ok: true, dist, range, band: 'long' };
    }
    return { ok: false, dist, range, reason: 'out_of_range' };
  },

  inSpellRange(casterToken, targetToken, spell) {
    const dist = this.distanceCells(casterToken, targetToken);
    const range = this.spellRangeCells(spell);
    if (range.normal === 0) return { ok: true, dist, range };
    return dist <= range.normal
      ? { ok: true, dist, range }
      : { ok: false, dist, range, reason: 'out_of_range' };
  },

  attackAnimationType(weapon, spell) {
    if (spell) return 'magic';
    const props = weapon?.properties || [];
    const range = weapon?.range || '';
    if (range && /\d/.test(range)) return 'ranged';
    if (props.includes('thrown')) return 'ranged';
    return 'melee';
  },

  TERRAIN_MOVEMENT_MULT: {
    difficult: 2, ice: 2, mud: 2, fire: 2, acid: 2, poison: 2, water: 2
  },

  FACING_DELTAS: [
    { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
    { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
  ],

  parseZonesList(raw) {
    if (!raw) return [];
    let arr = raw;
    if (typeof raw === 'string') {
      try { arr = JSON.parse(raw); } catch { return []; }
    }
    return Array.isArray(arr) ? arr : [];
  },

  zonesToJson(zones) {
    return JSON.stringify(zones || []);
  },

  cellKey(x, y) {
    return `${x},${y}`;
  },

  parseCellKey(key) {
    const [xs, ys] = String(key).split(',');
    return { x: parseInt(xs, 10), y: parseInt(ys, 10) };
  },

  facingFromCells(ox, oy, tx, ty) {
    const dx = tx - ox;
    const dy = ty - oy;
    if (dx === 0 && dy === 0) return 0;
    const angle = Math.atan2(dy, dx);
    const oct = Math.round(angle / (Math.PI / 4));
    return ((oct % 8) + 8) % 8;
  },

  getCellsInRadius(cx, cy, radiusCells, gw, gh) {
    const cells = [];
    const r = Math.max(0, radiusCells);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist <= r + 0.5) cells.push(this.cellKey(x, y));
      }
    }
    return cells;
  },

  getCellsInSquare(cx, cy, sizeCells, gw, gh) {
    const cells = [];
    const n = Math.max(1, sizeCells);
    const half = Math.floor(n / 2);
    for (let dy = 0; dy < n; dy++) {
      for (let dx = 0; dx < n; dx++) {
        const x = cx - half + dx;
        const y = cy - half + dy;
        if (x >= 0 && y >= 0 && x < gw && y < gh) cells.push(this.cellKey(x, y));
      }
    }
    return cells;
  },

  getCellsInCone(ox, oy, facing, lengthCells, gw, gh) {
    const cells = [];
    const len = Math.max(1, lengthCells);
    const angleCenter = (facing % 8) * (Math.PI / 4);
    const halfArc = Math.PI / 4;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const dx = x - ox;
        const dy = y - oy;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (dist === 0 || dist > len) continue;
        let angle = Math.atan2(dy, dx);
        let diff = angle - angleCenter;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        if (Math.abs(diff) <= halfArc + 0.05) cells.push(this.cellKey(x, y));
      }
    }
    return cells;
  },

  getCellsInLine(ox, oy, ex, ey, widthCells, gw, gh) {
    const line = this.bresenhamLine(ox, oy, ex, ey);
    const w = Math.max(1, widthCells || 1);
    const half = Math.floor((w - 1) / 2);
    const set = new Set();
    const perp = this.FACING_DELTAS[this.facingFromCells(ox, oy, ex, ey)];
    const px = perp.dy !== 0 ? 1 : 0;
    const py = perp.dx !== 0 ? 1 : 0;
    line.forEach((c) => {
      for (let o = -half; o <= half + (w % 2 ? 0 : 0); o++) {
        const x = c.x + px * o;
        const y = c.y + py * o;
        if (x >= 0 && y >= 0 && x < gw && y < gh) set.add(this.cellKey(x, y));
      }
    });
    return Array.from(set);
  },

  resolveZoneCells(zone, gw, gh) {
    if (!zone) return [];
    if (zone.shape === 'cells' && Array.isArray(zone.cells) && zone.cells.length) {
      return zone.cells.filter((k) => {
        const { x, y } = this.parseCellKey(k);
        return x >= 0 && y >= 0 && x < gw && y < gh;
      });
    }
    const origin = zone.origin || { x: 0, y: 0 };
    const ox = origin.x ?? 0;
    const oy = origin.y ?? 0;
    switch (zone.shape) {
      case 'circle':
        return this.getCellsInRadius(ox, oy, zone.radiusCells || 1, gw, gh);
      case 'square':
        return this.getCellsInSquare(ox, oy, zone.sizeCells || 2, gw, gh);
      case 'cone':
        return this.getCellsInCone(ox, oy, zone.facing ?? 0, zone.lengthCells || 3, gw, gh);
      case 'line': {
        const end = zone.end || { x: ox + 1, y: oy };
        return this.getCellsInLine(ox, oy, end.x, end.y, zone.widthCells || 1, gw, gh);
      }
      default:
        return Array.isArray(zone.cells) ? zone.cells : [];
    }
  },

  buildTerrainIndex(zones) {
    const index = new Map();
    (zones || []).forEach((zone) => {
      if (zone.kind !== 'terrain' && !zone.terrainType) return;
      const mult = this.TERRAIN_MOVEMENT_MULT[zone.terrainType] || 1;
      if (mult <= 1) return;
      const cells = zone.cells?.length
        ? zone.cells
        : this.resolveZoneCells(zone, 999, 999);
      cells.forEach((key) => {
        const prev = index.get(key) || 1;
        index.set(key, Math.max(prev, mult));
      });
    });
    return index;
  },

  movementCostAlongPath(fromX, fromY, toX, toY, terrainIndex) {
    const line = this.bresenhamLine(fromX, fromY, toX, toY);
    let total = 0;
    for (let i = 1; i < line.length; i++) {
      const key = this.cellKey(line[i].x, line[i].y);
      const mult = terrainIndex?.get(key) || 1;
      total += this.FT_PER_SQUARE * mult;
    }
    return total;
  },

  clampByMovementCost(fromX, fromY, toX, toY, maxFt, terrainIndex) {
    const line = this.bresenhamLine(fromX, fromY, toX, toY);
    let spent = 0;
    let last = { x: fromX, y: fromY };
    for (let i = 1; i < line.length; i++) {
      const key = this.cellKey(line[i].x, line[i].y);
      const mult = terrainIndex?.get(key) || 1;
      const step = this.FT_PER_SQUARE * mult;
      if (spent + step > maxFt) break;
      spent += step;
      last = { x: line[i].x, y: line[i].y };
    }
    return { ...last, costFt: spent };
  },

  tokensInZoneCells(tokens, cellKeys) {
    const set = new Set(cellKeys || []);
    return (tokens || []).filter((t) => {
      const a = this.tokenAnchor(t);
      return set.has(this.cellKey(a.x, a.y));
    });
  },

  buildHazardIndex(zones) {
    const types = (typeof MapZoneTypes !== 'undefined') ? MapZoneTypes.TERRAIN : null;
    if (!types) return new Map();
    const index = new Map();
    (zones || []).forEach((zone) => {
      const t = zone.terrainType;
      const def = types[t];
      const hazard = def?.hazard;
      if (!hazard) return;
      const cells = zone.cells?.length
        ? zone.cells
        : this.resolveZoneCells(zone, 999, 999);
      cells.forEach((key) => {
        let list = index.get(key);
        if (!list) {
          list = [];
          index.set(key, list);
        }
        if (!list.find((h) => h.terrainType === t)) {
          list.push({ terrainType: t, ...hazard });
        }
      });
    });
    return index;
  },

  hazardsAtCell(hazardIndex, x, y) {
    return hazardIndex?.get(this.cellKey(x, y)) || [];
  },

  tokenOccupiedCellsAt(token, x, y) {
    const size = parseInt(token?.size, 10) || 1;
    const cells = [];
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        cells.push({ x: x + dx, y: y + dy });
      }
    }
    return cells;
  },

  hazardsTouchedByMove(token, fromX, fromY, toX, toY, hazardIndex) {
    if (!hazardIndex || !hazardIndex.size) return [];
    const size = parseInt(token?.size, 10) || 1;
    const line = this.bresenhamLine(fromX, fromY, toX, toY);
    const seen = new Set();
    const result = [];
    for (let i = 0; i < line.length; i++) {
      const { x, y } = line[i];
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const hazards = this.hazardsAtCell(hazardIndex, x + dx, y + dy);
          for (const h of hazards) {
            if (seen.has(h.terrainType)) continue;
            seen.add(h.terrainType);
            result.push(h);
          }
        }
      }
    }
    return result;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapTactics;
}
