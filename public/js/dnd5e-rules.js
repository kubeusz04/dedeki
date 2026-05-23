// ===== D&D 5e rules data and helpers =====
const DndRules = {
  proficiencyBonus(level) {
    const lvl = Math.max(1, Math.min(20, parseInt(level, 10) || 1));
    return 2 + Math.floor((lvl - 1) / 4);
  },

  CLASS_PROFILES: {
    Barbarian: { hitDie: 12, savingThrows: ['strength', 'constitution'], spellcastingAbility: '', skillChoices: [['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival']] },
    Bard: { hitDie: 8, savingThrows: ['dexterity', 'charisma'], spellcastingAbility: 'charisma', skillChoices: [['any', 'any', 'any']] },
    Cleric: { hitDie: 8, savingThrows: ['wisdom', 'charisma'], spellcastingAbility: 'wisdom', skillChoices: [['History', 'Insight', 'Medicine', 'Persuasion', 'Religion']] },
    Druid: { hitDie: 8, savingThrows: ['intelligence', 'wisdom'], spellcastingAbility: 'wisdom', skillChoices: [['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival']] },
    Fighter: { hitDie: 10, savingThrows: ['strength', 'constitution'], spellcastingAbility: '', skillChoices: [['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival']] },
    Monk: { hitDie: 8, savingThrows: ['strength', 'dexterity'], spellcastingAbility: '', skillChoices: [['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth']] },
    Paladin: { hitDie: 10, savingThrows: ['wisdom', 'charisma'], spellcastingAbility: 'charisma', skillChoices: [['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion']] },
    Ranger: { hitDie: 10, savingThrows: ['strength', 'dexterity'], spellcastingAbility: 'wisdom', skillChoices: [['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival']] },
    Rogue: { hitDie: 8, savingThrows: ['dexterity', 'intelligence'], spellcastingAbility: '', skillChoices: [['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth']] },
    Sorcerer: { hitDie: 6, savingThrows: ['constitution', 'charisma'], spellcastingAbility: 'charisma', skillChoices: [['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion']] },
    Warlock: { hitDie: 8, savingThrows: ['wisdom', 'charisma'], spellcastingAbility: 'charisma', skillChoices: [['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion']] },
    Wizard: { hitDie: 6, savingThrows: ['intelligence', 'wisdom'], spellcastingAbility: 'intelligence', skillChoices: [['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion']] },
    Artificer: { hitDie: 8, savingThrows: ['constitution', 'intelligence'], spellcastingAbility: 'intelligence', skillChoices: [['Arcana', 'History', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Sleight of Hand']] },
    'Blood Hunter': { hitDie: 10, savingThrows: ['dexterity', 'intelligence'], spellcastingAbility: 'intelligence', skillChoices: [['Athletics', 'Acrobatics', 'Arcana', 'History', 'Insight', 'Investigation', 'Religion', 'Survival']] }
  },

  BACKGROUND_SKILLS: {
    Acolyte: ['Insight', 'Religion'],
    Charlatan: ['Deception', 'Sleight of Hand'],
    Criminal: ['Deception', 'Stealth'],
    Entertainer: ['Acrobatics', 'Performance'],
    'Folk Hero': ['Animal Handling', 'Survival'],
    'Guild Artisan': ['Insight', 'Persuasion'],
    Hermit: ['Medicine', 'Religion'],
    Noble: ['History', 'Persuasion'],
    Outlander: ['Athletics', 'Survival'],
    Sage: ['Arcana', 'History'],
    Sailor: ['Athletics', 'Perception'],
    Soldier: ['Athletics', 'Intimidation'],
    Urchin: ['Sleight of Hand', 'Stealth']
  },

  WEAPON_TEMPLATES: [
    { id: 'dagger', namePl: 'Sztylet', damage: '1d4', damageType: 'piercing', ability: 'dexterity', properties: ['finesse', 'light', 'thrown'], range: '20/60' },
    { id: 'shortsword', namePl: 'Krótki miecz', damage: '1d6', damageType: 'piercing', ability: 'dexterity', properties: ['finesse', 'light'] },
    { id: 'rapier', namePl: 'Rapier', damage: '1d8', damageType: 'piercing', ability: 'dexterity', properties: ['finesse'] },
    { id: 'longsword', namePl: 'Miecz długi', damage: '1d8', damageType: 'slashing', ability: 'strength', properties: ['versatile'] },
    { id: 'greatsword', namePl: 'Miecz dwuręczny', damage: '2d6', damageType: 'slashing', ability: 'strength', properties: ['heavy', 'two-handed'] },
    { id: 'handaxe', namePl: 'Toporek', damage: '1d6', damageType: 'slashing', ability: 'strength', properties: ['light', 'thrown'], range: '20/60' },
    { id: 'battleaxe', namePl: 'Topór bojowy', damage: '1d8', damageType: 'slashing', ability: 'strength', properties: ['versatile'] },
    { id: 'greataxe', namePl: 'Topór dwuręczny', damage: '1d12', damageType: 'slashing', ability: 'strength', properties: ['heavy', 'two-handed'] },
    { id: 'mace', namePl: 'Buława', damage: '1d6', damageType: 'bludgeoning', ability: 'strength', properties: [] },
    { id: 'warhammer', namePl: 'Młot bojowy', damage: '1d8', damageType: 'bludgeoning', ability: 'strength', properties: ['versatile'] },
    { id: 'quarterstaff', namePl: 'Kostur', damage: '1d6', damageType: 'bludgeoning', ability: 'strength', properties: ['versatile'] },
    { id: 'spear', namePl: 'Włócznia', damage: '1d6', damageType: 'piercing', ability: 'strength', properties: ['thrown', 'versatile'], range: '20/60' },
    { id: 'shortbow', namePl: 'Krótki łuk', damage: '1d6', damageType: 'piercing', ability: 'dexterity', properties: ['ammunition', 'two-handed'], range: '80/320' },
    { id: 'longbow', namePl: 'Łuk długi', damage: '1d8', damageType: 'piercing', ability: 'dexterity', properties: ['ammunition', 'heavy', 'two-handed'], range: '150/600' },
    { id: 'light-crossbow', namePl: 'Kusza lekka', damage: '1d8', damageType: 'piercing', ability: 'dexterity', properties: ['ammunition', 'loading', 'two-handed'], range: '80/320' },
    { id: 'heavy-crossbow', namePl: 'Kusza ciężka', damage: '1d10', damageType: 'piercing', ability: 'dexterity', properties: ['ammunition', 'heavy', 'loading', 'two-handed'], range: '100/400' },
    { id: 'sling', namePl: 'Proca', damage: '1d4', damageType: 'bludgeoning', ability: 'dexterity', properties: ['ammunition'], range: '30/120' },
    { id: 'whip', namePl: 'Bicz', damage: '1d4', damageType: 'slashing', ability: 'dexterity', properties: ['finesse', 'reach'] },
    { id: 'trident', namePl: 'Trójząb', damage: '1d6', damageType: 'piercing', ability: 'strength', properties: ['thrown', 'versatile'], range: '20/60' },
    { id: 'halberd', namePl: 'Halabarda', damage: '1d10', damageType: 'slashing', ability: 'strength', properties: ['heavy', 'reach', 'two-handed'] },
    { id: 'glaive', namePl: 'Glewia', damage: '1d10', damageType: 'slashing', ability: 'strength', properties: ['heavy', 'reach', 'two-handed'] }
  ],

  ARMOR_TEMPLATES: [
    { id: 'padded', namePl: 'Ochrona wyściełana', category: 'armor', armorClass: 11, dexBonusMax: 99, weight: 8, priceCopper: 500, stealthDisadvantage: true },
    { id: 'leather', namePl: 'Skórzana zbroja', category: 'armor', armorClass: 11, dexBonusMax: 99, weight: 10, priceCopper: 1000 },
    { id: 'studded-leather', namePl: 'Ćwiekowana skóra', category: 'armor', armorClass: 12, dexBonusMax: 99, weight: 13, priceCopper: 4500 },
    { id: 'hide', namePl: 'Zbroja ze skór', category: 'armor', armorClass: 12, dexBonusMax: 2, weight: 12, priceCopper: 1000 },
    { id: 'chain-shirt', namePl: 'Koszula kolcza', category: 'armor', armorClass: 13, dexBonusMax: 2, weight: 20, priceCopper: 5000 },
    { id: 'scale-mail', namePl: 'Kolczuga łuskowa', category: 'armor', armorClass: 14, dexBonusMax: 2, weight: 45, priceCopper: 5000, stealthDisadvantage: true },
    { id: 'breastplate', namePl: 'Napierśnik', category: 'armor', armorClass: 14, dexBonusMax: 2, weight: 20, priceCopper: 40000 },
    { id: 'half-plate', namePl: 'Półpłytowa', category: 'armor', armorClass: 15, dexBonusMax: 2, weight: 40, priceCopper: 75000, stealthDisadvantage: true },
    { id: 'ring-mail', namePl: 'Pierścieniowa', category: 'armor', armorClass: 14, dexBonusMax: 0, weight: 40, priceCopper: 3000, stealthDisadvantage: true },
    { id: 'chain-mail', namePl: 'Kolczuga', category: 'armor', armorClass: 16, dexBonusMax: 0, weight: 55, priceCopper: 7500, stealthDisadvantage: true },
    { id: 'splint', namePl: 'Opancerzenie splint', category: 'armor', armorClass: 17, dexBonusMax: 0, weight: 60, priceCopper: 20000, stealthDisadvantage: true },
    { id: 'plate', namePl: 'Płytowa', category: 'armor', armorClass: 18, dexBonusMax: 0, weight: 65, priceCopper: 150000, stealthDisadvantage: true },
    { id: 'shield', namePl: 'Tarcza', category: 'shield', acBonus: 2, weight: 6, priceCopper: 1000, equipSlot: 'shield' }
  ],

  GEAR_TEMPLATES: [
    { id: 'backpack', namePl: 'Plecak', category: 'gear', weight: 5, priceCopper: 200 },
    { id: 'rope-50', namePl: 'Lina (15 m)', category: 'gear', weight: 10, priceCopper: 100 },
    { id: 'torch', namePl: 'Pochodnia', category: 'gear', weight: 1, priceCopper: 1 },
    { id: 'rations', namePl: 'Racje (1 dzień)', category: 'gear', weight: 2, priceCopper: 5 },
    { id: 'healers-kit', namePl: 'Zestaw medyczny', category: 'gear', weight: 3, priceCopper: 500 },
    { id: 'thieves-tools', namePl: 'Włamywacza', category: 'gear', weight: 1, priceCopper: 2500 },
    { id: 'holy-symbol', namePl: 'Symbol święty', category: 'gear', weight: 0, priceCopper: 500 },
    { id: 'arcane-focus', namePl: 'Fokus arcaniczny', category: 'gear', weight: 1, priceCopper: 1000 },
    { id: 'potion-healing', namePl: 'Mikstura leczenia', category: 'potion', weight: 0.5, priceCopper: 5000, description: '2d4+2 HP' },
    { id: 'antitoxin', namePl: 'Antidotum', category: 'potion', weight: 0, priceCopper: 5000 },
    { id: 'cloak-travel', namePl: 'Płaszcz podróżny', category: 'gear', weight: 4, priceCopper: 100, equipSlot: 'cloak' },
    { id: 'hat-wizard', namePl: 'Kapelusz czarodzieja', category: 'gear', weight: 0, priceCopper: 500, equipSlot: 'head' },
    { id: 'gloves', namePl: 'Rękawice', category: 'gear', weight: 0, priceCopper: 200, equipSlot: 'hands' },
    { id: 'boots', namePl: 'Buty', category: 'gear', weight: 2, priceCopper: 200, equipSlot: 'feet' },
    { id: 'amulet', namePl: 'Amulet', category: 'wondrous', weight: 0, priceCopper: 500, equipSlot: 'amulet' },
    { id: 'ring', namePl: 'Pierścień', category: 'wondrous', weight: 0, priceCopper: 2500, equipSlot: 'ring1' }
  ],

  ALL_ITEM_TEMPLATES() {
    return [
      ...this.WEAPON_TEMPLATES.map((t) => ({ ...t, category: 'weapon', grantAs: 'weapon' })),
      ...this.ARMOR_TEMPLATES,
      ...this.GEAR_TEMPLATES
    ];
  },

  getItemTemplate(templateId) {
    return this.ALL_ITEM_TEMPLATES().find((t) => t.id === templateId) || null;
  },

  itemFromTemplate(templateId) {
    const t = this.getItemTemplate(templateId);
    if (!t) return null;
    const base = {
      id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      templateId: t.id,
      name: t.namePl,
      category: t.category || 'gear',
      quantity: 1,
      weight: t.weight ?? 0,
      description: t.description || ''
    };
    if (t.category === 'weapon' || t.damage) {
      return {
        ...base,
        damage: t.damage,
        damageType: t.damageType,
        ability: t.ability,
        properties: [...(t.properties || [])],
        range: t.range || '',
        attackBonus: 0,
        damageBonus: 0,
        isProficient: true
      };
    }
    if (t.category === 'armor') {
      return {
        ...base,
        equipSlot: 'armor',
        armorClass: t.armorClass,
        dexBonusMax: t.dexBonusMax,
        stealthDisadvantage: !!t.stealthDisadvantage
      };
    }
    if (t.category === 'shield') {
      return { ...base, equipSlot: 'shield', acBonus: t.acBonus || 2 };
    }
    return { ...base, equipSlot: t.equipSlot || '' };
  },

  formatPriceCopper(cp) {
    const n = Math.max(0, parseInt(cp, 10) || 0);
    if (n >= 10000) return `${(n / 100).toFixed(n % 100 ? 2 : 0)} MZ`;
    if (n >= 100) return `${(n / 100).toFixed(n % 100 ? 2 : 0)} MZ`;
    if (n >= 10) return `${(n / 10).toFixed(n % 10 ? 1 : 0)} MS`;
    return `${n} MC`;
  },

  getClassProfile(className) {
    return this.CLASS_PROFILES[className] || { hitDie: 8, savingThrows: [], spellcastingAbility: '', skillChoices: [[]] };
  },

  getBackgroundSkills(background) {
    return [...(this.BACKGROUND_SKILLS[background] || [])];
  },

  hitDieSides(className) {
    return this.getClassProfile(className).hitDie || 8;
  },

  averageHitDie(className) {
    const sides = this.hitDieSides(className);
    return Math.floor(sides / 2) + 1;
  },

  hasFinesse(weapon) {
    return (weapon.properties || []).includes('finesse');
  },

  attackAbility(char, weapon) {
    if (this.hasFinesse(weapon)) {
      const str = calcModifier(char.strength);
      const dex = calcModifier(char.dexterity);
      return dex > str ? 'dexterity' : 'strength';
    }
    return weapon.ability || 'strength';
  },

  weaponFromTemplate(templateId) {
    const t = this.WEAPON_TEMPLATES.find(w => w.id === templateId);
    if (!t) return null;
    return {
      id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      templateId: t.id,
      name: t.namePl,
      damage: t.damage,
      damageType: t.damageType,
      ability: t.ability,
      properties: [...(t.properties || [])],
      range: t.range || '',
      attackBonus: 0,
      damageBonus: 0,
      isProficient: true
    };
  },

  parseJsonArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
  },

  mergeUnique(arr, items) {
    const set = new Set(arr);
    items.forEach(i => set.add(i));
    return [...set];
  },

  computeDerivedStats(char, options = {}) {
    const level = Math.max(1, parseInt(char.level, 10) || 1);
    const className = char.char_class || 'Fighter';
    const background = char.background || '';
    const profile = this.getClassProfile(className);
    const pb = this.proficiencyBonus(level);
    const conMod = calcModifier(char.constitution || 10);
    const hitDie = `1d${profile.hitDie}`;

    const classSaves = profile.savingThrows || [];
    const bgSkills = this.getBackgroundSkills(background);

    let skillProficiencies = this.parseJsonArray(char.skill_proficiencies);
    skillProficiencies = this.mergeUnique(skillProficiencies, bgSkills);

    let saveProficiencies = this.parseJsonArray(char.saving_throw_proficiencies);
    saveProficiencies = this.mergeUnique(saveProficiencies, classSaves);

    const firstLevelHp = profile.hitDie + conMod;
    const perLevelHp = this.averageHitDie(className) + conMod;
    const suggestedMaxHp = firstLevelHp + Math.max(0, level - 1) * perLevelHp;

    const spellAb = profile.spellcastingAbility || char.spellcasting_ability || '';
    const spellMod = spellAb ? calcModifier(char[spellAb] || 10) : 0;
    const spellSaveDc = spellAb ? 8 + pb + spellMod : 0;
    const spellAttackBonus = spellAb ? pb + spellMod : 0;

    return {
      proficiencyBonus: pb,
      hitDice: hitDie,
      hitDiceRemaining: level,
      savingThrowProficiencies: saveProficiencies,
      skillProficiencies,
      spellcastingAbility: spellAb,
      spellSaveDc,
      spellAttackBonus,
      suggestedMaxHp: Math.max(1, suggestedMaxHp),
      classSkillPool: profile.skillChoices[0] || []
    };
  },

  applyDerivedToCharacter(char, options = {}) {
    const derived = this.computeDerivedStats(char, options);
    const level = Math.max(1, Math.min(20, parseInt(char.level, 10) || 1));
    const updates = {
      level,
      char_class: char.char_class || 'Fighter',
      subclass: char.subclass || '',
      background: char.background || '',
      proficiency_bonus: derived.proficiencyBonus,
      hit_dice: derived.hitDice,
      hit_dice_remaining: derived.hitDiceRemaining,
      saving_throw_proficiencies: JSON.stringify(derived.savingThrowProficiencies),
      skill_proficiencies: JSON.stringify(derived.skillProficiencies)
    };
    if (derived.spellcastingAbility) {
      updates.spellcasting_ability = derived.spellcastingAbility;
      updates.spell_save_dc = derived.spellSaveDc;
      updates.spell_attack_bonus = derived.spellAttackBonus;
    }
    if (options.setMaxHp) {
      updates.max_hp = derived.suggestedMaxHp;
      if (options.fullHealOnCreate) {
        updates.current_hp = derived.suggestedMaxHp;
      }
    }
    return { updates, derived };
  },

  rollDamageExpr(expr) {
    const match = String(expr).match(/(\d+)d(\d+)/i);
    if (!match) {
      const flat = parseInt(expr, 10);
      if (!Number.isNaN(flat)) return { rolls: [flat], total: flat };
      return { rolls: [0], total: 0 };
    }
    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const rolls = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
      const r = Math.floor(Math.random() * sides) + 1;
      rolls.push(r);
      total += r;
    }
    return { rolls, total };
  }
};
