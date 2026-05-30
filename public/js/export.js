// ===== Export / Backup =====
// Eksport pełnej kampanii: JSON-only lub ZIP (JSON + media).
// Import przywraca backup do bieżącej kampanii (tylko MG).
const ExportBackup = {
  init() {
    document.getElementById('btn-export-campaign')?.addEventListener('click', () => this.openModal());
  },

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  openModal() {
    if (!this.isDm()) {
      showToast('Tylko Mistrz Gry może eksportować kampanię', 'warning');
      return;
    }
    if (!App.currentCampaign) return;
    document.getElementById('export-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'export-overlay';
    overlay.className = 'modal-overlay';
    const cname = escapeHtml(App.currentCampaign.name || 'Kampania');
    overlay.innerHTML = `
      <div class="modal dm-feature-modal export-modal">
        ${featureModalHeader('💾', 'Eksport / Backup', 'Kopia zapasowa kampanii')}
        <div class="modal-body dm-feature-body export-body">
          <div class="dm-feature-intro">Kampania: <strong>${cname}</strong></div>
          <div class="export-options">
            <div class="export-option">
              <div class="export-option-head">
                <span class="export-icon">📄</span>
                <h4>JSON (tylko dane)</h4>
              </div>
              <p class="export-desc">
                Snapshot tabel SQL bez plików (obrazki, muzyka).
              </p>
              <button type="button" class="btn btn-primary" data-export="json">📥 Pobierz JSON</button>
            </div>
            <div class="export-option export-option-recommended">
              <div class="export-option-head">
                <span class="export-icon">📦</span>
                <h4>ZIP (pełny backup)</h4>
                <span class="export-badge">Zalecane</span>
              </div>
              <p class="export-desc">
                <code>campaign.json</code> + media (mapy, tokeny, muzyka, handouty).
              </p>
              <button type="button" class="btn btn-primary" data-export="zip">📦 Pobierz ZIP</button>
            </div>
          </div>

          <div class="export-import-section">
            <h4 class="export-import-title">📤 Import backupu</h4>
            <p class="export-desc">
              Przywróć dane z pliku wyeksportowanego z Roll 1 (<strong>JSON</strong> lub <strong>ZIP</strong>)
              do <strong>tej</strong> kampanii. Zastępuje postacie, mapę, czat, questy, ekonomię itd.
              Członkowie kampanii i kod zaproszenia pozostają bez zmian.
            </p>
            <p class="export-import-warn">⚠️ Operacja nieodwracalna — zrób eksport ZIP przed importem, jeśli chcesz zachować obecny stan.</p>
            <input type="file" id="export-import-file" accept=".json,.zip,application/json,application/zip" class="sr-only-input" tabindex="-1">
            <button type="button" class="btn btn-warning" id="export-import-pick">📂 Wybierz plik i importuj</button>
          </div>

          <div id="export-progress" class="export-progress" style="display:none;">
            <div class="spinner"></div>
            <span id="export-progress-text">Przetwarzanie...</span>
          </div>
          <div class="export-tips">
            <strong>💡 Wskazówki:</strong>
            <ul>
              <li>ZIP zawiera <code>README.txt</code> i <code>manifest.json</code>.</li>
              <li>Import z ZIP przywraca też pliki graficzne i audio (jeśli są w archiwum).</li>
              <li>Postacie graczy spoza tej kampanii zostaną przypisane do Ciebie (MG).</li>
            </ul>
          </div>
        </div>
        ${featureModalFooter()}
      </div>`;
    document.body.appendChild(overlay);
    bindFeatureOverlay(overlay);

    overlay.querySelectorAll('[data-export]').forEach((b) => {
      b.addEventListener('click', () => this.download(b.dataset.export));
    });
    overlay.querySelector('#export-import-pick')?.addEventListener('click', () => {
      overlay.querySelector('#export-import-file')?.click();
    });
    overlay.querySelector('#export-import-file')?.addEventListener('change', (e) => {
      this.importFile(e.target.files?.[0], overlay);
      e.target.value = '';
    });
  },

  async download(format) {
    const campaignId = App.currentCampaign?.id;
    if (!campaignId) return;
    const progress = document.getElementById('export-progress');
    const progressText = document.getElementById('export-progress-text');
    if (progress) progress.style.display = 'flex';
    if (progressText) {
      progressText.textContent = format === 'zip'
        ? 'Generowanie ZIP-a... To może potrwać przy dużych kampaniach.'
        : 'Generowanie JSON...';
    }
    try {
      const url = `/api/campaigns/${campaignId}/export.${format}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = j.error || msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const fname = match ? match[1] : `roll1-export.${format}`;
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(dlUrl), 30000);
      showToast(`✅ Pobrano: ${fname} (${this._formatSize(blob.size)})`, 'success');
    } catch (e) {
      showToast(`Błąd eksportu: ${e.message}`, 'error');
    } finally {
      if (progress) progress.style.display = 'none';
    }
  },

  async importFile(file, overlay) {
    if (!file || !App.currentCampaign) return;
    const name = file.name || 'backup';
    const ok = confirm(
      `Zaimportować „${name}” do kampanii „${App.currentCampaign.name}”?\n\n` +
      'Obecne dane kampanii (postać, mapa, czat, NPC…) zostaną ZASTĄPIONE.\n' +
      'Członkowie i zaproszenie pozostają. Kontynuować?'
    );
    if (!ok) return;

    const progress = overlay?.querySelector('#export-progress');
    const progressText = overlay?.querySelector('#export-progress-text');
    if (progress) progress.style.display = 'flex';
    if (progressText) progressText.textContent = 'Import backupu…';

    try {
      const fd = new FormData();
      fd.append('backup', file);
      const res = await fetch(`/api/campaigns/${App.currentCampaign.id}/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const files = data.files || {};
      const copied = (files.copied || []).length;
      const missing = (files.missing || []).length;
      let detail = '';
      if (copied || missing) detail = ` Pliki: ${copied} skopiowano${missing ? `, ${missing} brak w archiwum` : ''}.`;

      showToast(`✅ Backup zaimportowany.${detail}`, 'success');
      overlay?.remove();
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      showToast(`Błąd importu: ${e.message}`, 'error');
    } finally {
      if (progress) progress.style.display = 'none';
    }
  },

  _formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExportBackup;
}
