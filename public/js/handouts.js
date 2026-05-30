// ===== Player handouts =====
// MG przesyła obraz/PDF do wybranego gracza lub całej drużyny.
// Pliki są chronione: serwer sprawdza ACL przy każdym żądaniu /handout-files/...
const Handouts = {
  list: [],

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  bindSocketEvents(socket) {
    if (!socket) return;
    socket.on('handout-new', (data) => {
      if (!App.currentCampaign || data?.campaignId !== App.currentCampaign.id) return;
      const myId = App.user?.id;
      const visible = !data.recipient_user_ids?.length
        || data.recipient_user_ids.includes(String(myId));
      if (visible || this.isDm()) {
        if (visible && !this.isDm()) {
          showToast(`📜 ${data.from || 'MG'} wysłał ci handout: ${data.title}`, 'info');
        }
        this.load().then(() => this._refreshGrid());
      }
    });
    socket.on('handout-updated', () => {
      this.load().then(() => this._refreshGrid());
    });
    socket.on('handout-deleted', () => {
      this.load().then(() => this._refreshGrid());
    });
  },

  async load() {
    if (!App.currentCampaign) return;
    try {
      this.list = await apiFetch(`/campaigns/${App.currentCampaign.id}/handouts`);
    } catch (err) {
      console.error('handouts load', err);
      this.list = [];
    }
  },

  openTab() {
    document.querySelector('.session-tab[data-panel="handouts-panel"]')?.click();
  },

  async onPanelActivate() {
    if (!App.currentCampaign) return;
    await this.load();
    this._renderPanel();
  },

  open() {
    if (!App.currentCampaign) return;
    this.openTab();
  },

  _getMount() {
    return document.getElementById('handouts-panel-root');
  },

  _isUiMounted() {
    return !!document.getElementById('handouts-grid');
  },

  _refreshGrid() {
    if (this._isUiMounted()) this._renderGrid();
  },

  _docLabel(n) {
    if (n === 0) return '0 dokumentów';
    if (n === 1) return '1 dokument';
    if (n >= 2 && n <= 4) return `${n} dokumenty`;
    return `${n} dokumentów`;
  },

  _panelEyebrow() {
    return this.isDm() ? 'Archiwum tajnych przekazów' : 'Powierzone dokumenty';
  },

  _panelSub() {
    const n = this.list.length;
    if (!n) {
      return this.isDm()
        ? 'Puste archiwum · wyślij obrazy i PDF wybranym graczom lub całej drużynie'
        : 'Brak przekazów · MG może ci powierzyć mapy, listy i tajemnice';
    }
    if (this.isDm()) {
      const revealed = this.list.filter((h) => h.is_revealed).length;
      const hidden = n - revealed;
      const bits = [this._docLabel(n) + ' w archiwum'];
      if (revealed) bits.push(`${revealed} ujawnione`);
      if (hidden) bits.push(`${hidden} poufne`);
      bits.push('kontrola widoczności dla drużyny');
      return bits.join(' · ');
    }
    return `${this._docLabel(n)} dla ciebie · otwieraj materiały od MG`;
  },

  _updateHeaderMeta() {
    const brow = document.getElementById('handouts-eyebrow');
    const sub = document.getElementById('handouts-sub-line');
    if (brow) brow.textContent = this._panelEyebrow();
    if (sub) sub.textContent = this._panelSub();
  },

  _renderPanelHeader() {
    return `
      <header class="dm-feature-header handouts-header">
        <span class="dm-feature-header__icon" aria-hidden="true">🔒</span>
        <div class="dm-feature-header__titles">
          <p class="handouts-header__eyebrow" id="handouts-eyebrow">${escapeHtml(this._panelEyebrow())}</p>
          <h3>Tajne handouty</h3>
          <p class="dm-feature-header__sub" id="handouts-sub-line">${escapeHtml(this._panelSub())}</p>
        </div>
      </header>`;
  },

  // ===== Helpers =====
  fileUrlWithToken(fileUrl) {
    const tok = encodeURIComponent(getToken() || '');
    return `${fileUrl}?token=${tok}`;
  },

  isImage(mime) { return (mime || '').startsWith('image/'); },
  isPdf(mime) { return mime === 'application/pdf'; },

  formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  },

  recipientLabel(h) {
    if (!h.recipient_user_ids?.length) return '👥 Cała drużyna';
    const members = App.currentCampaign?.members || [];
    const names = h.recipient_user_ids
      .map((id) => members.find((m) => String(m.id) === String(id)))
      .filter(Boolean)
      .map((m) => m.display_name || m.username);
    if (!names.length) return '🤐 Tylko MG';
    return '👤 ' + names.join(', ');
  },

  _players() {
    const members = App.currentCampaign?.members || [];
    return members.filter((m) => m.role !== 'dm');
  },

  // ===== Panel sesji: archiwum =====
  _renderPanel() {
    const mount = this._getMount();
    if (!mount) return;
    const newBtn = this.isDm()
      ? `<button type="button" class="btn btn-primary handouts-btn-seal" data-action="new">🕯️ Nowy przekaz</button>`
      : '';
    const hint = this.isDm()
      ? 'Widzisz całe archiwum — ujawniaj i ukrywaj przed drużyną.'
      : 'Materiały przekazane przez MG tylko tobie lub drużynie.';
    mount.innerHTML = `
      <div class="handouts-vault handouts-vault--panel" role="region" aria-label="Tajne handouty">
        <div class="handouts-vault__glow" aria-hidden="true"></div>
        <div class="handouts-vault__chains" aria-hidden="true"></div>
        <div class="handouts-vault__frame">
          <div class="handouts-vault__rune" aria-hidden="true">◈ ✦ ◈</div>
          <div class="handouts-vault__inner">
            <div class="handouts-vault-cover">
              ${this._renderPanelHeader()}
            </div>
            <div class="dm-feature-toolbar handouts-toolbar">
              <p class="handouts-toolbar__hint">${escapeHtml(hint)}</p>
              ${newBtn}
            </div>
            <div class="handouts-chamber">
              <div class="handouts-chamber__mist" aria-hidden="true"></div>
              <div class="handouts-chamber__sigil" aria-hidden="true">☽</div>
              <div class="dm-feature-body handouts-body">
                <p class="handouts-motto dm-feature-intro">${this.isDm()
                  ? 'Przekaż graczom <strong>mapy, listy i tajemnice</strong> — kontroluj, kto je widzi i kiedy je ujawniasz.'
                  : 'Otwieraj tylko to, co MG ci powierzył — reszta pozostaje w cieniu.'}</p>
                <div class="handouts-grid" id="handouts-grid"></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    mount.querySelector('[data-action="new"]')?.addEventListener('click', () => this.openUploader());
    this._renderGrid();
  },

  _renderGrid() {
    const grid = document.getElementById('handouts-grid');
    if (!grid) return;
    if (!this.list.length) {
      grid.innerHTML = `<div class="handouts-empty dm-feature-empty">
        <span class="dm-feature-empty__icon" aria-hidden="true">🔒</span>
        <p>${this.isDm()
          ? 'Archiwum jest puste — żaden tajny przekaz nie został jeszcze zapieczętowany.<br>Kliknij <strong>🕯️ Nowy przekaz</strong>.'
          : 'Nikt nie powierzył ci jeszcze żadnego dokumentu.<br>Poczekaj na MG.'}</p>
      </div>`;
      this._updateHeaderMeta();
      return;
    }
    grid.innerHTML = this.list.map((h) => this._renderCard(h)).join('');
    this._updateHeaderMeta();
    grid.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        const act = b.dataset.act;
        if (act === 'view') return this.openViewer(id);
        if (act === 'edit') return this.openEditor(id);
        if (act === 'delete') return this.delete(id);
        if (act === 'reveal') return this.toggleReveal(id, true);
        if (act === 'hide') return this.toggleReveal(id, false);
      });
    });
  },

  _renderCard(h) {
    const isImg = this.isImage(h.mime_type);
    const isPdf = this.isPdf(h.mime_type);
    const thumb = isImg
      ? `<div class="handout-thumb"><img src="${this.fileUrlWithToken(h.file_url)}" alt="" loading="lazy"></div>`
      : `<div class="handout-thumb handout-thumb-icon">${isPdf ? '📄 PDF' : '📎'}</div>`;
    const dmActions = this.isDm()
      ? `<div class="handout-actions">
           <button type="button" class="btn btn-xs btn-secondary" data-act="view" data-id="${h.id}">👁️</button>
           <button type="button" class="btn btn-xs btn-secondary" data-act="edit" data-id="${h.id}">✏️</button>
           ${h.is_revealed
             ? `<button type="button" class="btn btn-xs btn-secondary" data-act="hide" data-id="${h.id}" title="Ukryj">🙈</button>`
             : `<button type="button" class="btn btn-xs btn-success" data-act="reveal" data-id="${h.id}" title="Ujawnij">📢</button>`}
           <button type="button" class="btn btn-xs btn-danger" data-act="delete" data-id="${h.id}">🗑️</button>
         </div>`
      : `<div class="handout-actions">
           <button type="button" class="btn btn-sm btn-primary" data-act="view" data-id="${h.id}">👁️ Otwórz</button>
         </div>`;
    const hiddenBadge = !h.is_revealed && this.isDm()
      ? `<span class="handout-hidden-badge" title="Ukryty przed graczami">🔒 Poufne</span>` : '';
    const sealStamp = !h.is_revealed
      ? `<div class="handout-card__stamp" aria-hidden="true">UKRYTE</div>`
      : `<div class="handout-card__wax" aria-hidden="true">✦</div>`;
    return `
      <article class="handout-secret-card handout-card ${h.is_revealed ? 'is-revealed' : 'is-hidden'}" data-id="${h.id}">
        ${sealStamp}
        <div class="handout-card__frame">
        ${thumb}
        <div class="handout-info">
          <div class="handout-title-row">
            <h4 class="handout-card__title">${escapeHtml(h.title)}</h4>
            ${hiddenBadge}
          </div>
          ${h.description ? `<div class="handout-desc">${escapeHtml(h.description).replace(/\n/g, '<br>')}</div>` : ''}
          <div class="handout-meta">
            <span>${this.recipientLabel(h)}</span>
            ${h.file_size ? `<span class="handout-size">${this.formatSize(h.file_size)}</span>` : ''}
            ${h.mime_type ? `<span class="handout-mime">${escapeHtml(h.mime_type)}</span>` : ''}
          </div>
          ${dmActions}
        </div>
        </div>
      </article>`;
  },

  // ===== Viewer =====
  openViewer(id) {
    const h = this.list.find((it) => it.id === id);
    if (!h) return;
    const url = this.fileUrlWithToken(h.file_url);
    const body = this.isImage(h.mime_type)
      ? `<div class="handout-viewer-image"><img src="${url}" alt="${escapeHtml(h.title)}"></div>`
      : this.isPdf(h.mime_type)
        ? `<iframe src="${url}" class="handout-viewer-pdf" title="${escapeHtml(h.title)}"></iframe>`
        : `<div class="handout-viewer-fallback"><a href="${url}" target="_blank" rel="noopener">⬇️ Pobierz plik</a></div>`;
    const overlay = createStackedFeatureOverlay('handout-viewer-overlay', buildFeatureModalHtml({
      icon: '🕯️',
      title: h.title,
      meta: `${this.recipientLabel(h)} · pod światłem świec`,
      modalClass: 'handout-viewer-modal handouts-vault-view',
      bodyHtml: `
        <div class="handout-viewer-body">
          <div class="handout-viewer__label" aria-hidden="true">Odszyfrowany dokument</div>
          ${h.description ? `<div class="handout-viewer-desc">${escapeHtml(h.description).replace(/\n/g, '<br>')}</div>` : ''}
          <div class="handout-viewer__reveal">${body}</div>
        </div>`,
      footerHtml: `
          <a href="${url}" target="_blank" rel="noopener" class="btn btn-secondary">⬇️ Otwórz w nowej karcie</a>
          <button type="button" class="btn btn-secondary" data-action="close">Zamknij</button>`
    }));
    const close = () => overlay.remove();
    overlay.querySelector('[data-action="close"]')?.addEventListener('click', close);
  },

  // ===== Uploader (DM) =====
  openUploader() {
    if (!this.isDm()) return;
    const players = this._players();
    const overlay = createStackedFeatureOverlay('handout-upload-overlay', buildFeatureModalHtml({
      icon: '🕯️',
      title: 'Nowy przekaz',
      meta: 'Tajne archiwum · zapieczętuj i wyślij',
      modalClass: 'handout-upload-modal handouts-vault-form handouts-vault-seal',
      bodyHtml: `
          <p class="handouts-form-intro dm-feature-intro">Włóż do archiwum <strong>obraz lub PDF</strong> (max 15 MB). Wybierz, kto może otworzyć pieczęć — i czy od razu to ujawniasz.</p>
          <div class="handout-upload-body handouts-vault-form__body">
          <div class="qe-row">
            <label>Tytuł</label>
            <input type="text" id="hu-title" maxlength="200" placeholder="np. Tajny list, Mapa skarbów">
          </div>
          <div class="qe-row">
            <label>Opis (opcjonalny)</label>
            <textarea id="hu-desc" rows="3" maxlength="4000" placeholder="Treść / kontekst"></textarea>
          </div>
          <div class="qe-row">
            <label>Plik (PNG, JPG, WEBP, GIF, PDF — max 15 MB)</label>
            <input type="file" id="hu-file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf">
          </div>
          <fieldset class="qe-fieldset">
            <legend>Odbiorcy</legend>
            <label class="hu-recipient-row"><input type="radio" name="hu-mode" value="all" checked> 👥 Cała drużyna</label>
            <label class="hu-recipient-row"><input type="radio" name="hu-mode" value="picked"> 👤 Wybrani gracze</label>
            <div id="hu-players" class="hu-player-list" style="display:none;">
              ${players.length
                ? players.map((p) => `
                  <label class="hu-player-item">
                    <input type="checkbox" data-pid="${p.id}">
                    <span>👤 ${escapeHtml(p.display_name || p.username)}</span>
                  </label>`).join('')
                : '<div class="qe-empty">Brak graczy w kampanii.</div>'}
            </div>
          </fieldset>
          <div class="qe-checkbox-row">
            <label><input type="checkbox" id="hu-revealed" checked> Od razu ujawnij graczom</label>
          </div>
          <div id="hu-progress" style="display:none;">⏳ Wysyłanie...</div>
          </div>`,
      footerHtml: `
          <button type="button" class="btn btn-secondary" data-action="close">Anuluj</button>
          <button type="button" class="btn btn-primary" id="hu-send">📤 Wyślij</button>`
    }));
    const close = () => overlay.remove();

    overlay.querySelectorAll('input[name="hu-mode"]').forEach((r) => {
      r.addEventListener('change', () => {
        const showPicker = overlay.querySelector('input[name="hu-mode"]:checked').value === 'picked';
        overlay.querySelector('#hu-players').style.display = showPicker ? '' : 'none';
      });
    });

    overlay.querySelector('[data-action="close"]')?.addEventListener('click', close);

    overlay.querySelector('#hu-send').addEventListener('click', async () => {
      const fileInput = overlay.querySelector('#hu-file');
      const file = fileInput?.files?.[0];
      if (!file) {
        showToast('Wybierz plik', 'warning');
        return;
      }
      const title = overlay.querySelector('#hu-title').value.trim() || file.name;
      const desc = overlay.querySelector('#hu-desc').value;
      const mode = overlay.querySelector('input[name="hu-mode"]:checked').value;
      const recipients = mode === 'picked'
        ? Array.from(overlay.querySelectorAll('#hu-players input[type="checkbox"]:checked')).map((c) => c.dataset.pid)
        : [];
      const revealed = overlay.querySelector('#hu-revealed').checked;

      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title);
      fd.append('description', desc);
      fd.append('recipient_user_ids', JSON.stringify(recipients));
      fd.append('is_revealed', String(revealed));

      overlay.querySelector('#hu-progress').style.display = '';
      overlay.querySelector('#hu-send').disabled = true;
      try {
        const res = await fetch(`/api/campaigns/${App.currentCampaign.id}/handouts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: fd
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        showToast('📤 Handout wysłany', 'success');
        await this.load();
        this._refreshGrid();
        close();
      } catch (e) {
        showToast(e.message || 'Błąd uploadu', 'error');
        overlay.querySelector('#hu-progress').style.display = 'none';
        overlay.querySelector('#hu-send').disabled = false;
      }
    });
  },

  // ===== Editor (DM) =====
  openEditor(id) {
    if (!this.isDm()) return;
    const h = this.list.find((it) => it.id === id);
    if (!h) return;
    const players = this._players();
    const setIds = new Set((h.recipient_user_ids || []).map(String));
    const isAll = setIds.size === 0;
    const overlay = createStackedFeatureOverlay('handout-edit-overlay', buildFeatureModalHtml({
      icon: '🕯️',
      title: 'Edytuj przekaz',
      meta: `Tajne archiwum · ${escapeHtml(h.title)}`,
      modalClass: 'handout-editor-modal handouts-vault-form handouts-vault-seal',
      bodyHtml: `
          <p class="handouts-form-intro dm-feature-intro">Zmień metadane przekazu — plik pozostaje w archiwum.</p>
          <div class="handout-upload-body handouts-vault-form__body">
          <div class="qe-row">
            <label>Tytuł</label>
            <input type="text" id="he-title" maxlength="200" value="${escapeHtml(h.title)}">
          </div>
          <div class="qe-row">
            <label>Opis</label>
            <textarea id="he-desc" rows="3" maxlength="4000">${escapeHtml(h.description)}</textarea>
          </div>
          <fieldset class="qe-fieldset">
            <legend>Odbiorcy</legend>
            <label class="hu-recipient-row"><input type="radio" name="he-mode" value="all" ${isAll ? 'checked' : ''}> 👥 Cała drużyna</label>
            <label class="hu-recipient-row"><input type="radio" name="he-mode" value="picked" ${isAll ? '' : 'checked'}> 👤 Wybrani gracze</label>
            <div id="he-players" class="hu-player-list" style="${isAll ? 'display:none;' : ''}">
              ${players.length
                ? players.map((p) => `
                  <label class="hu-player-item">
                    <input type="checkbox" data-pid="${p.id}" ${setIds.has(String(p.id)) ? 'checked' : ''}>
                    <span>👤 ${escapeHtml(p.display_name || p.username)}</span>
                  </label>`).join('')
                : '<div class="qe-empty">Brak graczy.</div>'}
            </div>
          </fieldset>
          <div class="qe-checkbox-row">
            <label><input type="checkbox" id="he-revealed" ${h.is_revealed ? 'checked' : ''}> Ujawniony graczom</label>
          </div>
          </div>`,
      footerHtml: `
          <button type="button" class="btn btn-secondary" data-action="close">Anuluj</button>
          <button type="button" class="btn btn-primary" id="he-save">💾 Zapisz</button>`
    }));
    const close = () => overlay.remove();
    overlay.querySelector('[data-action="close"]')?.addEventListener('click', close);

    overlay.querySelectorAll('input[name="he-mode"]').forEach((r) => {
      r.addEventListener('change', () => {
        const showPicker = overlay.querySelector('input[name="he-mode"]:checked').value === 'picked';
        overlay.querySelector('#he-players').style.display = showPicker ? '' : 'none';
      });
    });

    overlay.querySelector('#he-save').addEventListener('click', async () => {
      const mode = overlay.querySelector('input[name="he-mode"]:checked').value;
      const recipients = mode === 'picked'
        ? Array.from(overlay.querySelectorAll('#he-players input[type="checkbox"]:checked')).map((c) => c.dataset.pid)
        : [];
      const payload = {
        title: overlay.querySelector('#he-title').value.trim(),
        description: overlay.querySelector('#he-desc').value,
        recipient_user_ids: recipients,
        is_revealed: overlay.querySelector('#he-revealed').checked
      };
      try {
        await apiFetch(`/handouts/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Zapisano', 'success');
        await this.load();
        this._refreshGrid();
        close();
      } catch (e) {
        showToast(e.message || 'Błąd', 'error');
      }
    });
  },

  // ===== Quick actions =====
  async toggleReveal(id, revealed) {
    const h = this.list.find((it) => it.id === id);
    if (!h) return;
    try {
      await apiFetch(`/handouts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: h.title,
          description: h.description,
          recipient_user_ids: h.recipient_user_ids,
          is_revealed: !!revealed
        })
      });
      showToast(revealed ? '📢 Ujawniono' : '🙈 Ukryto', 'success');
    } catch (e) {
      showToast(e.message || 'Błąd', 'error');
    }
  },

  async delete(id) {
    if (!confirm('Usunąć ten handout?')) return;
    try {
      await apiFetch(`/handouts/${id}`, { method: 'DELETE' });
      showToast('Usunięto', 'success');
    } catch (e) {
      showToast(e.message || 'Błąd', 'error');
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Handouts;
}
