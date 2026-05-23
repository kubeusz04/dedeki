// Line of sight helpers
const MapLos = {
  parseBlocking(raw) {
    return MapTactics.parseBlockingList(raw);
  },

  hasLineOfSight(fromToken, toToken, blockingSet, options) {
    return MapTactics.hasLineOfSight(fromToken, toToken, blockingSet, options);
  },

  paintBlockingAt(blockingSet, x, y, brushRadius = 0) {
    const set = new Set(blockingSet);
    for (let dy = -brushRadius; dy <= brushRadius; dy++) {
      for (let dx = -brushRadius; dx <= brushRadius; dx++) {
        if (brushRadius && dx * dx + dy * dy > brushRadius * brushRadius) continue;
        set.add(`${x + dx},${y + dy}`);
      }
    }
    return set;
  }
};
