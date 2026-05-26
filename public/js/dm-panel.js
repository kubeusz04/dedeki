// ===== DM Panel Module =====
const DMPanel = {
  init() {
    document.getElementById('btn-create-npc').addEventListener('click', () => this.showCreateNpcDialog());
    document.getElementById('btn-dm-conditions').addEventListener('click', () => this.showConditions());
    document.getElementById('btn-dm-rules-ref').addEventListener('click', () => this.showRulesReference());
    document.getElementById('btn-dm-roll-table').addEventListener('click', () => this.showRandomTables());

    const infoBox = document.getElementById('dm-campaign-info');
    if (infoBox) {
      infoBox.addEventListener('click', (e) => {
        if (e.target.closest('[data-copy-invite]')) {
          this.copyInviteCode();
        }
        if (e.target.closest('[data-refresh-campaign-info]')) {
          this.loadCampaignInfo();
        }
      });
    }
  },

  async load() {
    if (!App.currentCampaign || App.currentCampaign.role !== 'dm') return;
    await this.loadCampaignInfo();
    this.loadNpcs();
    this.loadPartyOverview();
    if (typeof DMEconomy !== 'undefined') DMEconomy.load();
    if (typeof TokenLibrary !== 'undefined') TokenLibrary.load();
    if (typeof CampaignMusic !== 'undefined') CampaignMusic.renderDmPanel();
  },

  async copyInviteCode() {
    const code = App.currentCampaign?.invite_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast('Kod skopiowany do schowka', 'success');
    } catch (_err) {
      showToast(`Kod: ${code}`, 'info');
    }
  },

  async loadCampaignInfo() {
    const container = document.getElementById('dm-campaign-info');
    if (!container || !App.currentCampaign) return;

    container.innerHTML = '<p class="sheet-hint">Ładowanie informacji o kampanii…</p>';
    const campaignId = App.currentCampaign.id;

    try {
      const [campaign, characters, npcs, notes, diceLog, mapData] = await Promise.all([
        apiFetch(`/campaigns/${campaignId}`),
        apiFetch(`/campaigns/${campaignId}/characters`),
        apiFetch(`/campaigns/${campaignId}/npcs`),
        apiFetch(`/campaigns/${campaignId}/notes`),
        apiFetch(`/campaigns/${campaignId}/dice-log`).catch(() => []),
        apiFetch(`/campaigns/${campaignId}/map`).catch(() => null)
      ]);

      App.currentCampaign = { ...App.currentCampaign, ...campaign };

      const members = campaign.members || [];
      const players = members.filter((m) => m.role === 'player');
      const dms = members.filter((m) => m.role === 'dm');
      const slotsUsed = members.length;
      const slotsMax = campaign.max_players || 6;

      const assignedUserIds = new Set(characters.map((ch) => ch.user_id).filter(Boolean));
      const playersWithoutChar = players.filter((p) => !assignedUserIds.has(p.id));

      const initEntries = typeof Initiative !== 'undefined' ? Initiative.entries : [];
      const initRound = typeof Initiative !== 'undefined' ? Initiative.round : campaign.initiative_round || 1;
      const activeInit = initEntries.find((e) => e.is_active);

      const tokens = mapData?.tokens || [];
      const mapSettings = mapData?.settings || {};
      const fogOn = mapSettings.fog_enabled === 1 || mapSettings.fog_enabled === true;
      const hasMapBg = !!(mapSettings.background_image || mapSettings.backgroundImage);

      const visibleNpcs = npcs.filter((n) => n.is_visible).length;
      const dmNotes = notes.filter((n) => n.is_dm_only).length;
      const publicNotes = notes.length - dmNotes;

      const recentRolls = (diceLog || []).slice(-5).reverse();
      const avgLevel = characters.length
        ? (characters.reduce((s, ch) => s + (ch.level || 1), 0) / characters.length).toFixed(1)
        : '—';

      const statusLabel = campaign.status === 'active' ? 'Aktywna' : escapeHtml(campaign.status || '—');
      const statusClass = campaign.status === 'active' ? 'dm-badge-active' : 'dm-badge-muted';

      container.innerHTML = `
        <div class="dm-campaign-overview">
          <div class="dm-camp-header">
            <div>
              <h4 class="dm-camp-title">${escapeHtml(campaign.name)}</h4>
              <p class="dm-camp-meta">${escapeHtml(campaign.setting || 'Forgotten Realms')} · utworzono ${formatDate(campaign.created_at)}</p>
            </div>
            <div class="dm-camp-header-actions">
              <span class="dm-badge ${statusClass}">${statusLabel}</span>
              <button type="button" class="btn btn-sm btn-secondary" data-refresh-campaign-info title="Odśwież">↻</button>
            </div>
          </div>

          ${campaign.description ? `<p class="dm-camp-desc">${escapeHtml(campaign.description)}</p>` : '<p class="dm-camp-desc dm-camp-desc-empty">Brak opisu kampanii — możesz go dodać przy edycji na pulpicie.</p>'}

          <div class="dm-camp-invite-block">
            <span class="dm-camp-label">Kod zaproszenia</span>
            <div class="dm-camp-invite-row">
              <code class="dm-invite-code">${escapeHtml(campaign.invite_code)}</code>
              <button type="button" class="btn btn-sm btn-primary" data-copy-invite>📋 Kopiuj</button>
            </div>
            <span class="sheet-hint">Udostępnij graczom: Dołącz do kampanii → wklej kod</span>
          </div>

          <div class="dm-camp-stats-grid">
            <div class="dm-camp-stat"><span class="dm-stat-val">${slotsUsed}/${slotsMax}</span><span class="dm-stat-lbl">Miejsca</span></div>
            <div class="dm-camp-stat"><span class="dm-stat-val">${players.length}</span><span class="dm-stat-lbl">Graczy</span></div>
            <div class="dm-camp-stat"><span class="dm-stat-val">${characters.length}</span><span class="dm-stat-lbl">Postaci</span></div>
            <div class="dm-camp-stat"><span class="dm-stat-val">poz. ${avgLevel}</span><span class="dm-stat-lbl">Średni lvl</span></div>
            <div class="dm-camp-stat"><span class="dm-stat-val">${npcs.length}</span><span class="dm-stat-lbl">NPC (${visibleNpcs} wid.)</span></div>
            <div class="dm-camp-stat"><span class="dm-stat-val">${notes.length}</span><span class="dm-stat-lbl">Notatek</span></div>
            <div class="dm-camp-stat"><span class="dm-stat-val">${tokens.length}</span><span class="dm-stat-lbl">Tokenów</span></div>
            <div class="dm-camp-stat"><span class="dm-stat-val">${initEntries.length || '—'}</span><span class="dm-stat-lbl">Init (r.${initRound})</span></div>
          </div>

          <div class="dm-camp-subsection">
            <h5>👥 Członkowie kampanii</h5>
            <ul class="dm-member-list">
              ${members.length ? members.map((m) => {
                const char = characters.find((ch) => ch.user_id === m.id);
                const roleIcon = m.role === 'dm' ? '👑' : '🎮';
                const charLine = char
                  ? `${escapeHtml(char.name)} · ${escapeHtml(char.char_class)} ${char.level}`
                  : (m.role === 'player' ? '<em class="dm-warn">brak przypisanej postaci</em>' : '—');
                return `<li>
                  <span class="dm-member-name">${roleIcon} ${escapeHtml(m.display_name || m.username)}</span>
                  <span class="dm-member-char">${charLine}</span>
                  <span class="dm-member-joined">od ${formatDate(m.joined_at)}</span>
                </li>`;
              }).join('') : '<li class="sheet-hint">Brak członków</li>'}
            </ul>
            ${playersWithoutChar.length ? `<p class="dm-camp-alert">⚠ ${playersWithoutChar.length} gracz(ów) bez postaci: ${playersWithoutChar.map((p) => escapeHtml(p.display_name || p.username)).join(', ')}</p>` : ''}
          </div>

          <div class="dm-camp-subsection dm-camp-cols">
            <div>
              <h5>⚔️ Walka / inicjatywa</h5>
              ${initEntries.length
                ? `<p>Tura: <strong>${escapeHtml(activeInit?.entity_name || '—')}</strong> · Runda <strong>${initRound}</strong></p>
                   <p class="sheet-hint">Kolejka: ${initEntries.slice(0, 6).map((e) => `${e.is_active ? '▶' : ''}${escapeHtml(e.entity_name)} (${e.initiative_roll})`).join(' → ')}${initEntries.length > 6 ? '…' : ''}</p>`
                : '<p class="sheet-hint">Brak aktywnej kolejki — dodaj inicjatywę w zakładce Inicjatywa.</p>'}
            </div>
            <div>
              <h5>🗺️ Mapa</h5>
              <p>${hasMapBg ? 'Tło: ustawione' : 'Tło: brak'} · Mgła: ${fogOn ? 'włączona' : 'wyłączona'}</p>
              <p class="sheet-hint">${tokens.length} token(ów) na planszy</p>
            </div>
          </div>

          <div class="dm-camp-subsection">
            <h5>📝 Notatki</h5>
            <p>Publiczne: <strong>${publicNotes}</strong> · Tylko MG: <strong>${dmNotes}</strong></p>
          </div>

          ${recentRolls.length ? `
          <div class="dm-camp-subsection">
            <h5>🎲 Ostatnie rzuty</h5>
            <ul class="dm-recent-rolls">
              ${recentRolls.map((r) => `<li><strong>${escapeHtml(r.username)}</strong> ${escapeHtml(r.roll_expression)} = <span class="dm-roll-total">${r.total}</span></li>`).join('')}
            </ul>
          </div>` : ''}

          <div class="dm-camp-footer sheet-hint">
            ID kampanii: <code>${escapeHtml(campaign.id)}</code>
            ${dms.length ? ` · MG: ${dms.map((d) => escapeHtml(d.display_name || d.username)).join(', ')}` : ''}
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p class="dm-camp-alert">Błąd: ${escapeHtml(err.message)}</p>`;
    }
  },

  async loadNpcs() {
    try {
      const npcs = await apiFetch(`/campaigns/${App.currentCampaign.id}/npcs`);
      this._npcCache = npcs;
      const container = document.getElementById('npc-list');
      if (npcs.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">Brak NPC. Utwórz pierwszego!</p>';
        return;
      }
      container.innerHTML = npcs.map(npc => {
        let meta = {};
        try { meta = JSON.parse(npc.stats || '{}'); } catch (_e) { /* ignore */ }
        const crLabel = meta.cr ? `CR ${meta.cr}` : '';
        const isMonster = meta.category === 'monster';
        const tpl = meta.templateId ? NpcTemplates.getById(meta.templateId) : null;
        const entityType = isMonster ? 'monster' : 'npc';
        const nameJs = JSON.stringify(npc.name);
        return `
        <div class="npc-card ${tpl?.legendary ? 'npc-card-legendary' : ''}">
          <h4>${npc.is_visible ? '👁️' : '🙈'} ${escapeHtml(npc.name)} ${crLabel ? `<span class="npc-cr-badge">${escapeHtml(crLabel)}</span>` : ''}</h4>
          <p>${escapeHtml(npc.race || '')} ${npc.description ? '· ' + escapeHtml(npc.description.slice(0, 80)) + (npc.description.length > 80 ? '…' : '') : ''}</p>
          <div class="npc-stats">
            <span>❤️ ${npc.current_hp}/${npc.max_hp}</span>
            <span>🛡️ ${npc.armor_class}</span>
            <span>${isMonster ? '👹' : '🧙'}</span>
          </div>
          <div class="npc-actions">
            <button class="btn btn-sm btn-secondary" onclick="DMPanel.viewNpcNotes('${npc.id}')">📖 Zdolności</button>
            <button class="btn btn-sm btn-secondary" onclick="DMPanel.editNpc('${npc.id}')">✏️ Edytuj</button>
            <button class="btn btn-sm btn-secondary" onclick="DMPanel.toggleNpcVisibility('${npc.id}', ${npc.is_visible ? 0 : 1})">${npc.is_visible ? '🙈' : '👁️'}</button>
            <button class="btn btn-sm btn-secondary" onclick="DMPanel.addNpcToCombat('${npc.id}')">⚔️ Mapa+Init</button>
            <button class="btn btn-sm btn-secondary" onclick="DMPanel.addNpcToInitiative('${npc.id}')">⚔️ Init</button>
            <button class="btn btn-sm btn-secondary" onclick="DMPanel.addNpcToMap('${npc.id}')">🗺️</button>
            <button class="btn btn-sm btn-danger" onclick="DMPanel.deleteNpc('${npc.id}')">🗑️</button>
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      console.error('Failed to load NPCs:', err);
    }
  },

  async loadPartyOverview() {
    try {
      const chars = await apiFetch(`/campaigns/${App.currentCampaign.id}/characters`);
      const container = document.getElementById('dm-party-overview');
      if (chars.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">Brak postaci</p>';
        return;
      }
      container.innerHTML = chars.map(c => {
        const hpPercent = c.max_hp > 0 ? Math.round((c.current_hp / c.max_hp) * 100) : 100;
        return `
          <div class="party-member-row">
            <span><strong>${escapeHtml(c.name)}</strong> (${escapeHtml(c.player_name || '?')}) - ${escapeHtml(c.race)} ${escapeHtml(c.char_class)} Poz.${c.level}</span>
            <span>❤️ ${c.current_hp}/${c.max_hp} (${hpPercent}%) | 🛡️ AC ${c.armor_class} | Percepcja ${10 + calcModifier(c.wisdom)}</span>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Failed to load party overview:', err);
    }
  },

  showCreateNpcDialog() {
    this.showTemplateBrowser();
  },

  showTemplateBrowser() {
    const count = NpcTemplates.getAll().length;
    const html = `
      <div class="npc-template-browser">
        <p class="sheet-hint">${count} szablonów — kliknij kartę, aby zobaczyć szczegóły. Potężne jednostki mają unikalne mechaniki w notatkach.</p>
        <div class="template-filters">
          <select id="tpl-filter-cat" class="input-sm">
            <option value="all">Wszystkie</option>
            <option value="npc">🧙 NPC</option>
            <option value="monster">👹 Potwory</option>
          </select>
          <input type="text" id="tpl-search" placeholder="Szukaj nazwy, tagu…" class="input-sm">
          <select id="tpl-cr-max" class="input-sm">
            <option value="">CR: dowolne</option>
            <option value="1">CR ≤ 1</option>
            <option value="3">CR ≤ 3</option>
            <option value="5">CR ≤ 5</option>
            <option value="10">CR ≤ 10</option>
            <option value="15">CR ≤ 15</option>
          </select>
          <button type="button" class="btn btn-sm btn-secondary" id="btn-custom-npc">✏️ Własny</button>
        </div>
        <div id="tpl-preview" class="template-preview hidden"></div>
        <div id="tpl-grid" class="template-grid"></div>
      </div>
    `;
    showGenericModal('🧙 Szablony NPC i Potworów', html, 'modal-xl');

    const rerender = () => this.renderTemplateGrid();
    document.getElementById('tpl-filter-cat').addEventListener('change', rerender);
    document.getElementById('tpl-cr-max').addEventListener('change', rerender);
    document.getElementById('tpl-search').addEventListener('input', rerender);
    document.getElementById('btn-custom-npc').addEventListener('click', () => {
      closeModal('generic-modal');
      this.showCustomNpcForm();
    });
    document.getElementById('tpl-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.template-card');
      if (!card) return;
      if (e.target.closest('[data-tpl-use]')) {
        this.createFromTemplate(card.dataset.tplId);
        return;
      }
      this.showTemplatePreview(card.dataset.tplId);
    });
    rerender();
  },

  renderTemplateGrid() {
    const grid = document.getElementById('tpl-grid');
    if (!grid) return;
    const category = document.getElementById('tpl-filter-cat')?.value || 'all';
    const search = document.getElementById('tpl-search')?.value || '';
    const crMax = document.getElementById('tpl-cr-max')?.value || '';
    const list = NpcTemplates.filter({ category, search, crMax });

    if (!list.length) {
      grid.innerHTML = '<p class="sheet-hint">Brak wyników — zmień filtry.</p>';
      return;
    }

    grid.innerHTML = list.map((t) => `
      <div class="template-card ${t.legendary ? 'template-legendary' : ''}" data-tpl-id="${t.id}">
        <div class="template-card-top">
          <span class="template-cat">${t.category === 'npc' ? '🧙' : '👹'}</span>
          <span class="template-cr">CR ${escapeHtml(String(t.cr))}</span>
        </div>
        <div class="template-name">${escapeHtml(t.namePl)}</div>
        <div class="template-meta">${escapeHtml(t.race || '')} · ❤ ${t.max_hp} · 🛡 ${t.armor_class}</div>
        ${t.legendary ? '<span class="template-badge">LEGENDARNY</span>' : ''}
        ${(t.tags || []).slice(0, 2).map((tag) => `<span class="template-tag">${escapeHtml(tag)}</span>`).join('')}
        <button type="button" class="btn btn-sm btn-primary btn-full" data-tpl-use>Użyj szablonu</button>
      </div>
    `).join('');
  },

  showTemplatePreview(id) {
    const t = NpcTemplates.getById(id);
    const el = document.getElementById('tpl-preview');
    if (!t || !el) return;
    el.classList.remove('hidden');
    const notes = NpcTemplates.formatNotes(t);
    el.innerHTML = `
      <div class="template-preview-header">
        <strong>${escapeHtml(t.namePl)}</strong>
        <span>CR ${escapeHtml(String(t.cr))} · ${t.category === 'npc' ? 'NPC' : 'Potwór'}</span>
      </div>
      <p class="template-preview-desc">${escapeHtml(t.description || '')}</p>
      <pre class="template-preview-notes">${escapeHtml(notes)}</pre>
      <button type="button" class="btn btn-primary" data-tpl-use id="tpl-preview-use">➕ Dodaj do kampanii</button>
    `;
    document.getElementById('tpl-preview-use')?.addEventListener('click', () => this.createFromTemplate(id));
  },

  async createFromTemplate(templateId) {
    const t = NpcTemplates.getById(templateId);
    if (!t || !App.currentCampaign) return;
    try {
      const npc = await apiFetch(`/campaigns/${App.currentCampaign.id}/npcs`, {
        method: 'POST',
        body: JSON.stringify({
          name: t.namePl,
          race: t.race || '',
          description: t.description || '',
          max_hp: t.max_hp,
          current_hp: t.max_hp,
          armor_class: t.armor_class,
          notes: NpcTemplates.formatNotes(t),
          stats: NpcTemplates.formatStats(t),
          is_visible: false
        })
      });
      if (typeof Chat !== 'undefined') Chat.onNpcCreated(npc);
      closeModal('generic-modal');
      showToast(`${t.namePl} dodany do kampanii`, 'success');
      this.loadNpcs();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  showCustomNpcForm() {
    const html = `
      <form id="create-npc-form">
        <div class="form-row">
          <div class="form-group"><label>Imię</label><input type="text" id="npc-name" required></div>
          <div class="form-group"><label>Rasa</label><input type="text" id="npc-race"></div>
        </div>
        <div class="form-group"><label>Opis</label><textarea id="npc-description" rows="3"></textarea></div>
        <div class="form-row">
          <div class="form-group"><label>Max HP</label><input type="number" id="npc-hp" value="10" min="1"></div>
          <div class="form-group"><label>AC</label><input type="number" id="npc-ac" value="10" min="0"></div>
        </div>
        <div class="form-group"><label>Notatki (statystyki, zdolności)</label><textarea id="npc-notes" rows="6"></textarea></div>
        <div class="form-group">
          <label><input type="checkbox" id="npc-visible"> Widoczny dla graczy</label>
        </div>
        <button type="submit" class="btn btn-primary btn-full">🧙 Utwórz</button>
      </form>
    `;
    showGenericModal('Własny NPC / potwór', html);
    document.getElementById('create-npc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const npc = await apiFetch(`/campaigns/${App.currentCampaign.id}/npcs`, {
          method: 'POST',
          body: JSON.stringify({
            name: document.getElementById('npc-name').value.trim(),
            race: document.getElementById('npc-race').value.trim(),
            description: document.getElementById('npc-description').value.trim(),
            max_hp: parseInt(document.getElementById('npc-hp').value, 10),
            current_hp: parseInt(document.getElementById('npc-hp').value, 10),
            armor_class: parseInt(document.getElementById('npc-ac').value, 10),
            notes: document.getElementById('npc-notes').value.trim(),
            is_visible: document.getElementById('npc-visible').checked
          })
        });
        if (typeof Chat !== 'undefined') Chat.onNpcCreated(npc);
        closeModal('generic-modal');
        showToast('Utworzono!', 'success');
        this.loadNpcs();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },

  async editNpc(id) {
    try {
      // For simplicity, show quick HP/AC edit
      const html = `
        <form id="edit-npc-form">
          <div class="form-row">
            <div class="form-group"><label>Obecne HP</label><input type="number" id="edit-npc-hp" min="0"></div>
            <div class="form-group"><label>AC</label><input type="number" id="edit-npc-ac" min="0"></div>
          </div>
          <div class="form-group"><label>Notatki</label><textarea id="edit-npc-notes" rows="4"></textarea></div>
          <button type="submit" class="btn btn-primary btn-full">💾 Zapisz</button>
        </form>
      `;
      showGenericModal('Edytuj NPC', html);
      document.getElementById('edit-npc-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const data = {};
          const hp = document.getElementById('edit-npc-hp').value;
          const ac = document.getElementById('edit-npc-ac').value;
          const notes = document.getElementById('edit-npc-notes').value;
          if (hp) data.current_hp = parseInt(hp);
          if (ac) data.armor_class = parseInt(ac);
          if (notes) data.notes = notes;
          await apiFetch(`/npcs/${id}`, { method: 'PUT', body: JSON.stringify(data) });
          closeModal('generic-modal');
          showToast('NPC zaktualizowany!', 'success');
          this.loadNpcs();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async toggleNpcVisibility(id, visible) {
    try {
      await apiFetch(`/npcs/${id}`, { method: 'PUT', body: JSON.stringify({ is_visible: visible }) });
      this.loadNpcs();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async deleteNpc(id) {
    if (!confirm('Usunąć tego NPC?')) return;
    try {
      await apiFetch(`/npcs/${id}`, { method: 'DELETE' });
      showToast('NPC usunięty', 'success');
      this.loadNpcs();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async viewNpcNotes(id) {
    try {
      const npcs = await apiFetch(`/campaigns/${App.currentCampaign.id}/npcs`);
      const npc = npcs.find((n) => n.id === id);
      if (!npc) return;
      const body = `<pre class="template-preview-notes">${escapeHtml(npc.notes || 'Brak notatek')}</pre>`;
      showGenericModal(`📖 ${npc.name}`, body, 'modal-lg');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  _npcMeta(npc) {
    let meta = {};
    try { meta = JSON.parse(npc.stats || '{}'); } catch (_e) { /* ignore */ }
    const entityType = meta.category === 'monster' ? 'monster' : 'npc';
    return { meta, entityType };
  },

  addNpcToInitiative(npcId) {
    const npc = this._npcCache?.find((n) => n.id === npcId);
    if (!npc) return;
    const { entityType } = this._npcMeta(npc);
    const roll = Dice.rollDie(20);
    App.socket?.emit('initiative-add', {
      entityName: npc.name,
      entityType,
      entityId: npc.id,
      initiativeRoll: roll
    });
    showToast(`${npc.name} → inicjatywa (${roll})`, 'info');
  },

  addNpcToMap(npcId) {
    const npc = this._npcCache?.find((n) => n.id === npcId);
    if (!npc) return;
    const { entityType } = this._npcMeta(npc);
    App.socket?.emit('map-add-token', {
      entity_name: npc.name,
      entity_type: entityType,
      entity_id: npc.id,
      color: entityType === 'monster' ? '#5c1010' : '#8b3a2a',
      x: Math.floor(Math.random() * 10),
      y: Math.floor(Math.random() * 10),
      size: 1,
      is_visible: true,
      hp_max: npc.max_hp,
      hp_current: npc.current_hp,
      ac: npc.armor_class,
      sync_initiative: false
    });
    showToast(`${npc.name} dodany na mapę`, 'info');
  },

  addNpcToCombat(npcId) {
    const npc = this._npcCache?.find((n) => n.id === npcId);
    if (!npc) return;
    const { entityType } = this._npcMeta(npc);
    const roll = Dice.rollDie(20);
    App.socket?.emit('map-add-token', {
      entity_name: npc.name,
      entity_type: entityType,
      entity_id: npc.id,
      color: entityType === 'monster' ? '#5c1010' : '#8b3a2a',
      x: Math.floor(Math.random() * 10),
      y: Math.floor(Math.random() * 10),
      size: 1,
      is_visible: true,
      hp_max: npc.max_hp,
      hp_current: npc.current_hp,
      ac: npc.armor_class,
      sync_initiative: true,
      initiative_roll: roll
    });
    showToast(`${npc.name} → mapa + inicjatywa (${roll})`, 'success');
  },

  async showConditions() {
    try {
      const conditions = await apiFetch('/conditions');
      const body = conditions.map(c => `
        <div style="margin-bottom:12px;padding:10px;background:var(--bg-surface);border-radius:var(--radius);border-left:3px solid var(--accent-gold);">
          <strong style="color:var(--accent-gold);">${escapeHtml(c.name)}</strong>
          <p style="color:var(--text-secondary);font-size:0.9rem;margin-top:4px;">${escapeHtml(c.description)}</p>
        </div>
      `).join('');
      document.getElementById('conditions-modal-body').innerHTML = body;
      openModal('conditions-modal');
    } catch (err) {
      showToast('Błąd ładowania stanów', 'error');
    }
  },

  showRulesReference() {
    const html = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="padding:10px;background:var(--bg-surface);border-radius:var(--radius);">
          <strong style="color:var(--accent-gold);">Akcje w walce</strong>
          <ul style="color:var(--text-secondary);font-size:0.9rem;margin-top:6px;padding-left:20px;">
            <li><strong>Atak</strong> - Rzut ataku vs AC celu</li>
            <li><strong>Rzucenie Czaru</strong> - Użyj czaru (akcja/bonus/reakcja)</li>
            <li><strong>Unik (Dodge)</strong> - Ataki na ciebie mają utrudnienie</li>
            <li><strong>Odwrót (Disengage)</strong> - Ruch nie prowokuje ataków okazyjnych</li>
            <li><strong>Pomoc (Help)</strong> - Daj przewagę sojusznikowi</li>
            <li><strong>Ukrycie się (Hide)</strong> - Test Skradania</li>
            <li><strong>Szukanie (Search)</strong> - Test Percepcja/Śledztwo</li>
            <li><strong>Przygotowanie (Ready)</strong> - Przygotuj reakcję</li>
            <li><strong>Sprint (Dash)</strong> - Podwój prędkość ruchu</li>
          </ul>
        </div>
        <div style="padding:10px;background:var(--bg-surface);border-radius:var(--radius);">
          <strong style="color:var(--accent-gold);">Osłony (Cover)</strong>
          <ul style="color:var(--text-secondary);font-size:0.9rem;margin-top:6px;padding-left:20px;">
            <li><strong>Połowiczna (Half)</strong> - +2 AC i rzuty obronne DEX</li>
            <li><strong>Trzy-czwarte (3/4)</strong> - +5 AC i rzuty obronne DEX</li>
            <li><strong>Pełna (Full)</strong> - Nie można bezpośrednio atakować</li>
          </ul>
        </div>
        <div style="padding:10px;background:var(--bg-surface);border-radius:var(--radius);">
          <strong style="color:var(--accent-gold);">Trudność Testów (DC)</strong>
          <table style="color:var(--text-secondary);font-size:0.9rem;margin-top:6px;width:100%;">
            <tr><td>Bardzo łatwe</td><td style="text-align:right;font-weight:700;">DC 5</td></tr>
            <tr><td>Łatwe</td><td style="text-align:right;font-weight:700;">DC 10</td></tr>
            <tr><td>Średnie</td><td style="text-align:right;font-weight:700;">DC 15</td></tr>
            <tr><td>Trudne</td><td style="text-align:right;font-weight:700;">DC 20</td></tr>
            <tr><td>Bardzo trudne</td><td style="text-align:right;font-weight:700;">DC 25</td></tr>
            <tr><td>Prawie niemożliwe</td><td style="text-align:right;font-weight:700;">DC 30</td></tr>
          </table>
        </div>
        <div style="padding:10px;background:var(--bg-surface);border-radius:var(--radius);">
          <strong style="color:var(--accent-gold);">Quick Reference</strong>
          <ul style="color:var(--text-secondary);font-size:0.9rem;margin-top:6px;padding-left:20px;">
            <li><strong>Trafienie krytyczne:</strong> Nat 20 - podwójne kości obrażeń</li>
            <li><strong>Ciężka porażka:</strong> Nat 1 - automatyczne pudło</li>
            <li><strong>Stabilizacja:</strong> DC 10 rzut obr. na śmierć</li>
            <li><strong>Krótki odpoczynek:</strong> ≥1h, kości życia na leczenie</li>
            <li><strong>Długi odpoczynek:</strong> ≥8h, pełne HP, połowa kości życia</li>
            <li><strong>Reakcja:</strong> 1x na rundę (atak okazyjny, Counterspell, etc.)</li>
          </ul>
        </div>
      </div>
    `;
    showGenericModal('📖 Szybka Referencja Zasad', html);
  },

  showRandomTables() {
    const tables = {
      'Pogoda': ['☀️ Słonecznie', '⛅ Pochmurno', '🌧️ Deszcz', '⛈️ Burza', '🌫️ Mgła', '❄️ Śnieg', '🌪️ Wichura', '🌤️ Przyjemnie'],
      'Napotkane NPC': ['Wędrowny kupiec', 'Zagubiony podróżnik', 'Patrol straży', 'Banda rozbójników', 'Pielgrzym', 'Wędrowny bard', 'Łowca nagród', 'Tajemniczy czarodziej'],
      'Komplikacja w lochu': ['Pułapka!', 'Zawalony tunel', 'Tajne przejście', 'Zagadka na drzwiach', 'Trujący gaz', 'Zalany korytarz', 'Rywalizujący poszukiwacze', 'Przeklęty skarb'],
      'Nastrój w tawernie': ['Głośna i radosna', 'Cicha i podejrzana', 'Pijacka bójka', 'Dziwny bard gra', 'Plotki o smoku', 'Turniej pokera', 'Tajemniczy nieznajomy w kącie', 'Zamknięta — zaraza']
    };

    this._randomTables = {};
    let html = '<div id="random-tables-root" class="random-tables-root">';
    for (const [tableName, options] of Object.entries(tables)) {
      const tableId = tableName.replace(/\s+/g, '-');
      this._randomTables[tableId] = options;
      html += `
        <div class="random-table-block">
          <div class="random-table-header">
            <strong class="random-table-title">${escapeHtml(tableName)}</strong>
            <button type="button" class="btn btn-sm btn-primary" data-roll-table="${escapeHtml(tableId)}">🎲 Losuj</button>
          </div>
          <div class="random-table-result" data-result-for="${escapeHtml(tableId)}"></div>
        </div>
      `;
    }
    html += '</div>';
    showGenericModal('🎲 Losowe Tabele', html);

    const root = document.getElementById('random-tables-root');
    if (!root) return;
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-roll-table]');
      if (!btn) return;
      const tableId = btn.dataset.rollTable;
      const options = this._randomTables[tableId];
      if (options) this.rollTable(tableId, options);
    });
  },

  rollTable(tableId, options) {
    if (!options?.length) return;
    const idx = Math.floor(Math.random() * options.length);
    const result = options[idx];
    const el = document.querySelector(`[data-result-for="${tableId}"]`);
    if (el) {
      el.innerHTML = `<strong class="random-table-hit">→ ${escapeHtml(result)}</strong>`;
    }
  }
};
