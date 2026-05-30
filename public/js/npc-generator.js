// ===== NPC Generator =====
// Losowy NPC: rasa + imię + zawód + cecha + sekret + wygląd + pragnienie.
// Tabele PL z motywami fantasy (D&D-friendly).
const NpcGenerator = {
  RACE_ICONS: {
    human: '🧑', elf: '🧝', 'half-elf': '🧝‍♀️', dwarf: '⛏️', halfling: '🍀', gnome: '🔧',
    'half-orc': '💪', tiefling: '😈', dragonborn: '🐲', orc: '👹', goblin: '👺'
  },

  TABLES: {
    races: [
      { key: 'human',     label: 'Człowiek' },
      { key: 'elf',       label: 'Elf' },
      { key: 'half-elf',  label: 'Półelf' },
      { key: 'dwarf',     label: 'Krasnolud' },
      { key: 'halfling',  label: 'Niziołek' },
      { key: 'gnome',     label: 'Gnom' },
      { key: 'half-orc',  label: 'Półork' },
      { key: 'tiefling',  label: 'Tiefling' },
      { key: 'dragonborn',label: 'Dracon' },
      { key: 'orc',       label: 'Ork' },
      { key: 'goblin',    label: 'Goblin' }
    ],

    names: {
      human: {
        male: ['Tomasz','Marek','Piotr','Andrzej','Jakub','Kazimierz','Wiesław','Stefan','Henryk','Mikołaj','Dymitr','Bohdan','Jan','Aleksy','Roland','Edmund','Gerald','Wilhelm','Aldous','Cedric'],
        female: ['Anna','Katarzyna','Maria','Helena','Jadwiga','Wanda','Elżbieta','Eleonora','Izabela','Cecylia','Klara','Adelajda','Beatrycze','Genowefa','Władysława','Marlena','Alina','Joanna']
      },
      elf: {
        male: ['Aerendyl','Faelar','Quarion','Thalion','Erevan','Aelar','Galinndan','Hadarai','Heian','Himo','Immeral','Ivellios','Korfel','Lamlis','Mindartis','Naal','Nutae','Paelias','Peren','Riardon'],
        female: ['Adrie','Althaea','Anastrianna','Andraste','Antinua','Bethrynna','Birel','Caelynn','Drusilia','Enna','Felosial','Ielenia','Jelenneth','Keyleth','Leshanna','Lia','Meriele','Mialee','Naivara','Quelenna']
      },
      'half-elf': {
        male: ['Aramil','Aust','Beiro','Carric','Erdan','Galinndan','Heian','Hadarai','Immeral','Lamlis','Mindartis','Paelias','Riardon','Soveliss','Thamior','Tharivol','Theren','Varis'],
        female: ['Adrie','Bethrynna','Caelynn','Drusilia','Felosial','Ielenia','Lia','Meriele','Naivara','Quelenna','Sariel','Shanairra','Theirastra','Thia','Valanthe']
      },
      dwarf: {
        male: ['Adrik','Alberich','Baern','Barendd','Brottor','Bruenor','Dain','Darrak','Delg','Eberk','Einkil','Fargrim','Flint','Gardain','Harbek','Kildrak','Morgran','Orsik','Oskar','Rurik','Taklinn','Thorin','Tordek','Travok','Ulfgar','Veit'],
        female: ['Amber','Artin','Audhild','Bardryn','Diesa','Eldeth','Falkrunn','Gunnloda','Helja','Hlin','Kathra','Kristryd','Mardred','Riswynn','Sannl','Torbera','Torgga','Vistra']
      },
      halfling: {
        male: ['Alton','Ander','Cade','Corrin','Eldon','Errich','Finnan','Garret','Lindal','Lyle','Merric','Milo','Osborn','Perrin','Reed','Roscoe','Wellby'],
        female: ['Andry','Bree','Callie','Cora','Euphemia','Jillian','Kithri','Lavinia','Lidda','Merla','Nedda','Paela','Portia','Seraphina','Shaena','Trym','Vani']
      },
      gnome: {
        male: ['Alston','Boddynock','Burgell','Dimble','Eldon','Erky','Fonkin','Frug','Gerbo','Gimble','Glim','Jebeddo','Kellen','Namfoodle','Roondar','Seebo','Sindri','Warryn','Wrenn','Zook'],
        female: ['Bimpnottin','Breena','Caramip','Carlin','Donella','Duvamil','Ella','Ellyjobell','Lilli','Loopmottin','Mardnab','Nissa','Nyx','Oda','Orla','Roywyn','Shamil','Tana','Waywocket','Zanna']
      },
      'half-orc': {
        male: ['Dench','Feng','Gell','Henk','Holg','Imsh','Keth','Krusk','Mhurren','Ront','Shump','Thokk'],
        female: ['Baggi','Emen','Engong','Kansif','Myev','Neega','Ovak','Ownka','Shautha','Sutha','Vola','Volen','Yevelda']
      },
      tiefling: {
        male: ['Akmenos','Amnon','Barakas','Damakos','Ekemon','Iados','Kairon','Leucis','Melech','Morthos','Pelaios','Skamos','Therai'],
        female: ['Akta','Anakis','Bryseis','Criella','Damaia','Ea','Kallista','Lerissa','Makaria','Nemeia','Orianna','Phelaia','Rieta'],
        surnames: ['Bezgrzeszny','Niezłomny','Wieczność','Mrok','Cień','Otchłań','Cierpienie','Pragnienie','Zguba','Niedola','Łaska']
      },
      dragonborn: {
        male: ['Arjhan','Balasar','Bharash','Donaar','Ghesh','Heskan','Kriv','Medrash','Nadarr','Pandjed','Patrin','Rhogar','Shamash','Shedinn','Tarhun','Torinn'],
        female: ['Akra','Biri','Daar','Farideh','Harann','Havilar','Jheri','Kava','Korinn','Mishann','Nala','Perra','Raiann','Sora','Surina','Thava','Uadjit'],
        clans: ['Clethtinthiallor','Daardendrian','Delmirev','Drachedandion','Fenkenkabradon','Kerrhylon','Kimbatuul','Linxakasendalor','Myastan','Nemmonis','Norixius','Ophinshtalajiir','Prexijandilin','Shestendeliath','Turnuroth','Verthisathurgiesh','Yarjerit']
      },
      orc: {
        male: ['Grom','Bognak','Drog','Karg','Mog','Thrak','Urzog','Vrak','Yark','Zogar','Hrak','Burg'],
        female: ['Vola','Sutha','Engong','Ovak','Yevelda','Myev','Neega','Baggi','Emen','Shautha']
      },
      goblin: {
        male: ['Snik','Krep','Dripp','Gorz','Wibble','Skarn','Zogg','Bilg','Krunk','Pip'],
        female: ['Niksa','Krit','Vibble','Snipp','Tikka','Briga','Zugga','Mirka','Squik']
      }
    },

    professions: [
      'kowal','piekarz','rzeźnik','garbarz','tkacz','szewc','złotnik','jubiler','aptekarz',
      'kupiec','wędrowny handlarz','karczmarz','oberżysta','barman','sługa karczemny','kucharz',
      'farmer','myśliwy','traper','rybak','drwal','górnik','kamieniarz','cieśla','murarz',
      'strażnik miejski','strażnik bramy','najemnik','łowca głów','kapitan straży','żołnierz',
      'kapłan','mnich','minister','wiejski mędrzec','zielarz','znachor','wróżbita','astrolog',
      'mag dworski','uczony','bibliotekarz','skryba','heroldka','poseł','dyplomata',
      'bard wędrowny','minstrel','aktor','akrobata','wróżbiarka karczemna',
      'złodziej','paser','informator','przemytnik','fałszerz','kieszonkowiec',
      'arystokrata','baron','kasztelan','dziedziczka','dyktator gildii',
      'sędzia','adwokat','urzędnik','poborca podatkowy','katarzy więzień',
      'odkrywca','kartograf','archeolog','poszukiwacz skarbów','grobowiec łowca',
      'hodowca koni','kowal podkuwczy','sokolnik','dresator psów','pasterz',
      'matka rodu','niania','służąca w karczmie','lokaj','klucznik',
      'gładiator','mistrz miecza','kapitan żaglowca','korsarz','marynarz','dokarka portowa',
      'czarownica leśna','druidka','szaman plemienny','wioskowy starszy'
    ],

    traits: [
      'mówi szeptem, nawet gdy krzyczy',
      'śmieje się z własnych żartów zanim je opowie',
      'nigdy nie patrzy w oczy',
      'unika dotyku za wszelką cenę',
      'zbyt często bawi się małym amuletem',
      'mówi z ciężkim, niezidentyfikowanym akcentem',
      'pachnie ziołami z lasu',
      'ma wiecznie brudne ręce',
      'zawsze nosi rękawiczki, nawet w upalne dni',
      'mruczy melodię pod nosem',
      'kończy zdania chichotem',
      'ma tik nerwowy w lewym oku',
      'nigdy nie zdejmuje kapelusza',
      'spluwa po każdej obietnicy',
      'cytuje stare przysłowia',
      'krzywi się przy wzmiance o kapłanach',
      'mówi do siebie pod nosem',
      'ma zawsze rumianą twarz',
      'wzdycha co kilka minut',
      'wszystko sprawdza dwa razy',
      'zna wszystkich plotek w okolicy',
      'mówi powoli, jakby ważył każde słowo',
      'gestykuluje przesadnie',
      'co chwilę zerka przez ramię',
      'lubi bardzo mocno parzoną herbatę',
      'pachnie taniem winem',
      'ma siwy pasm we włosach mimo młodego wieku',
      'opowiada o pogodzie do każdego',
      'rzadko mruga',
      'zawsze ma pod ręką nóż do paznokci',
      'nuci kołysankę gdy się denerwuje',
      'ma blizny na knykciach',
      'mówi „prawda?" co kilka zdań',
      'gryzie wargę gdy słucha',
      'lubi pluć pestkami z owoców',
      'nosi za sobą kota / wronę / fretkę',
      'mocno utyka na lewą nogę',
      'głaszcze wąsy/brodę gdy myśli',
      'śpiewa fragmenty pieśni miłosnych',
      'jest ślepy na jedno oko'
    ],

    secrets: [
      'jest poszukiwany w trzech sąsiednich królestwach',
      'kradnie z kasy gildii od miesięcy',
      'jest tajnym członkiem kultu Złej Bogini',
      'ukrywa elficką krew',
      'zabił człowieka pijanego, lat temu — i nikt o tym nie wie',
      'jest podwójnym agentem dla rywala kupca',
      'spotkał smoka i przeżył tylko dzięki dziwnemu paktowi',
      'jest nieżywy od trzech lat — to nieumarły zachowujący pozory',
      'ma ukryte dziecko z nieprawego łoża u arystokraty',
      'znalazł starożytną mapę i ukrywa ją w siennikach',
      'ukrywa potwora w piwnicy karmiąc go resztkami',
      'paktuje z czartem — pozostały trzy lata do zapłaty',
      'jest klonem stworzonym przez maga; oryginał nie żyje',
      'planuje zamordować lokalnego barona',
      'zna lokalizację skarbu starożytnego króla',
      'ma na sobie klątwę zmiany kształtu pełni księżyca',
      'jest informatorem ligi szpiegów',
      'kradnie wspomnienia od śpiących gości',
      'jest w istocie elfem starożytnym, który udaje śmiertelnika',
      'uciekł z więzienia w sąsiednim królestwie',
      'sprzedał duszę za zdrowie umierającej córki',
      'ukrywa rodzinną klątwę — pierworodne dzieci mają znamię diabła',
      'jest jasnowidzącym i zna dzień własnej śmierci',
      'kradnie tożsamości zmarłych podróżnych',
      'rozmawia w snach z duchem zamordowanego brata',
      'utracił rękę w pojedynku, ale ma magiczną protezę',
      'jest podstawioną rolą — prawdziwa osoba zniknęła rok temu',
      'jego dom stoi nad starożytnym grobowcem',
      'codziennie nocą zmienia się w kruka',
      'finansuje rebelię przeciw królowi',
      'sprzedaje dzieci cyrkowi w sąsiednim mieście',
      'jest niewolnikiem demona, którego widzi tylko on',
      'zna prawdziwe imię miejscowego arcymaga'
    ],

    appearance: [
      'wysoki i szczupły, z głęboko osadzonymi oczami',
      'krępy, z szerokimi ramionami i grubymi dłońmi',
      'drobny, z ostrymi rysami twarzy',
      'pulchny, z policzkami jak jabłka',
      'wytatuowany od szyi po nadgarstki',
      'z długimi siwymi włosami zaplecionymi w warkocz',
      'łysy, z bliznę przebiegającą przez ciemię',
      'piegowaty, z gęstymi rudymi włosami',
      'ma oczy o dwóch różnych kolorach',
      'na szyi nosi srebrny medalion z portretem',
      'utykający, z drewnianą laską',
      'z brakującym palcem u lewej dłoni',
      'pachnący goździkami i piwem',
      'oczy jak dwa szafiry, lecz spojrzenie zimne',
      'ma blizny rytualne na policzkach',
      'nosi kosztowne ubranie pokryte plamami',
      'ma siwą skroń, choć twarz wygląda młodo',
      'porusza się jak kot — bezszelestnie',
      'głos głęboki jak grom',
      'głos cienki, niemal dziewczęcy',
      'ma kamienne, ciężkie spojrzenie',
      'nosi ozdobne kolczyki w obu uszach',
      'na czole ma stary znak kowalski',
      'ramiona pokryte gęstym tatuażem run',
      'pożółkłe zęby od fajki',
      'wąs zakręcany do góry'
    ],

    desires: [
      'chce odzyskać rodzinną relikwię',
      'pragnie zemsty na lokalnym arystokracie',
      'szuka zaginionej siostry',
      'pragnie tylko wreszcie odpocząć',
      'marzy o własnej karczmie',
      'chce zostać przyjęty do gildii magów',
      'pragnie zniszczyć kult, który zabił jego rodzinę',
      'szuka bohaterów do wyprawy do podziemi',
      'chce zostać królem swojego małego miasteczka',
      'pragnie poznać prawdę o swoich rodzicach',
      'chce uciec daleko od przeszłości',
      'szuka maga, który zdjąłby z niego klątwę',
      'pragnie spotkać prawdziwego smoka',
      'chce skompletować kolekcję starożytnych monet',
      'pragnie napisać kronikę swojego ludu',
      'chce wreszcie zarobić wystarczająco, by się ożenić',
      'szuka zemsty za zhańbioną siostrę',
      'pragnie zostać wybranym przez bóstwo',
      'chce wyjść z długów wobec gildii złodziei',
      'pragnie zniszczyć dowody swojej zbrodni',
      'szuka kogoś, komu mógłby zaufać',
      'pragnie spokojnej śmierci we śnie'
    ],

    bonds: [
      'lojalny wobec swojego mistrza',
      'kocha sekretnie żonę swojego brata',
      'nienawidzi miasta, w którym mieszka',
      'tęskni za zmarłym dzieckiem',
      'szuka swojego dawnego nauczyciela',
      'jest oddany lokalnemu kościołowi',
      'czuje się dłużnikiem złodzieja, który mu uratował życie',
      'kocha swój zwierzęcy towarzysz nad wszystko',
      'jest zaślepiony patriotyzmem',
      'czuje, że winien jest przysięgę zmarłemu przyjacielowi'
    ],

    flaws: [
      'pije za dużo',
      'zbyt łatwo ulega gniewowi',
      'jest skrajnie skąpy',
      'nigdy nie potrafi powiedzieć „nie"',
      'kłamie nawet w drobiazgach',
      'jest tchórzliwy w obliczu konfliktu',
      'wierzy każdej plotce',
      'paranoidalnie boi się magów',
      'pożycza i nigdy nie oddaje',
      'gardzi biednymi'
    ]
  },

  // ===== Helpers =====
  pick(arr) {
    if (!arr || !arr.length) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  },

  pickRace() {
    return this.pick(this.TABLES.races);
  },

  pickGender() {
    return Math.random() < 0.5 ? 'male' : 'female';
  },

  pickName(raceKey, gender) {
    const namesForRace = this.TABLES.names[raceKey] || this.TABLES.names.human;
    const list = namesForRace[gender] || namesForRace.male;
    let name = this.pick(list);
    if (raceKey === 'tiefling' && namesForRace.surnames) {
      name += ' ' + this.pick(namesForRace.surnames);
    } else if (raceKey === 'dragonborn' && namesForRace.clans) {
      name += ' ' + this.pick(namesForRace.clans);
    } else if (raceKey === 'human') {
      const surnames = ['Kowalski','Nowak','Wiśniewski','Wojtaszek','Kamiński','Lewandowski','Zieliński','Szymański','Woźniak','Dąbrowski','Bednarz','Mlynarski','Strażak','Szewczak','Borowski','Łucznik','Krawiec','Bednarz','Garncarz','Białowłosy','Krzywonos','Trzykrotny','Złotodzierżyciel'];
      if (Math.random() < 0.7) name += ' ' + this.pick(surnames);
    } else if (raceKey === 'dwarf') {
      const clans = ['Kamiennoręki','Złotobrody','Żelaznotop','Skałopiers','Mlotodzierżyciel','Krwawooki','Czarnobrody','Topornik','Cynober','Granitowy'];
      if (Math.random() < 0.7) name += ' ' + this.pick(clans);
    } else if (raceKey === 'halfling') {
      const surnames = ['Słomokwiat','Złotopole','Stokrotka','Borkowicz','Krągłonóżka','Domowy','Słońcowiec','Polnik'];
      if (Math.random() < 0.6) name += ' ' + this.pick(surnames);
    }
    return name;
  },

  generate() {
    const race = this.pickRace();
    const gender = this.pickGender();
    return {
      race,
      gender,
      name: this.pickName(race.key, gender),
      profession: this.pick(this.TABLES.professions),
      trait: this.pick(this.TABLES.traits),
      secret: this.pick(this.TABLES.secrets),
      appearance: this.pick(this.TABLES.appearance),
      desire: this.pick(this.TABLES.desires),
      bond: this.pick(this.TABLES.bonds),
      flaw: this.pick(this.TABLES.flaws),
      age: 18 + Math.floor(Math.random() * 60)
    };
  },

  reroll(npc, field) {
    if (field === 'race') {
      npc.race = this.pickRace();
      npc.name = this.pickName(npc.race.key, npc.gender);
    } else if (field === 'gender') {
      npc.gender = npc.gender === 'male' ? 'female' : 'male';
      npc.name = this.pickName(npc.race.key, npc.gender);
    } else if (field === 'name') {
      npc.name = this.pickName(npc.race.key, npc.gender);
    } else if (field === 'profession') npc.profession = this.pick(this.TABLES.professions);
    else if (field === 'trait') npc.trait = this.pick(this.TABLES.traits);
    else if (field === 'secret') npc.secret = this.pick(this.TABLES.secrets);
    else if (field === 'appearance') npc.appearance = this.pick(this.TABLES.appearance);
    else if (field === 'desire') npc.desire = this.pick(this.TABLES.desires);
    else if (field === 'bond') npc.bond = this.pick(this.TABLES.bonds);
    else if (field === 'flaw') npc.flaw = this.pick(this.TABLES.flaws);
    else if (field === 'age') npc.age = 18 + Math.floor(Math.random() * 60);
    return npc;
  },

  // ===== UI =====
  current: null,

  init() {
  },

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  openTab() {
    document.querySelector('.session-tab[data-panel="npc-generator-panel"]')?.click();
  },

  onPanelActivate() {
    if (!App.currentCampaign) return;
    if (!this.isDm()) {
      showToast('Tylko Mistrz Gry może generować NPC', 'warning');
      return;
    }
    if (!document.getElementById('npc-gen-sheet')) {
      if (!this.current) this.current = this.generate();
      this._renderPanel();
    } else {
      this._renderCard();
    }
    if (typeof DMPanel !== 'undefined') {
      DMPanel.loadNpcs().then(() => this._updateHeaderMeta());
    } else {
      this._updateHeaderMeta();
    }
  },

  open() {
    if (!this.isDm()) {
      showToast('Tylko Mistrz Gry może generować NPC', 'warning');
      return;
    }
    this.openTab();
  },

  _getMount() {
    return document.getElementById('npc-generator-panel-root');
  },

  _npcStats() {
    const npcs = (typeof DMPanel !== 'undefined' && DMPanel._npcCache) ? DMPanel._npcCache : [];
    let monsters = 0;
    let visible = 0;
    npcs.forEach((n) => {
      if (n.is_visible) visible += 1;
      try {
        const meta = JSON.parse(n.stats || '{}');
        if (meta.category === 'monster') monsters += 1;
      } catch (_e) { /* ignore */ }
    });
    return { total: npcs.length, monsters, visible, npcOnly: npcs.length - monsters };
  },

  _panelEyebrow() {
    return 'Kreator mistrza gry';
  },

  _panelSub() {
    const { total, monsters, npcOnly, visible } = this._npcStats();
    if (!total) {
      return 'Brak NPC w kampanii · szablony potworów i losowy kreator poniżej';
    }
    const bits = [`${total} w kampanii`];
    if (npcOnly) bits.push(`${npcOnly} postaci`);
    if (monsters) bits.push(`${monsters} potworów`);
    if (visible !== total) bits.push(`${visible} widocznych dla graczy`);
    return `${bits.join(' · ')} · szablony · kreator losowej tożsamości`;
  },

  _updateHeaderMeta() {
    const brow = document.getElementById('npc-gen-eyebrow');
    const sub = document.getElementById('npc-gen-sub-line');
    if (brow) brow.textContent = this._panelEyebrow();
    if (sub) sub.textContent = this._panelSub();
  },

  _renderPanelHeader() {
    return `
      <header class="dm-feature-header npc-gen-header">
        <span class="dm-feature-header__icon" aria-hidden="true">🎲</span>
        <div class="dm-feature-header__titles">
          <p class="npc-gen-header__eyebrow" id="npc-gen-eyebrow">${escapeHtml(this._panelEyebrow())}</p>
          <h3>Generator NPC</h3>
          <p class="dm-feature-header__sub" id="npc-gen-sub-line">${escapeHtml(this._panelSub())}</p>
        </div>
      </header>`;
  },

  _renderPanel() {
    const mount = this._getMount();
    if (!mount) return;
    mount.innerHTML = `
      <div class="npc-gen-creator npc-gen-creator--panel" role="region" aria-label="Kreator postaci NPC">
        <div class="npc-gen-creator__glow" aria-hidden="true"></div>
        <div class="npc-gen-creator__corners" aria-hidden="true"></div>
        <div class="npc-gen-frame">
          ${this._renderPanelHeader()}
          <div class="npc-gen-scroll">
            <section class="npc-gen-campaign" aria-label="NPC w kampanii">
              <div class="npc-gen-campaign__head">
                <h4 class="npc-gen-campaign__title">🧙 NPC w kampanii</h4>
                <button type="button" id="btn-create-npc" class="btn btn-sm btn-primary">➕ Szablony NPC / Potworów</button>
              </div>
              <p class="npc-gen-campaign__hint sheet-hint">Postacie i potwory zapisane w sesji — widoczność, mapa, inicjatywa.</p>
              <div id="npc-list" class="npc-list npc-gen-campaign-list"></div>
            </section>
            <div class="npc-gen-creator-divider" role="separator">
              <span>Kreator losowej postaci</span>
            </div>
            <nav class="npc-gen-steps" aria-label="Etapy kreacji">
              <span class="npc-gen-step is-active">① Tożsamość</span>
              <span class="npc-gen-step">② Wygląd</span>
              <span class="npc-gen-step">③ Motywacja</span>
              <span class="npc-gen-step npc-gen-step--secret">④ Sekret MG</span>
            </nav>
            <div class="dm-feature-body npc-gen-body" id="npc-gen-body">
              <div class="npc-gen-workspace">
                <aside class="npc-gen-portrait" id="npc-gen-portrait" aria-label="Podgląd postaci"></aside>
                <div class="npc-gen-sheet" id="npc-gen-sheet"></div>
              </div>
            </div>
          </div>
          <footer class="npc-gen-panel-footer">
            <div class="npc-gen-actions">
              <button type="button" class="btn btn-secondary npc-gen-btn-reroll" data-action="reroll-all">🎲 Losuj od nowa</button>
              <button type="button" class="btn btn-secondary" data-action="copy">📋 Kopiuj kartę</button>
              <button type="button" class="btn btn-primary npc-gen-btn-save" data-action="save">✓ Zapisz jako NPC</button>
            </div>
          </footer>
        </div>
      </div>`;

    mount.querySelector('[data-action="reroll-all"]')?.addEventListener('click', () => {
      this.current = this.generate();
      this._renderCard();
    });
    mount.querySelector('[data-action="copy"]')?.addEventListener('click', () => this._copyToClipboard());
    mount.querySelector('[data-action="save"]')?.addEventListener('click', () => this._saveAsNpc());

    this._renderCard();
    const body = mount.querySelector('.npc-gen-body');
    if (body && typeof AISuggest !== 'undefined' && !body.querySelector('.ai-suggest-bar')) {
      AISuggest.attachToElement(body, 'npc_generator', () => ({}), (r) => AISuggest.applyNpcGenerator(r));
    }
    if (typeof DMPanel !== 'undefined') {
      DMPanel.loadNpcs().then(() => this._updateHeaderMeta());
    } else {
      this._updateHeaderMeta();
    }
  },

  _slot(icon, label, field, value, extraClass = '') {
    return `
      <div class="npc-gen-slot ${extraClass}" data-field="${field}">
        <div class="npc-gen-slot__head">
          <span class="npc-gen-slot__icon" aria-hidden="true">${icon}</span>
          <span class="npc-gen-slot__label">${escapeHtml(label)}</span>
          <button type="button" class="npc-gen-slot__roll" data-reroll="${field}" title="Przelosuj ${escapeHtml(label)}">🎲</button>
        </div>
        <div class="npc-gen-slot__value">${escapeHtml(value)}</div>
      </div>`;
  },

  _renderCard() {
    const portrait = document.getElementById('npc-gen-portrait');
    const sheet = document.getElementById('npc-gen-sheet');
    if (!portrait || !sheet || !this.current) return;
    const n = this.current;
    const genderLabel = n.gender === 'male' ? 'Mężczyzna' : 'Kobieta';
    const genderIcon = n.gender === 'male' ? '♂' : '♀';
    const raceIcon = this.RACE_ICONS[n.race.key] || '🧑';

    portrait.innerHTML = `
      <div class="npc-gen-portrait__frame">
        <div class="npc-gen-portrait__aura" aria-hidden="true"></div>
        <div class="npc-gen-portrait__avatar" title="${escapeHtml(n.race.label)}">
          <span class="npc-gen-portrait__race">${raceIcon}</span>
          <span class="npc-gen-portrait__gender">${genderIcon}</span>
        </div>
        <h4 class="npc-gen-portrait__name">${escapeHtml(n.name)}</h4>
        <p class="npc-gen-portrait__title">${escapeHtml(n.profession)}</p>
        <ul class="npc-gen-orbs">
          <li><span class="npc-gen-orb__k">Rasa</span><span class="npc-gen-orb__v">${escapeHtml(n.race.label)}</span></li>
          <li><span class="npc-gen-orb__k">Wiek</span><span class="npc-gen-orb__v">${n.age}</span></li>
          <li><span class="npc-gen-orb__k">Płeć</span><span class="npc-gen-orb__v">${genderLabel}</span></li>
        </ul>
      </div>`;

    sheet.innerHTML = `
      <section class="npc-gen-section" data-section="identity">
        <h5 class="npc-gen-section__title"><span class="npc-gen-section__num">I</span> Tożsamość</h5>
        <div class="npc-gen-slots">
          ${this._slot('👤', 'Imię i nazwisko', 'name', n.name, 'npc-gen-slot--highlight')}
          ${this._slot('🧬', 'Rasa', 'race', n.race.label)}
          ${this._slot(genderIcon, 'Płeć', 'gender', genderLabel)}
          ${this._slot('🎂', 'Wiek', 'age', `${n.age} lat`)}
          ${this._slot('💼', 'Zawód / rola', 'profession', n.profession)}
        </div>
      </section>
      <section class="npc-gen-section" data-section="look">
        <h5 class="npc-gen-section__title"><span class="npc-gen-section__num">II</span> Wygląd i charakter</h5>
        <div class="npc-gen-slots">
          ${this._slot('👁️', 'Wygląd', 'appearance', n.appearance)}
          ${this._slot('✨', 'Cecha wyróżniająca', 'trait', n.trait)}
        </div>
      </section>
      <section class="npc-gen-section" data-section="motivation">
        <h5 class="npc-gen-section__title"><span class="npc-gen-section__num">III</span> Motywacja</h5>
        <div class="npc-gen-slots">
          ${this._slot('💖', 'Pragnienie', 'desire', n.desire)}
          ${this._slot('🔗', 'Więź', 'bond', n.bond)}
          ${this._slot('💢', 'Wada', 'flaw', n.flaw)}
        </div>
      </section>
      <section class="npc-gen-section npc-gen-section--secret" data-section="secret">
        <h5 class="npc-gen-section__title"><span class="npc-gen-section__num">IV</span> Tylko dla MG</h5>
        <div class="npc-gen-slots">
          ${this._slot('🤫', 'Sekret', 'secret', n.secret, 'npc-gen-slot--secret')}
        </div>
      </section>`;

    const root = document.getElementById('npc-gen-body');
    root?.querySelectorAll('[data-reroll]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.reroll(this.current, btn.dataset.reroll);
        this._renderCard();
      });
    });
  },

  _formatForChat() {
    const n = this.current;
    if (!n) return '';
    const genderLabel = n.gender === 'male' ? 'Mężczyzna' : 'Kobieta';
    return [
      `👤 ${n.name}`,
      `🧬 ${n.race.label} · ${genderLabel} · ${n.age} lat`,
      `💼 ${n.profession}`,
      `👁️ Wygląd: ${n.appearance}`,
      `✨ Cecha: ${n.trait}`,
      `💖 Pragnienie: ${n.desire}`,
      `🔗 Więź: ${n.bond}`,
      `💢 Wada: ${n.flaw}`,
      `🤫 Sekret: ${n.secret}`
    ].join('\n');
  },

  async _copyToClipboard() {
    const text = this._formatForChat();
    try {
      await navigator.clipboard.writeText(text);
      showToast('📋 Skopiowano do schowka', 'success');
    } catch (_e) {
      showToast('Nie udało się skopiować', 'error');
    }
  },

  async _saveAsNpc() {
    if (!this.current || !App.currentCampaign) return;
    const n = this.current;
    const genderLabel = n.gender === 'male' ? 'Mężczyzna' : 'Kobieta';
    const notes = [
      `${genderLabel} · ${n.age} lat · ${n.race.label} · ${n.profession}`,
      '',
      `👁️ Wygląd: ${n.appearance}`,
      `✨ Cecha: ${n.trait}`,
      `💖 Pragnienie: ${n.desire}`,
      `🔗 Więź: ${n.bond}`,
      `💢 Wada: ${n.flaw}`,
      '',
      `🤫 SEKRET (tylko MG): ${n.secret}`
    ].join('\n');
    try {
      const npc = await apiFetch(`/campaigns/${App.currentCampaign.id}/npcs`, {
        method: 'POST',
        body: JSON.stringify({
          name: n.name,
          race: n.race.label,
          description: `${n.profession}, ${n.appearance}`,
          notes,
          max_hp: 10,
          current_hp: 10,
          armor_class: 10,
          is_visible: false
        })
      });
      showToast(`💾 Zapisano: ${n.name}`, 'success');
      if (typeof Chat !== 'undefined' && Chat.onNpcCreated) Chat.onNpcCreated(npc);
      if (typeof DMPanel !== 'undefined' && DMPanel.loadNpcs) {
        DMPanel.loadNpcs().then(() => this._updateHeaderMeta());
      }
    } catch (err) {
      showToast(err.message || 'Błąd zapisu', 'error');
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NpcGenerator;
}
