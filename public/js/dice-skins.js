// ===== Skórki kości — presety + edytor własnych =====
// Pozwala graczowi wybrać/wgrać własny wygląd dla każdego typu kości (d4..d100).
// Stan przechowywany w localStorage (per-przeglądarka). Skórka aplikowana przez
// CSS custom properties + opcjonalne background-image dla każdej ścianki d6.

const DiceSkins = {
  STORAGE_KEY: 'roll1-dice-skin-v1',

  PRESETS: {
    classic: {
      name: '🎲 Klasyczne (kamień)',
      base: '#3b2a1f',
      highlight: '#6a4a32',
      shadow: '#1a0f08',
      number: '#f4ead2',
      numberShadow: '#c9a227',
      polyStroke: 'rgba(255, 240, 200, 0.5)',
      pip: '#f4ead2'
    },
    gold: {
      name: '✨ Złoto',
      base: '#caa033',
      highlight: '#ffe16a',
      shadow: '#7a5b16',
      number: '#1c1208',
      numberShadow: '#fff3b8',
      polyStroke: 'rgba(255, 230, 130, 0.85)',
      pip: '#1c1208'
    },
    crystal: {
      name: '💎 Kryształ',
      base: '#3a6a9a',
      highlight: '#8ec1ee',
      shadow: '#15273f',
      number: '#f0faff',
      numberShadow: '#5fb8ff',
      polyStroke: 'rgba(180, 220, 255, 0.85)',
      pip: '#f0faff'
    },
    blood: {
      name: '🩸 Krwawe',
      base: '#7a1c1c',
      highlight: '#c2362f',
      shadow: '#2a0808',
      number: '#fff2e6',
      numberShadow: '#ff6a4a',
      polyStroke: 'rgba(255, 120, 100, 0.85)',
      pip: '#fff2e6'
    },
    necrotic: {
      name: '💀 Nekrotyczne',
      base: '#22241f',
      highlight: '#4a4f3e',
      shadow: '#0a0b08',
      number: '#a8ff66',
      numberShadow: '#3aff22',
      polyStroke: 'rgba(120, 255, 90, 0.85)',
      pip: '#a8ff66'
    },
    frost: {
      name: '❄ Mroźne',
      base: '#7e9bbf',
      highlight: '#d6ecff',
      shadow: '#34516a',
      number: '#1f3a52',
      numberShadow: '#ffffff',
      polyStroke: 'rgba(255, 255, 255, 0.9)',
      pip: '#1f3a52'
    },
    forest: {
      name: '🌿 Leśne',
      base: '#3a5a2a',
      highlight: '#7aa83a',
      shadow: '#1a2810',
      number: '#fff3c4',
      numberShadow: '#caff77',
      polyStroke: 'rgba(170, 230, 90, 0.85)',
      pip: '#fff3c4'
    },
    royal: {
      name: '👑 Królewskie',
      base: '#3a206a',
      highlight: '#8b5cf6',
      shadow: '#1a0c34',
      number: '#fde68a',
      numberShadow: '#c084fc',
      polyStroke: 'rgba(196, 132, 252, 0.85)',
      pip: '#fde68a'
    },
    inferno: {
      name: '🔥 Inferno',
      base: '#7a2818',
      highlight: '#ff9a3c',
      shadow: '#220804',
      number: '#fffaf0',
      numberShadow: '#ff6020',
      polyStroke: 'rgba(255, 160, 60, 0.9)',
      pip: '#fffaf0'
    },
    bone: {
      name: '🦴 Kość słoniowa',
      base: '#e2d9b8',
      highlight: '#fff6dc',
      shadow: '#7a6b3c',
      number: '#3a2412',
      numberShadow: '#9a7842',
      polyStroke: 'rgba(80, 60, 30, 0.7)',
      pip: '#3a2412'
    }
  },

  DIE_TYPES: [4, 6, 8, 10, 12, 20, 100],

  state: null,

  init() {
    this.state = this._load() || { preset: 'classic', overrides: {}, faces: {} };
    this._applyToDom();
    document.getElementById('btn-dice-skins')?.addEventListener('click', () => this.openEditor());
  },

  _load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) { return null; }
  },

  _save() {
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state)); } catch (_e) {}
  },

  // Resolved skin per-die (preset + overrides[sides] + base preset)
  _resolveDie(sides) {
    const preset = this.PRESETS[this.state.preset] || this.PRESETS.classic;
    const ov = this.state.overrides?.[sides] || {};
    return { ...preset, ...ov };
  },

  _applyToDom() {
    const root = document.documentElement;
    // Domyślne (dla viewerów co rzucają — d20 fallback)
    const def = this._resolveDie(20);
    root.style.setProperty('--die-base', def.base);
    root.style.setProperty('--die-highlight', def.highlight);
    root.style.setProperty('--die-shadow', def.shadow);
    root.style.setProperty('--die-number', def.number);
    root.style.setProperty('--die-number-shadow', def.numberShadow);
    root.style.setProperty('--die-poly-stroke', def.polyStroke);
    root.style.setProperty('--die-pip', def.pip);
    // Per-die custom props (die-d4-base itd.)
    this.DIE_TYPES.forEach((s) => {
      const sk = this._resolveDie(s);
      root.style.setProperty(`--die-d${s}-base`, sk.base);
      root.style.setProperty(`--die-d${s}-highlight`, sk.highlight);
      root.style.setProperty(`--die-d${s}-shadow`, sk.shadow);
      root.style.setProperty(`--die-d${s}-number`, sk.number);
      root.style.setProperty(`--die-d${s}-number-shadow`, sk.numberShadow);
      root.style.setProperty(`--die-d${s}-stroke`, sk.polyStroke);
      root.style.setProperty(`--die-d${s}-pip`, sk.pip);
      const face = this.state.faces?.[s];
      root.style.setProperty(`--die-d${s}-face-image`, face ? `url("${face}")` : 'none');
    });
  },

  applyPreset(presetId) {
    if (!this.PRESETS[presetId]) return;
    this.state.preset = presetId;
    this._save();
    this._applyToDom();
  },

  setOverride(sides, partial) {
    if (!this.state.overrides) this.state.overrides = {};
    this.state.overrides[sides] = { ...(this.state.overrides[sides] || {}), ...partial };
    this._save();
    this._applyToDom();
  },

  clearOverride(sides) {
    if (this.state.overrides) delete this.state.overrides[sides];
    if (this.state.faces) delete this.state.faces[sides];
    this._save();
    this._applyToDom();
  },

  setFaceImage(sides, dataUrl) {
    if (!this.state.faces) this.state.faces = {};
    if (dataUrl) this.state.faces[sides] = dataUrl;
    else delete this.state.faces[sides];
    this._save();
    this._applyToDom();
  },

  reset() {
    this.state = { preset: 'classic', overrides: {}, faces: {} };
    this._save();
    this._applyToDom();
  },

  openEditor() {
    if (typeof showGenericModal !== 'function') return;
    const presetButtons = Object.entries(this.PRESETS).map(([id, p]) => {
      const isActive = this.state.preset === id;
      return `<button type="button" class="dice-preset-btn ${isActive ? 'is-active' : ''}" data-preset="${id}"
        style="--preset-base:${p.base};--preset-hl:${p.highlight};--preset-num:${p.number};">
        <span class="dice-preset-swatch"></span>
        <span class="dice-preset-name">${p.name}</span>
      </button>`;
    }).join('');

    const dieRows = this.DIE_TYPES.map((s) => {
      const sk = this._resolveDie(s);
      const face = this.state.faces?.[s] || '';
      return `<div class="dice-skin-row" data-sides="${s}">
        <div class="dice-skin-preview" style="background:${sk.base};color:${sk.number};border:2px solid ${sk.highlight};">
          ${face ? `<img src="${face}" alt="" />` : ''}
          <span>d${s}</span>
        </div>
        <div class="dice-skin-controls">
          <label>Baza
            <input type="color" data-skin-prop="base" value="${this._hex(sk.base)}">
          </label>
          <label>Krawędź
            <input type="color" data-skin-prop="highlight" value="${this._hex(sk.highlight)}">
          </label>
          <label>Cyfra
            <input type="color" data-skin-prop="number" value="${this._hex(sk.number)}">
          </label>
          <label class="dice-skin-file">Obraz ścianki
            <input type="file" data-skin-image accept="image/png,image/jpeg,image/webp,image/svg+xml">
          </label>
          <button type="button" class="btn btn-xs btn-secondary" data-skin-clear>Reset d${s}</button>
        </div>
      </div>`;
    }).join('');

    showGenericModal('🎨 Skórki kości', `
      <div class="dice-skin-editor">
        <p class="sheet-hint">Wybierz preset, a potem ewentualnie nadpisz kolory lub wgraj własny obraz dla wybranej kostki.</p>
        <h4>Presety</h4>
        <div class="dice-preset-grid">${presetButtons}</div>

        <h4>Indywidualne kostki</h4>
        <div class="dice-skin-list">${dieRows}</div>

        <div class="dice-skin-footer">
          <button type="button" class="btn btn-secondary" id="dice-skin-reset">↻ Przywróć domyślne</button>
          <button type="button" class="btn btn-primary" id="dice-skin-test">🎲 Test rzutu</button>
        </div>
      </div>
    `);

    const body = document.getElementById('generic-modal-body');
    body.querySelectorAll('.dice-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.applyPreset(btn.dataset.preset);
        body.querySelectorAll('.dice-preset-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        this._refreshPreviews(body);
      });
    });

    body.querySelectorAll('.dice-skin-row').forEach((row) => {
      const sides = parseInt(row.dataset.sides, 10);
      row.querySelectorAll('[data-skin-prop]').forEach((input) => {
        input.addEventListener('input', () => {
          this.setOverride(sides, { [input.dataset.skinProp]: input.value });
          this._refreshPreviews(body);
        });
      });
      const fileInput = row.querySelector('[data-skin-image]');
      fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 1024 * 1024) {
          showToast('Obraz zbyt duży (max 1 MB)', 'warning');
          return;
        }
        const url = await this._fileToDataUrl(file);
        this.setFaceImage(sides, url);
        this._refreshPreviews(body);
      });
      row.querySelector('[data-skin-clear]')?.addEventListener('click', () => {
        this.clearOverride(sides);
        this._refreshPreviews(body);
        const fi = row.querySelector('[data-skin-image]');
        if (fi) fi.value = '';
      });
    });

    body.querySelector('#dice-skin-reset')?.addEventListener('click', () => {
      this.reset();
      closeModal('generic-modal');
      this.openEditor();
    });

    body.querySelector('#dice-skin-test')?.addEventListener('click', () => {
      // Pokaż rzut po jednej z każdej + d20
      if (typeof Dice !== 'undefined' && Dice.startDiceAnimation) {
        const rolls = this.DIE_TYPES.map((s) => 1 + Math.floor(Math.random() * s));
        const sides = [...this.DIE_TYPES];
        Dice.startDiceAnimation(rolls, sides);
        setTimeout(() => Dice.stopDiceAnimation?.(rolls), 1800);
      }
    });
  },

  _refreshPreviews(body) {
    body.querySelectorAll('.dice-skin-row').forEach((row) => {
      const sides = parseInt(row.dataset.sides, 10);
      const sk = this._resolveDie(sides);
      const preview = row.querySelector('.dice-skin-preview');
      if (preview) {
        preview.style.background = sk.base;
        preview.style.color = sk.number;
        preview.style.borderColor = sk.highlight;
        const face = this.state.faces?.[sides];
        const img = preview.querySelector('img');
        if (face) {
          if (img) img.src = face;
          else {
            const newImg = document.createElement('img');
            newImg.src = face;
            preview.prepend(newImg);
          }
        } else if (img) {
          img.remove();
        }
      }
    });
  },

  _hex(color) {
    if (!color) return '#000000';
    if (color.startsWith('#')) {
      if (color.length === 4) return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
      return color.slice(0, 7);
    }
    const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) {
      const hex = (n) => parseInt(n, 10).toString(16).padStart(2, '0');
      return '#' + hex(m[1]) + hex(m[2]) + hex(m[3]);
    }
    return '#000000';
  },

  _fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
};

if (typeof window !== 'undefined') window.DiceSkins = DiceSkins;
