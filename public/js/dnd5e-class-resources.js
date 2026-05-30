// ===== D&D 5e Class Resource templates =====
// Każdy szablon = funkcja zwracająca {name, max, recoversOn, emoji}
// Wywoływana z (level, char) — może liczyć max wg poziomu lub stat.
const ClassResources = {
  // Tabele zasobów wg klasy. Kolejność = preferowana w UI.
  TEMPLATES: {
    Barbarian: [
      { id: 'rage', name: 'Szały', emoji: '😡', recoversOn: 'long',
        max: (lv) => lv >= 20 ? 999 : lv >= 17 ? 6 : lv >= 12 ? 5 : lv >= 6 ? 4 : lv >= 3 ? 3 : 2 }
    ],
    Bard: [
      { id: 'bardic-inspiration', name: 'Bardyczna inspiracja', emoji: '🎵',
        recoversOn: (lv) => lv >= 5 ? 'short' : 'long',
        max: (lv, c) => Math.max(1, ClassResources._mod(c?.charisma)) }
    ],
    Cleric: [
      { id: 'channel-divinity', name: 'Kanał Boskości', emoji: '✨', recoversOn: 'short',
        max: (lv) => lv >= 18 ? 3 : lv >= 6 ? 2 : 1 }
    ],
    Druid: [
      { id: 'wild-shape', name: 'Dzika postać', emoji: '🐺', recoversOn: 'short',
        max: () => 2 }
    ],
    Fighter: [
      { id: 'second-wind', name: 'Drugi oddech', emoji: '💨', recoversOn: 'short', max: () => 1 },
      { id: 'action-surge', name: 'Wybuch akcji', emoji: '⚡', recoversOn: 'short',
        max: (lv) => lv >= 17 ? 2 : 1, available: (lv) => lv >= 2 },
      { id: 'indomitable', name: 'Niezłomność', emoji: '🛡️', recoversOn: 'long',
        max: (lv) => lv >= 17 ? 3 : lv >= 13 ? 2 : 1, available: (lv) => lv >= 9 },
      { id: 'superiority-dice', name: 'Kostki przewagi (Battle Master)', emoji: '🎲', recoversOn: 'short',
        max: (lv) => lv >= 18 ? 6 : lv >= 7 ? 5 : 4, available: (lv) => lv >= 3 }
    ],
    Monk: [
      { id: 'ki', name: 'Ki', emoji: '🌀', recoversOn: 'short',
        max: (lv) => lv, available: (lv) => lv >= 2 }
    ],
    Paladin: [
      { id: 'channel-divinity', name: 'Kanał Boskości', emoji: '✨', recoversOn: 'short', max: () => 1,
        available: (lv) => lv >= 3 },
      { id: 'lay-on-hands', name: 'Nakładanie rąk (HP pool)', emoji: '🙏', recoversOn: 'long',
        max: (lv) => lv * 5 },
      { id: 'divine-sense', name: 'Boski zmysł', emoji: '👁️', recoversOn: 'long',
        max: (_, c) => 1 + Math.max(0, ClassResources._mod(c?.charisma)) }
    ],
    Ranger: [
      { id: 'favored-foe', name: 'Ulubiony wróg (UA/Tasha)', emoji: '🏹', recoversOn: 'long',
        max: (lv) => lv >= 18 ? 6 : lv >= 11 ? 5 : lv >= 5 ? 4 : 3 }
    ],
    Rogue: [
      { id: 'stroke-of-luck', name: 'Cios szczęścia', emoji: '🍀', recoversOn: 'short',
        max: () => 1, available: (lv) => lv >= 20 }
    ],
    Sorcerer: [
      { id: 'sorcery-points', name: 'Punkty Magii', emoji: '🌟', recoversOn: 'long',
        max: (lv) => lv, available: (lv) => lv >= 2 }
    ],
    Warlock: [
      { id: 'mystic-arcanum-6', name: 'Arkanum 6 lvl', emoji: '📜', recoversOn: 'long',
        max: () => 1, available: (lv) => lv >= 11 },
      { id: 'mystic-arcanum-7', name: 'Arkanum 7 lvl', emoji: '📜', recoversOn: 'long',
        max: () => 1, available: (lv) => lv >= 13 },
      { id: 'mystic-arcanum-8', name: 'Arkanum 8 lvl', emoji: '📜', recoversOn: 'long',
        max: () => 1, available: (lv) => lv >= 15 },
      { id: 'mystic-arcanum-9', name: 'Arkanum 9 lvl', emoji: '📜', recoversOn: 'long',
        max: () => 1, available: (lv) => lv >= 17 }
    ],
    Wizard: [
      { id: 'arcane-recovery', name: 'Magiczne odzyskanie', emoji: '🔮', recoversOn: 'long',
        max: () => 1 }
    ],
    Artificer: [
      { id: 'flash-of-genius', name: 'Iskra geniuszu', emoji: '💡', recoversOn: 'long',
        max: (_, c) => Math.max(1, ClassResources._mod(c?.intelligence)),
        available: (lv) => lv >= 7 },
      { id: 'magical-tinkering', name: 'Magiczne majsterkowanie', emoji: '🔧', recoversOn: 'none',
        max: (_, c) => Math.max(1, ClassResources._mod(c?.intelligence)) }
    ],
    'Blood Hunter': [
      { id: 'crimson-rite', name: 'Krwawy ryt (HP koszt)', emoji: '🩸', recoversOn: 'short',
        max: (lv) => lv >= 18 ? 4 : lv >= 11 ? 3 : 2 }
    ]
  },

  // Generic resources users may want to add
  GENERIC: [
    { id: 'inspiration', name: 'Inspiracja', emoji: '⭐', recoversOn: 'none', max: 1 },
    { id: 'luck-points', name: 'Punkty szczęścia', emoji: '🍀', recoversOn: 'long', max: 3 },
    { id: 'charges', name: 'Ładunki przedmiotu', emoji: '🔋', recoversOn: 'long', max: 3 }
  ],

  _mod(score) {
    const n = parseInt(score, 10);
    if (Number.isNaN(n)) return 0;
    return Math.floor((n - 10) / 2);
  },

  // Generuje listę proponowanych zasobów dla danej postaci.
  generateForCharacter(char) {
    if (!char) return [];
    const klass = String(char.char_class || '').trim();
    const lv = parseInt(char.level, 10) || 1;
    const tpls = this.TEMPLATES[klass] || [];
    return tpls
      .filter((t) => !t.available || t.available(lv))
      .map((t) => {
        const max = typeof t.max === 'function' ? t.max(lv, char) : (parseInt(t.max, 10) || 1);
        const recoversOn = typeof t.recoversOn === 'function' ? t.recoversOn(lv, char) : t.recoversOn;
        return {
          id: `${t.id}-${Math.random().toString(36).slice(2, 6)}`,
          name: t.name,
          emoji: t.emoji || '🎯',
          max,
          current: max,
          recoversOn: recoversOn || 'long'
        };
      });
  },

  // Parsuje JSON z DB i waliduje strukturę.
  parse(raw) {
    let arr;
    try { arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw; } catch { arr = []; }
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        id: String(r.id || `res-${Math.random().toString(36).slice(2, 8)}`),
        name: String(r.name || 'Zasób').slice(0, 60),
        emoji: String(r.emoji || '🎯').slice(0, 8),
        max: Math.max(0, parseInt(r.max, 10) || 0),
        current: Math.max(0, parseInt(r.current, 10) || 0),
        recoversOn: ['long', 'short', 'none'].includes(r.recoversOn) ? r.recoversOn : 'long'
      }));
  },

  serialize(resources) {
    return JSON.stringify(this.parse(resources));
  },

  recoveryLabel(recoversOn) {
    return ({
      long: 'długi',
      short: 'krótki',
      none: 'manual'
    })[recoversOn] || 'długi';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClassResources;
}
