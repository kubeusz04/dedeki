// ===== Synchronized campaign music (DM upload + room sync) =====
const CampaignMusic = {
  tracks: [],
  playback: null,
  audio: null,
  barEl: null,
  dmPanelEl: null,
  applyingSync: false,
  localVolume: 0.7,
  lastTrackId: null,

  init() {
    this.audio = document.getElementById('campaign-music-audio');
    this.barEl = document.getElementById('campaign-music-bar');
    this.dmPanelEl = document.getElementById('dm-music-panel');
    const stored = localStorage.getItem('dedeki-music-volume');
    if (stored != null) {
      const v = parseFloat(stored);
      if (!Number.isNaN(v)) this.localVolume = Math.max(0, Math.min(1, v));
    }
    if (this.audio) this.audio.volume = this.localVolume;

    this.barEl?.addEventListener('click', (e) => this.onBarClick(e));
    this.dmPanelEl?.addEventListener('click', (e) => this.onDmPanelClick(e));
    this.dmPanelEl?.addEventListener('change', (e) => {
      if (e.target.id === 'dm-music-file') this.onUploadSelected(e);
    });

    const seek = document.getElementById('music-seek');
    if (seek) {
      seek.addEventListener('input', () => this.onSeekInput(seek));
      seek.addEventListener('change', () => this.onSeekCommit(seek));
    }
    const vol = document.getElementById('music-volume');
    if (vol) {
      vol.value = String(Math.round(this.localVolume * 100));
      vol.addEventListener('input', () => this.onVolumeChange(vol));
    }

    if (this.audio) {
      this.audio.addEventListener('timeupdate', () => this.updateProgressUi());
      this.audio.addEventListener('loadedmetadata', () => this.updateProgressUi());
      this.audio.addEventListener('ended', () => {
        if (this.isDm() && !this.applyingSync) {
          this.emitControl('pause', { positionSec: 0 });
        }
      });
    }
  },

  isDm() {
    return App.currentCampaign?.role === 'dm';
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
    this.tracks = data.tracks || [];
    this.playback = data.playback || null;
    this.renderBar();
    this.renderDmPanel();
    this.syncAudioToPlayback();
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
        this.barEl?.classList.add('hidden');
        return;
      }

      this.barEl?.classList.remove('hidden');

      const url = track.file_url;
      const targetPos = this.getSyncedPosition();
      const needLoad = this.lastTrackId !== track.id || !this.audio.src || !this.audio.src.endsWith(url);

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
          showToast(err.message || 'Błąd odtwarzania', 'error');
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
            showToast('Kliknij ▶ na pasku muzyki, aby usłyszeć sesję', 'info');
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
    if (!App.socket || !this.isDm()) return;
    const payload = { action, ...extra };
    if (this.playback?.trackId) payload.trackId = this.playback.trackId;
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
      if (!track) return;
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
    }
  },

  onDmPanelClick(e) {
    if (!this.isDm()) return;
    const playBtn = e.target.closest('[data-music-play-id]');
    if (playBtn) {
      this.emitControl('play', { trackId: playBtn.dataset.musicPlayId, positionSec: 0 });
      return;
    }
    const delBtn = e.target.closest('[data-music-delete-id]');
    if (delBtn) this.deleteTrack(delBtn.dataset.musicDeleteId);
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
    document.getElementById('music-time-current').textContent = this.formatTime(pct * this.audio.duration);
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

    if (titleEl) {
      titleEl.textContent = track
        ? `${this.playback?.isPlaying ? '▶ ' : '⏸ '}${track.title}`
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
  },

  renderBar() {
    if (!this.barEl) return;
    const track = this.getActiveTrack();
    const showControls = this.isDm();
    this.barEl.classList.toggle('hidden', !track && !this.tracks.length);
    this.updateProgressUi();

    const stopBtn = document.getElementById('music-stop-btn');
    if (stopBtn) stopBtn.style.display = showControls ? '' : 'none';
  },

  renderDmPanel() {
    if (!this.dmPanelEl) return;
    if (!this.isDm()) {
      this.dmPanelEl.innerHTML = '';
      return;
    }

    const list = this.tracks.length
      ? this.tracks.map((t) => {
          const active = this.playback?.trackId === t.id;
          return `
            <div class="dm-music-track ${active ? 'active' : ''}">
              <div class="dm-music-track-info">
                <strong>${escapeHtml(t.title)}</strong>
                <span class="sheet-hint">${this.formatFileSize(t.file_size)}</span>
              </div>
              <div class="dm-music-track-actions">
                <button type="button" class="btn btn-sm btn-primary" data-music-play-id="${t.id}" title="Odtwórz dla wszystkich">▶</button>
                <button type="button" class="btn btn-sm btn-danger" data-music-delete-id="${t.id}" title="Usuń">🗑️</button>
              </div>
            </div>
          `;
        }).join('')
      : '<p class="sheet-hint">Brak utworów — wgraj plik audio (mp3, ogg, wav…).</p>';

    this.dmPanelEl.innerHTML = `
      <p class="sheet-hint">Muzyka odtwarza się <strong>zsynchronizowanie</strong> u wszystkich w sesji. Steruje nią MG.</p>
      <div class="dm-music-upload">
        <input type="text" id="dm-music-title" class="input-sm" placeholder="Tytuł utworu (opcjonalnie)">
        <label class="btn btn-sm btn-primary dm-music-file-label">
          📤 Wgraj audio
          <input type="file" id="dm-music-file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.webm,.flac" hidden>
        </label>
      </div>
      <p class="sheet-hint">Max 25 MB · mp3, ogg, wav, m4a</p>
      <div class="dm-music-list">${list}</div>
    `;
  },

  onEnterCampaign() {
    this.requestSync();
    this.renderDmPanel();
  },

  onLeaveCampaign() {
    this.tracks = [];
    this.playback = null;
    this.lastTrackId = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
    }
    this.barEl?.classList.add('hidden');
    if (this.dmPanelEl) this.dmPanelEl.innerHTML = '';
  }
};
