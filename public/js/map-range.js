// Range helpers (wraps MapTactics for weapons/spells)
const MapRange = {
  weaponRangeCells(weapon) {
    return MapTactics.weaponRangeCells(weapon);
  },

  spellRangeCells(spell) {
    return MapTactics.spellRangeCells(spell);
  },

  inWeaponRange(attacker, target, weapon) {
    return MapTactics.inWeaponRange(attacker, target, weapon);
  },

  inSpellRange(caster, target, spell) {
    return MapTactics.inSpellRange(caster, target, spell);
  },

  formatRangeLabel(cells) {
    const ft = MapTactics.cellsToFeet(cells);
    return `${cells} kr · ${ft} ft`;
  }
};
