// ===== Quest tracker =====
// MG zarządza questami (main/side/personal), gracze widzą widoczne questy.
// Status: active, completed, failed, abandoned. Przy completed: opcja przyznania
// XP/zł całej drużynie z auto-podziałem złota i emisją zdarzeń socket.
const Quests = {
  TYPES: [
    { key: 'main',     label: 'Główny',    icon: '⭐' },
    { key: 'side',     label: 'Poboczny',  icon: '📜' },
    { key: 'personal', label: 'Osobisty',  icon: '🧙' }
  ],
  STATUSES: [
    { key: 'active',    label: 'Aktywny',    icon: '🟢' },
    { key: 'completed', label: 'Ukończony',  icon: '✅' },
    { key: 'failed',    label: 'Nieudany',   icon: '💀' },
    { key: 'abandoned', label: 'Porzucony',  icon: '🚫' }
  ],

  quests: [],
  npcs: [],
  _filter: { type: '', status: 'active', query: '' },

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  bindSocketEvents(socket) {
    if (!socket) return;
    socket.on('quests-update', (data) => {
      if (!App.currentCampaign || data?.campaignId !== App.currentCampaign.id) return;
      this.quests = this._visibleQuests(data.quests || []);
      this._refreshGrid();
    });
    socket.on('quest-completed', (data) => {
      if (!App.currentCampaign || data?.campaignId !== App.currentCampaign.id) return;
      const q = data.quest;
      const aw = data.awarded || {};
      let txt = `🏆 Ukończono: ${q.title}`;
      if (aw.xp) txt += ` · +${aw.xp} XP`;
      if (aw.gold) txt += ` · +${aw.gold} zł / postać`;
      if (typeof showToast === 'function') showToast(txt, 'success');
    });
  },

  _visibleQuests(list) {
    if (this.isDm()) return list;
    return list.filter((q) => q.visible_to_players);
  },

  async load() {
    if (!App.currentCampaign) return;
    try {
      this.quests = await apiFetch(`/campaigns/${App.currentCampaign.id}/quests`);
      // Lazy-load NPCs only for DM (used by linked-NPC selector).
      if (this.isDm()) {
        try {
          this.npcs = await apiFetch(`/campaigns/${App.currentCampaign.id}/npcs`);
        } catch (_e) { this.npcs = []; }
      }
    } catch (err) {
      console.error('quests load', err);
      this.quests = [];
    }
  },

  openTab() {
    document.querySelector('.session-tab[data-panel="quests-panel"]')?.click();
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
    return document.getElementById('quests-panel-root');
  },

  _isUiMounted() {
    return !!document.getElementById('quests-grid');
  },

  _refreshGrid() {
    if (this._isUiMounted()) this._renderGrid();
  },

  _entryLabel(n) {
    if (n === 0) return '0 wpisów';
    if (n === 1) return '1 wpis';
    if (n >= 2 && n <= 4) return `${n} wpisy`;
    return `${n} wpisów`;
  },

  _questStats() {
    const all = this.quests;
    return {
      total: all.length,
      active: all.filter((q) => q.status === 'active').length,
      completed: all.filter((q) => q.status === 'completed').length,
      main: all.filter((q) => q.quest_type === 'main').length
    };
  },

  _filteredQuests() {
    let list = this.quests.slice();
    if (this._filter.type) list = list.filter((q) => q.quest_type === this._filter.type);
    if (this._filter.status) list = list.filter((q) => q.status === this._filter.status);
    const q = (this._filter.query || '').trim().toLowerCase();
    if (q) {
      list = list.filter((it) =>
        (it.title || '').toLowerCase().includes(q)
        || (it.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  },

  _panelEyebrow() {
    return this.isDm() ? 'Rejestr kampanii' : 'Zadania drużyny';
  },

  _panelSub() {
    const { total, active, completed, main } = this._questStats();
    const filtered = this._isUiMounted() ? this._filteredQuests().length : total;
    if (!total) {
      return this.isDm()
        ? 'Pusty dziennik · zapisuj cele, nagrody XP/złota i notatki MG'
        : 'Brak widocznych zadań · MG doda je w trakcie kampanii';
    }
    if (this.isDm()) {
      const bits = [];
      if (filtered !== total) bits.push(`${filtered} z ${total} po filtrach`);
      else bits.push(this._entryLabel(total) + ' w dzienniku');
      if (active) bits.push(`${active} aktywne`);
      if (completed) bits.push(`${completed} ukończone`);
      if (main) bits.push(`${main} głównych wątków`);
      bits.push('cele · nagrody · notatki');
      return bits.join(' · ');
    }
    const bits = [this._entryLabel(total) + ' widocznych'];
    if (active) bits.push(`${active} aktywne`);
    return bits.join(' · ');
  },

  _updateHeaderMeta() {
    const brow = document.getElementById('quests-eyebrow');
    const sub = document.getElementById('quests-sub-line');
    if (brow) brow.textContent = this._panelEyebrow();
    if (sub) sub.textContent = this._panelSub();
  },

  _renderPanelHeader() {
    return `
      <header class="dm-feature-header quests-header">
        <span class="dm-feature-header__icon" aria-hidden="true">📜</span>
        <div class="dm-feature-header__titles">
          <p class="quests-header__eyebrow" id="quests-eyebrow">${escapeHtml(this._panelEyebrow())}</p>
          <h3>Dziennik questów</h3>
          <p class="dm-feature-header__sub" id="quests-sub-line">${escapeHtml(this._panelSub())}</p>
        </div>
      </header>`;
  },

  // ===== Panel sesji =====
  _renderPanel() {
    const mount = this._getMount();
    if (!mount) return;
    const newBtn = this.isDm()
      ? `<button type="button" class="btn btn-primary quests-btn-new" data-action="new">✒️ Nowy wpis</button>`
      : '';
    mount.innerHTML = `
      <div class="quests-journal quests-journal--panel" role="region" aria-label="Dziennik questów">
        <div class="quests-spine" aria-hidden="true"><span class="quests-spine__marks">★ ✦ ★</span></div>
        <div class="quests-volume">
          <div class="quests-cover">
            ${this._renderPanelHeader()}
          </div>
          <div class="dm-feature-toolbar quests-toolbar">
            <span class="quests-toolbar__label" aria-hidden="true">Spis</span>
            <input type="search" class="quests-search" placeholder="Szukaj w dzienniku…" value="${escapeHtml(this._filter.query)}">
            <select class="quests-filter-type" title="Typ zadania">
              <option value="">Wszystkie typy</option>
              ${this.TYPES.map((t) => `<option value="${t.key}" ${this._filter.type === t.key ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
            </select>
            <select class="quests-filter-status" title="Status">
              <option value="">Wszystkie statusy</option>
              ${this.STATUSES.map((s) => `<option value="${s.key}" ${this._filter.status === s.key ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}
            </select>
            ${newBtn}
          </div>
          <div class="quests-folio">
            <div class="quests-folio__corner quests-folio__corner--tl" aria-hidden="true"></div>
            <div class="quests-folio__corner quests-folio__corner--br" aria-hidden="true"></div>
            <div class="quests-folio__bookmark" aria-hidden="true"></div>
            <div class="dm-feature-body quests-body">
              <p class="quests-motto dm-feature-intro">${this.isDm()
                ? 'Prowadź <strong>dziennik zadań</strong> kampanii — cele, nagrody i notatki MG w jednym miejscu.'
                : 'Twoje <strong>zadania</strong> zapisane przez Mistrza Gry.'}</p>
              <div class="quests-grid" id="quests-grid"></div>
            </div>
          </div>
        </div>
      </div>`;

    mount.querySelector('.quests-search')?.addEventListener('input', (e) => {
      this._filter.query = e.target.value;
      this._renderGrid();
    });
    mount.querySelector('.quests-filter-type')?.addEventListener('change', (e) => {
      this._filter.type = e.target.value;
      this._renderGrid();
    });
    mount.querySelector('.quests-filter-status')?.addEventListener('change', (e) => {
      this._filter.status = e.target.value;
      this._renderGrid();
    });
    mount.querySelector('[data-action="new"]')?.addEventListener('click', () => this.openEditor(null));

    this._renderGrid();
  },

  _renderGrid() {
    const grid = document.getElementById('quests-grid');
    if (!grid) return;
    let list = this._filteredQuests();
    if (!list.length) {
      const emptyMsg = this.quests.length
        ? 'Na tych kartach nie ma wpisu pasującego do filtrów.<br>Zmień kryteria wyszukiwania lub statusu.'
        : (this.isDm()
          ? 'Dziennik jest pusty — żaden quest nie został jeszcze zapisany.<br>Kliknij <strong>✒️ Nowy wpis</strong>.'
          : 'Nie masz jeszcze widocznych zadań.<br>Poczekaj na wpisy od MG.');
      grid.innerHTML = `<div class="quests-empty dm-feature-empty">
        <span class="dm-feature-empty__icon" aria-hidden="true">📜</span>
        <p>${emptyMsg}</p>
      </div>`;
      this._updateHeaderMeta();
      return;
    }
    list.sort((a, b) => {
      const so = { active: 0, completed: 1, failed: 2, abandoned: 3 };
      const sa = so[a.status] ?? 9;
      const sb = so[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      const to = { main: 0, side: 1, personal: 2 };
      return (to[a.quest_type] ?? 9) - (to[b.quest_type] ?? 9);
    });
    grid.innerHTML = list.map((it) => this._renderCard(it)).join('');
    this._updateHeaderMeta();
    grid.querySelectorAll('.quest-card').forEach((card) => this._bindCardEvents(card));
  },

  _typeMeta(key) { return this.TYPES.find((t) => t.key === key) || this.TYPES[1]; },
  _statusMeta(key) { return this.STATUSES.find((s) => s.key === key) || this.STATUSES[0]; },

  _renderCard(q) {
    const t = this._typeMeta(q.quest_type);
    const s = this._statusMeta(q.status);
    const objs = (q.objectives || []);
    const doneCount = objs.filter((o) => o.done).length;
    const linkedNpcs = (q.linked_npc_ids || [])
      .map((id) => this.npcs.find((n) => n.id === id))
      .filter(Boolean);
    const npcChips = linkedNpcs.length
      ? `<div class="quest-npcs">${linkedNpcs.map((n) => `<span class="quest-npc-chip">👤 ${escapeHtml(n.name)}</span>`).join('')}</div>`
      : '';
    const objList = objs.length
      ? `<ul class="quest-objectives">
          ${objs.map((o, i) => `
            <li class="${o.done ? 'is-done' : ''}">
              ${this.isDm() ? `<button type="button" class="quest-obj-toggle" data-obj-toggle="${q.id}" data-idx="${i}" title="Przełącz">${o.done ? '☑' : '☐'}</button>` : `<span class="quest-obj-mark">${o.done ? '☑' : '☐'}</span>`}
              <span>${escapeHtml(o.text)}</span>
            </li>`).join('')}
         </ul>`
      : '';
    const rewardLine = (q.xp_reward > 0 || q.gold_reward > 0)
      ? `<div class="quest-rewards">
           ${q.xp_reward > 0 ? `<span class="reward-chip xp">⚜ ${q.xp_reward} XP</span>` : ''}
           ${q.gold_reward > 0 ? `<span class="reward-chip gold">💰 ${q.gold_reward} zł</span>` : ''}
         </div>`
      : '';
    const dmActions = this.isDm()
      ? `<div class="quest-actions">
           ${q.status === 'active' ? `<button type="button" class="btn btn-xs btn-success" data-act="complete" data-id="${q.id}">✅ Ukończ</button>` : ''}
           ${q.status === 'active' ? `<button type="button" class="btn btn-xs btn-danger" data-act="fail" data-id="${q.id}">💀 Porażka</button>` : ''}
           ${q.status !== 'active' ? `<button type="button" class="btn btn-xs btn-secondary" data-act="reactivate" data-id="${q.id}">🟢 Wznów</button>` : ''}
           <button type="button" class="btn btn-xs btn-secondary" data-act="edit" data-id="${q.id}">✏️ Edytuj</button>
           <button type="button" class="btn btn-xs btn-danger" data-act="delete" data-id="${q.id}">🗑️ Usuń</button>
         </div>`
      : '';
    const visBadge = this.isDm() && !q.visible_to_players ? `<span class="quest-hidden-badge" title="Niewidoczne dla graczy">🙈 ukryty</span>` : '';
    const progressPct = objs.length ? Math.round(doneCount * 100 / objs.length) : 0;
    return `
      <article class="quest-journal-entry quest-card status-${q.status} type-${q.quest_type}" data-id="${q.id}">
        <div class="quest-entry__ribbon" aria-hidden="true">${t.icon} ${escapeHtml(t.label)}</div>
        <header class="quest-card-head">
          <div class="quest-title">
            <span class="quest-entry__seal quest-status-badge" title="${escapeHtml(s.label)}">${s.icon}</span>
            <h4 class="quest-entry__title">${escapeHtml(q.title)}</h4>
            <span class="quest-status-badge quest-entry__status-label">${s.label}</span>
            ${visBadge}
          </div>
        </header>
        ${q.description ? `<div class="quest-desc quest-entry__story">${escapeHtml(q.description).replace(/\n/g, '<br>')}</div>` : ''}
        ${objs.length ? `<div class="quest-progress-wrap">
          <div class="quest-progress-label">Cele · ${doneCount}/${objs.length}</div>
          <div class="quest-progress-bar" role="progressbar" aria-valuenow="${progressPct}" aria-valuemin="0" aria-valuemax="100"><div class="quest-progress-fill" style="width:${progressPct}%"></div></div>
        </div>` : ''}
        ${objList}
        ${rewardLine}
        ${npcChips}
        ${this.isDm() && q.dm_notes ? `<div class="quest-dm-notes"><strong>📝 Notatki MG:</strong> ${escapeHtml(q.dm_notes).replace(/\n/g,'<br>')}</div>` : ''}
        ${dmActions}
      </article>`;
  },

  _bindCardEvents(card) {
    card.querySelectorAll('[data-obj-toggle]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = b.dataset.objToggle;
        const idx = parseInt(b.dataset.idx, 10);
        try {
          await apiFetch(`/quests/${id}/objective/${idx}`, { method: 'POST' });
        } catch (e) { showToast(e.message || 'Błąd', 'error'); }
      });
    });
    card.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = b.dataset.id;
        const act = b.dataset.act;
        if (act === 'edit') return this.openEditor(id);
        if (act === 'delete') return this.delete(id);
        if (act === 'complete') return this.complete(id);
        if (act === 'fail') return this.setStatus(id, 'failed');
        if (act === 'reactivate') return this.setStatus(id, 'active');
      });
    });
  },

  // ===== Status / lifecycle =====
  async setStatus(id, status) {
    try {
      await apiFetch(`/quests/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    } catch (e) { showToast(e.message || 'Błąd', 'error'); }
  },

  async delete(id) {
    if (!confirm('Usunąć ten quest?')) return;
    try {
      await apiFetch(`/quests/${id}`, { method: 'DELETE' });
    } catch (e) { showToast(e.message || 'Błąd', 'error'); }
  },

  async complete(id) {
    const q = this.quests.find((it) => it.id === id);
    if (!q) return;
    let awardXp = false; let awardGold = false;
    if (q.xp_reward > 0) {
      awardXp = confirm(`Quest "${q.title}" ukończony.\n\nPrzyznać +${q.xp_reward} XP każdej postaci?`);
    }
    if (q.gold_reward > 0) {
      awardGold = confirm(`Podzielić ${q.gold_reward} złota między drużynę?`);
    }
    try {
      await apiFetch(`/quests/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ awardXp, awardGold })
      });
    } catch (e) { showToast(e.message || 'Błąd', 'error'); }
  },

  // ===== Editor =====
  openEditor(id) {
    if (!this.isDm()) return;
    const existing = id ? this.quests.find((q) => q.id === id) : null;
    const q = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
          id: null,
          title: '',
          description: '',
          quest_type: 'side',
          status: 'active',
          xp_reward: 0,
          gold_reward: 0,
          objectives: [],
          linked_npc_ids: [],
          dm_notes: '',
          visible_to_players: true
        };

    const bodyHtml = `
        <p class="quests-edit-intro dm-feature-intro">${id
          ? 'Popraw wpis w <strong>dzienniku questów</strong> — status, cele, nagrody i powiązani NPC.'
          : 'Nowa strona w dzienniku — uzupełnij tytuł, cele i nagrody dla drużyny.'}</p>
        <div class="quest-editor quest-journal-form">
          <div class="qe-row">
            <label>Tytuł</label>
            <input type="text" id="qe-title" maxlength="120" value="${escapeHtml(q.title)}">
          </div>
          <div class="qe-grid">
            <div class="qe-row">
              <label>Typ</label>
              <select id="qe-type">
                ${this.TYPES.map((t) => `<option value="${t.key}" ${q.quest_type === t.key ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="qe-row">
              <label>Status</label>
              <select id="qe-status">
                ${this.STATUSES.map((s) => `<option value="${s.key}" ${q.status === s.key ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}
              </select>
            </div>
            <div class="qe-row">
              <label>XP nagroda</label>
              <input type="number" id="qe-xp" min="0" step="25" value="${q.xp_reward || 0}">
            </div>
            <div class="qe-row">
              <label>Złoto nagroda (auto-podział)</label>
              <input type="number" id="qe-gold" min="0" step="1" value="${q.gold_reward || 0}">
            </div>
          </div>
          <div class="qe-row">
            <label>Opis (widoczny dla graczy)</label>
            <textarea id="qe-desc" rows="4" maxlength="4000">${escapeHtml(q.description)}</textarea>
          </div>
          <div class="qe-row">
            <label>📝 Notatki MG (tylko dla MG)</label>
            <textarea id="qe-dm-notes" rows="3" maxlength="4000">${escapeHtml(q.dm_notes)}</textarea>
          </div>
          <div class="qe-row qe-checkbox-row">
            <label><input type="checkbox" id="qe-visible" ${q.visible_to_players ? 'checked' : ''}> Widoczny dla graczy</label>
          </div>
          <fieldset class="qe-fieldset">
            <legend>Cele questa</legend>
            <div id="qe-objectives"></div>
            <button type="button" class="btn btn-xs btn-secondary" id="qe-add-objective">➕ Dodaj cel</button>
          </fieldset>
          <fieldset class="qe-fieldset">
            <legend>Powiązani NPC</legend>
            <div id="qe-npcs"></div>
          </fieldset>
        </div>`;
    const footerHtml = `
          <button type="button" class="btn btn-danger" data-action="delete" ${id ? '' : 'style="display:none"'}>🗑️ Usuń</button>
          <button type="button" class="btn btn-secondary" data-action="close">Anuluj</button>
          <button type="button" class="btn btn-primary" data-action="save">💾 Zapisz</button>`;
    const overlay = createStackedFeatureOverlay('quest-edit-overlay', buildFeatureModalHtml({
      icon: '✒️',
      title: id ? 'Edytuj wpis' : 'Nowa strona w dzienniku',
      meta: id ? 'Dziennik questów · rejestr kampanii' : 'Zapis w rejestrze kampanii',
      modalClass: 'quest-editor-modal quests-journal-edit modal-lg',
      bodyHtml,
      footerHtml
    }));
    const close = () => overlay.remove();

    const objRoot = overlay.querySelector('#qe-objectives');
    const renderObjs = () => {
      objRoot.innerHTML = q.objectives.map((o, i) => `
        <div class="qe-obj-row">
          <input type="checkbox" data-oi="${i}" data-of="done" ${o.done ? 'checked' : ''}>
          <input type="text" maxlength="200" data-oi="${i}" data-of="text" value="${escapeHtml(o.text)}" placeholder="Cel ${i + 1}">
          <button type="button" class="btn btn-xs btn-danger" data-oi="${i}" data-of="del">✕</button>
        </div>`).join('') || `<div class="qe-empty">Brak celów</div>`;
      objRoot.querySelectorAll('[data-of="done"]').forEach((el) => {
        el.addEventListener('change', () => { q.objectives[+el.dataset.oi].done = el.checked; });
      });
      objRoot.querySelectorAll('[data-of="text"]').forEach((el) => {
        el.addEventListener('input', () => { q.objectives[+el.dataset.oi].text = el.value; });
      });
      objRoot.querySelectorAll('[data-of="del"]').forEach((el) => {
        el.addEventListener('click', () => {
          q.objectives.splice(+el.dataset.oi, 1);
          renderObjs();
        });
      });
    };
    renderObjs();
    overlay.querySelector('#qe-add-objective').addEventListener('click', () => {
      q.objectives.push({ text: '', done: false });
      renderObjs();
    });

    // Linked NPCs
    const npcRoot = overlay.querySelector('#qe-npcs');
    if (!this.npcs.length) {
      npcRoot.innerHTML = `<div class="qe-empty">Brak NPC w kampanii.</div>`;
    } else {
      const setIds = new Set(q.linked_npc_ids || []);
      npcRoot.innerHTML = `<div class="qe-npc-list">${this.npcs.map((n) => `
        <label class="qe-npc-item">
          <input type="checkbox" data-npc-id="${n.id}" ${setIds.has(n.id) ? 'checked' : ''}>
          <span>👤 ${escapeHtml(n.name)}${n.race ? ` <small>(${escapeHtml(n.race)})</small>` : ''}</span>
        </label>`).join('')}</div>`;
      npcRoot.querySelectorAll('[data-npc-id]').forEach((el) => {
        el.addEventListener('change', () => {
          if (el.checked) setIds.add(el.dataset.npcId);
          else setIds.delete(el.dataset.npcId);
          q.linked_npc_ids = Array.from(setIds);
        });
      });
    }

    overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const payload = {
        title: overlay.querySelector('#qe-title').value.trim(),
        description: overlay.querySelector('#qe-desc').value,
        quest_type: overlay.querySelector('#qe-type').value,
        status: overlay.querySelector('#qe-status').value,
        xp_reward: parseInt(overlay.querySelector('#qe-xp').value, 10) || 0,
        gold_reward: parseInt(overlay.querySelector('#qe-gold').value, 10) || 0,
        objectives: q.objectives.filter((o) => (o.text || '').trim()),
        linked_npc_ids: q.linked_npc_ids,
        dm_notes: overlay.querySelector('#qe-dm-notes').value,
        visible_to_players: overlay.querySelector('#qe-visible').checked
      };
      if (!payload.title) {
        showToast('Tytuł jest wymagany', 'warning');
        return;
      }
      try {
        if (id) {
          await apiFetch(`/quests/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          await apiFetch(`/campaigns/${App.currentCampaign.id}/quests`, { method: 'POST', body: JSON.stringify(payload) });
        }
        showToast('Quest zapisany', 'success');
        close();
      } catch (e) {
        showToast(e.message || 'Błąd zapisu', 'error');
      }
    });

    overlay.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!id) return;
      if (!confirm('Usunąć ten quest?')) return;
      try {
        await apiFetch(`/quests/${id}`, { method: 'DELETE' });
        close();
      } catch (e) { showToast(e.message || 'Błąd', 'error'); }
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Quests;
}
