// Terrain / effect zone catalog (D&D 5e inspired)
const MapZoneTypes = {
  TERRAIN: {
    difficult: {
      id: 'difficult',
      label: 'Trudny teren',
      movementCost: 2,
      fill: 'rgba(139, 119, 80, 0.35)',
      stroke: 'rgba(139, 119, 80, 0.6)',
      hint: 'Każda stopa ruchu kosztuje 2 ft (×2).'
    },
    ice: {
      id: 'ice',
      label: 'Lód / ślisko',
      movementCost: 2,
      fill: 'rgba(120, 200, 255, 0.35)',
      stroke: 'rgba(80, 160, 220, 0.7)',
      hint: 'Trudny teren. Opcjonalnie ST Zręczności przy poślizgu.'
    },
    mud: {
      id: 'mud',
      label: 'Błoto',
      movementCost: 2,
      fill: 'rgba(90, 70, 45, 0.4)',
      stroke: 'rgba(70, 50, 30, 0.65)',
      hint: 'Trudny teren.'
    },
    fire: {
      id: 'fire',
      label: 'Ogień / lawa',
      movementCost: 2,
      fill: 'rgba(255, 120, 40, 0.35)',
      stroke: 'rgba(200, 60, 20, 0.75)',
      hint: '1d6 ogień gdy wejdziesz lub zaczynasz turę.',
      hazard: { damage: '1d6', damageType: 'fire', icon: '🔥', label: 'Ogień' }
    },
    acid: {
      id: 'acid',
      label: 'Kwas',
      movementCost: 2,
      fill: 'rgba(100, 220, 80, 0.35)',
      stroke: 'rgba(60, 160, 50, 0.7)',
      hint: '1d4 kwas gdy wejdziesz lub zaczynasz turę.',
      hazard: { damage: '1d4', damageType: 'acid', icon: '🧪', label: 'Kwas' }
    },
    poison: {
      id: 'poison',
      label: 'Trująca mgła',
      movementCost: 2,
      fill: 'rgba(140, 80, 180, 0.3)',
      stroke: 'rgba(100, 50, 140, 0.65)',
      hint: '1d4 trucizna gdy wejdziesz lub zaczynasz turę.',
      hazard: { damage: '1d4', damageType: 'poison', icon: '☠️', label: 'Trucizna' }
    },
    lightning: {
      id: 'lightning',
      label: 'Pole błyskawic',
      movementCost: 1,
      fill: 'rgba(255, 240, 120, 0.35)',
      stroke: 'rgba(220, 200, 50, 0.85)',
      hint: '1d6 błyskawica gdy wejdziesz lub zaczynasz turę.',
      hazard: { damage: '1d6', damageType: 'lightning', icon: '⚡', label: 'Błyskawica' }
    },
    necrotic: {
      id: 'necrotic',
      label: 'Aura nekrotyczna',
      movementCost: 1,
      fill: 'rgba(80, 40, 100, 0.45)',
      stroke: 'rgba(120, 60, 140, 0.85)',
      hint: '1d4 nekrotyczne gdy wejdziesz lub zaczynasz turę.',
      hazard: { damage: '1d4', damageType: 'necrotic', icon: '💀', label: 'Nekroza' }
    },
    water: {
      id: 'water',
      label: 'Woda (płytka)',
      movementCost: 2,
      fill: 'rgba(60, 140, 220, 0.3)',
      stroke: 'rgba(40, 100, 180, 0.6)',
      hint: 'Trudny teren.'
    }
  },

  DAMAGE_COLORS: {
    fire: { fill: 'rgba(255, 100, 30, 0.4)', stroke: 'rgba(255, 60, 0, 0.8)' },
    cold: { fill: 'rgba(100, 180, 255, 0.4)', stroke: 'rgba(50, 120, 220, 0.8)' },
    lightning: { fill: 'rgba(255, 255, 100, 0.35)', stroke: 'rgba(220, 200, 50, 0.85)' },
    acid: { fill: 'rgba(120, 220, 80, 0.4)', stroke: 'rgba(80, 180, 40, 0.8)' },
    poison: { fill: 'rgba(160, 80, 200, 0.35)', stroke: 'rgba(120, 40, 160, 0.8)' },
    necrotic: { fill: 'rgba(80, 40, 100, 0.45)', stroke: 'rgba(120, 60, 140, 0.85)' },
    radiant: { fill: 'rgba(255, 240, 180, 0.4)', stroke: 'rgba(220, 200, 100, 0.85)' },
    thunder: { fill: 'rgba(180, 160, 255, 0.35)', stroke: 'rgba(140, 100, 220, 0.8)' },
    force: { fill: 'rgba(200, 180, 255, 0.35)', stroke: 'rgba(160, 140, 220, 0.8)' },
    psychic: { fill: 'rgba(255, 120, 200, 0.35)', stroke: 'rgba(200, 80, 160, 0.8)' },
    bludgeoning: { fill: 'rgba(160, 140, 120, 0.35)', stroke: 'rgba(120, 100, 80, 0.75)' },
    default: { fill: 'rgba(180, 120, 255, 0.35)', stroke: 'rgba(140, 80, 200, 0.8)' }
  },

  getTerrain(id) {
    return this.TERRAIN[id] || this.TERRAIN.difficult;
  },

  getSpellColors(damageType) {
    return this.DAMAGE_COLORS[damageType] || this.DAMAGE_COLORS.default;
  },

  terrainOptions() {
    return Object.values(this.TERRAIN);
  },

  movementCostForType(terrainType) {
    const t = this.getTerrain(terrainType);
    return t.movementCost || 1;
  },

  hazardForType(terrainType) {
    const t = this.TERRAIN[terrainType];
    return t?.hazard || null;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapZoneTypes;
}
