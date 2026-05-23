// ===== DM NPC & Monster templates (D&D 5e inspired) =====
const NpcTemplates = {
  formatNotes(t) {
    const lines = [];
    if (t.cr) lines.push(`CR ${t.cr} · ${t.size || 'Średni'} · ${t.alignment || ''}`.trim());
    if (t.speed) lines.push(`Szybkość: ${t.speed}`);
    if (t.attacks) lines.push(`\nAtaki:\n${t.attacks}`);
    if (t.traits?.length) {
      lines.push('\nCechy:');
      t.traits.forEach((x) => lines.push(`• ${x.name}: ${x.desc}`));
    }
    if (t.abilities?.length) {
      lines.push('\nZdolności:');
      t.abilities.forEach((x) => lines.push(`• ${x.name}: ${x.desc}`));
    }
    if (t.legendary) {
      lines.push('\n═══ LEGENDARNY ═══');
      if (t.legendaryResist) lines.push(`Oporności legendarne: ${t.legendaryResist}/długa przerwa (automat. sukces rzutu obronnego).`);
      if (t.legendaryActions?.length) {
        lines.push('Akcje legendarne (3/tura):');
        t.legendaryActions.forEach((a) => lines.push(`  – ${a}`));
      }
      if (t.lairActions?.length) {
        lines.push('Akcje legowiska (inicjatywa 20):');
        t.lairActions.forEach((a) => lines.push(`  – ${a}`));
      }
      if (t.uniqueMechanic) lines.push(`\n⚙ UNIKALNA MECHANIKA:\n${t.uniqueMechanic}`);
    }
    if (t.dmTips) lines.push(`\n💡 MG: ${t.dmTips}`);
    return lines.join('\n').trim();
  },

  formatStats(t) {
    return JSON.stringify({
      templateId: t.id,
      category: t.category,
      cr: t.cr,
      size: t.size,
      stats: t.stats || {},
      initiative: t.initiative,
      tags: t.tags || []
    });
  },

  getAll() {
    return this.TEMPLATES;
  },

  getById(id) {
    return this.TEMPLATES.find((x) => x.id === id);
  },

  filter({ category, search, crMax }) {
    let list = this.TEMPLATES;
    if (category && category !== 'all') list = list.filter((x) => x.category === category);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((x) =>
        x.namePl.toLowerCase().includes(q) ||
        (x.tags || []).some((tag) => tag.toLowerCase().includes(q)) ||
        (x.race || '').toLowerCase().includes(q)
      );
    }
    if (crMax != null && crMax !== '') {
      const max = parseFloat(crMax);
      if (!Number.isNaN(max)) {
        list = list.filter((x) => this.crToNumber(x.cr) <= max);
      }
    }
    return list.sort((a, b) => this.crToNumber(a.cr) - this.crToNumber(b.cr));
  },

  crToNumber(cr) {
    if (!cr) return 0;
    if (typeof cr === 'number') return cr;
    const s = String(cr).replace(',', '.');
    if (s.includes('/')) {
      const [a, b] = s.split('/').map(Number);
      return b ? a / b : 0;
    }
    return parseFloat(s) || 0;
  },

  TEMPLATES: [
    // ─── NPC (społeczni) ───
    { id: 'innkeeper', category: 'npc', namePl: 'Karczmarz', cr: '0', race: 'Humanoid', tags: ['miasto', 'tawerna'], max_hp: 8, armor_class: 10, description: 'Gospodarz znanej tawerny, zna plotki i miejscowych.', stats: { str: 10, dex: 10, con: 10, int: 12, wis: 14, cha: 13 }, dmTips: 'Może dać zniżkę po udanym teście Perswazji DC 12.' },
    { id: 'town-guard', category: 'npc', namePl: 'Strażnik miejski', cr: '1/8', race: 'Humanoid', tags: ['miasto', 'straż'], max_hp: 11, armor_class: 16, description: 'Patroluje mury; reaguje na hałas i przestępstwa.', attacks: 'Włócznia +3 (1d6+1) lub lekka kusza +3 (1d8+1).', stats: { str: 13, dex: 12, con: 12, int: 10, wis: 11, cha: 10 } },
    { id: 'merchant', category: 'npc', namePl: 'Kupiec karawany', cr: '1/4', race: 'Humanoid', tags: ['handel', 'podróż'], max_hp: 16, armor_class: 11, description: 'Handluje rzadkimi towarami; chroni 2 strażników.', stats: { str: 10, dex: 12, con: 10, int: 14, wis: 12, cha: 15 }, dmTips: 'Ceny ±20% po testach Handlu/Perswazji.' },
    { id: 'priest', category: 'npc', namePl: 'Kapłan świątyni', cr: '2', race: 'Humanoid', tags: ['religia', 'leczenie'], max_hp: 27, armor_class: 13, description: 'Uzdrawia wiernych; posiada zaklęcia 1–3 poziomu.', abilities: [{ name: 'Leczenie boskie', desc: '3×/dzień przywraca 1d8+3 HP w dotyku.' }, { name: 'Zaklęcia', desc: 'Druid/Cleric lista — bless, cure wounds, lesser restoration.' }], stats: { str: 10, dex: 10, con: 12, int: 13, wis: 16, cha: 13 } },
    { id: 'noble', category: 'npc', namePl: 'Szlachcic', cr: '1/8', race: 'Humanoid', tags: ['polityka', 'miasto'], max_hp: 9, armor_class: 15, description: 'Wpływowy arystokrata; otoczony służbą.', stats: { str: 11, dex: 12, con: 11, int: 12, wis: 14, cha: 16 }, dmTips: 'Może wystawić list przepustkowy lub nagrodę.' },
    { id: 'spy', category: 'npc', namePl: 'Szpieg', cr: '1', race: 'Humanoid', tags: ['intriga', 'skradanie'], max_hp: 27, armor_class: 12, description: 'Mistrz kamuflażu i informacji.', abilities: [{ name: 'Cunning Action', desc: 'Co turę: Disengage, Dash lub Hide jako bonus.' }, { name: 'Sneak Attack', desc: '+1d6 obrażeń gdy ma przewagę lub sojusznik w zasięgu 1,5 m.' }], attacks: 'Sztylet +4 (1d4+2) + Sneak.', stats: { str: 10, dex: 15, con: 10, int: 12, wis: 14, cha: 12 } },
    { id: 'blacksmith', category: 'npc', namePl: 'Kowal', cr: '1', race: 'Humanoid', tags: ['rzemiosło', 'miasto'], max_hp: 30, armor_class: 14, description: 'Naprawia broń i zbroję; może wykonać custom order.', stats: { str: 16, dex: 10, con: 14, int: 12, wis: 10, cha: 10 } },
    { id: 'healer-herbalist', category: 'npc', namePl: 'Zielarz', cr: '1/4', race: 'Humanoid', tags: ['leczenie', 'miasto'], max_hp: 18, armor_class: 10, description: 'Sprzedaje mikstury i antidota.', abilities: [{ name: 'Zestaw ziół', desc: '1×/dzień leczy 2d4+2 HP lub usuwa jeden stan (nie zatrucie).' }], stats: { str: 8, dex: 12, con: 12, int: 14, wis: 15, cha: 10 } },
    { id: 'bandit-captain-npc', category: 'npc', namePl: 'Kapitan bandytów (NPC)', cr: '2', race: 'Humanoid', tags: ['bandyta', 'negocjacje'], max_hp: 52, armor_class: 15, description: 'Przywódca obozu; może negocjować okup.', attacks: 'Scimitar +4 (1d6+2), heavy crossbow +4 (1d10+2).', abilities: [{ name: 'Parry', desc: 'Reakcja: +2 AC vs jeden atak wręcz.' }], stats: { str: 14, dex: 15, con: 12, int: 14, wis: 11, cha: 14 } },
    { id: 'knight-errant', category: 'npc', namePl: 'Rycerz błądzący', cr: '3', race: 'Humanoid', tags: ['rycerz', 'sojusznik'], max_hp: 52, armor_class: 18, description: 'Honorowy wojownik; może pomóc na jedną bitwę.', attacks: 'Greatsword +5 (2d6+3).', stats: { str: 16, dex: 11, con: 14, int: 11, wis: 13, cha: 13 } },
    { id: 'cultist-orator', category: 'npc', namePl: 'Kaznodzieja kultu', cr: '2', race: 'Humanoid', tags: ['kult', 'zagrożenie'], max_hp: 45, armor_class: 13, description: 'Wzywa mrocznego patrona; otoczony 1d6+2 kultystami.', abilities: [{ name: 'Dark Devotion', desc: 'Przewaga na rzuty obronne przed charm/frightened.' }, { name: 'Rytuał', desc: 'Po 3 rundy w walce: przywołaj fiend CR ≤1 (raz).' }], stats: { str: 11, dex: 12, con: 12, int: 13, wis: 16, cha: 14 } },
    { id: 'archmage-npc', category: 'npc', namePl: 'Arcymag (sojusznik)', cr: '12', race: 'Humanoid', tags: ['mag', 'epicki'], max_hp: 99, armor_class: 12, description: 'Potężny czarodziej; rzadko wchodzi do walki osobiście.', legendary: true, legendaryResist: 2, abilities: [{ name: 'Zaklęcia', desc: 'Wizard 18 — fireball, counterspell, fly, wall of force, teleport.' }, { name: 'Magic Resistance', desc: 'Przewaga na rzuty obronne vs zaklęcia.' }], uniqueMechanic: 'Raz na scenę: „Arcane Ward” — pierwsze 30 obrażeń w sesji ignorowane; potem normalnie.', stats: { str: 10, dex: 14, con: 12, int: 20, wis: 15, cha: 16 } },

    // ─── Potwory (niskie CR) ───
    { id: 'goblin', category: 'monster', namePl: 'Goblin', cr: '1/4', race: 'Goblinoid', tags: ['humanoid', 'las'], max_hp: 7, armor_class: 15, speed: '9 m', description: 'Tchórzliwy napastnik z zasadzki.', attacks: 'Scimitar +4 (1d6+2), shortbow +4 (1d6+2).', abilities: [{ name: 'Nimble Escape', desc: 'Bonus: Disengage lub Dash.' }], stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 } },
    { id: 'kobold', category: 'monster', namePl: 'Kobold', cr: '1/8', race: 'Humanoid', tags: ['jaskinia', 'smok'], max_hp: 5, armor_class: 12, description: 'Atakuje tylko w grupie z przewagą.', abilities: [{ name: 'Pack Tactics', desc: 'Przewaga jeśli sojusznik w 1,5 m od celu.' }, { name: 'Sunlight Sensitivity', desc: 'Utrudnienie na ataki i Percepcję w świetle słonecznym.' }], attacks: 'Włócznia +4 (1d8+2).', stats: { str: 7, dex: 15, con: 9, int: 8, wis: 7, cha: 8 } },
    { id: 'wolf', category: 'monster', namePl: 'Wilk', cr: '1/4', race: 'Bestia', tags: ['dzicz', 'bestia'], max_hp: 11, armor_class: 13, speed: '12 m', description: 'Ściga osłabioną ofiarę.', abilities: [{ name: 'Pack Tactics', desc: 'Przewaga przy sojuszniku obok celu.' }, { name: 'Knockdown', desc: 'Jeśli trafienie ≥10 obrażeń — cel na ziemi (DC 11 STR).' }], attacks: 'Ugryzienie +4 (2d4+2).', stats: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 } },
    { id: 'skeleton', category: 'monster', namePl: 'Szkielet', cr: '1/4', race: 'Nieumarły', tags: ['dungeon', 'nieumarły'], max_hp: 13, armor_class: 13, description: 'Uporczywy sługa nekromanty.', vulnerabilities: 'bludgeoning', immunities: 'poison', attacks: 'Shortsword +4 (1d6+2), shortbow +4 (1d6+2).', stats: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 } },
    { id: 'zombie', category: 'monster', namePl: 'Zombie', cr: '1/4', race: 'Nieumarły', tags: ['nieumarły', 'horror'], max_hp: 22, armor_class: 8, description: 'Powolny, ale wytrzymały.', abilities: [{ name: 'Undead Fortitude', desc: 'CON rzut — przy 0 HP zostaje z 1 HP (chyba że radiant/krytyk).' }], attacks: 'Uderzenie +3 (1d6+1).', stats: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 } },
    { id: 'orc', category: 'monster', namePl: 'Ork', cr: '1/2', race: 'Humanoid', tags: ['humanoid', 'wojownik'], max_hp: 15, armor_class: 13, attacks: 'Greataxe +5 (1d12+3).', abilities: [{ name: 'Aggressive', desc: 'Bonus: Dash w kierunku wroga w zasięgu wzroku.' }], stats: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 } },
    { id: 'hobgoblin', category: 'monster', namePl: 'Hobgoblin', cr: '1/2', race: 'Goblinoid', tags: ['humanoid', 'taktyka'], max_hp: 11, armor_class: 18, attacks: 'Longsword +3 (1d8+1), longbow +3 (1d8+1).', abilities: [{ name: 'Martial Advantage', desc: 'Raz/turę +2d6 obrażeń jeśli sojusznik w 1,5 m od celu.' }], stats: { str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9 } },
    { id: 'bugbear', category: 'monster', namePl: 'Bugbear', cr: '1', race: 'Goblinoid', tags: ['humanoid', 'zasadzka'], max_hp: 27, armor_class: 16, attacks: 'Morningstar +4 (2d8+2), javelin +4 (1d6+2).', abilities: [{ name: 'Surprise Attack', desc: 'W pierwszej rundzie +2d6 obrażeń jeśli zaskoczenie.' }, { name: 'Brute', desc: 'Kość obrażeń ataku +1.' }], stats: { str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9 } },
    { id: 'ogre', category: 'monster', namePl: 'Ogr', cr: '2', race: 'Olbrzym', tags: ['giant', 'brutal'], max_hp: 59, armor_class: 11, attacks: 'Greatclub +6 (2d8+4).', stats: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 } },
    { id: 'giant-spider', category: 'monster', namePl: 'Pająk olbrzymi', cr: '1', race: 'Bestia', tags: ['jaskinia', 'trucizna'], max_hp: 26, armor_class: 14, attacks: 'Ugryzienie +5 (1d8+3 + DC 11 CON 2d8 poison).', abilities: [{ name: 'Web', desc: 'Reakcja lub akcja: DC 12 DEX unik albo unieruchomiony (web).' }], stats: { str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4 } },
    { id: 'harpy', category: 'monster', namePl: 'Harpia', cr: '3', race: 'Monstrosity', tags: ['lot', 'charm'], max_hp: 38, armor_class: 11, attacks: 'Szpony +5 (2d4+3).', abilities: [{ name: 'Luring Song', desc: 'W ciągu 5 m: WIS DC 11 lub charm — idzie w kierunku harpii.' }], stats: { str: 12, dex: 13, con: 12, int: 7, wis: 10, cha: 13 } },
    { id: 'wight', category: 'monster', namePl: 'Wight', cr: '3', race: 'Nieumarły', tags: ['nieumarły', 'life drain'], max_hp: 45, armor_class: 14, attacks: 'Life drain +4 (1d6+2 + max HP −1 do długiej przerwy).', abilities: [{ name: 'Sunlight Sensitivity', desc: 'Utrudnienie w słońcu.' }], stats: { str: 15, dex: 14, con: 16, int: 10, wis: 13, cha: 15 } },
    { id: 'owlbear', category: 'monster', namePl: 'Owlbear', cr: '3', race: 'Monstrosity', tags: ['dzicz', 'bestia'], max_hp: 59, armor_class: 13, attacks: 'Szpony +7 (2d8+5), dziób +7 (1d10+5).', stats: { str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7 } },
    { id: 'minotaur', category: 'monster', namePl: 'Minotaur', cr: '3', race: 'Monstrosity', tags: ['labirynt', 'szarża'], max_hp: 76, armor_class: 14, attacks: 'Topór +6 (2d12+4), rogi +6 (2d10+4).', abilities: [{ name: 'Charge', desc: 'Po 6 m biegu: +2d10 obrażeń rogami, cel STR DC 14 czy powalone.' }], stats: { str: 18, dex: 11, con: 16, int: 6, wis: 16, cha: 9 } },
    { id: 'displacer-beast', category: 'monster', namePl: 'Displacer beast', cr: '3', race: 'Monstrosity', tags: ['iluzja', 'tentacle'], max_hp: 85, armor_class: 15, attacks: 'Macki +6 (1d6+4, dwa ataki).', abilities: [{ name: 'Displacement', desc: 'Ataki na niego z utrudnieniem; po trafieniu znika do końca następnej tury.' }, { name: 'Avoidance', desc: 'DEX sukces na AoE — zero obrażeń.' }], stats: { str: 18, dex: 15, con: 16, int: 6, wis: 12, cha: 8 } },
    { id: 'troll', category: 'monster', namePl: 'Troll', cr: '5', race: 'Olbrzym', tags: ['regeneracja'], max_hp: 84, armor_class: 15, attacks: 'Pazury +7 (2d6+4), dziób +7 (1d8+4).', abilities: [{ name: 'Regeneration', desc: '10 HP/turę; wyłączone przez kwas/ogień.' }], stats: { str: 18, dex: 13, con: 20, int: 7, wis: 9, cha: 7 } },
    { id: 'manticore', category: 'monster', namePl: 'Mantykora', cr: '3', race: 'Monstrosity', tags: ['lot', 'ogon'], max_hp: 68, armor_class: 14, attacks: 'Ugryzienie +5 (1d8+3), ogon +5 (1d10+3 lub 3×kolce 1d6+3).', stats: { str: 17, dex: 16, con: 17, int: 7, wis: 12, cha: 8 } },
    { id: 'banshee', category: 'monster', namePl: 'Banshee', cr: '4', race: 'Nieumarły', tags: ['undead', 'horror'], max_hp: 58, armor_class: 12, abilities: [{ name: 'Horrifying Visage', desc: '30 m: WIS DC 13 lub frightened 1 min.' }, { name: 'Wail', desc: '1/dzień: 9 m — CON DC 13 lub 0 HP (poniżej 100 HP max).' }], stats: { str: 1, dex: 14, con: 10, int: 12, wis: 11, cha: 17 } },
    { id: 'young-red-dragon', category: 'monster', namePl: 'Młody czerwony smok', cr: '10', race: 'Smok', tags: ['smok', 'ogień'], max_hp: 178, armor_class: 18, speed: '12 m, lot 24 m', attacks: 'Pazury +10, dziób +10, ogon +10.', abilities: [{ name: 'Fire Breath', desc: '45 stożek DEX DC 17 — 10d10 fire (recharge 5-6).' }, { name: 'Frightful Presence', desc: '120 m WIS DC 16 lub frightened.' }], stats: { str: 23, dex: 10, con: 21, int: 14, wis: 11, cha: 19 } },

    // ─── Bossowie / legendarne ───
    {
      id: 'vampire-spawn-lord', category: 'monster', namePl: 'Wampir — lord dziedzictwa', cr: '11', race: 'Nieumarły', tags: ['boss', 'wampir', 'legendarny'], legendary: true, legendaryResist: 3,
      max_hp: 187, armor_class: 16, speed: '9 m, wspinaczka 9 m', size: 'Średni',
      description: 'Arystokrata nocy; kontroluje służących i mgłę.',
      attacks: 'Multiattack: 2× szpony +8 (2d6+4) lub ugryzienie +8 (1d6+4 + charm).',
      abilities: [
        { name: 'Regeneracja', desc: '20 HP/turę jeśli nie radiant/ogień.' },
        { name: 'Charm', desc: 'Ugryzienie: WIS DC 17 lub charm 24h.' },
        { name: 'Misty Escape', desc: 'Przy 0 HP (nie radiant/sunlight): forma mgły, ucieka do legowiska.' }
      ],
      legendaryActions: ['Ruch (bez prowokacji)', 'Atak szponami', 'Bite (koszt 2) — leczy za połowę obrażeń'],
      uniqueMechanic: 'Faza krwi: przy 50% HP — raz na walkę przywołuje 1d4+1 vampire spawn (max 4). Gracze w promieniu 3 m: CON DC 15 na początku tury lub 1 poziom wyczerpania (zmęczenie).',
      dmTips: 'Słabość: nie może wejść do domu bez zaproszenia; running water 20 obrażeń.',
      stats: { str: 18, dex: 18, con: 18, int: 17, wis: 15, cha: 18 }
    },
    {
      id: 'beholder-tyrant', category: 'monster', namePl: 'Beholder — oko tyrana', cr: '13', race: 'Aberracja', tags: ['boss', 'beholder', 'legendarny'], legendary: true, legendaryResist: 3,
      max_hp: 180, armor_class: 18, speed: '0 m, lot 6 m', size: 'Duży',
      description: 'Centralne oko i dziesięć promieni; paranoiczny strateg.',
      abilities: [
        { name: 'Antimagic Cone', desc: 'Stożek 45 m przed sobą — strefa bez magii (centralne oko).' },
        { name: 'Eye Rays', desc: '3 losowe promienie/turę (patrz unikalna mechanika).' }
      ],
      legendaryActions: ['Promień losowy (1)', 'Promień losowy (2) — koszt 2', 'Przesuń się 3 m'],
      uniqueMechanic: 'Tabela promieni (k20): 1 Charm, 2 Paralyze, 3 Fear, 4 Disintegrate 10d6+40, 5-6 Enervation 8d8, 7-8 Slow, 9 Telekinetic 3d6, 10 Sleep, 11 Petrify, 12 Death 10d10, 13-14 Confusion, 15-16 Trzy dodatkowe promienie, 17-18 Teleport, 19-20 Przywróć promień martwy.',
      dmTips: 'Gracze mogą użyć osłony przed stożkiem antymagic.',
      stats: { str: 10, dex: 14, con: 18, int: 17, wis: 15, cha: 17 }
    },
    {
      id: 'lich-archmage', category: 'monster', namePl: 'Licze — arcymag', cr: '21', race: 'Nieumarły', tags: ['boss', 'licze', 'legendarny'], legendary: true, legendaryResist: 3,
      max_hp: 135, armor_class: 17, speed: '9 m', size: 'Średni',
      description: 'Nieśmiertelny czarodziej; filakterium gdzieś ukryte.',
      abilities: [
        { name: 'Legendary Resistance', desc: '3/długa przerwa.' },
        { name: 'Rejuvenation', desc: 'W ciągu 1d10 dni odradza się przy filakterium.' },
        { name: 'Paralyzing Touch', desc: '+12 (3d6 cold), CON DC 18 lub paralyzed 1 min.' },
        { name: 'Zaklęcia', desc: 'Wizard 18+ — power word kill, finger of death, counterspell, fly, disintegrate.' }
      ],
      legendaryActions: ['Cantrip', 'Paralyzing Touch (koszt 2)', 'Frightening Gaze (koszt 2)', 'Disrupt Life (koszt 3) — 6d6 necrotic 6 m'],
      lairActions: ['Wizja iluzji', 'Zamrożenie podłogi (DEX save)', 'Przywołanie szkieletów'],
      uniqueMechanic: 'Filakterium: dopóki nie zniszczone — licze wraca po śmierci. W walce 1×/rundę Counterspell bez zużycia slotu (reakcja).',
      dmTips: 'Słabość narracyjna: zniszcz filakterium przed finałem.',
      stats: { str: 11, dex: 16, con: 16, int: 20, wis: 14, cha: 16 }
    },
    {
      id: 'ancient-red-dragon', category: 'monster', namePl: 'Starożytny czerwony smok', cr: '24', race: 'Smok', tags: ['boss', 'smok', 'legendarny'], legendary: true, legendaryResist: 3,
      max_hp: 546, armor_class: 22, speed: '12 m, kopanie 12 m, lot 24 m', size: 'Gargantuan',
      description: 'Pan wulkanów i skarbów; arrogancja i ogień.',
      attacks: 'Multiattack: ugryzienie +17 (2d10+10), pazury +17 (2d6+10), ogon +17 (2d8+10).',
      abilities: [
        { name: 'Fire Breath', desc: '90 stożek DEX DC 24 — 26d6 fire (recharge 5-6).' },
        { name: 'Frightful Presence', desc: '120 m WIS DC 21 lub frightened 1 min.' }
      ],
      legendaryActions: ['Wykrycie', 'Atak ogonem', 'Skrzydło (koszt 2) — 2d6+10 + DEX DC 24 powalenie 4,5 m'],
      lairActions: ['Magma erupt (DEX)', 'Gas vent (CON)', 'Rocks fall'],
      uniqueMechanic: 'Smocza furia: poniżej 25% HP — na koniec tury dodatkowy breath (jeśli naładowany) LUB 2 ataki pazurami. Ognista aura: 3 m — 3d6 fire na wejście/wyjście.',
      stats: { str: 30, dex: 10, con: 30, int: 18, wis: 15, cha: 23 }
    },
    {
      id: 'mind-flayer-colony', category: 'monster', namePl: 'Mind flayer — arcynaczelnik', cr: '15', race: 'Aberracja', tags: ['boss', 'illithid', 'legendarny'], legendary: true, legendaryResist: 2,
      max_hp: 127, armor_class: 15, speed: '9 m', size: 'Średni',
      description: 'Telepatyczny tyran pod miastem.',
      abilities: [
        { name: 'Magic Resistance', desc: 'Przewaga na rzuty obronne vs magia.' },
        { name: 'Mind Blast', desc: 'Stożek 18 m INT DC 16 — 3d8 psychic + stunned 1 min.' },
        { name: 'Extract Brain', desc: 'Na bezbronny cel: natychmiastowa śmierć + odżywienie.' }
      ],
      legendaryActions: ['Mind Blast (koszt 2)', 'Teleport 9 m', 'Tentacle +7 (2d6+4 psychic)'],
      uniqueMechanic: 'Kolonia: na inicjatywie 20 przywołuje 1d2 mind flayerów (raz na walkę) LUB kontroluje umysł jednego gracza (WIS DC 17 — wykonuje 1 akcję przeciw sojusznikom).',
      stats: { str: 11, dex: 12, con: 12, int: 19, wis: 17, cha: 17 }
    },
    {
      id: 'kraken-deep', category: 'monster', namePl: 'Kraken — pan głębin', cr: '23', race: 'Monstrosity', tags: ['boss', 'wodny', 'legendarny'], legendary: true, legendaryResist: 3,
      max_hp: 472, armor_class: 18, speed: '6 m, pływanie 18 m', size: 'Gargantuan',
      description: 'Bóg mórz w ciele potwora.',
      attacks: 'Multiattack: 3× macki +17, dziób +17.',
      abilities: [
        { name: 'Freedom of Movement', desc: 'Ignoruje trudny teren i chwyt.' },
        { name: 'Siege Monster', desc: '2× obrażenia na obiekty.' },
        { name: 'Lightning Storm', desc: '3 błyskawice +14 (4d12 lightning), 3 cele w 36 m.' }
      ],
      legendaryActions: ['Macka', 'Rzut statkiem/celem (koszt 2)', 'Piorun (koszt 3)'],
      uniqueMechanic: 'Przy 0 HP: rozpuszcza się w wodzie — odradza się w 1d10 dni w oceanie. Pod wodą: co turę jeden gracz — STR DC 20 albo grapple + pull 9 m.',
      stats: { str: 30, dex: 11, con: 25, int: 22, wis: 18, cha: 20 }
    },
    {
      id: 'death-knight-avatar', category: 'monster', namePl: 'Death Knight — awatar klątwy', cr: '17', race: 'Nieumarły', tags: ['boss', 'rycerz', 'legendarny'], legendary: true, legendaryResist: 3,
      max_hp: 180, armor_class: 20, speed: '9 m', size: 'Średni',
      description: 'Upadły paladyn w zbroi; aura grozy.',
      attacks: 'Multiattack: 3× longsword +11 (1d8+6 slashing + 1d8 necrotic).',
      abilities: [
        { name: 'Marshal Undead', desc: 'Nieumarli sojusznicy w 18 m +1 atak/rzut obronny.' },
        { name: 'Hellfire Orb', desc: '1/dzień: 6 m promień DEX DC 18 — 8d6 fire + 8d6 necrotic.' },
        { name: 'Zaklęcia paladyna', desc: 'Dispel magic, hold person, animate dead.' }
      ],
      legendaryActions: ['Atak mieczem', 'Hellfire Wave (koszt 2) — linia 18 m 4d6 fire', 'Frighten (koszt 2) WIS DC 18'],
      uniqueMechanic: 'Aura zemsty: gdy gracz trafi krytykiem — death knight reakcją uderza w tego gracza (+11, 1d8+6+1d8 necrotic). Raz na rundę.',
      stats: { str: 20, dex: 11, con: 20, int: 12, wis: 16, cha: 18 }
    },
    {
      id: 'demilich-skull', category: 'monster', namePl: 'Demilich — czaszka zapomnienia', cr: '18', race: 'Nieumarły', tags: ['boss', 'licze', 'legendarny'], legendary: true, legendaryResist: 3,
      max_hp: 80, armor_class: 20, speed: '0 m, lot 9 m', size: 'Mały',
      description: 'Latająca czaszka; unika walki wręcz.',
      abilities: [
        { name: 'Avoidance', desc: 'AoE DEX sukces = 0 obrażeń.' },
        { name: 'Turn Immunity', desc: 'Nie podlega turn undead.' },
        { name: 'Howl', desc: '1/dzień: 9 m — CON DC 15 lub 0 HP (poniżej 100 max HP).' }
      ],
      legendaryActions: ['Flight', 'Cloud of Dust (koszt 2) — 4d8 bludgeoning + blinded', 'Energy Drain (koszt 3) — 3 cele 10d6 necrotic, max HP −'],
      uniqueMechanic: 'Niewrażliwość: odporność na nonmagical physical. Tylko radiant damage z magic weapon ignoruje odporność w pełni. Przy 0 HP: czaszka pęka — dusza ucieka (odrodzenie w 1d10 lat).',
      stats: { str: 1, dex: 20, con: 10, int: 20, wis: 17, cha: 20 }
    },
    {
      id: 'aboleth-overmind', category: 'monster', namePl: 'Aboleth — overmind', cr: '10', race: 'Aberracja', tags: ['boss', 'wodny', 'mind'], legendary: true, legendaryResist: 2,
      max_hp: 150, armor_class: 17, speed: '3 m, pływanie 12 m', size: 'Duży',
      description: 'Pradawny manipulator umysłów pod wodą.',
      attacks: 'Macka +9 (2d6+5 bludgeoning).',
      abilities: [
        { name: 'Mucous Cloud', desc: 'W wodzie: oddycha powietrzem 10 min po kontakcie.' },
        { name: 'Probing Telepathy', desc: 'Zna pragnienia istot w 36 m.' },
        { name: 'Enslave', desc: '3/dzień: WIS DC 14 lub charm do 1d3+1 dni.' }
      ],
      legendaryActions: ['Macka', 'Psychic Pulse (koszt 2) — 4d6 psychic 6 m', 'Illusory Terrain (koszt 2)'],
      uniqueMechanic: 'Przekleństwo aboletha: po kontakcie z graczem — po 1d4 h zaczyna tonąć na lądzie (1 poziom wyczerpania/dzień bez wody). Leczenie remove curse.',
      stats: { str: 21, dex: 9, con: 15, int: 18, wis: 15, cha: 18 }
    },
    {
      id: 'balor-demon', category: 'monster', namePl: 'Balor — demon wojny', cr: '19', race: 'Fiend', tags: ['boss', 'demon', 'legendarny'], legendary: true, legendaryResist: 3,
      max_hp: 262, armor_class: 19, speed: '12 m, lot 18 m', size: 'Duży',
      description: 'Generał Piekieł; płonie i eksploduje.',
      attacks: 'Longsword +14 (3d10+8 slashing + 3d6 fire), whip +14 (5d4+8 slashing + pull 7,5 m).',
      abilities: [
        { name: 'Fire Aura', desc: '1,5 m — 3d6 fire na wejście/wyjście.' },
        { name: 'Death Throes', desc: 'Przy 0 HP: eksplozja 6 m DEX DC 18 — 20d6 fire.' }
      ],
      legendaryActions: ['Atak mieczem', 'Bicz + teleport 12 m (koszt 2)', 'Płomienny skok (koszt 3) — 4d6 fire 6 m'],
      uniqueMechanic: 'Aura strachu: 6 m — WIS DC 17 na wejście lub frightened. Demon nie może umrzeć na Material Plane bez eksplozji — dusza wraca do Abyssu.',
      stats: { str: 26, dex: 15, con: 22, int: 20, wis: 16, cha: 22 }
    },
    {
      id: 'iron-golem-sentinel', category: 'monster', namePl: 'Żelazny golem — strażnik', cr: '16', race: 'Konstrukt', tags: ['boss', 'golem', 'dungeon'], legendary: true, legendaryResist: 2,
      max_hp: 210, armor_class: 20, speed: '9 m', size: 'Duży',
      description: 'Nieustępliwy strażnik skarbca.',
      attacks: 'Sword +13 (3d10+6 slashing), poison breath (recharge 6).',
      abilities: [
        { name: 'Immutable Form', desc: 'Niezmieniany przez zaklęcia zmieniające formę.' },
        { name: 'Magic Resistance', desc: 'Przewaga na rzuty obronne vs magia.' },
        { name: 'Poison Breath', desc: '15 stożek CON DC 19 — 8d8 poison (recharge 6).' }
      ],
      legendaryActions: ['Uderzenie miecza', 'Poison Breath jeśli gotowe (koszt 2)', 'Ruch + blokada drzwi (koszt 1)'],
      uniqueMechanic: 'Słabość kwasu: obrażenia od kwasu są podwojone. Regeneracja wyłączona tylko gdy poniżej 50% HP i co turę otrzymuje kwas — inaczej 5 HP/turę.',
      stats: { str: 24, dex: 9, con: 20, int: 3, wis: 11, cha: 1 }
    },
    { id: 'cult-fanatic', category: 'monster', namePl: 'Fanatyk kultu', cr: '2', race: 'Humanoid', tags: ['kult', 'caster'], max_hp: 33, armor_class: 13, abilities: [{ name: 'Dark Devotion', desc: 'Przewaga vs charm/frightened.' }, { name: 'Spells', desc: 'Command, inflict wounds, hold person.' }], stats: { str: 11, dex: 14, con: 12, int: 10, wis: 14, cha: 13 } },
    { id: 'gnoll-pack', category: 'monster', namePl: 'Gnoll (pack lord)', cr: '2', race: 'Humanoid', tags: ['gnoll', 'pack'], max_hp: 49, armor_class: 15, attacks: 'Bite +4 (1d4+2), glaive +4 (1d10+2).', abilities: [{ name: 'Rampage', desc: 'Po zabiciu: bonus bite.' }], stats: { str: 14, dex: 12, con: 11, int: 6, wis: 10, cha: 7 } },
    { id: 'wraith', category: 'monster', namePl: 'Wraith', cr: '5', race: 'Nieumarły', tags: ['nieumarły', 'incorporeal'], max_hp: 67, armor_class: 13, abilities: [{ name: 'Incorporeal', desc: 'Przechodzi przez obiekty.' }, { name: 'Life Drain', desc: '+6 (4d8+3 necrotic, max HP − do długiej przerwy).' }], stats: { str: 6, dex: 16, con: 16, int: 12, wis: 14, cha: 15 } },
    { id: 'chimera', category: 'monster', namePl: 'Chimera', cr: '6', race: 'Monstrosity', tags: ['lot', 'multi'], max_hp: 114, armor_class: 14, attacks: 'Multi: bite, horns, claws, fire breath 5-6.', abilities: [{ name: 'Fire Breath', desc: '15 stożek DEX DC 15 — 7d8 fire.' }], stats: { str: 19, dex: 11, con: 19, int: 3, wis: 14, cha: 10 } },
    { id: 'stone-giant', category: 'monster', namePl: 'Kamienny olbrzym', cr: '7', race: 'Olbrzym', tags: ['giant', 'rzucanie'], max_hp: 126, armor_class: 17, attacks: 'Rock +9 (4d10+6).', stats: { str: 23, dex: 15, con: 20, int: 10, wis: 12, cha: 9 } },
    { id: 'young-black-dragon', category: 'monster', namePl: 'Młody czarny smok', cr: '7', race: 'Smok', tags: ['smok', 'kwas'], max_hp: 127, armor_class: 19, abilities: [{ name: 'Acid Breath', desc: '30 linia DEX DC 14 — 11d8 acid.' }], stats: { str: 19, dex: 14, con: 17, int: 12, wis: 11, cha: 15 } },
    { id: 'shield-guardian', category: 'monster', namePl: 'Shield guardian', cr: '7', race: 'Konstrukt', tags: ['golem', 'ochrona'], max_hp: 142, armor_class: 17, abilities: [{ name: 'Bound', desc: 'Połączony z amuletem — przekierowuje obrażenia na siebie.' }, { name: 'Regeneration', desc: '10 HP/turę jeśli w promieniu 18 m od twórcy.' }], stats: { str: 18, dex: 8, con: 18, int: 7, wis: 10, cha: 3 } }
  ]
};
