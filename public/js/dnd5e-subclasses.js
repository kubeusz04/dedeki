// ===== D&D 5e subclasses (PHB + TCoE Artificer + Blood Hunter) =====
const DndSubclasses = {
  /** Poziom, na którym wybiera się podklasę (standard 5e). */
  UNLOCK_LEVEL: {
    Cleric: 1,
    Sorcerer: 1,
    Warlock: 1,
    Wizard: 2,
    Druid: 2,
    Artificer: 3,
    'Blood Hunter': 3
  },

  DEFAULT_UNLOCK: 3,

  /** Klasa → lista oficjalnych podklas (nazwy angielskie, jak w podręcznikach). */
  BY_CLASS: {
    Barbarian: [
      'Path of the Berserker',
      'Path of the Totem Warrior',
      'Path of the Ancestral Guardian',
      'Path of the Storm Herald',
      'Path of the Zealot',
      'Path of the Beast',
      'Path of Wild Magic'
    ],
    Bard: [
      'College of Lore',
      'College of Valor',
      'College of Glamour',
      'College of Swords',
      'College of Whispers',
      'College of Eloquence',
      'College of Creation'
    ],
    Cleric: [
      'Life Domain',
      'Light Domain',
      'Nature Domain',
      'Tempest Domain',
      'Trickery Domain',
      'War Domain',
      'Knowledge Domain',
      'Death Domain',
      'Forge Domain',
      'Grave Domain',
      'Order Domain',
      'Peace Domain',
      'Twilight Domain'
    ],
    Druid: [
      'Circle of the Land',
      'Circle of the Moon',
      'Circle of Dreams',
      'Circle of the Shepherd',
      'Circle of Spores',
      'Circle of Stars',
      'Circle of Wildfire'
    ],
    Fighter: [
      'Champion',
      'Battle Master',
      'Eldritch Knight',
      'Arcane Archer',
      'Cavalier',
      'Samurai',
      'Echo Knight',
      'Psi Warrior',
      'Rune Knight'
    ],
    Monk: [
      'Way of the Open Hand',
      'Way of Shadow',
      'Way of the Four Elements',
      'Way of the Drunken Master',
      'Way of the Kensei',
      'Way of the Sun Soul',
      'Way of Mercy',
      'Way of the Astral Self'
    ],
    Paladin: [
      'Oath of Devotion',
      'Oath of the Ancients',
      'Oath of Vengeance',
      'Oath of Conquest',
      'Oath of Redemption',
      'Oath of Glory',
      'Oath of the Watchers'
    ],
    Ranger: [
      'Hunter',
      'Beast Master',
      'Gloom Stalker',
      'Horizon Walker',
      'Monster Slayer',
      'Fey Wanderer',
      'Swarmkeeper',
      'Drakewarden'
    ],
    Rogue: [
      'Thief',
      'Assassin',
      'Arcane Trickster',
      'Mastermind',
      'Swashbuckler',
      'Inquisitive',
      'Scout',
      'Phantom',
      'Soulknife'
    ],
    Sorcerer: [
      'Draconic Bloodline',
      'Wild Magic',
      'Storm Sorcery',
      'Divine Soul',
      'Shadow Magic',
      'Aberrant Mind',
      'Clockwork Soul'
    ],
    Warlock: [
      'The Archfey',
      'The Fiend',
      'The Great Old One',
      'The Celestial',
      'The Hexblade',
      'The Fathomless',
      'The Genie',
      'The Undead'
    ],
    Wizard: [
      'School of Abjuration',
      'School of Conjuration',
      'School of Divination',
      'School of Enchantment',
      'School of Evocation',
      'School of Illusion',
      'School of Necromancy',
      'School of Transmutation',
      'Bladesinging',
      'War Magic',
      'Chronurgy Magic',
      'Graviturgy Magic',
      'Order of Scribes'
    ],
    Artificer: [
      'Alchemist',
      'Armorer',
      'Artillerist',
      'Battle Smith'
    ],
    'Blood Hunter': [
      'Order of the Ghostslayer',
      'Order of the Profane Soul',
      'Order of the Lycan',
      'Order of the Mutant',
      'Order of the Blood Curse'
    ]
  },

  /** Etykiety PL w UI (klucz = nazwa angielska). */
  LABELS_PL: {
    'Path of the Berserker': 'Ścieżka Berserkera',
    'Path of the Totem Warrior': 'Ścieżka Wojownika Totemu',
    'Path of the Ancestral Guardian': 'Ścieżka Strażnika Przodków',
    'Path of the Storm Herald': 'Ścieżka Herolda Burzy',
    'Path of the Zealot': 'Ścieżka Zeloty',
    'Path of the Beast': 'Ścieżka Bestii',
    'Path of Wild Magic': 'Ścieżka Dzikiej Magii',
    'College of Lore': 'Kolegium Wiedzy',
    'College of Valor': 'Kolegium Męstwa',
    'College of Glamour': 'Kolegium Oczarowania',
    'College of Swords': 'Kolegium Ostrzy',
    'College of Whispers': 'Kolegium Szeptów',
    'College of Eloquence': 'Kolegium Elokwencji',
    'College of Creation': 'Kolegium Stworzenia',
    'Life Domain': 'Domena Życia',
    'Light Domain': 'Domena Światła',
    'Nature Domain': 'Domena Natury',
    'Tempest Domain': 'Domena Burzy',
    'Trickery Domain': 'Domena Podstępu',
    'War Domain': 'Domena Wojny',
    'Knowledge Domain': 'Domena Wiedzy',
    'Death Domain': 'Domena Śmierci',
    'Forge Domain': 'Domena Kuźni',
    'Grave Domain': 'Domena Grobu',
    'Order Domain': 'Domena Porządku',
    'Peace Domain': 'Domena Pokoju',
    'Twilight Domain': 'Domena Zmierzchu',
    'Circle of the Land': 'Krąg Ziemi',
    'Circle of the Moon': 'Krąg Księżyca',
    'Circle of Dreams': 'Krąg Snów',
    'Circle of the Shepherd': 'Krąg Pasterza',
    'Circle of Spores': 'Krąg Zarodników',
    'Circle of Stars': 'Krąg Gwiazd',
    'Circle of Wildfire': 'Krąg Dzikiego Ognia',
    Champion: 'Mistrz',
    'Battle Master': 'Mistrz Bitwy',
    'Eldritch Knight': 'Rycerz Eldrycki',
    'Arcane Archer': 'Łucznik Arkany',
    Cavalier: 'Kawalerzysta',
    Samurai: 'Samuraj',
    'Echo Knight': 'Rycerz Echa',
    'Psi Warrior': 'Wojownik Psi',
    'Rune Knight': 'Rycerz Run',
    'Way of the Open Hand': 'Droga Otwartej Dłoni',
    'Way of Shadow': 'Droga Cienia',
    'Way of the Four Elements': 'Droga Czterech Żywiołów',
    'Way of the Drunken Master': 'Droga Pijanego Mistrza',
    'Way of the Kensei': 'Droga Kensei',
    'Way of the Sun Soul': 'Droga Słonecznej Duszy',
    'Way of Mercy': 'Droga Miłosierdzia',
    'Way of the Astral Self': 'Droga Astralnego Ja',
    'Oath of Devotion': 'Przysięga Oddania',
    'Oath of the Ancients': 'Przysięga Starożytnych',
    'Oath of Vengeance': 'Przysięga Zemsty',
    'Oath of Conquest': 'Przysięga Podboju',
    'Oath of Redemption': 'Przysięga Odkupienia',
    'Oath of Glory': 'Przysięga Chwały',
    'Oath of the Watchers': 'Przysięga Czujnych',
    Hunter: 'Łowca',
    'Beast Master': 'Pan Bestii',
    'Gloom Stalker': 'Łowca Mroków',
    'Horizon Walker': 'Wędrowiec Horyzontu',
    'Monster Slayer': 'Pogromca Potworów',
    'Fey Wanderer': 'Wędrowiec Feów',
    Swarmkeeper: 'Strażnik Roju',
    Drakewarden: 'Strażnik Smoka',
    Thief: 'Złodziej',
    Assassin: 'Zabójca',
    'Arcane Trickster': 'Złodziej Arkany',
    Mastermind: 'Mózg',
    Swashbuckler: 'Szermierz',
    Inquisitive: 'Śledczy',
    Scout: 'Zwiadowca',
    Phantom: 'Fantom',
    Soulknife: 'Ostrze Duszy',
    'Draconic Bloodline': 'Smocze Dziedzictwo',
    'Wild Magic': 'Dzika Magia',
    'Storm Sorcery': 'Magia Burzy',
    'Divine Soul': 'Boska Dusza',
    'Shadow Magic': 'Magia Cienia',
    'Aberrant Mind': 'Obłąkany Umysł',
    'Clockwork Soul': 'Dusza Mechanizmu',
    'The Archfey': 'Arcyfey',
    'The Fiend': 'Diabeł',
    'The Great Old One': 'Pradawny',
    'The Celestial': 'Niebiański',
    'The Hexblade': 'Klątwowe Ostrze',
    'The Fathomless': 'Bezdenny',
    'The Genie': 'Dżin',
    'The Undead': 'Nieumarły',
    'School of Abjuration': 'Szkoła Ochrony',
    'School of Conjuration': 'Szkoła Przywoływania',
    'School of Divination': 'Szkoła Wróżbiarstwa',
    'School of Enchantment': 'Szkoła Uroku',
    'School of Evocation': 'Szkoła Wywoływania',
    'School of Illusion': 'Szkoła Iluzji',
    'School of Necromancy': 'Szkoła Nekromancji',
    'School of Transmutation': 'Szkoła Transmutacji',
    Bladesinging: 'Śpiew Ostrzy',
    'War Magic': 'Magia Wojny',
    'Chronurgy Magic': 'Magia Chronurgii',
    'Graviturgy Magic': 'Magia Grawiturgii',
    'Order of Scribes': 'Zakon Skrybów',
    Alchemist: 'Alchemik',
    Armorer: 'Pancernik',
    Artillerist: 'Artylerzysta',
    'Battle Smith': 'Kowal Bitewny',
    'Order of the Ghostslayer': 'Zakon Pogromcy Duchów',
    'Order of the Profane Soul': 'Zakon Profannej Duszy',
    'Order of the Lycan': 'Zakon Likantropa',
    'Order of the Mutant': 'Zakon Mutanta',
    'Order of the Blood Curse': 'Zakon Krwawej Klątwy'
  },

  getUnlockLevel(className) {
    return this.UNLOCK_LEVEL[className] ?? this.DEFAULT_UNLOCK;
  },

  getForClass(className) {
    return this.BY_CLASS[className] || [];
  },

  getLabel(name) {
    if (!name) return '';
    return this.LABELS_PL[name] || name;
  },

  isValidForClass(className, subclass) {
    if (!subclass) return true;
    return this.getForClass(className).includes(subclass);
  },

  renderSelectHtml(className, selected, canEdit, opts = {}) {
    const idAttr = opts.id ? ` id="${escapeHtml(opts.id)}"` : '';
    const subs = this.getForClass(className);
    const unlock = this.getUnlockLevel(className);
    const level = parseInt(opts.level, 10) || 1;
    const hint = level < unlock
      ? ` <span class="sheet-hint">(wybór od poz. ${unlock})</span>`
      : '';

    let options = `<option value="">— Nie wybrano —</option>`;
    subs.forEach((name) => {
      const label = this.getLabel(name);
      const sel = name === selected ? ' selected' : '';
      options += `<option value="${escapeHtml(name)}"${sel}>${escapeHtml(label)}</option>`;
    });
    if (selected && !subs.includes(selected)) {
      options += `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)} (własna)</option>`;
    }

    return `<select data-field="subclass"${idAttr} ${canEdit ? '' : 'disabled'}>${options}</select>${hint}`;
  },

  fillSelectElement(selectEl, className, selected) {
    if (!selectEl) return;
    const subs = this.getForClass(className);
    selectEl.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '— Nie wybrano —';
    selectEl.appendChild(empty);
    subs.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = this.getLabel(name);
      if (name === selected) opt.selected = true;
      selectEl.appendChild(opt);
    });
    if (selected && !subs.includes(selected)) {
      const custom = document.createElement('option');
      custom.value = selected;
      custom.textContent = `${selected} (własna)`;
      custom.selected = true;
      selectEl.appendChild(custom);
    } else if (selected && subs.includes(selected)) {
      selectEl.value = selected;
    } else {
      selectEl.value = selected || '';
    }
  }
};
