// Interactive map prop templates (barrels, crates, hazards)
const MapPropTemplates = {
  PROPS: [
    {
      id: 'water-barrel',
      namePl: 'Beczka z wodą',
      icon: '🛢️',
      description: 'Po zniszczeniu: plama wody (trudny teren, 2 kratki).',
      hp: 5,
      ac: 8,
      size: 1,
      color: '#3d6a8a',
      trigger: 'on_destroy',
      effects: [{ type: 'terrain_zone', terrainType: 'water', shape: 'circle', radiusCells: 2 }]
    },
    {
      id: 'oil-barrel',
      namePl: 'Beczka z olejem',
      icon: '🛢️',
      description: 'Po trafieniu: plama oleju (trudny teren). Po ogniu — można podpalić ręcznie.',
      hp: 5,
      ac: 8,
      size: 1,
      color: '#5a4a20',
      trigger: 'on_hit',
      effects: [{ type: 'terrain_zone', terrainType: 'mud', shape: 'circle', radiusCells: 1, label: 'Olej' }]
    },
    {
      id: 'powder-keg',
      namePl: 'Beczka prochu',
      icon: '💣',
      description: 'Po zniszczeniu: wybuch — ogień w promieniu 2 kratek.',
      hp: 8,
      ac: 10,
      size: 1,
      color: '#6b3030',
      trigger: 'on_destroy',
      effects: [{ type: 'terrain_zone', terrainType: 'fire', shape: 'circle', radiusCells: 2, label: 'Pożar' }]
    },
    {
      id: 'wine-cask',
      namePl: 'Beczka wina',
      icon: '🍷',
      description: 'Po zniszczeniu: mała kałuża (trudny teren).',
      hp: 4,
      ac: 8,
      size: 1,
      color: '#5c2840',
      trigger: 'on_destroy',
      effects: [{ type: 'terrain_zone', terrainType: 'water', shape: 'circle', radiusCells: 1, label: 'Wino' }]
    },
    {
      id: 'acid-vial-crate',
      namePl: 'Skrzynia z kwasem',
      icon: '⚗️',
      description: 'Po trafieniu: plama kwasu (trudny teren).',
      hp: 6,
      ac: 10,
      size: 1,
      color: '#4a7a3a',
      trigger: 'on_hit',
      effects: [{ type: 'terrain_zone', terrainType: 'acid', shape: 'square', sizeCells: 2, label: 'Kwas' }]
    },
    {
      id: 'ice-block',
      namePl: 'Blok lodu',
      icon: '🧊',
      description: 'Po zniszczeniu: śliski lód (2×3 kratki).',
      hp: 10,
      ac: 12,
      size: 1,
      color: '#8ec8e8',
      trigger: 'on_destroy',
      effects: [{ type: 'terrain_zone', terrainType: 'ice', shape: 'square', sizeCells: 3, label: 'Lód' }]
    },
    {
      id: 'brazier',
      namePl: 'Koksownik / palenisko',
      icon: '🔥',
      description: 'Po trafieniu: rozprzestrzenia ogień (1 kratka).',
      hp: 15,
      ac: 14,
      size: 1,
      color: '#a04020',
      trigger: 'on_hit',
      effects: [{ type: 'terrain_zone', terrainType: 'fire', shape: 'circle', radiusCells: 1, label: 'Ogień' }]
    },
    {
      id: 'wooden-crate',
      namePl: 'Drewniana skrzynia',
      icon: '📦',
      description: 'Słaba skrzynia — bez efektu (dekor / osłona).',
      hp: 3,
      ac: 10,
      size: 1,
      color: '#6b4a2a',
      trigger: 'none',
      effects: []
    },
    {
      id: 'stone-pillar',
      namePl: 'Filar kamienny',
      icon: '🏛️',
      description: 'Osłona — dużo PW, blokuje LoS po zniszczeniu (rubble).',
      hp: 30,
      ac: 15,
      size: 1,
      color: '#6a6a6a',
      trigger: 'on_destroy',
      effects: [{ type: 'blocking', cellsRadius: 0 }]
    },
    {
      id: 'hay-bale',
      namePl: 'Belka siana',
      icon: '🌾',
      description: 'Po trafieniu ogniem — łatwo zapala się (ogień 2 kratki).',
      hp: 4,
      ac: 8,
      size: 1,
      color: '#c9a227',
      trigger: 'on_hit',
      removeOnTrigger: true,
      effects: [{ type: 'terrain_zone', terrainType: 'fire', shape: 'circle', radiusCells: 2, label: 'Płonące siano' }]
    }
  ],

  get(id) {
    return this.PROPS.find((p) => p.id === id) || null;
  },

  all() {
    return this.PROPS.slice();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapPropTemplates;
}
