// Theme presets + custom theme editor
// All theme variables map to CSS custom properties used across the app.
// `book-leather` drives body backgrounds, `parchment-gradient` drives card / panel backgrounds,
// and `parchment-shadow` provides the inset frame on parchment-styled containers.
const Themes = {
  STORAGE_KEY: 'roll1-theme',
  STORAGE_CUSTOM: 'roll1-theme-custom',

  PRESETS: [
    {
      id: 'parchment',
      name: '🏰 Pergamin (klasyczny)',
      desc: 'Stara księga fantasy, ciepłe brązy i złoto.',
      vars: {
        '--bg-dark': '#141008',
        '--bg-darker': '#1a120c',
        '--bg-card': '#e9dcc4',
        '--bg-card-hover': '#dfd0b4',
        '--bg-input': '#d9c9a8',
        '--bg-surface': '#e4d6bc',
        '--text-primary': '#1a1008',
        '--text-secondary': '#4a3828',
        '--text-muted': '#6b5540',
        '--text-on-accent': '#f8f0e4',
        '--text-on-parchment': '#1a1008',
        '--accent-primary': '#7a3018',
        '--accent-primary-hover': '#5c2412',
        '--accent-secondary': '#3d5248',
        '--accent-secondary-hover': '#2d3d36',
        '--accent-gold': '#b8860b',
        '--accent-gold-light': '#d4af37',
        '--accent-red': '#8b2500',
        '--accent-red-hover': '#6e1e00',
        '--accent-green': '#3d5c34',
        '--accent-green-hover': '#2e4628',
        '--accent-ink': '#2a1810',
        '--border-color': '#5c4030',
        '--border-light': '#8a6848',
        '--border-ornate': '#6b4a2a',
        '--focus-ring': 'rgba(184, 134, 11, 0.35)',
        '--tint-primary': 'rgba(122, 48, 24, 0.14)',
        '--tint-gold': 'rgba(184, 134, 11, 0.16)',
        '--tint-secondary': 'rgba(61, 82, 72, 0.14)',
        '--tint-green': 'rgba(61, 92, 52, 0.14)',
        '--parchment-gradient': 'linear-gradient(168deg, #f4ead4 0%, #ebe0c8 18%, #e2d4b8 42%, #d9c9a8 68%, #e8dcc4 100%)',
        '--book-leather': 'radial-gradient(ellipse 100% 60% at 50% -10%, rgba(120, 80, 40, 0.35) 0%, transparent 55%), radial-gradient(ellipse 80% 50% at 50% 110%, rgba(0, 0, 0, 0.45) 0%, transparent 50%), linear-gradient(175deg, #181008 0%, #2a1c12 30%, #342418 50%, #241810 75%, #141008 100%)',
        '--parchment-shadow': 'inset 0 0 0 1px rgba(255, 248, 230, 0.45), inset 0 0 48px rgba(101, 67, 33, 0.1), 0 2px 0 rgba(60, 40, 20, 0.2), 0 8px 24px rgba(0, 0, 0, 0.35)',
      }
    },
    {
      id: 'midnight',
      name: '🌙 Północ',
      desc: 'Ciemne granaty i fiolet, akcent srebrny.',
      vars: {
        '--bg-dark': '#080a14',
        '--bg-darker': '#04060e',
        '--bg-card': '#1a1d2e',
        '--bg-card-hover': '#22253a',
        '--bg-input': '#161929',
        '--bg-surface': '#1d2032',
        '--text-primary': '#e8eaf8',
        '--text-secondary': '#a8aac8',
        '--text-muted': '#7a7d99',
        '--text-on-accent': '#ffffff',
        '--text-on-parchment': '#e8eaf8',
        '--accent-primary': '#5a4fcf',
        '--accent-primary-hover': '#7066e3',
        '--accent-secondary': '#3a4670',
        '--accent-secondary-hover': '#4a5688',
        '--accent-gold': '#c0c4e8',
        '--accent-gold-light': '#e0e3ff',
        '--accent-red': '#c84860',
        '--accent-red-hover': '#a83a50',
        '--accent-green': '#4a9d6f',
        '--accent-green-hover': '#3a8059',
        '--accent-ink': '#0a0e1c',
        '--border-color': '#363a55',
        '--border-light': '#4a4f70',
        '--border-ornate': '#5560a0',
        '--focus-ring': 'rgba(192, 196, 232, 0.4)',
        '--tint-primary': 'rgba(90, 79, 207, 0.18)',
        '--tint-gold': 'rgba(192, 196, 232, 0.14)',
        '--tint-secondary': 'rgba(58, 70, 112, 0.2)',
        '--tint-green': 'rgba(74, 157, 111, 0.16)',
        '--parchment-gradient': 'linear-gradient(168deg, #232842 0%, #1f2438 28%, #1a1d2e 58%, #1d2034 100%)',
        '--book-leather': 'radial-gradient(ellipse 100% 60% at 50% -10%, rgba(90, 79, 207, 0.25) 0%, transparent 55%), radial-gradient(ellipse 80% 50% at 50% 110%, rgba(0, 0, 0, 0.55) 0%, transparent 50%), linear-gradient(175deg, #060a16 0%, #0a0f22 30%, #101632 50%, #0a0f22 75%, #060a16 100%)',
        '--parchment-shadow': 'inset 0 0 0 1px rgba(160, 168, 232, 0.18), inset 0 0 48px rgba(20, 24, 60, 0.4), 0 2px 0 rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.55)',
      }
    },
    {
      id: 'forest',
      name: '🌲 Bór',
      desc: 'Głęboka zieleń i ziemia, akcent miedziany.',
      vars: {
        '--bg-dark': '#0a0f08',
        '--bg-darker': '#060a04',
        '--bg-card': '#1c2818',
        '--bg-card-hover': '#243522',
        '--bg-input': '#172115',
        '--bg-surface': '#1f2c1b',
        '--text-primary': '#e0e8d8',
        '--text-secondary': '#a8b09a',
        '--text-muted': '#7a8270',
        '--text-on-accent': '#fff8e8',
        '--text-on-parchment': '#e0e8d8',
        '--accent-primary': '#8b5a2b',
        '--accent-primary-hover': '#a76e36',
        '--accent-secondary': '#3a5530',
        '--accent-secondary-hover': '#4a6a3e',
        '--accent-gold': '#c8a45e',
        '--accent-gold-light': '#e6c280',
        '--accent-red': '#a64a3a',
        '--accent-red-hover': '#8a3a2c',
        '--accent-green': '#5a8b3a',
        '--accent-green-hover': '#446b2a',
        '--accent-ink': '#0c1408',
        '--border-color': '#3a4a32',
        '--border-light': '#5a6a52',
        '--border-ornate': '#6a7556',
        '--focus-ring': 'rgba(200, 164, 94, 0.32)',
        '--tint-primary': 'rgba(139, 90, 43, 0.18)',
        '--tint-gold': 'rgba(200, 164, 94, 0.16)',
        '--tint-secondary': 'rgba(58, 85, 48, 0.2)',
        '--tint-green': 'rgba(90, 139, 58, 0.18)',
        '--parchment-gradient': 'linear-gradient(168deg, #243524 0%, #1f2f1c 28%, #1a2818 58%, #1d2c1a 100%)',
        '--book-leather': 'radial-gradient(ellipse 100% 60% at 50% -10%, rgba(139, 90, 43, 0.3) 0%, transparent 55%), radial-gradient(ellipse 80% 50% at 50% 110%, rgba(0, 0, 0, 0.55) 0%, transparent 50%), linear-gradient(175deg, #060a04 0%, #0e1808 30%, #142210 50%, #0e1808 75%, #060a04 100%)',
        '--parchment-shadow': 'inset 0 0 0 1px rgba(200, 164, 94, 0.22), inset 0 0 48px rgba(20, 30, 14, 0.4), 0 2px 0 rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.5)',
      }
    },
    {
      id: 'blood-moon',
      name: '🩸 Krwawy Księżyc',
      desc: 'Czerń i głęboka czerwień — klimat horror / nekromancji.',
      vars: {
        '--bg-dark': '#0c0606',
        '--bg-darker': '#080202',
        '--bg-card': '#1c0e0e',
        '--bg-card-hover': '#241414',
        '--bg-input': '#180a0a',
        '--bg-surface': '#1f1010',
        '--text-primary': '#f0d8d4',
        '--text-secondary': '#b89890',
        '--text-muted': '#806860',
        '--text-on-accent': '#fff0e8',
        '--text-on-parchment': '#f0d8d4',
        '--accent-primary': '#9a2424',
        '--accent-primary-hover': '#b83030',
        '--accent-secondary': '#5a2828',
        '--accent-secondary-hover': '#6e3030',
        '--accent-gold': '#c46060',
        '--accent-gold-light': '#e08080',
        '--accent-red': '#d4453a',
        '--accent-red-hover': '#b8362e',
        '--accent-green': '#4a7a4a',
        '--accent-green-hover': '#386038',
        '--accent-ink': '#0c0303',
        '--border-color': '#4a1e1e',
        '--border-light': '#6a3030',
        '--border-ornate': '#7a3a3a',
        '--focus-ring': 'rgba(196, 96, 96, 0.4)',
        '--tint-primary': 'rgba(154, 36, 36, 0.2)',
        '--tint-gold': 'rgba(196, 96, 96, 0.16)',
        '--tint-secondary': 'rgba(90, 40, 40, 0.18)',
        '--tint-green': 'rgba(74, 122, 74, 0.14)',
        '--parchment-gradient': 'linear-gradient(168deg, #2a1414 0%, #251010 28%, #1f0c0c 58%, #240e0e 100%)',
        '--book-leather': 'radial-gradient(ellipse 100% 60% at 50% -10%, rgba(154, 36, 36, 0.3) 0%, transparent 55%), radial-gradient(ellipse 80% 50% at 50% 110%, rgba(0, 0, 0, 0.6) 0%, transparent 50%), linear-gradient(175deg, #080202 0%, #1a0808 30%, #220c0c 50%, #160606 75%, #080202 100%)',
        '--parchment-shadow': 'inset 0 0 0 1px rgba(196, 96, 96, 0.2), inset 0 0 48px rgba(40, 8, 8, 0.5), 0 2px 0 rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.6)',
      }
    },
    {
      id: 'cyber',
      name: '🔵 Cyber',
      desc: 'Futurystyczna stal i neon — dla sci-fi / cyberpunk.',
      vars: {
        '--bg-dark': '#06080c',
        '--bg-darker': '#020306',
        '--bg-card': '#10161e',
        '--bg-card-hover': '#161e28',
        '--bg-input': '#0c1218',
        '--bg-surface': '#121a24',
        '--text-primary': '#d4f0ff',
        '--text-secondary': '#8aa8c0',
        '--text-muted': '#5a7088',
        '--text-on-accent': '#000c10',
        '--text-on-parchment': '#d4f0ff',
        '--accent-primary': '#00b4ff',
        '--accent-primary-hover': '#30c8ff',
        '--accent-secondary': '#1a3a55',
        '--accent-secondary-hover': '#264e70',
        '--accent-gold': '#00ffd4',
        '--accent-gold-light': '#5cffe8',
        '--accent-red': '#ff3a5c',
        '--accent-red-hover': '#e02448',
        '--accent-green': '#00ff88',
        '--accent-green-hover': '#00cc6c',
        '--accent-ink': '#000408',
        '--border-color': '#1e3a5c',
        '--border-light': '#2a5688',
        '--border-ornate': '#00b4ff',
        '--focus-ring': 'rgba(0, 180, 255, 0.4)',
        '--tint-primary': 'rgba(0, 180, 255, 0.16)',
        '--tint-gold': 'rgba(0, 255, 212, 0.14)',
        '--tint-secondary': 'rgba(26, 58, 85, 0.22)',
        '--tint-green': 'rgba(0, 255, 136, 0.12)',
        '--parchment-gradient': 'linear-gradient(168deg, #182838 0%, #122230 28%, #0e1c28 58%, #122030 100%)',
        '--book-leather': 'radial-gradient(ellipse 100% 60% at 50% -10%, rgba(0, 180, 255, 0.18) 0%, transparent 55%), radial-gradient(ellipse 80% 50% at 50% 110%, rgba(0, 0, 0, 0.65) 0%, transparent 50%), linear-gradient(175deg, #020306 0%, #060c14 30%, #0a1422 50%, #060c14 75%, #020306 100%)',
        '--parchment-shadow': 'inset 0 0 0 1px rgba(0, 180, 255, 0.22), inset 0 0 48px rgba(0, 30, 60, 0.5), 0 0 24px rgba(0, 180, 255, 0.08), 0 2px 0 rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.6)',
      }
    },
    {
      id: 'solar',
      name: '☀️ Solar (jasny)',
      desc: 'Jasne tło, lekki dla dziennego użytku.',
      vars: {
        '--bg-dark': '#f0eadc',
        '--bg-darker': '#e8dfcc',
        '--bg-card': '#fbf6ec',
        '--bg-card-hover': '#f3ecdc',
        '--bg-input': '#fdf9f0',
        '--bg-surface': '#f8f2e4',
        '--text-primary': '#2c1f10',
        '--text-secondary': '#5a4a34',
        '--text-muted': '#7a6a54',
        '--text-on-accent': '#fff8e8',
        '--text-on-parchment': '#2c1f10',
        '--accent-primary': '#c4641c',
        '--accent-primary-hover': '#a85412',
        '--accent-secondary': '#a08a64',
        '--accent-secondary-hover': '#8a7654',
        '--accent-gold': '#b8860b',
        '--accent-gold-light': '#d4a322',
        '--accent-red': '#c43e1c',
        '--accent-red-hover': '#a8341a',
        '--accent-green': '#588a3a',
        '--accent-green-hover': '#446e2c',
        '--accent-ink': '#1a0e04',
        '--border-color': '#a08a64',
        '--border-light': '#bca882',
        '--border-ornate': '#8a7654',
        '--focus-ring': 'rgba(196, 100, 28, 0.28)',
        '--tint-primary': 'rgba(196, 100, 28, 0.1)',
        '--tint-gold': 'rgba(184, 134, 11, 0.12)',
        '--tint-secondary': 'rgba(160, 138, 100, 0.15)',
        '--tint-green': 'rgba(88, 138, 58, 0.1)',
        '--parchment-gradient': 'linear-gradient(168deg, #fdf8ea 0%, #f6efde 18%, #efe5cb 42%, #e8dcbc 68%, #f4ead4 100%)',
        '--book-leather': 'radial-gradient(ellipse 100% 60% at 50% -10%, rgba(255, 240, 200, 0.55) 0%, transparent 55%), radial-gradient(ellipse 80% 50% at 50% 110%, rgba(180, 150, 100, 0.18) 0%, transparent 50%), linear-gradient(175deg, #e8dfcc 0%, #efe5cb 30%, #f4ead4 50%, #efe5cb 75%, #e8dfcc 100%)',
        '--parchment-shadow': 'inset 0 0 0 1px rgba(255, 248, 230, 0.7), inset 0 0 48px rgba(180, 150, 100, 0.08), 0 2px 0 rgba(120, 80, 40, 0.12), 0 4px 16px rgba(120, 80, 40, 0.18)',
      }
    },
    {
      id: 'arctic',
      name: '❄️ Arktyka',
      desc: 'Lód i błękit, dla zimowych przygód.',
      vars: {
        '--bg-dark': '#0c1620',
        '--bg-darker': '#080f18',
        '--bg-card': '#162534',
        '--bg-card-hover': '#1e3245',
        '--bg-input': '#101e2c',
        '--bg-surface': '#1a2a3a',
        '--text-primary': '#e0eef8',
        '--text-secondary': '#a8c0d4',
        '--text-muted': '#788ca0',
        '--text-on-accent': '#001020',
        '--text-on-parchment': '#e0eef8',
        '--accent-primary': '#3a8ac4',
        '--accent-primary-hover': '#4a9ad4',
        '--accent-secondary': '#2a4a6c',
        '--accent-secondary-hover': '#3a5e84',
        '--accent-gold': '#a8d8ff',
        '--accent-gold-light': '#c8e8ff',
        '--accent-red': '#c4543a',
        '--accent-red-hover': '#a8442e',
        '--accent-green': '#4aac98',
        '--accent-green-hover': '#388876',
        '--accent-ink': '#040a14',
        '--border-color': '#2a4a6c',
        '--border-light': '#3e6488',
        '--border-ornate': '#5a82a8',
        '--focus-ring': 'rgba(168, 216, 255, 0.4)',
        '--tint-primary': 'rgba(58, 138, 196, 0.18)',
        '--tint-gold': 'rgba(168, 216, 255, 0.16)',
        '--tint-secondary': 'rgba(42, 74, 108, 0.22)',
        '--tint-green': 'rgba(74, 172, 152, 0.14)',
        '--parchment-gradient': 'linear-gradient(168deg, #20384e 0%, #1a3045 28%, #162a3c 58%, #1c3145 100%)',
        '--book-leather': 'radial-gradient(ellipse 100% 60% at 50% -10%, rgba(168, 216, 255, 0.2) 0%, transparent 55%), radial-gradient(ellipse 80% 50% at 50% 110%, rgba(0, 0, 0, 0.55) 0%, transparent 50%), linear-gradient(175deg, #060e18 0%, #0a1828 30%, #102236 50%, #0a1828 75%, #060e18 100%)',
        '--parchment-shadow': 'inset 0 0 0 1px rgba(168, 216, 255, 0.22), inset 0 0 48px rgba(20, 40, 70, 0.4), 0 2px 0 rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.5)',
      }
    },
  ],

  EDITABLE_VARS: [
    { key: '--bg-dark',           label: 'Tło ekranu' },
    { key: '--bg-card',           label: 'Karta / panel' },
    { key: '--bg-card-hover',     label: 'Karta — hover' },
    { key: '--bg-input',          label: 'Pole formularza' },
    { key: '--bg-surface',        label: 'Powierzchnia wtórna' },
    { key: '--text-primary',      label: 'Tekst główny' },
    { key: '--text-secondary',    label: 'Tekst drugorzędny' },
    { key: '--text-muted',        label: 'Tekst wygaszony' },
    { key: '--text-on-accent',    label: 'Tekst na akcencie' },
    { key: '--text-on-parchment', label: 'Tekst na karcie' },
    { key: '--accent-primary',    label: 'Akcent główny' },
    { key: '--accent-secondary',  label: 'Akcent drugorzędny' },
    { key: '--accent-gold',       label: 'Akcent złoty / dekoracja' },
    { key: '--accent-red',        label: 'Niebezpieczny' },
    { key: '--accent-green',      label: 'Pozytywny' },
    { key: '--border-color',      label: 'Ramka' },
    { key: '--border-light',      label: 'Ramka jasna' },
    { key: '--border-ornate',     label: 'Ramka ozdobna' },
  ],

  // Variables that are not simple colors (gradients, shadows) — these are derived
  // from the active preset and re-applied whenever the user edits a color in the
  // custom editor so the look stays cohesive.
  COMPOSITE_VARS: [
    '--parchment-gradient',
    '--book-leather',
    '--parchment-shadow',
    '--focus-ring',
    '--tint-primary',
    '--tint-gold',
    '--tint-secondary',
    '--tint-green',
  ],

  init() {
    document.getElementById('btn-theme')?.addEventListener('click', () => this.openPicker());
    const saved = this.loadActive();
    if (saved) this.apply(saved, { skipSave: true });
  },

  loadActive() {
    try {
      const id = localStorage.getItem(this.STORAGE_KEY);
      if (!id) return null;
      if (id === 'custom') {
        const raw = localStorage.getItem(this.STORAGE_CUSTOM);
        if (!raw) return null;
        return { id: 'custom', name: '✏️ Mój motyw', vars: JSON.parse(raw) };
      }
      const preset = this.PRESETS.find((p) => p.id === id);
      return preset || null;
    } catch (_e) {
      return null;
    }
  },

  apply(theme, opts = {}) {
    if (!theme?.vars) return;
    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    if (!opts.skipSave) {
      try {
        localStorage.setItem(this.STORAGE_KEY, theme.id);
        if (theme.id === 'custom') {
          localStorage.setItem(this.STORAGE_CUSTOM, JSON.stringify(theme.vars));
        }
      } catch (_e) { /* localStorage might be blocked */ }
    }
    this._active = theme;
  },

  reset() {
    const root = document.documentElement;
    const allKeys = new Set();
    this.PRESETS.forEach((p) => Object.keys(p.vars).forEach((k) => allKeys.add(k)));
    this.EDITABLE_VARS.forEach((v) => allKeys.add(v.key));
    this.COMPOSITE_VARS.forEach((k) => allKeys.add(k));
    allKeys.forEach((k) => root.style.removeProperty(k));
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.STORAGE_CUSTOM);
    } catch (_e) { /* ignore */ }
    this._active = null;
  },

  currentVarValue(key) {
    return this._active?.vars?.[key]
      || getComputedStyle(document.documentElement).getPropertyValue(key).trim()
      || '#888888';
  },

  openPicker() {
    if (typeof showGenericModal !== 'function') return;
    const active = this._active || this.loadActive() || this.PRESETS[0];
    const presetRows = this.PRESETS.map((p) => {
      const isActive = active?.id === p.id ? ' theme-card-active' : '';
      const swatches = ['--accent-primary', '--accent-gold', '--accent-red', '--accent-green', '--bg-card']
        .map((k) => `<span class="theme-swatch" style="background:${p.vars[k]}"></span>`).join('');
      return `<button type="button" class="theme-card${isActive}" data-theme-id="${p.id}">
        <div class="theme-card-name">${p.name}</div>
        <div class="theme-card-swatches">${swatches}</div>
        <div class="theme-card-desc">${p.desc}</div>
      </button>`;
    }).join('');

    const customActive = active?.id === 'custom' ? ' theme-card-active' : '';
    const customRow = `<button type="button" class="theme-card${customActive}" data-theme-id="custom">
      <div class="theme-card-name">✏️ Mój motyw</div>
      <div class="theme-card-desc">Edytuj kolory ręcznie i zachowaj.</div>
    </button>`;

    const colorPickers = this.EDITABLE_VARS.map((v) => `
      <label class="theme-color-row">
        <span class="theme-color-label">${v.label}<small>${v.key}</small></span>
        <input type="color" class="theme-color-input" data-var="${v.key}" value="${this._toHex(this.currentVarValue(v.key))}">
      </label>
    `).join('');

    showGenericModal('🎨 Motyw interfejsu', `
      <p class="info-text">Wybierz gotowy preset albo zbuduj własny — zmiana obejmuje cały interfejs.</p>
      <div class="theme-grid">${presetRows}${customRow}</div>
      <details class="theme-custom-editor" ${active?.id === 'custom' ? 'open' : ''}>
        <summary>✏️ Edytuj kolory ręcznie</summary>
        <div class="theme-color-grid">${colorPickers}</div>
        <div class="theme-editor-actions">
          <button type="button" class="btn btn-sm btn-primary" id="btn-theme-save-custom">💾 Zapisz jako mój motyw</button>
          <button type="button" class="btn btn-sm btn-secondary" id="btn-theme-reset">↺ Domyślny</button>
        </div>
      </details>
    `, 'modal-lg');

    const modal = document.getElementById('generic-modal-body');
    modal.querySelectorAll('[data-theme-id]').forEach((btn) => {
      btn.addEventListener('click', () => this._onPickPreset(btn.dataset.themeId));
    });
    modal.querySelectorAll('.theme-color-input').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        document.documentElement.style.setProperty(inp.dataset.var, e.target.value);
        this._refreshDerivedTints();
      });
    });
    modal.querySelector('#btn-theme-save-custom')?.addEventListener('click', () => {
      const vars = this._collectCustomVars(modal);
      this.apply({ id: 'custom', name: '✏️ Mój motyw', vars });
      showToast('Zapisano motyw niestandardowy', 'success');
      modal.querySelectorAll('[data-theme-id]').forEach((c) => c.classList.remove('theme-card-active'));
      modal.querySelector('[data-theme-id="custom"]')?.classList.add('theme-card-active');
    });
    modal.querySelector('#btn-theme-reset')?.addEventListener('click', () => {
      this.apply(this.PRESETS[0]);
      closeModal('generic-modal');
      showToast('Przywrócono motyw domyślny', 'info');
    });
  },

  // Collect color inputs and rebuild composite variables (gradients, shadows, tints) so the
  // custom theme still has a cohesive look instead of inheriting parchment styling.
  _collectCustomVars(modal) {
    const vars = {};
    modal.querySelectorAll('.theme-color-input').forEach((inp) => {
      vars[inp.dataset.var] = inp.value;
    });
    const card = vars['--bg-card'] || '#1a1d2e';
    const dark = vars['--bg-dark'] || '#080a14';
    const accent = vars['--accent-primary'] || '#5a4fcf';
    const gold = vars['--accent-gold'] || '#c0c4e8';
    const sec = vars['--accent-secondary'] || '#3a4670';
    const green = vars['--accent-green'] || '#4a9d6f';
    const isLight = this._isLightColor(card);
    const cardLighter = this._mix(card, isLight ? '#ffffff' : '#ffffff', 0.08);
    const cardDarker = this._mix(card, '#000000', 0.12);
    vars['--parchment-gradient'] = `linear-gradient(168deg, ${cardLighter} 0%, ${card} 40%, ${cardDarker} 100%)`;
    const darkLighter = this._mix(dark, accent, 0.18);
    vars['--book-leather'] = `radial-gradient(ellipse 100% 60% at 50% -10%, ${this._withAlpha(accent, 0.22)} 0%, transparent 55%), radial-gradient(ellipse 80% 50% at 50% 110%, rgba(0,0,0,0.55) 0%, transparent 50%), linear-gradient(175deg, ${dark} 0%, ${darkLighter} 50%, ${dark} 100%)`;
    vars['--parchment-shadow'] = `inset 0 0 0 1px ${this._withAlpha(gold, isLight ? 0.5 : 0.2)}, inset 0 0 48px ${this._withAlpha(dark, 0.4)}, 0 2px 0 rgba(0,0,0,${isLight ? 0.18 : 0.4}), 0 8px 24px rgba(0,0,0,${isLight ? 0.25 : 0.55})`;
    vars['--focus-ring'] = this._withAlpha(gold, 0.4);
    vars['--tint-primary'] = this._withAlpha(accent, 0.16);
    vars['--tint-gold'] = this._withAlpha(gold, 0.16);
    vars['--tint-secondary'] = this._withAlpha(sec, 0.2);
    vars['--tint-green'] = this._withAlpha(green, 0.16);
    return vars;
  },

  // Live preview: recompute gradients/tints while the user drags color sliders.
  _refreshDerivedTints() {
    const modal = document.getElementById('generic-modal-body');
    if (!modal) return;
    const vars = this._collectCustomVars(modal);
    const root = document.documentElement;
    this.COMPOSITE_VARS.forEach((k) => {
      if (vars[k]) root.style.setProperty(k, vars[k]);
    });
  },

  _onPickPreset(id) {
    if (id === 'custom') {
      const saved = localStorage.getItem(this.STORAGE_CUSTOM);
      if (saved) {
        try {
          this.apply({ id: 'custom', name: '✏️ Mój motyw', vars: JSON.parse(saved) });
        } catch (_e) { /* ignore */ }
      }
      return;
    }
    const preset = this.PRESETS.find((p) => p.id === id);
    if (!preset) return;
    this.apply(preset);
    showToast(`Motyw: ${preset.name}`, 'success');
    const modal = document.getElementById('generic-modal-body');
    modal?.querySelectorAll('[data-theme-id]').forEach((c) => c.classList.remove('theme-card-active'));
    modal?.querySelector(`[data-theme-id="${id}"]`)?.classList.add('theme-card-active');
    modal?.querySelectorAll('.theme-color-input').forEach((inp) => {
      inp.value = this._toHex(this.currentVarValue(inp.dataset.var));
    });
  },

  _toHex(color) {
    const c = String(color || '').trim();
    if (!c) return '#888888';
    if (c.startsWith('#')) {
      if (c.length === 4) {
        return '#' + c.slice(1).split('').map((ch) => ch + ch).join('');
      }
      return c.slice(0, 7);
    }
    const rgb = c.match(/\d+/g);
    if (rgb && rgb.length >= 3) {
      const hex = rgb.slice(0, 3).map((n) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0')).join('');
      return '#' + hex;
    }
    return '#888888';
  },

  _parseHex(color) {
    const hex = this._toHex(color).slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  },

  _mix(a, b, t) {
    const ca = this._parseHex(a);
    const cb = this._parseHex(b);
    const k = Math.max(0, Math.min(1, t));
    const r = Math.round(ca.r + (cb.r - ca.r) * k);
    const g = Math.round(ca.g + (cb.g - ca.g) * k);
    const bl = Math.round(ca.b + (cb.b - ca.b) * k);
    return '#' + [r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('');
  },

  _withAlpha(hex, alpha) {
    const { r, g, b } = this._parseHex(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },

  _isLightColor(hex) {
    const { r, g, b } = this._parseHex(hex);
    // Perceived luminance (Rec. 709)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 160;
  },
};
