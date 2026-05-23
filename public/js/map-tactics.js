// Grid tactics: distance, range, line of sight (browser + Node)
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
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapTactics;
}
