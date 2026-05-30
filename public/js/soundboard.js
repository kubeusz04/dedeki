// ===== Soundboard + Ambient mixer =====
// SFX (one-shot, np. krzyk, drzwi, błyskawica) i Ambient (zapętlone warstwy: deszcz + ognisko + tłum).
// MG triggeruje, wszyscy klienci grają w tym samym momencie (Socket.IO).
// Lokalny master volume zapisany w localStorage.

const Soundboard = {
  library: [],
  // Aktywne instancje audio: { soundId: HTMLAudioElement } — dla ambient layerów.
  ambientAudio: new Map(),
  // Pula SFX (one-shot): co odtworzony zostaje wyrzucony po zakończeniu.
  _sfxQueue: [],
  // Master volume per-user
  _masterVolume: 0.8,
  // Suggested icons + tags for quick categorization in upload UI
  PRESETS: [
    { icon: '🗡️', label: 'Walka',     tags: ['walka', 'metal', 'cios'] },
    { icon: '⚡',  label: 'Magia',     tags: ['czar', 'magia', 'piorun'] },
    { icon: '👹', label: 'Potwór',    tags: ['ryk', 'potwór'] },
    { icon: '🚪', label: 'Drzwi',     tags: ['drzwi', 'skrzypienie'] },
    { icon: '🏆', label: 'Zwycięstwo',tags: ['fanfare', 'zwycięstwo'] },
    { icon: '😱', label: 'Krzyk',     tags: ['krzyk', 'dramat'] },
    { icon: '💰', label: 'Złoto',     tags: ['monety', 'kasa'] },
    { icon: '🔔', label: 'Dzwon',     tags: ['dzwon', 'kościół'] },
    { icon: '🌧️', label: 'Deszcz',    tags: ['deszcz', 'pogoda'] },
    { icon: '🔥', label: 'Ogień',     tags: ['ogień', 'ognisko'] },
    { icon: '🌬️', label: 'Wiatr',     tags: ['wiatr', 'pogoda'] },
    { icon: '🌊', label: 'Woda',      tags: ['woda', 'rzeka', 'morze'] },
    { icon: '👥', label: 'Tłum',      tags: ['tłum', 'tawerna'] },
    { icon: '🐦', label: 'Las',       tags: ['las', 'ptaki', 'natura'] },
    { icon: '🏛️', label: 'Lochy',    tags: ['lochy', 'echo'] }
  ],

  init() {
    const stored = parseFloat(localStorage.getItem('soundboard_master_volume'));
    if (!isNaN(stored)) this._masterVolume = Math.min(1, Math.max(0, stored));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._fadeAllAmbient(0.3);
      else this._fadeAllAmbient(1.0);
    });
  },

  isDm() { return App.currentCampaign?.role === 'dm'; },

  bindSocketEvents(socket) {
    if (!socket) return;
    this.socket = socket;
    socket.on('sfx-play', (data) => {
      if (!App.currentCampaign || data?.campaignId !== App.currentCampaign.id) return;
      this._playOneShot(data.url, data.volume ?? 0.7);
      if (typeof showToast === 'function') {
        showToast(`${data.icon || '🔊'} ${data.name}`, 'info', 1500);
      }
    });
    socket.on('ambient-update', (data) => {
      if (!App.currentCampaign || data?.campaignId !== App.currentCampaign.id) return;
      this._syncAmbient(data.layers || {});
      this._refreshPanelContent();
    });
    socket.on('sound-library-update', (data) => {
      if (!App.currentCampaign || data?.campaignId !== App.currentCampaign.id) return;
      this.load().then(() => this._refreshPanelContent());
    });
    socket.on('connect', () => {
      // After (re)connect, request current ambient state to resync.
      if (App.currentCampaign) socket.emit('ambient-request-state');
    });
  },

  async load() {
    if (!App.currentCampaign) return;
    try {
      this.library = await apiFetch(`/campaigns/${App.currentCampaign.id}/sounds`);
    } catch (err) {
      console.error('soundboard load', err);
      this.library = [];
    }
  },

  openTab() {
    document.querySelector('.session-tab[data-panel="soundboard-panel"]')?.click();
  },

  async onPanelActivate() {
    if (!App.currentCampaign) return;
    await this.load();
    this._ensureUnlocked();
    this._renderPanel();
    if (this.socket) this.socket.emit('ambient-request-state');
  },

  open() {
    if (!App.currentCampaign) return;
    this.openTab();
  },

  _isUiMounted() {
    return !!document.getElementById('soundboard-panel-root')?.querySelector('#sb-tab-content');
  },

  _refreshPanelContent() {
    if (this._isUiMounted()) this._renderPanelContent();
  },

  // ===== Local audio playback =====
  _ensureUnlocked() {
    // Mobile/iOS często wymaga gestu użytkownika przed grą audio.
    // Otwarcie modala = klik = gest, więc tu okazja by zinicjalizować.
    if (this._audioCtx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        this._audioCtx = new Ctx();
        if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
      }
    } catch (_e) { /* noop */ }
  },

  _playOneShot(url, volume) {
    this._ensureUnlocked();
    const a = new Audio(this._authedUrl(url));
    a.volume = Math.min(1, Math.max(0, volume * this._masterVolume));
    a.addEventListener('ended', () => {
      const idx = this._sfxQueue.indexOf(a);
      if (idx >= 0) this._sfxQueue.splice(idx, 1);
    });
    this._sfxQueue.push(a);
    if (this._sfxQueue.length > 12) {
      const old = this._sfxQueue.shift();
      try { old.pause(); } catch (_e) { /* noop */ }
    }
    a.play().catch((err) => {
      console.warn('SFX play blocked:', err.message);
      if (typeof showToast === 'function') {
        showToast('🔇 Kliknij gdziekolwiek by odblokować dźwięk', 'warning');
      }
    });
  },

  _authedUrl(url) {
    // Sound files live in public/uploads/sounds — no auth required for static.
    return url;
  },

  _syncAmbient(layers) {
    const wantedIds = new Set(Object.keys(layers || {}));
    // Stop layers no longer in state.
    for (const [id, audio] of this.ambientAudio) {
      if (!wantedIds.has(id)) {
        this._fadeOutAndStop(audio);
        this.ambientAudio.delete(id);
      }
    }
    // Start / update wanted layers.
    for (const [id, layer] of Object.entries(layers || {})) {
      let audio = this.ambientAudio.get(id);
      if (!audio) {
        this._ensureUnlocked();
        audio = new Audio(this._authedUrl(layer.url));
        audio.loop = true;
        audio.volume = 0;
        audio._targetVolume = layer.volume;
        this.ambientAudio.set(id, audio);
        audio.play().catch((err) => console.warn('ambient play blocked:', err.message));
        this._fadeTo(audio, layer.volume * this._masterVolume, 1500);
      } else {
        audio._targetVolume = layer.volume;
        this._fadeTo(audio, layer.volume * this._masterVolume, 400);
      }
    }
  },

  _fadeTo(audio, targetVolume, durationMs) {
    if (audio._fadeTimer) { clearInterval(audio._fadeTimer); audio._fadeTimer = null; }
    const start = audio.volume;
    const t0 = performance.now();
    const step = () => {
      const elapsed = performance.now() - t0;
      const k = Math.min(1, elapsed / durationMs);
      audio.volume = Math.min(1, Math.max(0, start + (targetVolume - start) * k));
      if (k < 1) audio._fadeTimer = setTimeout(step, 16);
    };
    step();
  },

  _fadeOutAndStop(audio) {
    this._fadeTo(audio, 0, 800);
    setTimeout(() => { try { audio.pause(); audio.src = ''; } catch (_e) { /* noop */ } }, 1000);
  },

  _fadeAllAmbient(globalScale) {
    for (const [_id, audio] of this.ambientAudio) {
      const target = (audio._targetVolume || 0.5) * this._masterVolume * globalScale;
      this._fadeTo(audio, target, 400);
    }
  },

  setMasterVolume(v) {
    this._masterVolume = Math.min(1, Math.max(0, v));
    localStorage.setItem('soundboard_master_volume', String(this._masterVolume));
    for (const [_id, audio] of this.ambientAudio) {
      audio.volume = (audio._targetVolume || 0.5) * this._masterVolume;
    }
  },

  // ===== Session panel (Magic DJ deck) =====
  _renderPanel() {
    const mount = document.getElementById('soundboard-panel-root');
    if (!mount) return;
    const tab = this._activeTab || 'sfx';
    const libTab = this.isDm()
      ? `<button type="button" class="sb-tab dj-channel${tab === 'library' ? ' active' : ''}" data-tab="library">📀 Biblioteka</button>`
      : '';
    mount.innerHTML = `
      <div class="soundboard-dj" role="region" aria-label="Magiczny DJ — soundboard">
        <div class="soundboard-dj__glow" aria-hidden="true"></div>
        <div class="soundboard-dj__scanlines" aria-hidden="true"></div>
        <header class="soundboard-dj__header">
          <div class="soundboard-dj__brand">
            <span class="soundboard-dj__logo" aria-hidden="true">🎧</span>
            <div class="soundboard-dj__titles">
              <h2 class="soundboard-dj__title">Magiczny DJ</h2>
              <p class="soundboard-dj__subtitle">SFX · Ambient · Mikser warstw</p>
            </div>
          </div>
          <div class="soundboard-dj__master">
            <span class="soundboard-dj__master-label">MASTER</span>
            <div class="soundboard-dj__fader">
              <input type="range" id="sb-master-volume" min="0" max="1" step="0.05" value="${this._masterVolume}" aria-label="Głośność lokalna">
              <div class="soundboard-dj__vu" aria-hidden="true">
                <span></span><span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span><span></span>
              </div>
            </div>
            <span id="sb-master-label" class="soundboard-dj__master-value">${Math.round(this._masterVolume * 100)}%</span>
          </div>
        </header>
        <nav class="soundboard-dj__channels sb-tabs" aria-label="Kanały">
          <button type="button" class="sb-tab dj-channel ${tab === 'sfx' ? 'active' : ''}" data-tab="sfx">⚡ SFX</button>
          <button type="button" class="sb-tab dj-channel ${tab === 'ambient' ? 'active' : ''}" data-tab="ambient">🌧️ Ambient</button>
          ${libTab}
        </nav>
        <div id="sb-tab-content" class="sb-tab-content soundboard-dj__stage"></div>
        <footer class="soundboard-dj__footer">
          ${this.isDm()
            ? '<span class="soundboard-dj__hint">Kliknij pad — wszyscy słyszą. Ambient mieszaj warstwami.</span>'
            : '<span class="soundboard-dj__hint">Sterowanie przez MG. Twój suwak MASTER działa lokalnie.</span>'}
        </footer>
      </div>`;

    mount.querySelectorAll('.sb-tab').forEach((t) => {
      t.addEventListener('click', () => {
        mount.querySelectorAll('.sb-tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        this._activeTab = t.dataset.tab;
        this._renderPanelContent();
      });
    });

    mount.querySelector('#sb-master-volume')?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.setMasterVolume(v);
      const label = mount.querySelector('#sb-master-label');
      if (label) label.textContent = `${Math.round(v * 100)}%`;
      mount.querySelector('.soundboard-dj__vu')?.style.setProperty('--vu', String(v));
    });
    mount.querySelector('.soundboard-dj__vu')?.style.setProperty('--vu', String(this._masterVolume));

    this._activeTab = tab;
    this._renderPanelContent();
  },

  _renderPanelContent() {
    const root = document.getElementById('sb-tab-content');
    if (!root) return;
    if (this._activeTab === 'sfx') return this._renderSfxPanel();
    if (this._activeTab === 'ambient') return this._renderAmbientPanel();
    if (this._activeTab === 'library') return this._renderLibraryPanel();
  },

  _renderSfxPanel() {
    const root = document.getElementById('sb-tab-content');
    if (!root) return;
    const sfx = this.library.filter((s) => s.category === 'sfx');
    if (!sfx.length) {
      root.innerHTML = `<div class="dm-feature-empty sb-empty"><p>${this.isDm() ? 'Brak SFX. Wgraj je w zakładce „Biblioteka".' : 'MG nie wgrał jeszcze efektów dźwiękowych.'}</p></div>`;
      return;
    }
    root.innerHTML = `
      <div class="sb-grid">
        ${sfx.map((s) => `
          <button class="sb-pad" data-play="${s.id}" ${this.isDm() ? '' : 'disabled title="Tylko MG może odpalać dźwięki"'}>
            <span class="sb-pad-icon">${s.icon || '🔊'}</span>
            <span class="sb-pad-name">${escapeHtml(s.name)}</span>
            ${(s.tags || []).slice(0,2).map((t) => `<span class="sb-pad-tag">${escapeHtml(t)}</span>`).join('')}
          </button>`).join('')}
      </div>
      <div class="sb-help">${this.isDm() ? 'Klik = odpal jednorazowy efekt u wszystkich graczy.' : 'Tylko MG może odpalać efekty. Twój master volume działa lokalnie.'}</div>
    `;
    root.querySelectorAll('[data-play]').forEach((b) => {
      b.addEventListener('click', () => {
        if (!this.isDm()) return;
        const id = b.dataset.play;
        const s = this.library.find((it) => it.id === id);
        if (this.socket) this.socket.emit('play-sfx', { soundId: id, volume: s?.default_volume });
        b.classList.add('is-firing');
        setTimeout(() => b.classList.remove('is-firing'), 400);
      });
    });
  },

  _renderAmbientPanel() {
    const root = document.getElementById('sb-tab-content');
    if (!root) return;
    const ambient = this.library.filter((s) => s.category === 'ambient');
    const activeIds = new Set([...this.ambientAudio.keys()]);
    if (!ambient.length) {
      root.innerHTML = `<div class="sb-empty">${this.isDm() ? 'Brak ambientów. Wgraj zapętlone pliki w zakładce „Biblioteka".' : 'MG nie wgrał jeszcze ambientów.'}</div>`;
      return;
    }
    const dmStop = this.isDm() && activeIds.size > 0
      ? `<button class="btn btn-sm btn-warning" data-stop-all>⏹ Zatrzymaj wszystko</button>` : '';
    root.innerHTML = `
      <div class="sb-ambient-toolbar">
        <span>Aktywne warstwy: <strong>${activeIds.size}</strong></span>
        ${dmStop}
      </div>
      <div class="sb-ambient-list">
        ${ambient.map((s) => {
          const isActive = activeIds.has(s.id);
          const audio = this.ambientAudio.get(s.id);
          const vol = audio ? (audio._targetVolume ?? s.default_volume) : s.default_volume;
          return `
          <div class="sb-ambient-row ${isActive ? 'is-active' : ''}" data-amb-id="${s.id}">
            <div class="sb-amb-info">
              <span class="sb-amb-icon">${s.icon || '🎵'}</span>
              <span class="sb-amb-name">${escapeHtml(s.name)}</span>
              ${isActive ? '<span class="sb-amb-badge">▶ gra</span>' : ''}
            </div>
            <input type="range" min="0" max="1" step="0.05" value="${vol}" class="sb-amb-volume" ${this.isDm() ? '' : 'disabled'}>
            <span class="sb-amb-vol-label">${Math.round(vol * 100)}%</span>
            ${this.isDm() ? `<button class="btn btn-xs ${isActive ? 'btn-warning' : 'btn-success'}" data-amb-toggle>${isActive ? '⏸ Stop' : '▶ Graj'}</button>` : ''}
          </div>`;
        }).join('')}
      </div>
      <div class="sb-help">${this.isDm() ? 'Włącz kilka warstw naraz: deszcz + ognisko + tłum. Każda ma osobny suwak.' : 'Tylko MG może sterować ambientem.'}</div>
    `;

    if (this.isDm()) {
      root.querySelector('[data-stop-all]')?.addEventListener('click', () => {
        if (this.socket) this.socket.emit('ambient-stop-all');
      });
      root.querySelectorAll('.sb-ambient-row').forEach((row) => {
        const id = row.dataset.ambId;
        const volSlider = row.querySelector('.sb-amb-volume');
        const volLabel = row.querySelector('.sb-amb-vol-label');
        const toggle = row.querySelector('[data-amb-toggle]');
        const isActive = row.classList.contains('is-active');

        toggle?.addEventListener('click', () => {
          if (this.socket) this.socket.emit('ambient-set', { soundId: id, playing: !isActive, volume: parseFloat(volSlider.value) });
        });
        volSlider?.addEventListener('input', () => {
          volLabel.textContent = `${Math.round(parseFloat(volSlider.value) * 100)}%`;
        });
        volSlider?.addEventListener('change', () => {
          if (!isActive) return;
          if (this.socket) this.socket.emit('ambient-set', { soundId: id, playing: true, volume: parseFloat(volSlider.value) });
        });
      });
    }
  },

  // ===== Library (DM) =====
  _renderLibraryPanel() {
    if (!this.isDm()) return;
    const root = document.getElementById('sb-tab-content');
    if (!root) return;
    root.innerHTML = `
      <div class="sb-library-actions">
        <button class="btn btn-primary" id="sb-add-sound">➕ Wgraj nowy dźwięk</button>
      </div>
      <div class="sb-library-list">
        ${this.library.length ? this.library.map((s) => {
          const isYoutube = s.source_type === 'youtube';
          return `
          <div class="sb-lib-row">
            <span class="sb-lib-icon">${s.icon || '🔊'}</span>
            <span class="sb-lib-name">${escapeHtml(s.name)}${isYoutube ? ' <span class="bard-track__yt">YT</span>' : ''}</span>
            <span class="sb-lib-cat">${s.category === 'ambient' ? '🌧️ Ambient' : '⚡ SFX'}</span>
            <span class="sb-lib-size">${(s.file_size / 1024 / 1024).toFixed(1)} MB</span>
            <button class="btn btn-xs btn-secondary" data-preview="${s.id}">▶ Podgląd</button>
            <button class="btn btn-xs btn-secondary" data-edit="${s.id}">✏️</button>
            <button class="btn btn-xs btn-danger" data-delete="${s.id}">🗑️</button>
          </div>`;
        }).join('') : '<div class="sb-empty">Biblioteka pusta. Wgraj swój pierwszy dźwięk.</div>'}
      </div>
    `;
    root.querySelector('#sb-add-sound').addEventListener('click', () => this.openUploader());
    root.querySelectorAll('[data-preview]').forEach((b) => b.addEventListener('click', () => {
      const s = this.library.find((it) => it.id === b.dataset.preview);
      if (s) this._playOneShot(s.file_url, s.default_volume);
    }));
    root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => this.openEditor(b.dataset.edit)));
    root.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => this.delete(b.dataset.delete)));
  },

  openUploader() {
    if (!this.isDm()) return;
    const presetButtons = this.PRESETS.map((p) =>
      `<button type="button" class="sb-preset" data-preset='${JSON.stringify(p).replace(/'/g, '&apos;')}'>${p.icon} ${p.label}</button>`
    ).join('');
    const overlay = createStackedFeatureOverlay('sb-upload-overlay', buildFeatureModalHtml({
      icon: '🔊',
      title: 'Wgraj dźwięk',
      meta: 'SFX lub ambient do kampanii',
      modalClass: 'sb-upload-modal',
      bodyHtml: `
          <p class="dm-feature-intro">Pliki <strong>MP3, OGG, WAV, M4A, WebM</strong> (max 10 MB). SFX odtwarza się jednorazowo; ambient można mieszać warstwami.</p>
          <div class="sb-upload-body">
          <div class="qe-row">
            <label>Plik audio (max 10 MB)</label>
            <input type="file" id="sb-file" accept="audio/*">
          </div>
          <div class="qe-row">
            <label>Nazwa</label>
            <input type="text" id="sb-name" maxlength="100" placeholder="np. Krzyk gobliny, Deszcz w lesie">
          </div>
          <div class="qe-row">
            <label>Kategoria</label>
            <select id="sb-category">
              <option value="sfx">⚡ SFX (one-shot — efekt jednorazowy)</option>
              <option value="ambient">🌧️ Ambient (zapętlony, miksowany z innymi)</option>
            </select>
          </div>
          <div class="qe-row">
            <label>Ikona / emoji (opcjonalna)</label>
            <input type="text" id="sb-icon" maxlength="4" placeholder="np. 🔥">
            <div class="sb-presets">${presetButtons}</div>
          </div>
          <div class="qe-row">
            <label>Domyślna głośność</label>
            <input type="range" id="sb-volume" min="0" max="1" step="0.05" value="0.7">
            <span id="sb-volume-label">70%</span>
          </div>
          <div id="sb-upload-progress" style="display:none;color:var(--accent-color);">⏳ Wysyłanie...</div>
          <hr class="sb-upload-divider">
          <p class="dm-feature-intro"><strong>Lub pobierz z YouTube</strong> — audio zostanie zapisane lokalnie jak przy uploadzie.</p>
          <div class="qe-row">
            <label>Link YouTube</label>
            <input type="url" id="sb-modal-youtube-url" placeholder="https://www.youtube.com/watch?v=…">
          </div>
          <div id="sb-youtube-progress" style="display:none;color:var(--accent-color);">⏳ Pobieranie z YouTube…</div>
          </div>`,
      footerHtml: `
          <button type="button" class="btn btn-secondary" data-action="close">Anuluj</button>
          <button type="button" class="btn btn-secondary" id="sb-youtube-go">▶ Pobierz z YouTube</button>
          <button type="button" class="btn btn-primary" id="sb-upload-go">📤 Wgraj</button>`
    }));
    const close = () => overlay.remove();

    overlay.querySelectorAll('.sb-preset').forEach((b) => {
      b.addEventListener('click', () => {
        try {
          const p = JSON.parse(b.dataset.preset.replace(/&apos;/g, "'"));
          overlay.querySelector('#sb-icon').value = p.icon;
          if (!overlay.querySelector('#sb-name').value) overlay.querySelector('#sb-name').value = p.label;
        } catch (_e) { /* noop */ }
      });
    });

    overlay.querySelector('#sb-volume').addEventListener('input', (e) => {
      overlay.querySelector('#sb-volume-label').textContent = `${Math.round(parseFloat(e.target.value) * 100)}%`;
    });

    overlay.querySelector('#sb-youtube-go')?.addEventListener('click', async () => {
      const url = overlay.querySelector('#sb-modal-youtube-url')?.value?.trim();
      if (!url) return showToast('Wklej link YouTube', 'warning');
      const ytBtn = overlay.querySelector('#sb-youtube-go');
      const prog = overlay.querySelector('#sb-youtube-progress');
      if (ytBtn) ytBtn.disabled = true;
      if (prog) prog.style.display = '';
      try {
        showToast('Pobieranie z YouTube (30–90 s)…', 'info');
        const sound = await apiFetch(`/campaigns/${App.currentCampaign.id}/sounds/youtube`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            name: overlay.querySelector('#sb-name').value.trim(),
            category: overlay.querySelector('#sb-category').value,
            icon: overlay.querySelector('#sb-icon').value,
            default_volume: overlay.querySelector('#sb-volume').value
          })
        });
        showToast(
          sound.duplicate ? 'Ten dźwięk jest już w bibliotece' : 'Dźwięk pobrany z YouTube',
          sound.duplicate ? 'info' : 'success'
        );
        await this.load();
        this._refreshPanelContent();
        close();
      } catch (e) {
        showToast(e.message || 'Nie udało się pobrać z YouTube', 'error');
        if (prog) prog.style.display = 'none';
        if (ytBtn) ytBtn.disabled = false;
      }
    });

    overlay.querySelector('#sb-upload-go').addEventListener('click', async () => {
      const file = overlay.querySelector('#sb-file').files?.[0];
      if (!file) return showToast('Wybierz plik', 'warning');
      const fd = new FormData();
      fd.append('audio', file);
      fd.append('name', overlay.querySelector('#sb-name').value.trim() || file.name);
      fd.append('category', overlay.querySelector('#sb-category').value);
      fd.append('icon', overlay.querySelector('#sb-icon').value);
      fd.append('default_volume', overlay.querySelector('#sb-volume').value);
      overlay.querySelector('#sb-upload-progress').style.display = '';
      overlay.querySelector('#sb-upload-go').disabled = true;
      try {
        const res = await fetch(`/api/campaigns/${App.currentCampaign.id}/sounds`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: fd
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        showToast('✅ Wgrano', 'success');
        await this.load();
        this._refreshPanelContent();
        close();
      } catch (e) {
        showToast(e.message || 'Błąd', 'error');
        overlay.querySelector('#sb-upload-progress').style.display = 'none';
        overlay.querySelector('#sb-upload-go').disabled = false;
      }
    });
  },

  openEditor(id) {
    if (!this.isDm()) return;
    const s = this.library.find((it) => it.id === id);
    if (!s) return;
    const overlay = createStackedFeatureOverlay('sb-edit-overlay', buildFeatureModalHtml({
      icon: '🔊',
      title: 'Edytuj dźwięk',
      meta: escapeHtml(s.name),
      modalClass: 'sb-upload-modal',
      bodyHtml: `
          <div class="sb-upload-body">
          <div class="qe-row"><label>Nazwa</label><input type="text" id="se-name" maxlength="100" value="${escapeHtml(s.name)}"></div>
          <div class="qe-row">
            <label>Kategoria</label>
            <select id="se-category">
              <option value="sfx" ${s.category === 'sfx' ? 'selected' : ''}>⚡ SFX</option>
              <option value="ambient" ${s.category === 'ambient' ? 'selected' : ''}>🌧️ Ambient</option>
            </select>
          </div>
          <div class="qe-row"><label>Ikona</label><input type="text" id="se-icon" maxlength="4" value="${escapeHtml(s.icon)}"></div>
          <div class="qe-row">
            <label>Domyślna głośność</label>
            <input type="range" id="se-volume" min="0" max="1" step="0.05" value="${s.default_volume}">
            <span id="se-volume-label">${Math.round(s.default_volume * 100)}%</span>
          </div>
          </div>`,
      footerHtml: `
          <button type="button" class="btn btn-secondary" data-action="close">Anuluj</button>
          <button type="button" class="btn btn-primary" id="se-save">💾 Zapisz</button>`
    }));
    const close = () => overlay.remove();
    overlay.querySelector('#se-volume').addEventListener('input', (e) => {
      overlay.querySelector('#se-volume-label').textContent = `${Math.round(parseFloat(e.target.value) * 100)}%`;
    });
    overlay.querySelector('#se-save').addEventListener('click', async () => {
      try {
        await apiFetch(`/sounds/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: overlay.querySelector('#se-name').value,
            category: overlay.querySelector('#se-category').value,
            icon: overlay.querySelector('#se-icon').value,
            default_volume: parseFloat(overlay.querySelector('#se-volume').value)
          })
        });
        showToast('Zapisano', 'success');
        close();
      } catch (e) { showToast(e.message || 'Błąd', 'error'); }
    });
  },

  async delete(id) {
    if (!confirm('Usunąć ten dźwięk?')) return;
    try {
      await apiFetch(`/sounds/${id}`, { method: 'DELETE' });
      showToast('Usunięto', 'success');
    } catch (e) { showToast(e.message || 'Błąd', 'error'); }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Soundboard;
}
