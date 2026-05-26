// ===== Token image library (per campaign) =====
const TokenLibrary = {
  images: [],         // {id, campaign_id, name, image_url, category, ...}
  _pendingTokenId: '', // jeśli ustawione, kliknięcie obrazka przypisze go do tego tokenu

  init() {
    document.getElementById('btn-token-library')?.addEventListener('click', () => this.open());
    document.getElementById('token-library-upload')?.addEventListener('change', (e) => this.onUploadFile(e));
  },

  async load() {
    if (!App.currentCampaign) return;
    try {
      this.images = await apiFetch(`/campaigns/${App.currentCampaign.id}/token-images`);
    } catch (err) {
      console.error('TokenLibrary load', err);
      this.images = [];
    }
  },

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  // Otwiera bibliotekę. Jeśli forTokenId podany, klik obrazka przypisuje go do tokenu.
  async open(forTokenId = null) {
    if (!App.currentCampaign) {
      showToast('Wybierz najpierw kampanię', 'warning');
      return;
    }
    this._pendingTokenId = forTokenId || '';
    await this.load();
    this._render();
  },

  _render() {
    const dm = this.isDm();
    const forToken = this._pendingTokenId;
    const tokenInfo = forToken
      ? (BattleMap.tokens?.find((t) => t.id === forToken))
      : null;

    const headerHint = forToken && tokenInfo
      ? `<p class="sheet-hint">Wybierz grafikę dla tokenu <strong>${escapeHtml(tokenInfo.entity_name)}</strong>. Klik obrazka = przypisanie.</p>`
      : `<p class="sheet-hint">Biblioteka grafik twojej kampanii. Możesz dodawać nowe i używać tych samych obrazków dla wielu tokenów.</p>`;

    const uploadBtn = dm ? `
      <div class="token-lib-toolbar">
        <button type="button" class="btn btn-primary" id="tlib-upload-btn">📤 Wgraj nową grafikę</button>
        <input type="text" id="tlib-search" placeholder="Szukaj po nazwie…" class="tlib-search">
        <select id="tlib-cat-filter" class="tlib-cat-filter">
          <option value="">Wszystkie kategorie</option>
          <option value="character">Postać</option>
          <option value="npc">NPC</option>
          <option value="monster">Potwór</option>
          <option value="object">Przedmiot / rekwizyt</option>
          <option value="other">Inne</option>
        </select>
      </div>` : '';

    const dmHint = dm ? '' : '<p class="info-text">Tylko MG może dodawać nowe grafiki. Możesz przeglądać dostępne.</p>';

    showGenericModal('🖼️ Biblioteka tokenów', `
      ${headerHint}
      ${dmHint}
      ${uploadBtn}
      <div class="token-lib-grid" id="token-lib-grid">${this._renderGrid(this.images)}</div>
    `, 'modal-xl');

    document.getElementById('tlib-upload-btn')?.addEventListener('click', () => {
      const input = document.getElementById('token-library-upload');
      if (input) input.click();
    });
    document.getElementById('tlib-search')?.addEventListener('input', (e) => this._applyFilter());
    document.getElementById('tlib-cat-filter')?.addEventListener('change', () => this._applyFilter());
    this._bindGridEvents();
  },

  _applyFilter() {
    const q = (document.getElementById('tlib-search')?.value || '').toLowerCase().trim();
    const cat = document.getElementById('tlib-cat-filter')?.value || '';
    let filtered = this.images;
    if (q) filtered = filtered.filter((i) => (i.name || '').toLowerCase().includes(q));
    if (cat) filtered = filtered.filter((i) => i.category === cat);
    const grid = document.getElementById('token-lib-grid');
    if (grid) {
      grid.innerHTML = this._renderGrid(filtered);
      this._bindGridEvents();
    }
  },

  _renderGrid(images) {
    if (!images.length) {
      return `<div class="token-lib-empty">
        <div style="font-size:3rem;opacity:0.3;text-align:center">📭</div>
        <p class="info-text" style="text-align:center">Biblioteka jest pusta.${this.isDm() ? ' Wgraj pierwszą grafikę przyciskiem powyżej.' : ''}</p>
      </div>`;
    }
    return images.map((it) => {
      const catLabels = { character: '🧝 Postać', npc: '👤 NPC', monster: '👹 Potwór', object: '📦 Obiekt', other: '✨ Inne' };
      const catLabel = catLabels[it.category] || it.category || '';
      return `
        <div class="token-lib-card" data-img-id="${it.id}" data-img-url="${escapeHtml(it.image_url)}" title="${escapeHtml(it.name || '')}">
          <div class="token-lib-thumb"><img src="${escapeHtml(it.image_url)}" alt="${escapeHtml(it.name || 'token')}" loading="lazy"></div>
          <div class="token-lib-meta">
            <div class="token-lib-name">${escapeHtml(it.name || 'Token')}</div>
            <div class="token-lib-cat">${escapeHtml(catLabel)}</div>
          </div>
          ${this.isDm() ? `
            <div class="token-lib-actions">
              <button type="button" class="btn btn-xs btn-secondary tlib-rename" data-img-id="${it.id}" title="Zmień nazwę">✏️</button>
              <button type="button" class="btn btn-xs btn-danger tlib-delete" data-img-id="${it.id}" title="Usuń z biblioteki">✕</button>
            </div>` : ''}
        </div>`;
    }).join('');
  },

  _bindGridEvents() {
    document.querySelectorAll('#token-lib-grid .token-lib-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.token-lib-actions')) return;
        this._handleCardClick(card.dataset.imgId, card.dataset.imgUrl);
      });
    });
    document.querySelectorAll('.tlib-rename').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._renameImage(btn.dataset.imgId);
      });
    });
    document.querySelectorAll('.tlib-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteImage(btn.dataset.imgId);
      });
    });
  },

  async _handleCardClick(imgId, imgUrl) {
    if (this._pendingTokenId && this.isDm()) {
      // Przypisz do tokenu
      try {
        await apiFetch(`/campaigns/${App.currentCampaign.id}/map/tokens/${this._pendingTokenId}/image-url`, {
          method: 'PUT',
          body: JSON.stringify({ imageUrl: imgUrl })
        });
        showToast('Grafika tokenu zaktualizowana', 'success');
        closeModal('generic-modal');
        this._pendingTokenId = '';
      } catch (err) {
        showToast(err.message || 'Błąd przypisania', 'error');
      }
    } else {
      // Bez wybranego tokenu — kopiuj URL do schowka (przyda się np. w kreatorze map)
      try {
        await navigator.clipboard.writeText(imgUrl);
        showToast('URL skopiowany do schowka', 'info');
      } catch {
        prompt('Skopiuj URL grafiki:', imgUrl);
      }
    }
  },

  async _renameImage(imgId) {
    const img = this.images.find((i) => i.id === imgId);
    if (!img) return;
    const newName = prompt('Nowa nazwa:', img.name || '');
    if (newName == null) return;
    try {
      const updated = await apiFetch(`/token-images/${imgId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName.trim() })
      });
      img.name = updated.name;
      this._applyFilter();
      showToast('Nazwa zmieniona', 'success');
    } catch (err) {
      showToast(err.message || 'Błąd zmiany nazwy', 'error');
    }
  },

  async _deleteImage(imgId) {
    if (!confirm('Usunąć tę grafikę z biblioteki?\n\nTokeny które jej używają zachowają obraz, ale nie będzie można jej użyć ponownie.')) return;
    try {
      await apiFetch(`/token-images/${imgId}`, { method: 'DELETE' });
      this.images = this.images.filter((i) => i.id !== imgId);
      this._applyFilter();
      showToast('Usunięto', 'success');
    } catch (err) {
      showToast(err.message || 'Błąd usuwania', 'error');
    }
  },

  async onUploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !App.currentCampaign) return;

    const name = prompt('Nazwa grafiki (np. "Goblin", "Smok czerwony"):', file.name.replace(/\.[^.]+$/, '')) || file.name;
    if (name === null) return;

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('name', name);
      formData.append('category', 'character');

      const headers = {};
      const tk = getToken();
      if (tk) headers.Authorization = `Bearer ${tk}`;
      const res = await fetch(`/api/campaigns/${App.currentCampaign.id}/token-images`, {
        method: 'POST',
        headers,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Błąd uploadu');

      this.images.unshift(data);
      this._applyFilter();
      showToast('Grafika dodana do biblioteki', 'success');

      // Jeśli mamy oczekujący token, od razu go przypisz
      if (this._pendingTokenId) {
        await this._handleCardClick(data.id, data.image_url);
      }
    } catch (err) {
      showToast(err.message || 'Błąd uploadu', 'error');
    }
  }
};
