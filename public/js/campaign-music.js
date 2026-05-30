// ===== Synchronized campaign music (DM upload + room sync) =====
const CampaignMusic = {
  tracks: [],
  playlists: [],
  playback: null,
  audio: null,
  applyingSync: false,
  localVolume: 0.7,
  lastTrackId: null,
  _panelBound: false,

  init() {
    this.audio = document.getElementById('campaign-music-audio');
    const stored = localStorage.getItem('dedeki-music-volume');
    if (stored != null) {
      const v = parseFloat(stored);
      if (!Number.isNaN(v)) this.localVolume = Math.max(0, Math.min(1, v));
    }
    if (this.audio) this.audio.volume = this.localVolume;

    if (this.audio) {
      this.audio.addEventListener('timeupdate', () => this.updateProgressUi());
      this.audio.addEventListener('loadedmetadata', () => this.updateProgressUi());
      this.audio.addEventListener('ended', () => {
        if (this.applyingSync) return;
        if (!this.isDm()) return;
        if (this.playback?.playlistId && this.playback?.autoAdvance !== false) {
          this.emitControl('next');
          return;
        }
        this.emitControl('pause', { positionSec: 0 });
      });
    }
  },

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  openTab() {
    document.querySelector('.session-tab[data-panel="campaign-music-panel"]')?.click();
  },

  open() {
    if (!App.currentCampaign) return;
    this.openTab();
  },

  async onPanelActivate() {
    if (!App.currentCampaign) return;
    this.requestSync();
    this._renderPanel();
  },

  _getMount() {
    return document.getElementById('campaign-music-panel-root');
  },

  _isPanelMounted() {
    return !!document.getElementById('music-player-root');
  },

  _refreshPanel() {
    if (!this._isPanelMounted()) return;
    this._updateHeaderCount();
    this._renderLibrary();
    this._renderPlaylists();
    this.syncPlaylistControls();
    this.updateProgressUi();
    this.renderTimeSpeedUi();
  },

  requestSync() {
    if (App.socket?.connected) App.socket.emit('music-request-sync');
    else if (App.currentCampaign) this.loadFromApi();
  },

  async loadFromApi() {
    if (!App.currentCampaign) return;
    try {
      const data = await apiFetch(`/campaigns/${App.currentCampaign.id}/music`);
      this.applySyncPayload(data);
    } catch (err) {
      console.error('Failed to load music:', err);
    }
  },

  applySyncPayload(data) {
    const wasPlaying = !!this.playback?.isPlaying;
    this.tracks = data.tracks || [];
    this.playlists = data.playlists || [];
    this.playback = data.playback || null;
    const nowPlaying = !!this.playback?.isPlaying;
    this._refreshPanel();
    this.syncAudioToPlayback();
    if (wasPlaying !== nowPlaying && typeof WorldState !== 'undefined') {
      WorldState.onMusicPlaybackChange(nowPlaying);
    }
  },

  getPlaylist(id) {
    return this.playlists.find((p) => p.id === id);
  },

  getActivePlaylist() {
    const id = this.playback?.playlistId;
    return id ? this.getPlaylist(id) : null;
  },

  getTrack(id) {
    return this.tracks.find((t) => t.id === id);
  },

  getActiveTrack() {
    const id = this.playback?.trackId;
    return id ? this.getTrack(id) : null;
  },

  getSyncedPosition() {
    if (!this.playback?.trackId) return 0;
    const p = this.playback;
    if (!p.isPlaying) return Math.max(0, p.positionSec || 0);
    const elapsed = (Date.now() - (p.updatedAt || Date.now())) / 1000;
    return Math.max(0, (p.positionSec || 0) + elapsed);
  },

  async syncAudioToPlayback() {
    if (!this.audio) return;
    this.applyingSync = true;
    try {
      const track = this.getActiveTrack();
      if (!track || !this.playback?.trackId) {
        this.lastTrackId = null;
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.updateProgressUi();
        return;
      }

      const url = track.file_url;
      const targetPos = this.getSyncedPosition();
      const needLoad = this.lastTrackId !== track.id || !this.audio.src || !this.audio.src.includes(url);

      if (needLoad) {
        this.lastTrackId = track.id;
        this.audio.src = url;
        await new Promise((resolve, reject) => {
          const onReady = () => {
            this.audio.removeEventListener('loadedmetadata', onReady);
            this.audio.removeEventListener('error', onErr);
            resolve();
          };
          const onErr = () => {
            this.audio.removeEventListener('loadedmetadata', onReady);
            this.audio.removeEventListener('error', onErr);
            reject(new Error('Nie udało się wczytać utworu'));
          };
          if (this.audio.readyState >= 1) resolve();
          else {
            this.audio.addEventListener('loadedmetadata', onReady);
            this.audio.addEventListener('error', onErr);
          }
        }).catch((err) => {
          console.error('Music load error:', url, err);
          showToast(
            err.message?.includes('wczytać')
              ? `Nie można odtworzyć pliku (${track.title}). Sprawdź, czy plik istnieje na serwerze.`
              : (err.message || 'Błąd odtwarzania'),
            'error'
          );
        });
      }

      if (Math.abs(this.audio.currentTime - targetPos) > 1.2) {
        try {
          this.audio.currentTime = targetPos;
        } catch (_e) { /* ignore */ }
      }

      if (this.playback.isPlaying) {
        try {
          await this.audio.play();
        } catch (err) {
          if (this.isDm()) {
            showToast('Kliknij play — przeglądarka wymaga interakcji', 'warning');
          } else {
            showToast('Kliknij ▶ na zakładce Muzyka, aby usłyszeć sesję', 'info');
          }
        }
      } else {
        this.audio.pause();
      }
    } finally {
      this.applyingSync = false;
      this.updateProgressUi();
    }
  },

  emitControl(action, extra = {}) {
    if (!this.isDm()) return;
    if (!App.socket?.connected) {
      showToast('Brak połączenia z serwerem — poczekaj chwilę lub odśwież stronę', 'warning');
      return;
    }
    const payload = { action, ...extra };
    if (!payload.trackId && this.playback?.trackId) {
      payload.trackId = this.playback.trackId;
    }
    App.socket.emit('music-control', payload);
  },

  onBarClick(e) {
    const btn = e.target.closest('[data-music-action]');
    if (!btn) return;
    const action = btn.dataset.musicAction;
    if (!this.isDm()) {
      if (action === 'mute') this.toggleMute();
      return;
    }

    const track = this.getActiveTrack();
    if (action === 'play') {
      if (!track && this.tracks.length === 1) {
        this.emitControl('play', { trackId: this.tracks[0].id, positionSec: 0 });
        return;
      }
      if (!track) {
        showToast('Wybierz utwór z biblioteki (przycisk ▶ przy tytule)', 'info');
        return;
      }
      if (this.playback?.isPlaying) {
        this.emitControl('pause', { positionSec: this.audio?.currentTime || 0 });
        return;
      }
      const pos = this.audio?.currentTime || this.getSyncedPosition() || 0;
      this.emitControl('play', { trackId: track.id, positionSec: pos });
    } else if (action === 'pause') {
      this.emitControl('pause', { positionSec: this.audio?.currentTime || 0 });
    } else if (action === 'stop') {
      this.emitControl('stop');
    } else if (action === 'next') {
      this.emitControl('next');
    }
  },

  onPlaylistOptionsChange() {
    if (!this.isDm() || !this.playback?.playlistId) return;
    const shuffle = document.getElementById('music-shuffle')?.checked;
    const autoAdvance = document.getElementById('music-auto-advance')?.checked;
    this.emitControl('playlist-options', { shuffle, autoAdvance });
  },

  playPlaylist(playlistId) {
    const pl = this.getPlaylist(playlistId);
    if (!pl?.track_ids?.length) {
      showToast('Playlista jest pusta', 'warning');
      return;
    }
    this.emitControl('play-playlist', {
      playlistId,
      shuffle: pl.shuffle,
      autoAdvance: pl.auto_advance
    });
  },

  onPanelClick(e) {
    if (e.target.closest('[data-music-action]')) {
      this.onBarClick(e);
      return;
    }
    if (!this.isDm()) return;
    const playBtn = e.target.closest('[data-music-play-id]');
    if (playBtn) {
      this.emitControl('play', { trackId: playBtn.dataset.musicPlayId, positionSec: 0 });
      return;
    }
    const delBtn = e.target.closest('[data-music-delete-id]');
    if (delBtn) {
      this.deleteTrack(delBtn.dataset.musicDeleteId);
      return;
    }
    const plPlay = e.target.closest('[data-playlist-play-id]');
    if (plPlay) {
      this.playPlaylist(plPlay.dataset.playlistPlayId);
      return;
    }
    const plEdit = e.target.closest('[data-playlist-edit-id]');
    if (plEdit) {
      this.openPlaylistEditor(plEdit.dataset.playlistEditId);
      return;
    }
    const plDel = e.target.closest('[data-playlist-delete-id]');
    if (plDel) {
      this.deletePlaylist(plDel.dataset.playlistDeleteId);
    }
  },

  async onUploadSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !App.currentCampaign) return;

    const titleInput = document.getElementById('dm-music-title');
    const title = (titleInput?.value || file.name.replace(/\.[^.]+$/, '')).trim();

    const formData = new FormData();
    formData.append('audio', file);
    formData.append('title', title);

    try {
      showToast('Wgrywanie muzyki…', 'info');
      await apiFetch(`/campaigns/${App.currentCampaign.id}/music`, { method: 'POST', body: formData });
      if (titleInput) titleInput.value = '';
      showToast('Utwór dodany', 'success');
      await this.loadFromApi();
    } catch (err) {
      showToast(err.message || 'Błąd uploadu', 'error');
    }
  },

  async onYoutubeImport() {
    if (!App.currentCampaign || !this.isDm()) return;
    const urlInput = document.getElementById('dm-music-youtube-url');
    const titleInput = document.getElementById('dm-music-title');
    const btn = document.getElementById('btn-music-youtube-import');
    const url = (urlInput?.value || '').trim();
    if (!url) {
      showToast('Wklej link YouTube', 'warning');
      return;
    }

    const title = (titleInput?.value || '').trim();
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Pobieranie…';
    }

    try {
      showToast('Pobieranie z YouTube (30–90 s)…', 'info');
      const track = await apiFetch(`/campaigns/${App.currentCampaign.id}/music/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title })
      });
      if (urlInput) urlInput.value = '';
      if (titleInput) titleInput.value = '';
      showToast(
        track.duplicate ? 'Ten utwór jest już w bibliotece' : 'Utwór pobrany z YouTube',
        track.duplicate ? 'info' : 'success'
      );
      await this.loadFromApi();
    } catch (err) {
      showToast(err.message || 'Nie udało się pobrać z YouTube', 'error');
      console.error('YouTube import:', err);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '▶ Pobierz z YouTube';
      }
    }
  },

  _trackMeta(t) {
    if (t.source_type === 'youtube') {
      const parts = ['YouTube'];
      if (t.file_size) parts.push(this.formatFileSize(t.file_size));
      return parts.join(' · ');
    }
    return this.formatFileSize(t.file_size);
  },

  async deleteTrack(trackId) {
    if (!App.currentCampaign || !confirm('Usunąć ten utwór z kampanii?')) return;
    try {
      await apiFetch(`/campaigns/${App.currentCampaign.id}/music/${trackId}`, { method: 'DELETE' });
      showToast('Utwór usunięty', 'success');
      await this.loadFromApi();
    } catch (err) {
      showToast(err.message || 'Nie udało się usunąć', 'error');
    }
  },

  onSeekInput(seek) {
    if (!this.isDm() || !this.audio?.duration) return;
    const pct = parseFloat(seek.value) / 100;
    const curEl = document.getElementById('music-time-current');
    if (curEl) curEl.textContent = this.formatTime(pct * this.audio.duration);
  },

  onSeekCommit(seek) {
    if (!this.isDm() || !this.audio?.duration) return;
    const pos = (parseFloat(seek.value) / 100) * this.audio.duration;
    const track = this.getActiveTrack();
    if (!track) return;
    this.emitControl('seek', {
      trackId: track.id,
      positionSec: pos,
      isPlaying: this.playback?.isPlaying
    });
  },

  onVolumeChange(vol) {
    this.localVolume = Math.max(0, Math.min(1, parseInt(vol.value, 10) / 100));
    if (this.audio) this.audio.volume = this.localVolume;
    localStorage.setItem('dedeki-music-volume', String(this.localVolume));
    const muteBtn = document.getElementById('music-mute-btn');
    if (muteBtn) muteBtn.textContent = this.localVolume === 0 ? '🔇' : '🔊';
    const volLabel = document.getElementById('music-volume-label');
    if (volLabel) volLabel.textContent = `${Math.round(this.localVolume * 100)}%`;
  },

  toggleMute() {
    const vol = document.getElementById('music-volume');
    if (!vol) return;
    if (this.localVolume > 0) {
      this._prevVolume = this.localVolume;
      vol.value = '0';
    } else {
      vol.value = String(Math.round((this._prevVolume ?? 0.7) * 100));
    }
    this.onVolumeChange(vol);
  },

  formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  },

  formatFileSize(bytes) {
    const n = parseInt(bytes, 10) || 0;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  },

  updateProgressUi() {
    const track = this.getActiveTrack();
    const titleEl = document.getElementById('music-track-title');
    const curEl = document.getElementById('music-time-current');
    const durEl = document.getElementById('music-time-duration');
    const seek = document.getElementById('music-seek');
    const playBtn = document.getElementById('music-play-btn');
    const deck = document.getElementById('music-player-root');

    if (titleEl) {
      const pl = this.getActivePlaylist();
      const plLabel = pl ? ` · 🎼 ${pl.name}` : '';
      titleEl.textContent = track
        ? `${this.playback?.isPlaying ? '▶ ' : '⏸ '}${track.title}${plLabel}`
        : 'Brak odtwarzania';
    }

    const dur = this.audio?.duration || 0;
    let cur = this.audio?.currentTime || 0;
    if (this.applyingSync && this.playback) cur = this.getSyncedPosition();

    if (curEl) curEl.textContent = this.formatTime(cur);
    if (durEl) durEl.textContent = this.formatTime(dur);
    if (seek && dur > 0) {
      seek.value = String(Math.min(100, Math.max(0, (cur / dur) * 100)));
      seek.disabled = !this.isDm() || !track;
    }
    if (playBtn) {
      playBtn.textContent = this.playback?.isPlaying ? '⏸' : '▶';
      playBtn.disabled = !this.isDm() || !track;
      playBtn.title = this.isDm() ? (this.playback?.isPlaying ? 'Pauza' : 'Odtwórz') : 'Sterowanie tylko dla MG';
    }
    if (deck) {
      deck.classList.toggle('bard-player--playing', !!this.playback?.isPlaying);
      deck.classList.toggle('bard-player--idle', !track);
    }
  },

  renderTimeSpeedUi() {
    if (typeof WorldState !== 'undefined') WorldState._renderTimeSpeedUi();
  },

  syncPlaylistControls() {
    const wrap = document.getElementById('bard-playlist-controls');
    const nameEl = document.getElementById('music-playlist-name');
    const shuffleEl = document.getElementById('music-shuffle');
    const autoEl = document.getElementById('music-auto-advance');
    const nextBtn = document.getElementById('music-next-btn');
    const pl = this.getActivePlaylist();
    const inPlaylist = !!this.playback?.playlistId;

    if (wrap) wrap.hidden = !this.isDm();
    if (nameEl) {
      nameEl.textContent = pl
        ? `Playlista: ${pl.name} (${pl.track_ids.length} utw.)`
        : 'Odtwarzanie pojedynczego utworu';
    }
    if (shuffleEl && inPlaylist) shuffleEl.checked = !!this.playback?.shuffle;
    if (autoEl && inPlaylist) autoEl.checked = this.playback?.autoAdvance !== false;
    if (nextBtn) nextBtn.disabled = !this.isDm() || !inPlaylist;
    if (shuffleEl) shuffleEl.disabled = !this.isDm() || !inPlaylist;
    if (autoEl) autoEl.disabled = !this.isDm() || !inPlaylist;
  },

  _renderPlaylists() {
    const listEl = document.getElementById('dm-music-playlists');
    if (!listEl) return;

    if (!this.isDm()) {
      const pl = this.getActivePlaylist();
      listEl.innerHTML = pl
        ? `<p class="bard-library__hint">🎼 Aktywna playlista MG: <strong>${escapeHtml(pl.name)}</strong></p>`
        : '';
      return;
    }

    if (!this.playlists.length) {
      listEl.innerHTML = '<p class="bard-library-empty">Brak playlist — utwórz pierwszą, aby odtwarzać kolejne utwory automatycznie.</p>';
      return;
    }

    listEl.innerHTML = this.playlists.map((pl) => {
      const active = this.playback?.playlistId === pl.id;
      const count = pl.track_ids?.length || 0;
      const flags = [
        pl.shuffle ? '🔀 losowo' : '▶ kolejno',
        pl.auto_advance !== false ? '⏭ auto' : '⏸ bez auto'
      ].join(' · ');
      return `
        <div class="bard-playlist ${active ? 'bard-playlist--active' : ''}">
          <div class="bard-playlist__info">
            <strong>${escapeHtml(pl.name)}</strong>
            <span class="bard-playlist__meta">${count} ${count === 1 ? 'utwór' : count < 5 ? 'utwory' : 'utworów'} · ${flags}</span>
          </div>
          <div class="bard-playlist__actions">
            <button type="button" class="btn btn-sm bard-track__play" data-playlist-play-id="${pl.id}" title="Odtwórz playlistę" ${count ? '' : 'disabled'}>▶</button>
            <button type="button" class="btn btn-sm btn-secondary" data-playlist-edit-id="${pl.id}" title="Edytuj">✏️</button>
            <button type="button" class="btn btn-sm btn-danger" data-playlist-delete-id="${pl.id}" title="Usuń">🗑️</button>
          </div>
        </div>`;
    }).join('');
  },

  openPlaylistEditor(playlistId = null) {
    if (!App.currentCampaign || !this.isDm()) return;
    const existing = playlistId ? this.getPlaylist(playlistId) : null;
    const selected = new Set(existing?.track_ids || []);
    const trackChecks = this.tracks.length
      ? this.tracks.map((t) => `
          <label class="bard-playlist-pick">
            <input type="checkbox" class="bard-playlist-pick__cb" value="${t.id}" ${selected.has(t.id) ? 'checked' : ''}>
            <span>${escapeHtml(t.title)}</span>
          </label>`).join('')
      : '<p class="bard-library-empty">Najpierw dodaj utwory do biblioteki.</p>';

    const overlay = createStackedFeatureOverlay('bard-playlist-overlay', buildFeatureModalHtml({
      icon: '🎼',
      title: existing ? 'Edytuj playlistę' : 'Nowa playlista',
      meta: 'Wybierz utwory i opcje odtwarzania',
      modalClass: 'bard-playlist-modal',
      bodyHtml: `
        <div class="bard-playlist-form">
          <div class="qe-row">
            <label>Nazwa playlisty</label>
            <input type="text" id="bard-pl-name" maxlength="80" value="${existing ? escapeHtml(existing.name) : ''}" placeholder="np. Walka w jaskini, Tawerna">
          </div>
          <div class="bard-playlist-form__opts">
            <label><input type="checkbox" id="bard-pl-shuffle" ${existing?.shuffle ? 'checked' : ''}> 🔀 Losowe kolejności (shuffle)</label>
            <label><input type="checkbox" id="bard-pl-auto" ${existing?.auto_advance !== false ? 'checked' : ''}> ⏭ Przechodź do następnego utworu</label>
          </div>
          <p class="bard-library__hint">Zaznacz utwory w bibliotece kampanii:</p>
          <div class="bard-playlist-picks">${trackChecks}</div>
        </div>`,
      footerHtml: `
        <button type="button" class="btn btn-secondary" data-action="close">Anuluj</button>
        <button type="button" class="btn btn-primary" id="bard-pl-save">💾 Zapisz</button>`
    }));

    overlay.querySelector('#bard-pl-save')?.addEventListener('click', async () => {
      const name = overlay.querySelector('#bard-pl-name')?.value?.trim();
      if (!name) {
        showToast('Podaj nazwę playlisty', 'warning');
        return;
      }
      const track_ids = [...overlay.querySelectorAll('.bard-playlist-pick__cb:checked')].map((el) => el.value);
      const shuffle = !!overlay.querySelector('#bard-pl-shuffle')?.checked;
      const auto_advance = !!overlay.querySelector('#bard-pl-auto')?.checked;
      try {
        if (existing) {
          await apiFetch(`/music/playlists/${existing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, track_ids, shuffle, auto_advance })
          });
          showToast('Playlista zaktualizowana', 'success');
        } else {
          await apiFetch(`/campaigns/${App.currentCampaign.id}/music/playlists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, track_ids, shuffle, auto_advance })
          });
          showToast('Playlista utworzona', 'success');
        }
        overlay.remove();
        await this.loadFromApi();
      } catch (err) {
        showToast(err.message || 'Nie udało się zapisać playlisty', 'error');
      }
    });
  },

  async deletePlaylist(playlistId) {
    if (!confirm('Usunąć tę playlistę?')) return;
    try {
      await apiFetch(`/music/playlists/${playlistId}`, { method: 'DELETE' });
      showToast('Playlista usunięta', 'success');
      await this.loadFromApi();
    } catch (err) {
      showToast(err.message || 'Nie udało się usunąć', 'error');
    }
  },

  _renderLibrary() {
    const listEl = document.getElementById('dm-music-list');
    if (!listEl) return;

    if (!this.tracks.length) {
      listEl.innerHTML = '<p class="bard-library-empty">Brak utworów — wgraj plik audio lub pobierz z linku YouTube.</p>';
      return;
    }

    listEl.innerHTML = this.tracks.map((t) => {
      const active = this.playback?.trackId === t.id;
      const isYoutube = t.source_type === 'youtube';
      return `
        <div class="bard-track ${active ? 'bard-track--active' : ''}">
          <span class="bard-track__disc" aria-hidden="true">${isYoutube ? '▶️' : '💿'}</span>
          <div class="bard-track__info">
            <strong>${escapeHtml(t.title)}${isYoutube ? ' <span class="bard-track__yt">YT</span>' : ''}</strong>
            <span class="bard-track__meta">${this._trackMeta(t)}</span>
            ${isYoutube && t.source_url && this.isDm()
              ? `<a class="bard-track__source" href="${escapeHtml(t.source_url)}" target="_blank" rel="noopener noreferrer">Źródło</a>`
              : ''}
          </div>
          <div class="bard-track__actions">
            ${this.isDm()
              ? `<button type="button" class="btn btn-sm bard-track__play" data-music-play-id="${t.id}" title="Odtwórz dla wszystkich">▶</button>
                 <button type="button" class="btn btn-sm btn-danger" data-music-delete-id="${t.id}" title="Usuń">🗑️</button>`
              : (active && this.playback?.isPlaying ? '<span class="bard-track__live">🔴 gra</span>' : '')}
          </div>
        </div>`;
    }).join('');
  },

  _renderPanel() {
    const mount = this._getMount();
    if (!mount) return;
    if (this._isPanelMounted()) {
      this._updateHeaderCount();
      this._renderLibrary();
      this._renderPlaylists();
      this.syncPlaylistControls();
      this.updateProgressUi();
      this.renderTimeSpeedUi();
      return;
    }
    const isDm = this.isDm();
    const trackCount = this.tracks.length;

    mount.innerHTML = `
      <div class="bard-stage bard-stage--panel" role="region" aria-label="Muzyka sesji">
        <div class="bard-stage__embers" aria-hidden="true"></div>
        <header class="bard-stage__header">
          <div class="bard-stage__brand">
            <span class="bard-stage__lute" aria-hidden="true">🎵</span>
            <div>
              <h2 class="bard-stage__title">Scena Barda</h2>
              <p class="bard-stage__sub" id="bard-track-count">${trackCount} ${trackCount === 1 ? 'utwór' : trackCount < 5 ? 'utwory' : 'utworów'} · synchronizacja dla całej drużyny</p>
            </div>
          </div>
        </header>
        <div class="bard-stage__body">
          <section class="bard-player-wrap">
            <div id="music-player-root" class="bard-player bard-player--idle">
              <div class="bard-vinyl" aria-hidden="true"><span class="bard-vinyl__label">🎲</span></div>
              <div class="bard-player__main">
                <p class="bard-player__label">Teraz gra</p>
                <p id="music-track-title" class="bard-player__title">Brak odtwarzania</p>
                <div class="bard-player__transport">
                  <button type="button" id="music-play-btn" class="btn bard-transport-btn" data-music-action="play" title="Odtwórz / pauza" disabled>▶</button>
                  <button type="button" id="music-next-btn" class="btn bard-transport-btn" data-music-action="next" title="Następny utwór" disabled>⏭</button>
                  <button type="button" id="music-stop-btn" class="btn bard-transport-btn bard-transport-btn--stop" data-music-action="stop" title="Stop" ${isDm ? '' : 'hidden'}>⏹</button>
                  <span id="music-time-current" class="bard-time">0:00</span>
                  <input type="range" id="music-seek" class="bard-seek" min="0" max="100" value="0" disabled>
                  <span id="music-time-duration" class="bard-time">0:00</span>
                </div>
                <div class="bard-playlist-controls" id="bard-playlist-controls" ${isDm ? '' : 'hidden'}>
                  <span id="music-playlist-name" class="bard-playlist-controls__name">Odtwarzanie pojedynczego utworu</span>
                  <label class="bard-playlist-controls__opt"><input type="checkbox" id="music-shuffle" disabled> 🔀 Shuffle</label>
                  <label class="bard-playlist-controls__opt"><input type="checkbox" id="music-auto-advance" disabled> ⏭ Auto następny</label>
                </div>
                <div class="bard-player__volume">
                  <button type="button" id="music-mute-btn" class="btn btn-sm btn-secondary" data-music-action="mute" title="Wycisz">🔊</button>
                  <input type="range" id="music-volume" class="bard-volume" min="0" max="100" value="${Math.round(this.localVolume * 100)}" title="Głośność (lokalna)">
                  <span id="music-volume-label" class="bard-volume-label">${Math.round(this.localVolume * 100)}%</span>
                </div>
              </div>
            </div>
          </section>
          <section class="bard-library">
            <h3 class="bard-library__title">📚 Biblioteka kampanii</h3>
            ${isDm ? `
              <p class="bard-library__hint">Muzyka odtwarza się <strong>zsynchronizowanie</strong> u wszystkich. Steruje nią MG — ▶ włącza też auto-czas w kalendarzu.</p>
              <div class="bard-upload">
                <input type="text" id="dm-music-title" class="bard-upload__title" placeholder="Tytuł utworu (opcjonalnie)">
                <label class="btn btn-sm btn-primary bard-upload__btn">
                  📤 Wgraj audio
                  <input type="file" id="dm-music-file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.webm,.flac" hidden>
                </label>
              </div>
              <div class="bard-youtube-import">
                <input type="url" id="dm-music-youtube-url" class="bard-upload__title bard-youtube-import__url" placeholder="Link YouTube (watch lub youtu.be)">
                <button type="button" id="btn-music-youtube-import" class="btn btn-sm btn-secondary">▶ Pobierz z YouTube</button>
              </div>
              <p class="bard-upload__limits">Upload: max 25 MB · mp3, ogg, wav, m4a · YouTube: max 15 min · tylko prywatna sesja · wymaga yt-dlp na serwerze</p>
            ` : '<p class="bard-library__hint">Słuchasz muzyki sesji zsynchronizowanej z MG. Głośność regulujesz u siebie.</p>'}
            <div id="dm-music-list" class="bard-library__list"></div>
          </section>
          <section class="bard-library bard-playlists-section">
            <div class="bard-playlists-section__head">
              <h3 class="bard-library__title">🎼 Playlisty</h3>
              ${isDm ? '<button type="button" id="btn-bard-new-playlist" class="btn btn-sm btn-primary">➕ Nowa playlista</button>' : ''}
            </div>
            ${isDm ? '<p class="bard-library__hint">▶ na playliście odtwarza ją dla wszystkich. Włącz shuffle i auto-następny — po końcu utworu przechodzi dalej (zapętla playlistę).</p>' : ''}
            <div id="dm-music-playlists" class="bard-library__list"></div>
          </section>
        </div>
      </div>`;

    this._bindPanelEvents();
    this._updateHeaderCount();
    this._renderLibrary();
    this._renderPlaylists();
    this.syncPlaylistControls();
    this.updateProgressUi();
    this.renderTimeSpeedUi();
  },

  _updateHeaderCount() {
    const line = document.getElementById('bard-track-count');
    if (!line) return;
    const n = this.tracks.length;
    line.textContent = `${n} ${n === 1 ? 'utwór' : n < 5 ? 'utwory' : 'utworów'} · synchronizacja dla całej drużyny`;
  },

  _bindPanelEvents() {
    const mount = this._getMount();
    if (!mount || mount.dataset.bound === '1') return;
    mount.dataset.bound = '1';

    mount.addEventListener('click', (e) => {
      if (e.target.closest('#btn-bard-new-playlist')) {
        e.preventDefault();
        this.openPlaylistEditor();
        return;
      }
      if (e.target.closest('#btn-music-youtube-import')) {
        e.preventDefault();
        this.onYoutubeImport();
        return;
      }
      this.onPanelClick(e);
    });
    mount.addEventListener('change', (e) => {
      if (e.target.id === 'dm-music-file') this.onUploadSelected(e);
    });

    const seek = document.getElementById('music-seek');
    if (seek) {
      seek.addEventListener('input', () => this.onSeekInput(seek));
      seek.addEventListener('change', () => this.onSeekCommit(seek));
    }
    const vol = document.getElementById('music-volume');
    if (vol) {
      vol.addEventListener('input', () => this.onVolumeChange(vol));
    }
    document.getElementById('music-shuffle')?.addEventListener('change', () => this.onPlaylistOptionsChange());
    document.getElementById('music-auto-advance')?.addEventListener('change', () => this.onPlaylistOptionsChange());
  },

  onEnterCampaign() {
    this.requestSync();
    this._refreshPanel();
  },

  onLeaveCampaign() {
    this.tracks = [];
    this.playlists = [];
    this.playback = null;
    this.lastTrackId = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
    }
    const mount = this._getMount();
    if (mount) {
      mount.innerHTML = '';
      delete mount.dataset.bound;
    }
  }
};
