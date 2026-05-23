// ===== D&D 5e spell catalog =====
const DndSpells = {
  SCHOOLS_PL: {
    abjuration: 'ochrona', conjuration: 'przywoływanie', divination: 'wróżbiarstwo',
    enchantment: 'czary', evocation: 'wywoływanie', illusion: 'iluzje',
    necromancy: 'nekromancja', transmutation: 'transmutacja'
  },

  FULL_CASTERS: ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard', 'Artificer', 'Warlock'],
  HALF_CASTERS: ['Paladin', 'Ranger'],

  getMaxSpellLevel(className, characterLevel) {
    const lvl = Math.max(1, parseInt(characterLevel, 10) || 1);
    if (this.HALF_CASTERS.includes(className)) {
      if (lvl < 2) return 0;
      if (lvl < 5) return 1;
      if (lvl < 9) return 2;
      if (lvl < 13) return 3;
      if (lvl < 17) return 4;
      return 5;
    }
    if (!this.FULL_CASTERS.includes(className) && className !== 'Warlock') {
      const ab = DndRules.getClassProfile(className).spellcastingAbility;
      if (!ab) return 0;
    }
    if (lvl < 3) return 1;
    if (lvl < 5) return 2;
    if (lvl < 7) return 3;
    if (lvl < 9) return 4;
    if (lvl < 11) return 5;
    if (lvl < 13) return 6;
    if (lvl < 15) return 7;
    if (lvl < 17) return 8;
    return 9;
  },

  getSpellcastingAbility(char) {
    return char.spellcasting_ability || DndRules.getClassProfile(char.char_class || '').spellcastingAbility || '';
  },

  getSpellAttackBonus(char) {
    const ab = this.getSpellcastingAbility(char);
    if (!ab) return 0;
    const pb = char.proficiency_bonus || DndRules.proficiencyBonus(char.level);
    return pb + calcModifier(char[ab] || 10);
  },

  getSpellSaveDc(char) {
    const ab = this.getSpellcastingAbility(char);
    if (!ab) return 8;
    const pb = char.proficiency_bonus || DndRules.proficiencyBonus(char.level);
    return 8 + pb + calcModifier(char[ab] || 10);
  },

  getTemplate(id) {
    return this.SPELL_TEMPLATES.find((s) => s.id === id) || null;
  },

  spellFromTemplate(templateId) {
    const t = this.getTemplate(templateId);
    if (!t) return null;
    return {
      id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      templateId: t.id,
      name: t.namePl,
      level: t.level,
      school: t.school,
      attackType: t.attackType,
      saveAbility: t.saveAbility || '',
      damage: t.damage || '',
      damageType: t.damageType || '',
      healing: t.healing || '',
      castingTime: t.castingTime,
      range: t.range,
      duration: t.duration,
      concentration: !!t.concentration,
      ritual: !!t.ritual,
      description: t.description || ''
    };
  },

  canLearnSpell(spell, className, characterLevel) {
    const maxLvl = this.getMaxSpellLevel(className, characterLevel);
    const spellLvl = spell.level ?? 0;
    if (spellLvl > maxLvl) return false;
    if (!spell.classes || !spell.classes.length) return true;
    return spell.classes.includes(className);
  },

  getAvailableTemplates(className, characterLevel) {
    return this.SPELL_TEMPLATES.filter((s) => this.canLearnSpell(s, className, characterLevel));
  },

  normalizeSpell(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      const byName = this.SPELL_TEMPLATES.find((s) => s.namePl === raw || s.id === raw);
      if (byName) return this.spellFromTemplate(byName.id);
      return { id: `sp-custom`, name: raw, level: 0, attackType: 'none' };
    }
    if (raw.templateId) {
      const t = this.getTemplate(raw.templateId);
      return { ...t, ...raw, name: raw.name || t?.namePl || 'Czar' };
    }
    return raw;
  },

  parseSpellsKnown(char) {
    return Characters.parseJSON(char.spells_known).map((s) => this.normalizeSpell(s)).filter(Boolean);
  },

  levelLabel(level) {
    return level === 0 ? 'Cantrip' : `Poziom ${level}`;
  },

  // ——— Katalog (PHB / podstawowe 5e) ———
  SPELL_TEMPLATES: [
    // Cantrips
    { id: 'fire-bolt', namePl: 'Pocisk ognia', level: 0, school: 'evocation', classes: ['Wizard', 'Sorcerer', 'Artificer', 'Warlock'], attackType: 'attack', damage: '1d10', damageType: 'fire', castingTime: '1 akcja', range: '36 m', duration: 'Natychmiast', description: 'Atak dystansowy ogniem.' },
    { id: 'ray-of-frost', namePl: 'Promień mrozu', level: 0, school: 'evocation', classes: ['Wizard', 'Sorcerer', 'Artificer'], attackType: 'attack', damage: '1d8', damageType: 'cold', castingTime: '1 akcja', range: '18 m', duration: 'Natychmiast', description: 'Atak dystansowy zimnem.' },
    { id: 'shocking-grasp', namePl: 'Porażenie', level: 0, school: 'evocation', classes: ['Wizard', 'Sorcerer', 'Artificer'], attackType: 'attack', damage: '1d8', damageType: 'lightning', castingTime: '1 akcja', range: 'Dotyk', duration: 'Natychmiast', description: 'Atak wręcz elektrycznością.' },
    { id: 'sacred-flame', namePl: 'Święty płomień', level: 0, school: 'evocation', classes: ['Cleric'], attackType: 'save', saveAbility: 'dexterity', damage: '1d8', damageType: 'radiant', castingTime: '1 akcja', range: '18 m', duration: 'Natychmiast', description: 'Cel ST Zręczność lub obrażenia światłem.' },
    { id: 'toll-the-dead', namePl: 'Dzwon zagłady', level: 0, school: 'necromancy', classes: ['Cleric', 'Warlock', 'Wizard'], attackType: 'save', saveAbility: 'wisdom', damage: '1d8', damageType: 'necrotic', castingTime: '1 akcja', range: '18 m', duration: 'Natychmiast', description: '1d12 jeśli cel ma rany.' },
    { id: 'eldritch-blast', namePl: 'Eldrycki pocisk', level: 0, school: 'evocation', classes: ['Warlock'], attackType: 'attack', damage: '1d10', damageType: 'force', castingTime: '1 akcja', range: '36 m', duration: 'Natychmiast', description: '1+ promienie siły (skaluje poziomem).' },
    { id: 'vicious-mockery', namePl: 'Okrutny kpina', level: 0, school: 'enchantment', classes: ['Bard'], attackType: 'save', saveAbility: 'wisdom', damage: '1d4', damageType: 'psychic', castingTime: '1 akcja', range: '18 m', duration: 'Natychmiast', description: 'Utrudnienie na atak do końca tury.' },
    { id: 'produce-flame', namePl: 'Płomień', level: 0, school: 'conjuration', classes: ['Druid'], attackType: 'attack', damage: '1d8', damageType: 'fire', castingTime: '1 akcja', range: '9 m', duration: '10 min', description: 'Płomień w dłoni lub rzut.' },
    { id: 'guidance', namePl: 'Wskazówka', level: 0, school: 'divination', classes: ['Cleric', 'Druid', 'Artificer'], attackType: 'none', castingTime: '1 akcja', range: 'Dotyk', duration: 'Koncentracja, do 1 min', concentration: true, description: '+1k4 do jednego testu zdolności.' },
    { id: 'mage-hand', namePl: 'Ręka maga', level: 0, school: 'conjuration', classes: ['Wizard', 'Sorcerer', 'Bard', 'Warlock', 'Artificer'], attackType: 'none', castingTime: '1 akcja', range: '9 m', duration: '1 min', description: 'Spektralna ręka do manipulacji.' },
    { id: 'prestidigitation', namePl: 'Prestidigitacja', level: 0, school: 'transmutation', classes: ['Wizard', 'Sorcerer', 'Bard', 'Warlock', 'Artificer'], attackType: 'none', castingTime: '1 akcja', range: '3 m', duration: 'Do 1 h', description: 'Drobne magiczne efekty.' },
    { id: 'thaumaturgy', namePl: 'Taumaturgia', level: 0, school: 'transmutation', classes: ['Cleric'], attackType: 'none', castingTime: '1 akcja', range: '9 m', duration: 'Do 1 min', description: 'Efekt boskiej potęgi.' },

    // 1st
    { id: 'magic-missile', namePl: 'Magiczny pocisk', level: 1, school: 'evocation', classes: ['Wizard', 'Sorcerer'], attackType: 'none', damage: '3d4+3', damageType: 'force', castingTime: '1 akcja', range: '36 m', duration: 'Natychmiast', description: '3 pociski trafiają automatycznie.' },
    { id: 'shield', namePl: 'Tarcza', level: 1, school: 'abjuration', classes: ['Wizard', 'Sorcerer'], attackType: 'none', castingTime: '1 reakcja', range: 'Ty', duration: '1 runda', description: '+5 KP do następnego ataku.' },
    { id: 'burning-hands', namePl: 'Płonące dłonie', level: 1, school: 'evocation', classes: ['Wizard', 'Sorcerer'], attackType: 'save', saveAbility: 'dexterity', damage: '3d6', damageType: 'fire', castingTime: '1 akcja', range: 'Ty (stożek)', duration: 'Natychmiast', description: 'Stożek ognia 4,5 m.' },
    { id: 'cure-wounds', namePl: 'Leczenie ran', level: 1, school: 'evocation', classes: ['Cleric', 'Druid', 'Bard', 'Paladin', 'Ranger', 'Artificer'], attackType: 'heal', healing: '1d8', castingTime: '1 akcja', range: 'Dotyk', duration: 'Natychmiast', description: 'Leczenie + modyfikator rzucania.' },
    { id: 'healing-word', namePl: 'Słowo leczenia', level: 1, school: 'evocation', classes: ['Cleric', 'Druid', 'Bard'], attackType: 'heal', healing: '1d4', castingTime: '1 akcja dodatkowa', range: '18 m', duration: 'Natychmiast', description: 'Szybkie leczenie na dystans.' },
    { id: 'bless', namePl: 'Błogosławieństwo', level: 1, school: 'enchantment', classes: ['Cleric', 'Paladin'], attackType: 'none', castingTime: '1 akcja', range: '9 m', duration: 'Koncentracja, do 1 min', concentration: true, description: '+1k4 do ataków i rzutów obronnych.' },
    { id: 'guiding-bolt', namePl: 'Pocisk prowadzący', level: 1, school: 'evocation', classes: ['Cleric'], attackType: 'attack', damage: '4d6', damageType: 'radiant', castingTime: '1 akcja', range: '36 m', duration: 'Natychmiast', description: 'Przewaga na następny atak.' },
    { id: 'hex', namePl: 'Klątwa', level: 1, school: 'enchantment', classes: ['Warlock'], attackType: 'none', castingTime: '1 akcja dodatkowa', range: '27 m', duration: 'Koncentracja, do 1 h', concentration: true, description: '+1d6 nekrotycznych przy trafieniu.' },
    { id: 'hunters-mark', namePl: 'Znak łowcy', level: 1, school: 'divination', classes: ['Ranger'], attackType: 'none', castingTime: '1 akcja dodatkowa', range: '27 m', duration: 'Koncentracja, do 1 h', concentration: true, description: '+1d6 obrażeń na celu.' },
    { id: 'thunderwave', namePl: 'Fala grzmotu', level: 1, school: 'evocation', classes: ['Wizard', 'Sorcerer', 'Bard', 'Druid'], attackType: 'save', saveAbility: 'constitution', damage: '2d8', damageType: 'thunder', castingTime: '1 akcja', range: 'Ty', duration: 'Natychmiast', description: 'Obuch + odepchnięcie.' },
    { id: 'sleep', namePl: 'Sen', level: 1, school: 'enchantment', classes: ['Wizard', 'Sorcerer', 'Bard'], attackType: 'none', castingTime: '1 akcja', range: '27 m', duration: '1 min', description: '5d8 PW — usypia stwory.' },
    { id: 'detect-magic', namePl: 'Wykrycie magii', level: 1, school: 'divination', classes: ['Wizard', 'Cleric', 'Druid', 'Bard', 'Paladin', 'Ranger', 'Artificer'], attackType: 'none', ritual: true, castingTime: '1 akcja', range: 'Ty', duration: 'Koncentracja, 10 min', concentration: true, description: 'Wyczuwanie aur magicznych.' },
    { id: 'identify', namePl: 'Identyfikacja', level: 1, school: 'divination', classes: ['Wizard', 'Bard', 'Artificer'], attackType: 'none', ritual: true, castingTime: '1 min', range: 'Dotyk', duration: 'Natychmiast', description: 'Właściwości magicznego przedmiotu.' },
    { id: 'sanctuary', namePl: 'Sanktuarium', level: 1, school: 'abjuration', classes: ['Cleric', 'Artificer'], attackType: 'none', castingTime: '1 akcja dodatkowa', range: '9 m', duration: '1 min', description: 'Cel musi zdać ST Mądrość by zaatakować.' },
    { id: 'entangle', namePl: 'Zarośla', level: 1, school: 'conjuration', classes: ['Druid', 'Ranger'], attackType: 'save', saveAbility: 'strength', damage: '', damageType: '', castingTime: '1 akcja', range: '27 m', duration: 'Koncentracja, 1 min', concentration: true, description: 'Trawa wiąże — ST Siła.' },
    { id: 'faerie-fire', namePl: 'Wróżkowe światło', level: 1, school: 'evocation', classes: ['Bard', 'Druid', 'Artificer'], attackType: 'save', saveAbility: 'dexterity', castingTime: '1 akcja', range: '18 m', duration: 'Koncentracja, 1 min', concentration: true, description: 'Cele świecą — przewaga ataków.' },
    { id: 'command', namePl: 'Rozkaz', level: 1, school: 'enchantment', classes: ['Cleric', 'Paladin'], attackType: 'save', saveAbility: 'wisdom', castingTime: '1 akcja', range: '18 m', duration: '1 runda', description: 'Jednowyrazowe polecenie.' },
    { id: 'armor-of-agathys', namePl: 'Zbroja Agathys', level: 1, school: 'abjuration', classes: ['Warlock'], attackType: 'none', castingTime: '1 akcja', range: 'Ty', duration: '1 h', description: '5 tymczasowych HP + 5 zimna przy trafieniu.' },

    // 2nd
    { id: 'scorching-ray', namePl: 'Palące promienie', level: 2, school: 'evocation', classes: ['Wizard', 'Sorcerer'], attackType: 'attack', damage: '2d6', damageType: 'fire', castingTime: '1 akcja', range: '36 m', duration: 'Natychmiast', description: '3 ataki (każdy 2d6).' },
    { id: 'misty-step', namePl: 'Mglisty krok', level: 2, school: 'conjuration', classes: ['Wizard', 'Sorcerer', 'Warlock', 'Bard'], attackType: 'none', castingTime: '1 akcja dodatkowa', range: 'Ty', duration: 'Natychmiast', description: 'Teleport 9 m.' },
    { id: 'hold-person', namePl: 'Unieruchomienie osoby', level: 2, school: 'enchantment', classes: ['Wizard', 'Cleric', 'Bard', 'Sorcerer', 'Warlock'], attackType: 'save', saveAbility: 'wisdom', castingTime: '1 akcja', range: '18 m', duration: 'Koncentracja, 1 min', concentration: true, description: 'Paraliż humanoida.' },
    { id: 'spiritual-weapon', namePl: 'Duchowa broń', level: 2, school: 'evocation', classes: ['Cleric', 'Warlock'], attackType: 'attack', damage: '1d8', damageType: 'force', castingTime: '1 akcja dodatkowa', range: '18 m', duration: '1 min', description: 'Atak dodatkowy co turę.' },
    { id: 'prayer-of-healing', namePl: 'Modlitwa leczenia', level: 2, school: 'evocation', classes: ['Cleric'], attackType: 'heal', healing: '2d8', castingTime: '10 min', range: '9 m', duration: 'Natychmiast', description: 'Do 6 celów + mod.' },
    { id: 'lesser-restoration', namePl: 'Mniejsze przywrócenie', level: 2, school: 'abjuration', classes: ['Cleric', 'Druid', 'Paladin', 'Ranger', 'Bard', 'Artificer'], attackType: 'none', castingTime: '1 akcja', range: 'Dotyk', duration: 'Natychmiast', description: 'Usuwa chorobę lub stan.' },
    { id: 'invisibility', namePl: 'Niewidzialność', level: 2, school: 'illusion', classes: ['Wizard', 'Sorcerer', 'Bard', 'Warlock', 'Artificer'], attackType: 'none', castingTime: '1 akcja', range: 'Dotyk', duration: 'Koncentracja, 1 h', concentration: true, description: 'Niewidzialność do ataku.' },
    { id: 'shatter', namePl: 'Rozbicie', level: 2, school: 'evocation', classes: ['Wizard', 'Sorcerer', 'Bard', 'Warlock'], attackType: 'save', saveAbility: 'constitution', damage: '3d8', damageType: 'thunder', castingTime: '1 akcja', range: '18 m', duration: 'Natychmiast', description: 'Sfera 3 m — dźwięk.' },
    { id: 'spike-growth', namePl: 'Kolczaste zarośla', level: 2, school: 'transmutation', classes: ['Druid', 'Ranger'], attackType: 'none', castingTime: '1 akcja', range: '45 m', duration: 'Koncentracja, 10 min', concentration: true, description: '2d4 kolce za każde 1,5 m ruchu.' },
    { id: 'moonbeam', namePl: 'Promień księżyca', level: 2, school: 'evocation', classes: ['Druid'], attackType: 'save', saveAbility: 'constitution', damage: '2d10', damageType: 'radiant', castingTime: '1 akcja', range: '36 m', duration: 'Koncentracja, 1 min', concentration: true, description: 'Cylinder światła.' },
    { id: 'aid', namePl: 'Wspomożenie', level: 2, school: 'abjuration', classes: ['Cleric', 'Paladin', 'Artificer'], attackType: 'none', castingTime: '1 akcja', range: '9 m', duration: '8 h', description: '+5 max HP do 3 celów.' },
    { id: 'heat-metal', namePl: 'Rozgrzany metal', level: 2, school: 'transmutation', classes: ['Druid', 'Bard', 'Artificer'], attackType: 'save', saveAbility: 'constitution', damage: '2d8', damageType: 'fire', castingTime: '1 akcja', range: '18 m', duration: 'Koncentracja, 1 min', concentration: true, description: 'Podgrzewa metal.' },

    // 3rd
    { id: 'fireball', namePl: 'Kula ognia', level: 3, school: 'evocation', classes: ['Wizard', 'Sorcerer', 'Warlock'], attackType: 'save', saveAbility: 'dexterity', damage: '8d6', damageType: 'fire', castingTime: '1 akcja', range: '45 m', duration: 'Natychmiast', description: 'Sfera 6 m — połowa obrażeń przy ST.' },
    { id: 'lightning-bolt', namePl: 'Piorun', level: 3, school: 'evocation', classes: ['Wizard', 'Sorcerer'], attackType: 'save', saveAbility: 'dexterity', damage: '8d6', damageType: 'lightning', castingTime: '1 akcja', range: 'Ty (linia)', duration: 'Natychmiast', description: 'Linia 30 m.' },
    { id: 'counterspell', namePl: 'Kontrzaklęcie', level: 3, school: 'abjuration', classes: ['Wizard', 'Sorcerer', 'Warlock', 'Bard'], attackType: 'none', castingTime: '1 reakcja', range: '18 m', duration: 'Natychmiast', description: 'Przerywa rzucanie czaru.' },
    { id: 'revivify', namePl: 'Ożywienie', level: 3, school: 'necromancy', classes: ['Cleric', 'Paladin', 'Druid', 'Ranger', 'Bard', 'Artificer'], attackType: 'none', castingTime: '1 akcja', range: 'Dotyk', duration: 'Natychmiast', description: 'Wskrzeszenie w ciągu 1 minuty.' },
    { id: 'spirit-guardians', namePl: 'Duchowi strażnicy', level: 3, school: 'conjuration', classes: ['Cleric'], attackType: 'save', saveAbility: 'wisdom', damage: '3d8', damageType: 'radiant', castingTime: '1 akcja', range: 'Ty', duration: 'Koncentracja, 10 min', concentration: true, description: 'Aura 4,5 m — wrogi ST lub obrażenia.' },
    { id: 'hypnotic-pattern', namePl: 'Wzorzec hipnozy', level: 3, school: 'illusion', classes: ['Wizard', 'Sorcerer', 'Bard', 'Warlock'], attackType: 'save', saveAbility: 'wisdom', castingTime: '1 akcja', range: '36 m', duration: 'Koncentracja, 1 min', concentration: true, description: 'Zauroczenie w obszarze.' },
    { id: 'fly', namePl: 'Lot', level: 3, school: 'transmutation', classes: ['Wizard', 'Sorcerer', 'Bard', 'Warlock', 'Artificer'], attackType: 'none', castingTime: '1 akcja', range: 'Dotyk', duration: 'Koncentracja, 10 min', concentration: true, description: 'Lot 18 m/s.' },
    { id: 'haste', namePl: 'Pośpiech', level: 3, school: 'transmutation', classes: ['Wizard', 'Sorcerer', 'Bard', 'Artificer'], attackType: 'none', castingTime: '1 akcja', range: '9 m', duration: 'Koncentracja, 1 min', concentration: true, description: 'Podwójna akcja, +2 KP, AC.' },
    { id: 'call-lightning', namePl: 'Przywołanie pioruna', level: 3, school: 'conjuration', classes: ['Druid'], attackType: 'save', saveAbility: 'dexterity', damage: '3d10', damageType: 'lightning', castingTime: '1 akcja', range: '36 m', duration: 'Koncentracja, 10 min', concentration: true, description: 'Chmura burzowa.' },
    { id: 'conjure-animals', namePl: 'Przywołanie zwierząt', level: 3, school: 'conjuration', classes: ['Druid', 'Ranger'], attackType: 'none', castingTime: '1 akcja', range: '18 m', duration: 'Koncentracja, 1 h', concentration: true, description: 'Duchy bestii.' },
    { id: 'dispel-magic', namePl: 'Rozproszenie magii', level: 3, school: 'abjuration', classes: ['Wizard', 'Cleric', 'Druid', 'Bard', 'Sorcerer', 'Warlock', 'Paladin', 'Ranger', 'Artificer'], attackType: 'none', castingTime: '1 akcja', range: '36 m', duration: 'Natychmiast', description: 'Kończy efekt 3 poziomu lub niższy.' },
    { id: 'mass-healing-word', namePl: 'Masowe słowo leczenia', level: 3, school: 'evocation', classes: ['Cleric', 'Bard'], attackType: 'heal', healing: '1d4', castingTime: '1 akcja dodatkowa', range: '18 m', duration: 'Natychmiast', description: 'Do 6 celów + mod.' },

    // 4th
    { id: 'polymorph', namePl: 'Polimorfia', level: 4, school: 'transmutation', classes: ['Wizard', 'Druid', 'Bard', 'Sorcerer'], attackType: 'none', castingTime: '1 akcja', range: '18 m', duration: 'Koncentracja, 1 h', concentration: true, description: 'Zmiana formy bestii.' },
    { id: 'banishment', namePl: 'Wygnanie', level: 4, school: 'abjuration', classes: ['Wizard', 'Cleric', 'Paladin', 'Sorcerer', 'Warlock'], attackType: 'save', saveAbility: 'charisma', castingTime: '1 akcja', range: '18 m', duration: 'Koncentracja, 1 min', concentration: true, description: 'Wypędza na inny plan.' },
    { id: 'greater-invisibility', namePl: 'Większa niewidzialność', level: 4, school: 'illusion', classes: ['Wizard', 'Sorcerer', 'Bard', 'Artificer'], attackType: 'none', castingTime: '1 akcja', range: 'Dotyk', duration: 'Koncentracja, 1 min', concentration: true, description: 'Niewidzialność nawet po ataku.' },
    { id: 'wall-of-fire', namePl: 'Ściana ognia', level: 4, school: 'evocation', classes: ['Wizard', 'Druid', 'Sorcerer', 'Warlock'], attackType: 'save', saveAbility: 'dexterity', damage: '5d8', damageType: 'fire', castingTime: '1 akcja', range: '36 m', duration: 'Koncentracja, 1 min', concentration: true, description: 'Ściana płomieni.' },
    { id: 'guardian-of-faith', namePl: 'Strażnik wiary', level: 4, school: 'conjuration', classes: ['Cleric'], attackType: 'save', saveAbility: 'dexterity', damage: '20', damageType: 'radiant', castingTime: '1 akcja', range: '9 m', duration: '8 h', description: 'Duch zadaje obrażenia przy wejściu.' },
    { id: 'ice-storm', namePl: 'Burza lodowa', level: 4, school: 'evocation', classes: ['Wizard', 'Druid', 'Sorcerer'], attackType: 'save', saveAbility: 'dexterity', damage: '2d8', damageType: 'bludgeoning', castingTime: '1 akcja', range: '90 m', duration: 'Natychmiast', description: '+ 4d6 zimno w obszarze.' },
    { id: 'freedom-of-movement', namePl: 'Wolność ruchów', level: 4, school: 'abjuration', classes: ['Cleric', 'Druid', 'Bard', 'Ranger', 'Artificer'], attackType: 'none', castingTime: '1 akcja', range: 'Dotyk', duration: '1 h', description: 'Immunitet na spowolnienie i chwyt.' },

    // 5th
    { id: 'hold-monster', namePl: 'Unieruchomienie potwora', level: 5, school: 'enchantment', classes: ['Wizard', 'Sorcerer', 'Bard', 'Warlock'], attackType: 'save', saveAbility: 'wisdom', castingTime: '1 akcja', range: '27 m', duration: 'Koncentracja, 1 min', concentration: true, description: 'Paraliż stwora.' },
    { id: 'cone-of-cold', namePl: 'Stożek zimna', level: 5, school: 'evocation', classes: ['Wizard', 'Sorcerer', 'Druid'], attackType: 'save', saveAbility: 'constitution', damage: '8d8', damageType: 'cold', castingTime: '1 akcja', range: 'Ty', duration: 'Natychmiast', description: 'Stożek 18 m.' },
    { id: 'flame-strike', namePl: 'Uderzenie płomieni', level: 5, school: 'evocation', classes: ['Cleric'], attackType: 'save', saveAbility: 'dexterity', damage: '4d6', damageType: 'fire', castingTime: '1 akcja', range: '18 m', duration: 'Natychmiast', description: '+ 4d6 światło od nieba.' },
    { id: 'raise-dead', namePl: 'Wskrzeszenie', level: 5, school: 'necromancy', classes: ['Cleric', 'Bard', 'Paladin'], attackType: 'none', castingTime: '1 h', range: 'Dotyk', duration: 'Natychmiast', description: 'Wskrzeszenie po dniach.' },
    { id: 'mass-cure-wounds', namePl: 'Masowe leczenie ran', level: 5, school: 'evocation', classes: ['Cleric', 'Druid', 'Bard'], attackType: 'heal', healing: '3d8', castingTime: '1 akcja', range: '18 m', duration: 'Natychmiast', description: 'Do 6 celów w promieniu 9 m.' },
    { id: 'wall-of-force', namePl: 'Ściana siły', level: 5, school: 'evocation', classes: ['Wizard'], attackType: 'none', castingTime: '1 akcja', range: '36 m', duration: 'Koncentracja, 10 min', concentration: true, description: 'Niewidzialna bariera.' },
    { id: 'telekinesis', namePl: 'Telekineza', level: 5, school: 'transmutation', classes: ['Wizard', 'Sorcerer'], attackType: 'none', castingTime: '1 akcja', range: '18 m', duration: 'Koncentracja, 10 min', concentration: true, description: 'Ruch dużych obiektów.' },
    { id: 'destructive-wave', namePl: 'Fala zniszczenia', level: 5, school: 'evocation', classes: ['Paladin'], attackType: 'save', saveAbility: 'constitution', damage: '5d6', damageType: 'thunder', castingTime: '1 akcja', range: 'Ty', duration: 'Natychmiast', description: '+ 5d6 radiant lub nekrotyczne.' },

    // 6th+
    { id: 'chain-lightning', namePl: 'Łańcuch piorunów', level: 6, school: 'evocation', classes: ['Wizard', 'Sorcerer'], attackType: 'save', saveAbility: 'dexterity', damage: '10d8', damageType: 'lightning', castingTime: '1 akcja', range: '45 m', duration: 'Natychmiast', description: 'Skacze na 3 cele.' },
    { id: 'heal', namePl: 'Uzdrowienie', level: 6, school: 'evocation', classes: ['Cleric', 'Druid'], attackType: 'heal', healing: '70', castingTime: '1 akcja', range: '18 m', duration: 'Natychmiast', description: '70 HP (nie więcej max).' },
    { id: 'disintegrate', namePl: 'Dezintegracja', level: 6, school: 'transmutation', classes: ['Wizard', 'Sorcerer'], attackType: 'attack', damage: '10d6+40', damageType: 'force', castingTime: '1 akcja', range: '18 m', duration: 'Natychmiast', description: 'Promień zielonej energii.' },
    { id: 'sunbeam', namePl: 'Promień słońca', level: 6, school: 'evocation', classes: ['Druid', 'Sorcerer'], attackType: 'save', saveAbility: 'constitution', damage: '6d8', damageType: 'radiant', castingTime: '1 akcja', range: 'Ty', duration: 'Koncentracja, 1 min', concentration: true, description: 'Linia światła.' },
    { id: 'finger-of-death', namePl: 'Palec śmierci', level: 7, school: 'necromancy', classes: ['Wizard', 'Sorcerer', 'Warlock'], attackType: 'save', saveAbility: 'constitution', damage: '7d8+30', damageType: 'necrotic', castingTime: '1 akcja', range: '18 m', duration: 'Natychmiast', description: 'Potężne obrażenia nekrotyczne.' },
    { id: 'power-word-stun', namePl: 'Słowo mocy: ogłuszenie', level: 8, school: 'enchantment', classes: ['Wizard', 'Bard', 'Sorcerer', 'Warlock'], attackType: 'none', castingTime: '1 akcja', range: '18 m', duration: 'Natychmiast', description: 'Cel ≤150 HP — ogłuszony.' },
    { id: 'meteor-swarm', namePl: 'Rój meteorów', level: 9, school: 'evocation', classes: ['Wizard', 'Sorcerer'], attackType: 'save', saveAbility: 'dexterity', damage: '20d6', damageType: 'fire', castingTime: '1 akcja', range: '1,6 km', duration: 'Natychmiast', description: '+ 20d6 obuch w obszarze 12 m.' },
    { id: 'power-word-kill', namePl: 'Słowo mocy: zabij', level: 9, school: 'enchantment', classes: ['Wizard', 'Bard', 'Sorcerer', 'Warlock'], attackType: 'none', castingTime: '1 akcja', range: '18 m', duration: 'Natychmiast', description: 'Cel ≤100 HP — natychmiastowa śmierć.' },
    { id: 'wish', namePl: 'Życzenie', level: 9, school: 'conjuration', classes: ['Wizard', 'Sorcerer'], attackType: 'none', castingTime: '1 akcja', range: 'Ty', duration: 'Natychmiast', description: 'Najpotężniejsza magia — duplikuje czar 8 lub niższy.' }
  ]
};
