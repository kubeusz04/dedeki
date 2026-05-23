// ===== Campaigns Module =====
const Campaigns = {
  init() {
    document.getElementById('btn-create-campaign').addEventListener('click', () => this.showCreateDialog());
    document.getElementById('btn-join-campaign').addEventListener('click', () => this.showJoinDialog());
    document.getElementById('btn-my-characters').addEventListener('click', () => this.showMyCharacters());
    document.getElementById('btn-import-char-global')?.addEventListener('click', () => {
      if (typeof Characters !== 'undefined') Characters.promptImport();
    });
    document.getElementById('btn-delete-campaign')?.addEventListener('click', () => {
      if (!App.currentCampaign || App.currentCampaign.role !== 'dm') return;
      Campaigns.showDeleteDialog(App.currentCampaign.id, App.currentCampaign.name);
    });
  },

  async load() {
    try {
      const campaigns = await apiFetch('/campaigns');
      this.render(campaigns);
    } catch (err) {
      showToast('Błąd ładowania kampanii: ' + err.message, 'error');
    }
  },

  render(campaigns) {
    const container = document.getElementById('campaign-list');
    if (campaigns.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--text-secondary);">
          <p style="font-size:1.2rem;margin-bottom:8px;">🏰 Nie masz jeszcze żadnych kampanii</p>
          <p>Utwórz nową kampanię jako Mistrz Gry lub dołącz do istniejącej za pomocą kodu zaproszenia!</p>
        </div>`;
      return;
    }
    container.innerHTML = campaigns.map(c => `
      <div class="campaign-card" data-id="${escapeHtml(c.id)}">
        <div class="campaign-card-info">
          <h3>${escapeHtml(c.name)}</h3>
          <p>${escapeHtml(c.description || 'Brak opisu')} • ${escapeHtml(c.setting || 'Forgotten Realms')}</p>
        </div>
        <div class="campaign-card-meta">
          <span class="badge ${c.role === 'dm' ? 'badge-dm' : 'badge-player'}">
            ${c.role === 'dm' ? '👑 Mistrz Gry' : '🎮 Gracz'}
          </span>
          <span class="badge badge-members">👥 ${c.member_count}</span>
          ${c.role === 'dm' ? `<button type="button" class="btn btn-sm btn-danger campaign-delete-btn" data-delete-id="${escapeHtml(c.id)}" data-delete-name="${escapeHtml(c.name)}" title="Usuń kampanię">🗑️</button>` : ''}
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.campaign-card').forEach(card => {
      card.addEventListener('click', () => {
        App.enterCampaign(card.dataset.id);
      });
    });
    container.querySelectorAll('.campaign-delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showDeleteDialog(btn.dataset.deleteId, btn.dataset.deleteName);
      });
    });
  },

  showCreateDialog() {
    const html = `
      <form id="create-campaign-form">
        <div class="form-group">
          <label>Nazwa Kampanii</label>
          <input type="text" id="new-campaign-name" required maxlength="100">
        </div>
        <div class="form-group">
          <label>Opis</label>
          <textarea id="new-campaign-desc" rows="3" maxlength="500"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Setting</label>
            <select id="new-campaign-setting">
              <option>Forgotten Realms</option>
              <option>Eberron</option>
              <option>Ravenloft</option>
              <option>Greyhawk</option>
              <option>Dragonlance</option>
              <option>Homebrew</option>
            </select>
          </div>
          <div class="form-group">
            <label>Max Graczy</label>
            <input type="number" id="new-campaign-max" value="6" min="2" max="12">
          </div>
        </div>
        <div class="form-group">
          <label>Hasło usuwania kampanii</label>
          <input type="password" id="new-campaign-delete-pw" required minlength="4" maxlength="64" autocomplete="new-password" placeholder="Wymagane do trwałego usunięcia">
          <p class="sheet-hint">Zapamiętaj to hasło — będzie potrzebne, aby usunąć kampanię.</p>
        </div>
        <div class="form-group">
          <label>Potwierdź hasło</label>
          <input type="password" id="new-campaign-delete-pw2" required minlength="4" maxlength="64" autocomplete="new-password">
        </div>
        <button type="submit" class="btn btn-primary btn-full">🏰 Utwórz Kampanię</button>
      </form>
    `;
    showGenericModal('Utwórz Nową Kampanię', html);
    document.getElementById('create-campaign-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const deletePassword = document.getElementById('new-campaign-delete-pw').value;
      const deletePassword2 = document.getElementById('new-campaign-delete-pw2').value;
      if (deletePassword.length < 4) {
        showToast('Hasło usuwania musi mieć co najmniej 4 znaki', 'warning');
        return;
      }
      if (deletePassword !== deletePassword2) {
        showToast('Hasła usuwania nie są identyczne', 'warning');
        return;
      }
      try {
        await apiFetch('/campaigns', {
          method: 'POST',
          body: JSON.stringify({
            name: document.getElementById('new-campaign-name').value.trim(),
            description: document.getElementById('new-campaign-desc').value.trim(),
            setting: document.getElementById('new-campaign-setting').value,
            maxPlayers: parseInt(document.getElementById('new-campaign-max').value, 10),
            deletePassword
          })
        });
        closeModal('generic-modal');
        showToast('Kampania utworzona!', 'success');
        this.load();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },

  showDeleteDialog(campaignId, campaignName) {
    const html = `
      <form id="delete-campaign-form">
        <p class="sheet-hint">Trwale usuniesz kampanię <strong>${escapeHtml(campaignName || '')}</strong> wraz z mapą, czatem, notatkami i innymi danymi sesji. Tej operacji nie można cofnąć.</p>
        <div class="form-group">
          <label>Hasło usuwania kampanii</label>
          <input type="password" id="delete-campaign-password" required minlength="4" maxlength="64" autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-danger btn-full">🗑️ Usuń kampanię na stałe</button>
      </form>
    `;
    showGenericModal('Usuń kampanię', html);
    document.getElementById('delete-campaign-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.deleteCampaign(campaignId, document.getElementById('delete-campaign-password').value);
    });
  },

  async deleteCampaign(campaignId, deletePassword) {
    if (!deletePassword) {
      showToast('Podaj hasło usuwania', 'warning');
      return;
    }
    if (!confirm('Ostatnie potwierdzenie: na pewno usunąć tę kampanię?')) return;
    try {
      await apiFetch(`/campaigns/${campaignId}`, {
        method: 'DELETE',
        body: JSON.stringify({ deletePassword })
      });
      closeModal('generic-modal');
      showToast('Kampania usunięta', 'success');
      if (App.currentCampaign?.id === campaignId) {
        App.leaveCampaign();
      } else {
        showScreen('dashboard-screen');
      }
      this.load();
    } catch (err) {
      showToast(err.message || 'Nie udało się usunąć kampanii', 'error');
    }
  },

  showJoinDialog() {
    const html = `
      <form id="join-campaign-form">
        <div class="form-group">
          <label>Kod Zaproszenia</label>
          <input type="text" id="join-invite-code" required placeholder="np. A1B2C3D4" maxlength="8" style="text-transform:uppercase;font-size:1.3rem;text-align:center;letter-spacing:3px;">
        </div>
        <button type="submit" class="btn btn-primary btn-full">🔗 Dołącz do Kampanii</button>
      </form>
    `;
    showGenericModal('Dołącz do Kampanii', html);
    document.getElementById('join-campaign-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiFetch('/campaigns/join', {
          method: 'POST',
          body: JSON.stringify({
            inviteCode: document.getElementById('join-invite-code').value.trim()
          })
        });
        closeModal('generic-modal');
        showToast('Dołączono do kampanii!', 'success');
        this.load();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },

  async showMyCharacters() {
    try {
      const characters = await apiFetch('/characters');
      let html = `<div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="btn-create-char-dash" class="btn btn-primary">➕ Nowa Postać</button>
        <button id="btn-import-char-dash" class="btn btn-secondary">📥 Importuj</button>
      </div>`;
      if (characters.length === 0) {
        html += '<p style="color:var(--text-secondary);">Nie masz jeszcze żadnych postaci.</p>';
      } else {
        html += '<div class="characters-grid">';
        characters.forEach(c => {
          html += Characters.renderCard(c, false);
        });
        html += '</div>';
      }
      showGenericModal('📋 Moje Postacie', html);
      document.getElementById('btn-create-char-dash')?.addEventListener('click', () => {
        closeModal('generic-modal');
        Characters.showCreateForm();
      });
      document.getElementById('btn-import-char-dash')?.addEventListener('click', () => {
        closeModal('generic-modal');
        Characters.promptImport();
      });
      document.querySelectorAll('#generic-modal-body .character-card').forEach(card => {
        card.addEventListener('click', () => {
          closeModal('generic-modal');
          Characters.openSheet(card.dataset.id);
        });
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
};
