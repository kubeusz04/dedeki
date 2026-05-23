// ===== Notes Module =====
const Notes = {
  init() {
    document.getElementById('btn-add-note').addEventListener('click', () => this.showCreateDialog());
  },

  async load() {
    if (!App.currentCampaign) return;
    try {
      const notes = await apiFetch(`/campaigns/${App.currentCampaign.id}/notes`);
      this.render(notes);
    } catch (err) {
      showToast('Błąd ładowania notatek: ' + err.message, 'error');
    }
  },

  render(notes) {
    const container = document.getElementById('notes-list');
    if (notes.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:30px;color:var(--text-secondary);">
          📝 Brak notatek. Dodaj pierwszą notatkę z sesji!
        </div>`;
      return;
    }

    const userId = getUser()?.id;
    container.innerHTML = notes.map(n => `
      <div class="note-card ${n.is_dm_only ? 'dm-only' : ''}">
        <div class="note-header">
          <h3>${n.is_dm_only ? '🔒 ' : ''}${escapeHtml(n.title)}</h3>
          <div class="note-meta">
            Sesja #${n.session_number} • ${formatDate(n.created_at)}
            ${n.is_dm_only ? ' • Tylko MG' : ''}
          </div>
        </div>
        <div class="note-content">${escapeHtml(n.content)}</div>
        ${n.user_id === userId ? `
          <div class="note-actions">
            <button class="btn btn-sm btn-secondary" onclick="Notes.edit('${n.id}', '${escapeHtml(n.title)}', \`${escapeHtml(n.content)}\`, ${n.is_dm_only}, ${n.session_number})">✏️ Edytuj</button>
            <button class="btn btn-sm btn-danger" onclick="Notes.delete('${n.id}')">🗑️ Usuń</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  },

  showCreateDialog() {
    const isDm = App.currentCampaign?.role === 'dm';
    const html = `
      <form id="create-note-form">
        <div class="form-group">
          <label>Tytuł</label>
          <input type="text" id="note-title" required maxlength="200">
        </div>
        <div class="form-group">
          <label>Numer Sesji</label>
          <input type="number" id="note-session" value="1" min="1">
        </div>
        <div class="form-group">
          <label>Treść</label>
          <textarea id="note-content" rows="8" maxlength="5000"></textarea>
        </div>
        ${isDm ? `
          <div class="form-group">
            <label><input type="checkbox" id="note-dm-only"> Tylko widoczne dla MG</label>
          </div>
        ` : ''}
        <button type="submit" class="btn btn-primary btn-full">📝 Zapisz Notatkę</button>
      </form>
    `;
    showGenericModal('Nowa Notatka', html);
    document.getElementById('create-note-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiFetch(`/campaigns/${App.currentCampaign.id}/notes`, {
          method: 'POST',
          body: JSON.stringify({
            title: document.getElementById('note-title').value.trim(),
            content: document.getElementById('note-content').value.trim(),
            sessionNumber: parseInt(document.getElementById('note-session').value),
            isDmOnly: document.getElementById('note-dm-only')?.checked || false
          })
        });
        closeModal('generic-modal');
        showToast('Notatka zapisana!', 'success');
        this.load();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },

  edit(id, title, content, isDmOnly, sessionNumber) {
    const isDm = App.currentCampaign?.role === 'dm';
    const html = `
      <form id="edit-note-form">
        <div class="form-group">
          <label>Tytuł</label>
          <input type="text" id="edit-note-title" value="${escapeHtml(title)}" required maxlength="200">
        </div>
        <div class="form-group">
          <label>Numer Sesji</label>
          <input type="number" id="edit-note-session" value="${sessionNumber}" min="1">
        </div>
        <div class="form-group">
          <label>Treść</label>
          <textarea id="edit-note-content" rows="8" maxlength="5000">${escapeHtml(content)}</textarea>
        </div>
        ${isDm ? `
          <div class="form-group">
            <label><input type="checkbox" id="edit-note-dm-only" ${isDmOnly ? 'checked' : ''}> Tylko widoczne dla MG</label>
          </div>
        ` : ''}
        <button type="submit" class="btn btn-primary btn-full">💾 Zapisz Zmiany</button>
      </form>
    `;
    showGenericModal('Edytuj Notatkę', html);
    document.getElementById('edit-note-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiFetch(`/notes/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: document.getElementById('edit-note-title').value.trim(),
            content: document.getElementById('edit-note-content').value.trim(),
            session_number: parseInt(document.getElementById('edit-note-session').value),
            is_dm_only: document.getElementById('edit-note-dm-only')?.checked ? 1 : 0
          })
        });
        closeModal('generic-modal');
        showToast('Notatka zaktualizowana!', 'success');
        this.load();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },

  async delete(id) {
    if (!confirm('Usunąć tę notatkę?')) return;
    try {
      await apiFetch(`/notes/${id}`, { method: 'DELETE' });
      showToast('Notatka usunięta', 'success');
      this.load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
};
