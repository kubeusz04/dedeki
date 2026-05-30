// ===== Calendar / weather / time of day =====
// Faerûn (Calendar of Harptos) i Greyhawk (Common Year) z wpływem na ataki:
// - silny wiatr / burza → utrudnienie ataków dystansowych
// - mocno zaciemnione (noc, gęsta mgła, śnieżyca) → utrudnienie atakującemu, przewaga obrońcy
// - lekko zaciemnione (zmierzch/świt, lekka mgła, deszcz) → utrudnienie na Spostrzegawczość

const WorldState = {
  // ===== Kalendarze =====
  CALENDARS: {
    faerun: {
      label: 'Faerûn (Kalendarz Harptos)',
      epoch: 'DR',
      months: [
        // Każdy miesiąc 30 dni; festiwale wstawiane między miesiące jako pseudo-"month" 31. dnia.
        { key: 'hammer',     name: 'Hammer',     pl: 'Hammer (Głębokozima)', days: 30 },
        // Midwinter — festiwal po Hammer (31. dzień)
        { key: 'alturiak',   name: 'Alturiak',   pl: 'Alturiak (Szpon Zimy)', days: 30 },
        { key: 'ches',       name: 'Ches',       pl: 'Ches (Zachodzącego Słońca)', days: 30 },
        { key: 'tarsakh',    name: 'Tarsakh',    pl: 'Tarsakh (Szpon Burz)', days: 30 },
        // Greengrass — festiwal po Tarsakh
        { key: 'mirtul',     name: 'Mirtul',     pl: 'Mirtul (Roztopów)', days: 30 },
        { key: 'kythorn',    name: 'Kythorn',    pl: 'Kythorn (Czas Kwiatów)', days: 30 },
        { key: 'flamerule',  name: 'Flamerule',  pl: 'Flamerule (Letnie Pływy)', days: 30 },
        // Midsummer — festiwal po Flamerule
        { key: 'eleasis',    name: 'Eleasis',    pl: 'Eleasis (Wysokie Słońce)', days: 30 },
        { key: 'eleint',     name: 'Eleint',     pl: 'Eleint (Wybladzania)', days: 30 },
        // Highharvestide — festiwal po Eleint
        { key: 'marpenoth',  name: 'Marpenoth',  pl: 'Marpenoth (Spadania Liści)', days: 30 },
        { key: 'uktar',      name: 'Uktar',      pl: 'Uktar (Gnicia)', days: 30 },
        // Feast of the Moon — festiwal po Uktar
        { key: 'nightal',    name: 'Nightal',    pl: 'Nightal (Schodzenia)', days: 30 }
      ],
      // Festiwale: po którym miesiącu (0-indexed) i ich nazwy
      festivals: {
        0: 'Midwinter (Festiwal)',
        3: 'Greengrass (Festiwal)',
        6: 'Midsummer (Festiwal)',
        8: 'Highharvestide (Festiwal)',
        10: 'Feast of the Moon (Festiwal)'
      },
      seasonForMonth(m) {
        if ([0, 1, 11].includes(m)) return 'winter';
        if ([2, 3, 4].includes(m))  return 'spring';
        if ([5, 6, 7].includes(m))  return 'summer';
        return 'autumn';
      }
    },
    greyhawk: {
      label: 'Greyhawk (Common Year)',
      epoch: 'CY',
      // 12 miesięcy × 28 dni + 4 festiwale (każdy 7 dni)
      months: [
        { key: 'fireseek',   name: 'Fireseek',   pl: 'Fireseek (Szukaniec Ognia)',   days: 28 },
        { key: 'readying',   name: 'Readying',   pl: 'Readying (Przygotowania)',     days: 28 },
        { key: 'coldeven',   name: 'Coldeven',   pl: 'Coldeven (Zimnego Wieczoru)', days: 28 },
        { key: 'planting',   name: 'Planting',   pl: 'Planting (Sadzenia)',          days: 28 },
        { key: 'flocktime',  name: 'Flocktime',  pl: 'Flocktime (Stadny)',           days: 28 },
        { key: 'wealsun',    name: 'Wealsun',    pl: 'Wealsun (Hojnego Słońca)',     days: 28 },
        { key: 'reaping',    name: 'Reaping',    pl: 'Reaping (Żniw)',               days: 28 },
        { key: 'goodmonth',  name: 'Goodmonth',  pl: 'Goodmonth (Dobry)',            days: 28 },
        { key: 'harvester',  name: 'Harvester',  pl: 'Harvester (Zbieracz)',         days: 28 },
        { key: 'patchwall',  name: 'Patchwall',  pl: 'Patchwall (Łatany Mur)',       days: 28 },
        { key: 'readyreat',  name: "Ready'reat", pl: "Ready'reat (Czas Zaszycia)",   days: 28 },
        { key: 'sunsebb',    name: 'Sunsebb',    pl: 'Sunsebb (Słońca Zwiędłego)',   days: 28 }
      ],
      festivals: {
        '-1': 'Needfest (Święto Potrzeby)',
        2:  'Growfest (Święto Wzrostu)',
        5:  'Richfest (Bogate Święto)',
        8:  'Brewfest (Święto Piwowarów)'
      },
      seasonForMonth(m) {
        if ([0, 1, 11].includes(m)) return 'winter';
        if ([2, 3, 4].includes(m))  return 'spring';
        if ([5, 6, 7].includes(m))  return 'summer';
        return 'autumn';
      }
    },
    gregorian: {
      label: 'Gregoriański (Ziemski)',
      epoch: '',
      months: [
        { key: 'jan', name: 'Styczeń',     pl: 'Styczeń',     days: 31 },
        { key: 'feb', name: 'Luty',        pl: 'Luty',        days: 28 },
        { key: 'mar', name: 'Marzec',      pl: 'Marzec',      days: 31 },
        { key: 'apr', name: 'Kwiecień',    pl: 'Kwiecień',    days: 30 },
        { key: 'may', name: 'Maj',         pl: 'Maj',         days: 31 },
        { key: 'jun', name: 'Czerwiec',    pl: 'Czerwiec',    days: 30 },
        { key: 'jul', name: 'Lipiec',      pl: 'Lipiec',      days: 31 },
        { key: 'aug', name: 'Sierpień',    pl: 'Sierpień',    days: 31 },
        { key: 'sep', name: 'Wrzesień',    pl: 'Wrzesień',    days: 30 },
        { key: 'oct', name: 'Październik', pl: 'Październik', days: 31 },
        { key: 'nov', name: 'Listopad',    pl: 'Listopad',    days: 30 },
        { key: 'dec', name: 'Grudzień',    pl: 'Grudzień',    days: 31 }
      ],
      festivals: {},
      seasonForMonth(m) {
        if ([11, 0, 1].includes(m)) return 'winter';
        if ([2, 3, 4].includes(m))  return 'spring';
        if ([5, 6, 7].includes(m))  return 'summer';
        return 'autumn';
      }
    }
  },

  WEATHER: {
    clear:        { label: 'Czysto',            icon: '☀️', desc: 'Bezchmurne niebo.' },
    cloudy:       { label: 'Pochmurnie',        icon: '⛅', desc: 'Lekko zachmurzone.' },
    overcast:     { label: 'Zachmurzenie',      icon: '☁️', desc: 'Pełne zachmurzenie.' },
    rain:         { label: 'Deszcz',            icon: '🌧️', desc: 'Deszcz utrudnia widoczność.' },
    storm:        { label: 'Burza',             icon: '⛈️', desc: 'Silne opady, błyskawice.' },
    thunderstorm: { label: 'Nawałnica',         icon: '🌩️', desc: 'Pioruny, ulewa, wichura.' },
    snow:         { label: 'Śnieg',             icon: '🌨️', desc: 'Pada śnieg.' },
    blizzard:     { label: 'Śnieżyca',          icon: '❄️', desc: 'Wichurowy śnieg, śmiertelnie zimno.' },
    fog:          { label: 'Mgła',              icon: '🌫️', desc: 'Gęsta mgła ogranicza widoczność.' },
    heatwave:     { label: 'Skwar',             icon: '🥵', desc: 'Upał wyczerpuje organizm.' },
    sandstorm:    { label: 'Burza piaskowa',    icon: '🏜️', desc: 'Wiatr i piasek, niemal zerowa widoczność.' }
  },

  WIND: {
    calm:     { label: 'Bezwietrznie',  beaufort: 0 },
    light:    { label: 'Lekki wiatr',   beaufort: 2 },
    moderate: { label: 'Umiarkowany',   beaufort: 4 },
    strong:   { label: 'Silny',         beaufort: 6 },
    gale:     { label: 'Wichura',       beaufort: 9 }
  },

  TEMPERATURE: {
    arctic:    { label: 'Lodowato',  pl: 'Lodowate (-30°C i niżej)' },
    cold:      { label: 'Zimno',     pl: 'Zimno (poniżej 0°C)' },
    temperate: { label: 'Umiarkowanie', pl: 'Umiarkowanie (5–25°C)' },
    warm:      { label: 'Ciepło',    pl: 'Ciepło (25–35°C)' },
    hot:       { label: 'Gorąco',    pl: 'Gorąco (35–40°C)' },
    scorching: { label: 'Skwar',     pl: 'Skwar (40°C+)' }
  },

  // ===== State =====
  state: null,
  _patchedDice: false,
  AUTO_FLUSH_EVERY_GAME_MINUTES: 10,
  DEFAULT_TIME_SPEED_ID: 'walk',
  /** Prędkość auto-czasu przy ▶ muzyki (minuty gry na 1 sekundę rzeczywistą) */
  TIME_SPEEDS: [
    { id: 'slow', label: '1 — Spokojnie', minutesPerSecond: 0.25, hint: '~15 min gry / min' },
    { id: 'walk', label: '2 — Spacer', minutesPerSecond: 1, hint: '~1 h gry / min' },
    { id: 'travel', label: '3 — Podróż', minutesPerSecond: 6, hint: '~6 h gry / min' },
    { id: 'day', label: '4 — Dzień', minutesPerSecond: 60, hint: '~1 dobę gry / min' },
    { id: 'montage', label: '5 — Montaż', minutesPerSecond: 360, hint: '~6 dni gry / min' }
  ],
  _auto: { timer: null, pendingMinutes: 0, lastWeatherSlot: null },

  _timeSpeedStorageKey() {
    return `dedeki-time-speed-${App.currentCampaign?.id || 'global'}`;
  },

  getTimeSpeedId() {
    const saved = localStorage.getItem(this._timeSpeedStorageKey());
    if (this.TIME_SPEEDS.some((s) => s.id === saved)) return saved;
    return this.DEFAULT_TIME_SPEED_ID;
  },

  getTimeSpeed() {
    return this.TIME_SPEEDS.find((s) => s.id === this.getTimeSpeedId()) || this.TIME_SPEEDS[1];
  },

  getMinutesPerSecond() {
    return this.getTimeSpeed().minutesPerSecond;
  },

  setTimeSpeedId(id) {
    if (!this.TIME_SPEEDS.some((s) => s.id === id)) return;
    localStorage.setItem(this._timeSpeedStorageKey(), id);
    this._renderHud();
    this._refreshPanel();
  },

  init() {
    this._patchDice();
  },

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  onMusicPlaybackChange(isPlaying) {
    if (!this.isDm()) return;
    if (isPlaying) this.startAutoAdvance();
    else this.stopAutoAdvance();
  },

  startAutoAdvance() {
    if (!this.isDm() || !this.state || this._auto.timer) return;
    this._auto.lastWeatherSlot = this._weatherSlotKey(this.state);
    this._auto.timer = setInterval(() => this._onAutoTick(), 1000);
    this._renderHud();
    this._refreshPanel();
  },

  stopAutoAdvance() {
    if (this._auto.timer) {
      clearInterval(this._auto.timer);
      this._auto.timer = null;
    }
    if (this.isDm()) this._flushAutoAdvance();
    this._renderHud();
    this._refreshPanel();
  },

  onLeaveCampaign() {
    this.stopAutoAdvance();
    this._auto.pendingMinutes = 0;
    this._auto.lastWeatherSlot = null;
    this.state = null;
  },

  _weatherSlotKey(st) {
    if (!st) return '';
    return `${st.year}-${st.month_index}-${st.day}-${Math.floor((st.hour * 60 + st.minute) / 360)}`;
  },

  _onAutoTick() {
    if (!this.isDm() || !this.state) return;
    this._auto.pendingMinutes += this.getMinutesPerSecond();
    if (this._auto.pendingMinutes >= this.AUTO_FLUSH_EVERY_GAME_MINUTES) {
      this._flushAutoAdvance();
    } else {
      this._renderHud();
      this._refreshPanel();
    }
  },

  _getDisplayState() {
    if (!this.state) return null;
    if (!this._auto.pendingMinutes) return this.state;
    return { ...this.state, ...this._computeAdvance(this._auto.pendingMinutes) };
  },

  async _flushAutoAdvance() {
    if (!this.isDm() || !this.state) return;
    const delta = this._auto.pendingMinutes;
    if (delta <= 0) return;
    this._auto.pendingMinutes = 0;
    const patch = this._computeAdvance(delta);
    if (this.state.auto_weather) {
      const slot = this._weatherSlotKey(patch);
      if (slot !== this._auto.lastWeatherSlot) {
        Object.assign(patch, this._randomWeatherPatch());
        this._auto.lastWeatherSlot = slot;
      }
    }
    await this.update(patch);
  },

  bindSocketEvents(socket) {
    if (!socket) return;
    socket.on('world-state-update', (data) => {
      if (!App.currentCampaign || data?.campaignId !== App.currentCampaign.id) return;
      const oldState = this.state;
      this.state = this._normalizeClockFields(data.state);
      this._renderHud();
      this._refreshPanel();
      if (oldState) this._announceChange(oldState, data.state);
    });
  },

  async load() {
    if (!App.currentCampaign) return;
    try {
      this.state = this._normalizeClockFields(
        await apiFetch(`/campaigns/${App.currentCampaign.id}/world-state`)
      );
      this._renderHud();
      this._refreshPanel();
      this.syncMusicPlaybackFromCampaign();
    } catch (err) {
      console.error('world-state load', err);
    }
  },

  // ===== Pora dnia =====
  /** HH:MM — zawsze pełne minuty (bez ułamków z auto-czasu). */
  _normalizeClockFields(st) {
    if (!st) return st;
    return {
      ...st,
      hour: Math.min(23, Math.max(0, Math.floor(Number(st.hour)) || 0)),
      minute: Math.min(59, Math.max(0, Math.floor(Number(st.minute)) || 0))
    };
  },

  formatClock(state) {
    const st = state ?? this.state;
    if (!st) return '00:00';
    const totalMins = Math.floor(Number(st.hour) * 60 + Number(st.minute));
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  timeOfDay(state) {
    const h = Math.floor(Number((state ?? this.state)?.hour) ?? 12);
    if (h < 5) return 'night';
    if (h < 7) return 'dawn';
    if (h < 18) return 'day';
    if (h < 20) return 'dusk';
    return 'night';
  },

  timeOfDayMeta(state) {
    const t = this.timeOfDay(state);
    return {
      night: { label: 'Noc',     icon: '🌙' },
      dawn:  { label: 'Świt',    icon: '🌅' },
      day:   { label: 'Dzień',   icon: '☀️' },
      dusk:  { label: 'Zmierzch', icon: '🌇' }
    }[t];
  },

  // ===== Combat effects (5e DMG) =====
  // Zwraca strukturę z modyfikatorami środowiskowymi.
  getEnvironmentalEffects(state) {
    const st = state ?? this._getDisplayState() ?? this.state;
    if (!st) return { rangedDisadvantage: false, lightlyObscured: false, heavilyObscured: false, reasons: [] };
    const t = this.timeOfDay(st);
    const w = st.weather;
    const wind = st.wind;
    const reasons = [];
    let rangedDisadvantage = false;
    let lightlyObscured = false;
    let heavilyObscured = false;

    // Wiatr / burza wpływa na pociski
    if (wind === 'strong' || wind === 'gale' || w === 'storm' || w === 'thunderstorm' || w === 'blizzard' || w === 'sandstorm') {
      rangedDisadvantage = true;
      reasons.push(`silny wiatr/burza — utrudnienie ataku dystansowego`);
    }

    // Mocno zaciemnione = blinded condition wobec celów w środku
    if (w === 'fog' || w === 'blizzard' || w === 'sandstorm') {
      heavilyObscured = true;
      reasons.push(`mocno zaciemnione (${this.WEATHER[w]?.label}) — utrudnienie ataku, cel ma przewagę`);
    }
    if (t === 'night' && (w === 'clear' || w === 'cloudy')) {
      // Noc bez darkvision liczymy jako mocno zaciemnione
      heavilyObscured = true;
      reasons.push(`noc — utrudnienie ataku bez widzenia w ciemności`);
    } else if (t === 'night') {
      heavilyObscured = true;
      reasons.push(`noc + zła pogoda — utrudnienie ataku`);
    }

    // Lekko zaciemnione (perception)
    if (t === 'dawn' || t === 'dusk') {
      lightlyObscured = true;
      reasons.push(`półmrok — utrudnienie testów Spostrzegawczości`);
    }
    if (w === 'rain' || w === 'snow') {
      lightlyObscured = true;
      reasons.push(`opady — utrudnienie testów Spostrzegawczości`);
    }

    return { rangedDisadvantage, lightlyObscured, heavilyObscured, reasons };
  },

  // Czy broń/atak jest dystansowy?
  _isRangedAttack(weapon) {
    if (!weapon) return false;
    if (weapon.range && /^\d+/.test(String(weapon.range))) return true;
    const tags = (weapon.tags || []).map((t) => String(t).toLowerCase());
    if (tags.includes('ranged') || tags.includes('thrown') || tags.includes('dystansowa')) return true;
    if (typeof weapon.normalRange === 'number' && weapon.normalRange > 5) return true;
    return false;
  },

  // ===== Patching Dice =====
  _patchDice() {
    if (this._patchedDice || typeof Dice === 'undefined') return;
    this._patchedDice = true;

    const origExec = Dice.executeWeaponAttack.bind(Dice);
    Dice.executeWeaponAttack = (char, weapon, options = {}) => {
      const env = this.getEnvironmentalEffects();
      const opts = { ...options };
      let envApplied = false;
      if (env.heavilyObscured) {
        opts.forceDisadvantage = true;
        envApplied = true;
      }
      if (this._isRangedAttack(weapon) && env.rangedDisadvantage && !opts.forceDisadvantage) {
        opts.forceDisadvantage = true;
        envApplied = true;
      }
      if (envApplied && typeof showToast === 'function') {
        const reasons = env.reasons.filter((r) => /utrudnienie ataku|wiatr/.test(r));
        if (reasons.length) showToast(`🌦️ Środowisko: ${reasons[0]}`, 'warning');
      }
      return origExec(char, weapon, opts);
    };

    if (typeof Dice.rollSpell === 'function') {
      const origSpell = Dice.rollSpell.bind(Dice);
      Dice.rollSpell = (char, spell, mode) => {
        const env = this.getEnvironmentalEffects();
        if (env.heavilyObscured && mode === 'attack' && typeof showToast === 'function') {
          showToast('🌫️ Mocno zaciemnione — atak czaru z utrudnieniem (RAW)', 'warning');
        }
        return origSpell(char, spell, mode);
      };
    }
  },

  // ===== HUD widget =====
  _renderHud() {
    const root = document.getElementById('world-state-hud');
    if (!root) return;
    const st = this._getDisplayState();
    if (!st) { root.innerHTML = ''; return; }
    const cal = this.CALENDARS[st.calendar_type] || this.CALENDARS.faerun;
    const monthMeta = cal.months[st.month_index] || cal.months[0];
    const tod = this.timeOfDayMeta(st);
    const weatherMeta = this.WEATHER[st.weather] || this.WEATHER.clear;
    const timeStr = this.formatClock(st);
    const env = this.getEnvironmentalEffects(st);
    const warn = env.rangedDisadvantage || env.heavilyObscured ? '⚠️' : '';
    const epoch = cal.epoch ? ` ${cal.epoch}` : '';
    const speed = this.getTimeSpeed();
    const autoBadge = this._auto.timer
      ? `<span class="world-hud-auto" title="Czas leci: ${escapeHtml(speed.label)} (${speed.hint})">⏱️${speed.id === 'walk' ? '' : `<small>${escapeHtml(speed.label.split(' — ')[0])}</small>`}</span>`
      : '';
    root.innerHTML = `
      <button type="button" id="world-state-button" class="world-hud" title="Otwórz zakładkę Kalendarz">
        <span class="world-hud-tod">${tod.icon}</span>
        <span class="world-hud-time">${timeStr}</span>
        <span class="world-hud-date">${monthMeta.pl} ${st.day}, ${st.year}${epoch}</span>
        <span class="world-hud-weather">${weatherMeta.icon}</span>
        ${autoBadge}
        ${warn ? `<span class="world-hud-warn">${warn}</span>` : ''}
      </button>`;
    root.querySelector('#world-state-button').addEventListener('click', () => this.open());
  },

  // ===== Zakładka sesji — Kronika / kalendarz =====
  openTab() {
    document.querySelector('.session-tab[data-panel="world-calendar-panel"]')?.click();
  },

  open() {
    if (!App.currentCampaign) return;
    this.openTab();
  },

  async onPanelActivate() {
    if (!App.currentCampaign) return;
    if (!this.state) await this.load();
    if (!this.state) {
      const mount = this._getMount();
      if (mount) mount.innerHTML = '<p class="chronicle-load-hint">Nie udało się wczytać kroniki kampanii.</p>';
      return;
    }
    this._renderPanel();
  },

  _getMount() {
    return document.getElementById('world-calendar-panel-root');
  },

  _isPanelMounted() {
    return !!document.getElementById('world-state-body');
  },

  _refreshPanel() {
    if (this._isPanelMounted()) this._renderPanelContent();
  },

  _seasonMeta(cal, monthIndex) {
    const season = cal.seasonForMonth(monthIndex ?? 0);
    return {
      winter: { label: 'Zima', icon: '❄️' },
      spring: { label: 'Wiosna', icon: '🌸' },
      summer: { label: 'Lato', icon: '☀️' },
      autumn: { label: 'Jesień', icon: '🍂' }
    }[season] || { label: '—', icon: '📅' };
  },

  _festivalName(cal, monthIndex, day) {
    const fest = cal.festivals?.[monthIndex];
    const month = cal.months[monthIndex];
    if (!fest || !month) return '';
    if (day === month.days) return fest;
    return '';
  },

  _renderPanel() {
    const mount = this._getMount();
    if (!mount) return;
    mount.innerHTML = `
      <div class="chronicle-almanac chronicle-almanac--panel" role="region" aria-label="Kalendarz, pogoda i pora dnia">
        <div class="chronicle-almanac__grain" aria-hidden="true"></div>
        <div class="chronicle-almanac__rings" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <header class="chronicle-almanac__cover">
          <p class="chronicle-almanac__eyebrow">Kronika kampanii</p>
          <h2 class="chronicle-almanac__title">📅 Kalendarz, pogoda i pora dnia</h2>
          <p class="chronicle-almanac__subtitle" id="chronicle-subtitle">Harptos · niebo · wiatr</p>
        </header>
        <div class="chronicle-almanac__body-wrap">
          <div id="world-state-body" class="chronicle-almanac__body"></div>
        </div>
      </div>`;
    this._renderPanelContent();
  },

  _renderPanelContent() {
    const root = document.getElementById('world-state-body');
    if (!root) return;
    const isDm = App.currentCampaign?.role === 'dm';
    const st = this._getDisplayState();
    const cal = this.CALENDARS[this.state.calendar_type] || this.CALENDARS.faerun;
    const monthMeta = cal.months[st.month_index] || cal.months[0];
    const tod = this.timeOfDayMeta(st);
    const weatherMeta = this.WEATHER[st.weather] || this.WEATHER.clear;
    const windMeta = this.WIND[st.wind] || this.WIND.calm;
    const tempMeta = this.TEMPERATURE[st.temperature] || this.TEMPERATURE.temperate;
    const env = this.getEnvironmentalEffects(st);
    const epoch = cal.epoch ? ` ${cal.epoch}` : '';

    const calOptions = Object.entries(this.CALENDARS).map(([k, c]) =>
      `<option value="${k}" ${this.state.calendar_type === k ? 'selected' : ''}>${c.label}</option>`).join('');
    const monthOptions = cal.months.map((m, i) =>
      `<option value="${i}" ${this.state.month_index === i ? 'selected' : ''}>${m.pl}</option>`).join('');
    const weatherOptions = Object.entries(this.WEATHER).map(([k, w]) =>
      `<option value="${k}" ${this.state.weather === k ? 'selected' : ''}>${w.icon} ${w.label}</option>`).join('');
    const windOptions = Object.entries(this.WIND).map(([k, w]) =>
      `<option value="${k}" ${this.state.wind === k ? 'selected' : ''}>${w.label}</option>`).join('');
    const tempOptions = Object.entries(this.TEMPERATURE).map(([k, t]) =>
      `<option value="${k}" ${this.state.temperature === k ? 'selected' : ''}>${t.pl}</option>`).join('');

    const autoRunning = !!this._auto.timer;
    const dmControls = isDm ? `
      <p class="chronicle-dm-title">✒️ Zapisy mistrza — sterowanie czasem</p>
      <div class="ws-auto-hint ${autoRunning ? 'ws-auto-hint--on' : ''}">
        ${autoRunning
          ? `⏱️ Czas leci automatycznie (▶ muzyka) — prędkość: <strong>${escapeHtml(this.getTimeSpeed().label)}</strong>. Pauza zatrzymuje zegar.`
          : '▶ Włącz muzykę kampanii — kalendarz, pora dnia i (opcjonalnie) pogoda będą się same przesuwać.'}
      </div>
      <fieldset class="ws-fieldset">
        <legend>Sterowanie czasem</legend>
        <div class="ws-time-buttons">
          <button class="btn btn-sm btn-secondary" data-advance="6">+6 minut</button>
          <button class="btn btn-sm btn-secondary" data-advance="60">+1 godz</button>
          <button class="btn btn-sm btn-secondary" data-advance="360">+6 godz</button>
          <button class="btn btn-sm btn-secondary" data-advance="1440">+1 dzień</button>
          <button class="btn btn-sm btn-secondary" data-advance="10080">+1 tydzień</button>
          <button class="btn btn-sm btn-warning" data-advance="-60">−1 godz</button>
        </div>
      </fieldset>
      <fieldset class="ws-fieldset">
        <legend>Ustawienia</legend>
        <div class="ws-grid">
          <div class="qe-row"><label>Kalendarz</label><select data-set="calendar_type">${calOptions}</select></div>
          <div class="qe-row"><label>Rok</label><input type="number" data-set="year" value="${this.state.year}"></div>
          <div class="qe-row"><label>Miesiąc</label><select data-set="month_index">${monthOptions}</select></div>
          <div class="qe-row"><label>Dzień</label><input type="number" min="1" max="${monthMeta.days}" data-set="day" value="${this.state.day}"></div>
          <div class="qe-row"><label>Godzina</label><input type="number" min="0" max="23" data-set="hour" value="${this.state.hour}"></div>
          <div class="qe-row"><label>Minuta</label><input type="number" min="0" max="59" data-set="minute" value="${this.state.minute}"></div>
          <div class="qe-row"><label>Pogoda</label><select data-set="weather">${weatherOptions}</select></div>
          <div class="qe-row"><label>Wiatr</label><select data-set="wind">${windOptions}</select></div>
          <div class="qe-row"><label>Temperatura</label><select data-set="temperature">${tempOptions}</select></div>
        </div>
        <div class="ws-quick">
          <button class="btn btn-sm btn-secondary" data-quick-weather>🎲 Losowa pogoda dla pory roku</button>
          <label class="ws-auto-weather-label">
            <input type="checkbox" data-set="auto_weather" ${this.state.auto_weather ? 'checked' : ''}>
            Losuj pogodę co ~6 h gry (przy ▶ muzyki)
          </label>
        </div>
        <div class="qe-row" style="margin-top:8px;">
          <label>Notatki MG</label>
          <textarea data-set="notes" rows="3" maxlength="4000">${escapeHtml(this.state.notes)}</textarea>
        </div>
      </fieldset>
    ` : '';

    const season = this._seasonMeta(cal, st.month_index);
    const festival = this._festivalName(cal, st.month_index, st.day);
    const subtitle = document.getElementById('chronicle-subtitle');
    if (subtitle) {
      subtitle.textContent = `${cal.label.replace(/\s*\(.*\)\s*/, '')} · ${season.label} · ${tod.label.toLowerCase()}`;
    }

    root.innerHTML = `
      <div class="chronicle-spread">
        <section class="chronicle-page chronicle-page--date" aria-label="Data">
          <div class="chronicle-page__corner chronicle-page__corner--tl" aria-hidden="true"></div>
          <div class="chronicle-page__corner chronicle-page__corner--br" aria-hidden="true"></div>
          <p class="chronicle-page__label">Dzień w kalendarzu</p>
          <div class="chronicle-day-seal">
            <span class="chronicle-day-seal__num">${st.day}</span>
            <span class="chronicle-day-seal__ring" aria-hidden="true"></span>
          </div>
          <h3 class="chronicle-month">${escapeHtml(monthMeta.pl)}</h3>
          <p class="chronicle-year">${st.year}${escapeHtml(epoch)}</p>
          <p class="chronicle-season">${season.icon} ${season.label}</p>
          ${festival ? `<p class="chronicle-festival">🎭 ${escapeHtml(festival)}</p>` : ''}
        </section>

        <section class="chronicle-page chronicle-page--sky" aria-label="Czas i pogoda">
          <div class="chronicle-page__corner chronicle-page__corner--tl" aria-hidden="true"></div>
          <div class="chronicle-page__corner chronicle-page__corner--br" aria-hidden="true"></div>
          <div class="chronicle-sky-dial chronicle-sky-dial--${this.timeOfDay(st)}" aria-hidden="true">
            <span class="chronicle-sky-dial__arc"></span>
            <span class="chronicle-sky-dial__sun">${tod.icon}</span>
          </div>
          <p class="chronicle-page__label">Pora dnia</p>
          <p class="chronicle-clock">${this.formatClock(st)}</p>
          <div id="chronicle-time-speed-wrap" class="chronicle-time-speed"></div>
          <p class="chronicle-tod">${tod.icon} ${tod.label}</p>
          <hr class="chronicle-ink-rule">
          <p class="chronicle-page__label">Pogoda</p>
          <div class="chronicle-weather-plate">
            <span class="chronicle-weather-plate__icon">${weatherMeta.icon}</span>
            <div>
              <p class="chronicle-weather-plate__name">${escapeHtml(weatherMeta.label)}</p>
              <p class="chronicle-weather-plate__meta">${escapeHtml(windMeta.label)} · ${escapeHtml(tempMeta.pl)}</p>
            </div>
          </div>
          <p class="chronicle-weather-desc">${escapeHtml(weatherMeta.desc)}</p>
        </section>

        <section class="chronicle-page chronicle-page--lore" aria-label="Wpływ na grę">
          <div class="chronicle-page__corner chronicle-page__corner--tl" aria-hidden="true"></div>
          <div class="chronicle-page__corner chronicle-page__corner--br" aria-hidden="true"></div>
          <p class="chronicle-page__label">Zapiski kronikarza</p>
          ${env.reasons.length
            ? `<div class="chronicle-effects ws-effects">
                <strong>🎯 Wpływ na walkę / testy</strong>
                <ul>${env.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
              </div>`
            : '<div class="chronicle-effects chronicle-effects--clear ws-effects ws-effects-none">Brak wpływu środowiska na rzuty.</div>'}
          ${this.state.notes
            ? `<div class="chronicle-notes ws-notes"><strong>📝 Notatki MG</strong><p>${escapeHtml(this.state.notes).replace(/\n/g, '<br>')}</p></div>`
            : '<p class="chronicle-notes-empty">Brak notatek MG do tej pory.</p>'}
        </section>
      </div>
      ${isDm ? `<div class="chronicle-dm-scroll">${dmControls}</div>` : `
        <p class="chronicle-player-hint">Tylko MG może zmieniać datę, pogodę i czas. Obserwujesz kronikę na żywo z resztą drużyny.</p>`}
    `;

    this._renderTimeSpeedUi();
    if (isDm) this._bindDmControls(root);
  },

  _renderTimeSpeedUi() {
    const wrap = document.getElementById('chronicle-time-speed-wrap');
    if (!wrap) return;
    if (!this.isDm()) {
      wrap.innerHTML = '';
      wrap.classList.add('chronicle-time-speed--hidden');
      return;
    }
    wrap.classList.remove('chronicle-time-speed--hidden');
    const active = this.getTimeSpeedId();
    const buttons = this.TIME_SPEEDS.map((s, i) =>
      `<button type="button" class="btn btn-xs chronicle-speed-pick ${active === s.id ? 'btn-primary' : 'btn-secondary'}" data-time-speed="${s.id}" title="${escapeHtml(s.label)} — ${escapeHtml(s.hint)}">${i + 1}</button>`
    ).join('');
    wrap.innerHTML = `
      <span class="chronicle-speed-label">⏱ Tempo sesji</span>
      <div class="chronicle-speed-row">${buttons}</div>
      <p class="chronicle-speed-hint">Aktywna: ${escapeHtml(this.getTimeSpeed().hint)}</p>`;
  },

  _bindDmControls(root) {
    root.querySelectorAll('[data-advance]').forEach((b) => {
      b.addEventListener('click', () => this.advanceMinutes(parseInt(b.dataset.advance, 10)));
    });
    root.querySelectorAll('[data-set]').forEach((el) => {
      el.addEventListener('change', () => {
        const field = el.dataset.set;
        let val;
        if (el.type === 'checkbox') val = el.checked;
        else if (el.type === 'number') val = parseInt(el.value, 10);
        else val = el.value;
        this.update({ [field]: val });
      });
    });
    root.querySelector('[data-quick-weather]')?.addEventListener('click', () => this.randomizeWeather());
    root.querySelectorAll('[data-time-speed]').forEach((b) => {
      b.addEventListener('click', () => this.setTimeSpeedId(b.dataset.timeSpeed));
    });
  },

  // ===== Time advancement =====
  _computeAdvance(deltaMinutes) {
    const base = this.state;
    if (!base) return {};
    let mins = Math.floor(Number(base.hour) * 60 + Number(base.minute) + deltaMinutes);
    let dayDelta = Math.floor(mins / 1440);
    if (mins < 0) {
      dayDelta = Math.floor(mins / 1440);
      mins = ((mins % 1440) + 1440) % 1440;
    } else {
      mins = mins % 1440;
    }
    const hour = Math.floor(mins / 60);
    const minute = Math.floor(mins % 60);

    let { day, month_index, year, calendar_type } = base;
    const cal = this.CALENDARS[calendar_type] || this.CALENDARS.faerun;
    day += dayDelta;
    while (day > cal.months[month_index].days) {
      day -= cal.months[month_index].days;
      month_index += 1;
      if (month_index >= cal.months.length) { month_index = 0; year += 1; }
    }
    while (day < 1) {
      month_index -= 1;
      if (month_index < 0) { month_index = cal.months.length - 1; year -= 1; }
      day += cal.months[month_index].days;
    }
    return { hour, minute, day, month_index, year };
  },

  async advanceMinutes(deltaMinutes) {
    if (!this.state) return;
    await this.update(this._computeAdvance(deltaMinutes));
  },

  _randomWeatherPatch() {
    const cal = this.CALENDARS[this.state?.calendar_type] || this.CALENDARS.faerun;
    const season = cal.seasonForMonth(this.state?.month_index ?? 0);
    const tables = {
      winter: { weather: ['clear','cloudy','overcast','snow','snow','blizzard','fog'], wind: ['calm','light','moderate','strong'], temperature: ['arctic','cold','cold','cold','temperate'] },
      spring: { weather: ['clear','clear','cloudy','rain','rain','storm','fog'], wind: ['calm','light','moderate'], temperature: ['cold','temperate','temperate','warm'] },
      summer: { weather: ['clear','clear','clear','cloudy','rain','thunderstorm','heatwave'], wind: ['calm','calm','light','moderate'], temperature: ['warm','warm','hot','scorching'] },
      autumn: { weather: ['clear','cloudy','overcast','rain','rain','storm','fog'], wind: ['calm','light','moderate','strong'], temperature: ['temperate','cold','cold'] }
    };
    const table = tables[season] || tables.spring;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    return { weather: pick(table.weather), wind: pick(table.wind), temperature: pick(table.temperature) };
  },

  randomizeWeather() {
    if (!this.state) return;
    this.update(this._randomWeatherPatch());
  },

  async update(patch) {
    if (!App.currentCampaign) return;
    try {
      const payload = { ...patch };
      if (payload.auto_weather !== undefined) payload.auto_weather = !!payload.auto_weather;
      this.state = this._normalizeClockFields(await apiFetch(`/campaigns/${App.currentCampaign.id}/world-state`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      }));
      this._renderHud();
      this._refreshPanel();
    } catch (e) {
      showToast(e.message || 'Błąd', 'error');
    }
  },

  syncMusicPlaybackFromCampaign() {
    if (typeof CampaignMusic === 'undefined' || !this.isDm()) return;
    this.onMusicPlaybackChange(!!CampaignMusic.playback?.isPlaying);
  },

  _formatCombatImpactForChat(state) {
    const env = this.getEnvironmentalEffects(state);
    if (!env.reasons.length) return 'Brak wpływu środowiska na rzuty.';
    return env.reasons.map((r) => `• ${r}`).join('\n');
  },

  _postWeatherToChat(state) {
    if (typeof Chat === 'undefined' || !state) return;
    const w = this.WEATHER[state.weather] || this.WEATHER.clear;
    const wind = this.WIND[state.wind] || this.WIND.calm;
    const temp = this.TEMPERATURE[state.temperature] || this.TEMPERATURE.temperate;
    const impact = this._formatCombatImpactForChat(state);
    Chat.addSystemMessage({
      type: 'weather',
      content: `Pogoda: ${w.icon} ${w.label} · ${wind.label} · ${temp.pl}\n🎯 Wpływ na walkę / testy:\n${impact}`
    });
  },

  _announceChange(oldState, newState) {
    const envChanged =
      oldState.weather !== newState.weather ||
      oldState.wind !== newState.wind ||
      oldState.temperature !== newState.temperature;
    if (envChanged) this._postWeatherToChat(newState);

    if (this._timeOfDayFromHour(oldState.hour) !== this._timeOfDayFromHour(newState.hour)) {
      const tod = this.timeOfDayMeta(newState);
      showToast(`${tod.icon} ${tod.label}`, 'info');
    }
  },

  _timeOfDayFromHour(h) {
    if (h < 5) return 'night';
    if (h < 7) return 'dawn';
    if (h < 18) return 'day';
    if (h < 20) return 'dusk';
    return 'night';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorldState;
}
