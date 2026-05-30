// ===== DM Panel Module =====
const DMPanel = {
  init() {
    document.getElementById('npc-generator-panel-root')?.addEventListener('click', (e) => {
      if (e.target.closest('#btn-create-npc')) this.showCreateNpcDialog();
    });

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
    if (typeof TokenLibrary !== 'undefined') TokenLibrary.load();
  },

  onPanelActivate() {
    if (!App.currentCampaign || App.currentCampaign.role !== 'dm') return;
    this.loadCampaignInfo();
  },

  _campDaysSince(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  },

  _walletCopper(c) {
    return (parseInt(c.copper, 10) || 0) + (parseInt(c.silver, 10) || 0) * 10
      + (parseInt(c.electrum, 10) || 0) * 50 + (parseInt(c.gold, 10) || 0) * 100
      + (parseInt(c.platinum, 10) || 0) * 1000;
  },

  _formatPartyWealth(cp) {
    if (!cp) return '0 MZ';
    const gp = Math.floor(cp / 100);
    const rem = cp % 100;
    if (gp >= 1000) return `~${(gp / 1000).toFixed(1)}k MZ`;
    return rem ? `${gp} MZ + reszta` : `${gp} MZ`;
  },

  _worldSnapshot(ws) {
    if (!ws) return null;
    const WS = typeof WorldState !== 'undefined' ? WorldState : null;
    const cal = WS?.CALENDARS?.[ws.calendar_type] || WS?.CALENDARS?.faerun;
    const monthMeta = cal?.months?.[ws.month_index] || { pl: '—' };
    const weatherMeta = WS?.WEATHER?.[ws.weather] || { icon: '🌤️', label: ws.weather || '—' };
    const windMeta = WS?.WIND?.[ws.wind] || { label: ws.wind || '—' };
    const tempMeta = WS?.TEMPERATURE?.[ws.temperature] || { pl: ws.temperature || '—' };
    const tod = WS?.timeOfDayMeta ? WS.timeOfDayMeta(ws) : { icon: '⏰', label: '—' };
    const season = WS?._seasonMeta
      ? WS._seasonMeta(cal, ws.month_index)
      : { icon: '📅', label: cal?.seasonForMonth?.(ws.month_index) || '—' };
    const epoch = cal?.epoch ? ` ${cal.epoch}` : '';
    const clock = WS?.formatClock ? WS.formatClock(ws) : '—';
    const env = WS?.getEnvironmentalEffects ? WS.getEnvironmentalEffects(ws) : { reasons: [] };
    return {
      date: `${monthMeta.pl} ${ws.day}, ${ws.year}${epoch}`,
      clock,
      tod,
      season,
      weather: weatherMeta,
      wind: windMeta,
      temp: tempMeta,
      envWarn: env.rangedDisadvantage || env.heavilyObscured,
      envReasons: env.reasons || []
    };
  },

  _statTile(val, lbl, mod = '') {
    return `<div class="dm-camp-stat ${mod}"><span class="dm-stat-val">${val}</span><span class="dm-stat-lbl">${lbl}</span></div>`;
  },

  _statGroup(title, tiles) {
    return `<section class="dm-stat-group"><h5 class="dm-stat-group__title">${title}</h5><div class="dm-camp-stats-grid">${tiles}</div></section>`;
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
      const [
        campaign,
        characters,
        npcs,
        notes,
        diceLog,
        mapData,
        quests,
        handouts,
        worldState,
        musicData,
        sounds,
        bestiary,
        merchants,
        lootTables,
        tokenImages,
        messages
      ] = await Promise.all([
        apiFetch(`/campaigns/${campaignId}`),
        apiFetch(`/campaigns/${campaignId}/characters`),
        apiFetch(`/campaigns/${campaignId}/npcs`),
        apiFetch(`/campaigns/${campaignId}/notes`),
        apiFetch(`/campaigns/${campaignId}/dice-log`).catch(() => []),
        apiFetch(`/campaigns/${campaignId}/map`).catch(() => null),
        apiFetch(`/campaigns/${campaignId}/quests`).catch(() => []),
        apiFetch(`/campaigns/${campaignId}/handouts`).catch(() => []),
        apiFetch(`/campaigns/${campaignId}/world-state`).catch(() => null),
        apiFetch(`/campaigns/${campaignId}/music`).catch(() => ({ tracks: [], playback: null })),
        apiFetch(`/campaigns/${campaignId}/sounds`).catch(() => []),
        apiFetch(`/campaigns/${campaignId}/bestiary`).catch(() => []),
        apiFetch(`/campaigns/${campaignId}/merchants`).catch(() => []),
        apiFetch(`/campaigns/${campaignId}/loot-tables`).catch(() => []),
        apiFetch(`/campaigns/${campaignId}/token-images`).catch(() => []),
        apiFetch(`/campaigns/${campaignId}/messages?limit=200`).catch(() => [])
      ]);

      App.currentCampaign = { ...App.currentCampaign, ...campaign };

      const members = campaign.members || [];
      const players = members.filter((m) => m.role === 'player');
      const dms = members.filter((m) => m.role === 'dm');
      const slotsUsed = members.length;
      const slotsMax = campaign.max_players || 6;
      const slotsFree = Math.max(0, slotsMax - slotsUsed);
      const campAge = this._campDaysSince(campaign.created_at);

      const assignedUserIds = new Set(characters.map((ch) => ch.user_id).filter(Boolean));
      const playersWithoutChar = players.filter((p) => !assignedUserIds.has(p.id));

      const initEntries = typeof Initiative !== 'undefined' ? Initiative.entries : [];
      const initRound = typeof Initiative !== 'undefined' ? Initiative.round : campaign.initiative_round || 1;
      const activeInit = initEntries.find((e) => e.is_active);

      const tokens = mapData?.tokens || [];
      const mapSettings = mapData?.settings || {};
      const fogOn = mapSettings.fog_enabled === 1 || mapSettings.fog_enabled === true;
      const hasMapBg = !!(mapSettings.background_image || mapSettings.backgroundImage);
      const gridW = mapSettings.grid_width ?? 25;
      const gridH = mapSettings.grid_height ?? 18;
      const gridCellW = mapSettings.grid_cell_width > 0 ? mapSettings.grid_cell_width : (mapSettings.grid_size ?? 40);
      const gridCellH = mapSettings.grid_cell_height > 0 ? mapSettings.grid_cell_height : (mapSettings.grid_size ?? 40);

      const visibleNpcs = npcs.filter((n) => n.is_visible).length;
      const hiddenNpcs = npcs.length - visibleNpcs;
      let monsterCount = 0;
      let legendaryNpc = 0;
      npcs.forEach((n) => {
        try {
          const meta = JSON.parse(n.stats || '{}');
          if (meta.category === 'monster') monsterCount += 1;
          if (typeof NpcTemplates !== 'undefined' && meta.templateId) {
            const tpl = NpcTemplates.getById(meta.templateId);
            if (tpl?.legendary) legendaryNpc += 1;
          }
        } catch (_e) { /* ignore */ }
      });

      const dmNotes = notes.filter((n) => n.is_dm_only).length;
      const publicNotes = notes.length - dmNotes;
      const sessionNotes = notes.filter((n) => n.session_number).length;

      const recentRolls = (diceLog || []).slice(-8).reverse();
      const diceTotal = (diceLog || []).length;
      const nat20 = (diceLog || []).filter((r) => r.total === 20 && /d20/i.test(r.roll_expression || '')).length;
      const nat1 = (diceLog || []).filter((r) => r.total === 1 && /d20/i.test(r.roll_expression || '')).length;

      const avgLevel = characters.length
        ? (characters.reduce((s, ch) => s + (ch.level || 1), 0) / characters.length).toFixed(1)
        : '—';
      const minLevel = characters.length ? Math.min(...characters.map((c) => c.level || 1)) : '—';
      const maxLevel = characters.length ? Math.max(...characters.map((c) => c.level || 1)) : '—';
      const totalHpMax = characters.reduce((s, c) => s + (c.max_hp || 0), 0);
      const totalHpCur = characters.reduce((s, c) => s + (c.current_hp || 0), 0);
      const partyHpPct = totalHpMax > 0 ? Math.round((totalHpCur / totalHpMax) * 100) : null;
      const wounded = characters.filter((c) => c.max_hp > 0 && c.current_hp < c.max_hp && c.current_hp > 0).length;
      const downed = characters.filter((c) => (c.current_hp || 0) <= 0).length;
      const totalInsp = characters.reduce((s, c) => s + (parseInt(c.inspiration, 10) || 0), 0);
      const partyWealthCp = characters.reduce((s, c) => s + this._walletCopper(c), 0);

      const questsActive = quests.filter((q) => q.status === 'active').length;
      const questsDone = quests.filter((q) => q.status === 'completed').length;
      const questsFailed = quests.filter((q) => q.status === 'failed' || q.status === 'abandoned').length;
      const questsMain = quests.filter((q) => q.quest_type === 'main').length;

      const musicTracks = musicData?.tracks || [];
      const musicPlaying = !!musicData?.playback?.isPlaying;
      const msgCount = messages.length;
      const msgHint = msgCount >= 200 ? '200+' : String(msgCount);

      const world = this._worldSnapshot(worldState);

      const statusLabel = campaign.status === 'active' ? 'Aktywna' : escapeHtml(campaign.status || '—');
      const statusClass = campaign.status === 'active' ? 'dm-badge-active' : 'dm-badge-muted';

      const partyRows = characters.length
        ? characters.map((c) => {
          const hpPct = c.max_hp > 0 ? Math.round((c.current_hp / c.max_hp) * 100) : 100;
          const hpClass = hpPct <= 25 ? 'dm-hp--critical' : hpPct <= 50 ? 'dm-hp--low' : '';
          const insp = parseInt(c.inspiration, 10) || 0;
          const player = members.find((m) => m.id === c.user_id);
          return `<tr>
            <td><strong>${escapeHtml(c.name)}</strong><span class="dm-party-sub">${escapeHtml(c.race || '')} ${escapeHtml(c.char_class || '')} ${c.level}</span></td>
            <td>${escapeHtml(player?.display_name || player?.username || '—')}</td>
            <td class="dm-party-hp">
              <div class="dm-hp-bar ${hpClass}" style="--hp:${hpPct}%"><span>${c.current_hp}/${c.max_hp}</span></div>
            </td>
            <td>${c.armor_class ?? '—'}</td>
            <td>${insp > 0 ? '⭐'.repeat(Math.min(insp, 3)) + (insp > 3 ? `+${insp - 3}` : '') : '—'}</td>
            <td class="dm-party-wallet">${typeof Economy !== 'undefined' ? escapeHtml(Economy.formatWallet(c)) : '—'}</td>
          </tr>`;
        }).join('')
        : '<tr><td colspan="6" class="sheet-hint">Brak postaci w kampanii</td></tr>';

      container.innerHTML = `
        <div class="dm-campaign-overview">
          <div class="dm-camp-header">
            <div>
              <h4 class="dm-camp-title">${escapeHtml(campaign.name)}</h4>
              <p class="dm-camp-meta">
                ${escapeHtml(campaign.setting || 'Forgotten Realms')}
                · utworzono ${formatDate(campaign.created_at)}
                ${campAge != null ? ` · <strong>${campAge}</strong> dni kampanii` : ''}
              </p>
            </div>
            <div class="dm-camp-header-actions">
              <span class="dm-badge ${statusClass}">${statusLabel}</span>
              <button type="button" class="btn btn-sm btn-secondary" data-refresh-campaign-info title="Odśwież statystyki">↻ Odśwież</button>
            </div>
          </div>

          <div class="dm-camp-kpi-row">
            <span class="dm-kpi">🎮 <strong>${players.length}</strong> graczy</span>
            <span class="dm-kpi">🪑 <strong>${slotsFree}</strong> wolnych miejsc</span>
            <span class="dm-kpi">🎲 <strong>${diceTotal}</strong> rzutów w logu</span>
            <span class="dm-kpi">💬 <strong>${msgHint}</strong> wiad. (ostatnie)</span>
            ${partyHpPct != null ? `<span class="dm-kpi dm-kpi--hp">❤️ drużyna <strong>${partyHpPct}%</strong> HP</span>` : ''}
          </div>

          ${campaign.description ? `<p class="dm-camp-desc">${escapeHtml(campaign.description)}</p>` : '<p class="dm-camp-desc dm-camp-desc-empty">Brak opisu kampanii — możesz go dodać przy edycji na pulpicie.</p>'}

          <div class="dm-camp-invite-block">
            <span class="dm-camp-label">Kod zaproszenia</span>
            <div class="dm-camp-invite-row">
              <code class="dm-invite-code">${escapeHtml(campaign.invite_code)}</code>
              <button type="button" class="btn btn-sm btn-primary" data-copy-invite>📋 Kopiuj</button>
            </div>
            <span class="sheet-hint">Udostępnij graczom: Dołącz do kampanii → wklej kod · limit <strong>${slotsMax}</strong> miejsc (łącznie z MG)</span>
          </div>

          <div class="dm-camp-stat-groups">
            ${this._statGroup('👥 Drużyna i gracze', [
              this._statTile(`${slotsUsed}/${slotsMax}`, 'Miejsca'),
              this._statTile(String(players.length), 'Graczy'),
              this._statTile(String(characters.length), 'Postaci'),
              this._statTile(`poz. ${avgLevel}`, 'Śr. poziom'),
              this._statTile(`${minLevel}–${maxLevel}`, 'Zakres lvl'),
              this._statTile(partyHpPct != null ? `${partyHpPct}%` : '—', 'HP drużyny', partyHpPct != null && partyHpPct <= 40 ? 'dm-camp-stat--warn' : ''),
              this._statTile(String(wounded), 'Ranni', wounded > 0 ? 'dm-camp-stat--warn' : ''),
              this._statTile(String(downed), 'Bez przytomności', downed > 0 ? 'dm-camp-stat--danger' : ''),
              this._statTile(String(totalInsp), 'Inspiracja łącznie'),
              this._statTile(this._formatPartyWealth(partyWealthCp), 'Majątek drużyny')
            ].join(''))}
            ${this._statGroup('📚 Zasoby kampanii', [
              this._statTile(`${questsActive}/${quests.length}`, 'Questy aktywne'),
              this._statTile(String(questsDone), 'Ukończone'),
              this._statTile(String(questsMain), 'Główne wątki'),
              this._statTile(String(npcs.length), `NPC (${visibleNpcs} wid.)`),
              this._statTile(String(monsterCount), 'Potwory'),
              this._statTile(String(hiddenNpcs), 'Ukryte NPC'),
              this._statTile(String(bestiary.length), 'Bestiariusz'),
              this._statTile(String(handouts.length), 'Handouty'),
              this._statTile(String(notes.length), 'Notatki'),
              this._statTile(String(sessionNotes), 'Z sesją #')
            ].join(''))}
            ${this._statGroup('🎵 Sesja i narzędzia', [
              this._statTile(String(musicTracks.length), 'Utwory muzyki'),
              this._statTile(musicPlaying ? '▶ gra' : '⏸', 'Muzyka'),
              this._statTile(String(sounds.length), 'Dźwięki SB'),
              this._statTile(String(merchants.length), 'Kupcy'),
              this._statTile(String(lootTables.length), 'Tabele łupu'),
              this._statTile(String(tokenImages.length), 'Obrazy tokenów'),
              this._statTile(String(diceTotal), 'Rzuty w logu'),
              this._statTile(`20:${nat20} · 1:${nat1}`, 'Krytyki d20')
            ].join(''))}
            ${this._statGroup('🗺️ Mapa i walka', [
              this._statTile(String(tokens.length), 'Tokenów'),
              this._statTile(fogOn ? 'mgła ON' : 'mgła OFF', 'Mgła wojny'),
              this._statTile(hasMapBg ? '✓' : '—', 'Tło mapy'),
              this._statTile(`${gridW}×${gridH}`, 'Siatka'),
              this._statTile(String(initEntries.length || 0), `Init r.${initRound}`),
              this._statTile(legendaryNpc > 0 ? String(legendaryNpc) : '0', 'Legendarni NPC')
            ].join(''))}
          </div>

          ${world ? `
          <section class="dm-camp-world-card">
            <h5>📅 Świat gry (kalendarz)</h5>
            <div class="dm-world-grid">
              <div><span class="dm-camp-label">Data</span><strong>${escapeHtml(world.date)}</strong></div>
              <div><span class="dm-camp-label">Czas</span><strong>${escapeHtml(world.clock)}</strong> · ${world.tod.icon} ${escapeHtml(world.tod.label)}</div>
              <div><span class="dm-camp-label">Pogoda</span><strong>${world.weather.icon} ${escapeHtml(world.weather.label)}</strong></div>
              <div><span class="dm-camp-label">Wiatr / temp.</span>${escapeHtml(world.wind.label)} · ${escapeHtml(world.temp.pl)}</div>
              <div><span class="dm-camp-label">Pora roku</span>${world.season.icon} ${escapeHtml(world.season.label)}</div>
              ${world.envWarn ? `<div class="dm-camp-alert dm-camp-alert--inline">⚠️ ${escapeHtml(world.envReasons.slice(0, 2).join(' · ') || 'Trudne warunki walki')}</div>` : ''}
            </div>
          </section>` : ''}

          <div class="dm-camp-subsection">
            <h5>⚔️ Stan drużyny</h5>
            <div class="dm-party-table-wrap">
              <table class="dm-party-table">
                <thead>
                  <tr>
                    <th>Postać</th>
                    <th>Gracz</th>
                    <th>HP</th>
                    <th>AC</th>
                    <th>Insp.</th>
                    <th>Portfel</th>
                  </tr>
                </thead>
                <tbody>${partyRows}</tbody>
              </table>
            </div>
          </div>

          <div class="dm-camp-subsection">
            <h5>👥 Członkowie kampanii</h5>
            <ul class="dm-member-list">
              ${members.length ? members.map((m) => {
                const char = characters.find((ch) => ch.user_id === m.id);
                const roleIcon = m.role === 'dm' ? '👑' : '🎮';
                const charLine = char
                  ? `${escapeHtml(char.name)} · ${escapeHtml(char.char_class)} ${char.level} · ❤️ ${char.current_hp}/${char.max_hp}`
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
                   <ol class="dm-init-queue">${initEntries.map((e) =>
                     `<li class="${e.is_active ? 'is-active' : ''}">${e.is_active ? '▶ ' : ''}${escapeHtml(e.entity_name)} <span class="dm-init-val">${e.initiative_roll}</span></li>`
                   ).join('')}</ol>`
                : '<p class="sheet-hint">Brak aktywnej kolejki — dodaj inicjatywę w zakładce Inicjatywa.</p>'}
            </div>
            <div>
              <h5>🗺️ Mapa</h5>
              <ul class="dm-camp-bullets">
                <li>Tło planszy: <strong>${hasMapBg ? 'ustawione' : 'brak'}</strong></li>
                <li>Mgła wojny: <strong>${fogOn ? 'włączona' : 'wyłączona'}</strong></li>
                <li>Plansza: <strong>${gridW}×${gridH}</strong> · kratka ${gridCellW}×${gridCellH}px</li>
                <li>Tokeny na mapie: <strong>${tokens.length}</strong></li>
                <li>Biblioteka grafik tokenów: <strong>${tokenImages.length}</strong></li>
              </ul>
            </div>
            <div>
              <h5>📜 Questy</h5>
              <ul class="dm-camp-bullets">
                <li>Aktywne: <strong>${questsActive}</strong></li>
                <li>Ukończone: <strong>${questsDone}</strong></li>
                <li>Nieudane / porzucone: <strong>${questsFailed}</strong></li>
              </ul>
            </div>
          </div>

          <div class="dm-camp-subsection dm-camp-cols">
            <div>
              <h5>📝 Notatki</h5>
              <p>Publiczne: <strong>${publicNotes}</strong> · Tylko MG: <strong>${dmNotes}</strong> · Z numerem sesji: <strong>${sessionNotes}</strong></p>
            </div>
            <div>
              <h5>🧙 NPC i bestiariusz</h5>
              <ul class="dm-camp-bullets">
                <li>NPC łącznie: <strong>${npcs.length}</strong> (widoczne: ${visibleNpcs}, ukryte: ${hiddenNpcs})</li>
                <li>Potwory w NPC: <strong>${monsterCount}</strong></li>
                <li>Wpisy bestiariusza: <strong>${bestiary.length}</strong></li>
                ${legendaryNpc ? `<li>Legendarni (szablon): <strong>${legendaryNpc}</strong></li>` : ''}
              </ul>
            </div>
          </div>

          ${recentRolls.length ? `
          <div class="dm-camp-subsection">
            <h5>🎲 Ostatnie rzuty (${recentRolls.length})</h5>
            <ul class="dm-recent-rolls">
              ${recentRolls.map((r) => {
                const when = r.created_at ? formatTime(r.created_at) : '';
                return `<li><span class="dm-roll-time">${when}</span> <strong>${escapeHtml(r.username)}</strong> ${escapeHtml(r.roll_expression)} = <span class="dm-roll-total">${r.total}</span></li>`;
              }).join('')}
            </ul>
            <p class="sheet-hint">W logu zapisano łącznie ${diceTotal} rzutów · naturalne 20: ${nat20} · naturalne 1: ${nat1}</p>
          </div>` : ''}

          <div class="dm-camp-footer sheet-hint">
            ID kampanii: <code>${escapeHtml(campaign.id)}</code>
            ${dms.length ? ` · MG: ${dms.map((d) => escapeHtml(d.display_name || d.username)).join(', ')}` : ''}
            · questy: ${quests.length} · handouty: ${handouts.length} · dźwięki: ${sounds.length}
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p class="dm-camp-alert">Błąd: ${escapeHtml(err.message)}</p>`;
    }
  },

  async loadNpcs() {
    const container = document.getElementById('npc-list');
    if (!container || !App.currentCampaign) return;
    try {
      const npcs = await apiFetch(`/campaigns/${App.currentCampaign.id}/npcs`);
      this._npcCache = npcs;
      if (npcs.length === 0) {
        container.innerHTML = '<p class="npc-gen-empty-msg">Brak NPC. Utwórz pierwszego!</p>';
        if (typeof NpcGenerator !== 'undefined') NpcGenerator._updateHeaderMeta();
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
      if (typeof NpcGenerator !== 'undefined') NpcGenerator._updateHeaderMeta();
    } catch (err) {
      console.error('Failed to load NPCs:', err);
    }
  },

  async loadPartyOverview() {
    if (!App.currentCampaign || App.currentCampaign.role !== 'dm') return;
    const container = document.getElementById('dm-party-overview');
    if (!container) return;
    try {
      const chars = await apiFetch(`/campaigns/${App.currentCampaign.id}/characters`);
      this._cachedParty = chars;
      if (chars.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">Brak postaci</p>';
        return;
      }
      container.innerHTML = chars.map(c => {
        const hpPercent = c.max_hp > 0 ? Math.round((c.current_hp / c.max_hp) * 100) : 100;
        const insp = parseInt(c.inspiration, 10) || 0;
        const stars = insp > 0 ? '⭐'.repeat(Math.min(insp, 5)) + (insp > 5 ? `(${insp})` : '') : '○';
        return `
          <div class="party-member-row" data-char-id="${escapeHtml(c.id)}">
            <span><strong>${escapeHtml(c.name)}</strong> (${escapeHtml(c.player_name || '?')}) - ${escapeHtml(c.race)} ${escapeHtml(c.char_class)} Poz.${c.level}</span>
            <span>❤️ ${c.current_hp}/${c.max_hp} (${hpPercent}%) | 🛡️ AC ${c.armor_class} | Percepcja ${10 + calcModifier(c.wisdom)}</span>
            <span class="party-inspiration">
              <span class="party-inspiration-label" title="Inspiracja">${stars}</span>
              <button type="button" class="btn btn-xs btn-secondary" data-dm-insp="add" data-char-id="${escapeHtml(c.id)}" title="+1 inspiracja">+</button>
              <button type="button" class="btn btn-xs btn-secondary" data-dm-insp="sub" data-char-id="${escapeHtml(c.id)}" title="-1 inspiracja" ${insp <= 0 ? 'disabled' : ''}>−</button>
              <button type="button" class="btn btn-xs btn-secondary" data-dm-insp="set" data-char-id="${escapeHtml(c.id)}" title="Ustaw...">⚙</button>
            </span>
          </div>
        `;
      }).join('');
      this._bindInspirationButtons();
    } catch (err) {
      console.error('Failed to load party overview:', err);
    }
  },

  _bindInspirationButtons() {
    const container = document.getElementById('dm-party-overview');
    if (!container) return;
    container.querySelectorAll('[data-dm-insp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.dmInsp;
        const id = btn.dataset.charId;
        if (typeof Inspiration === 'undefined') return;
        if (action === 'add') Inspiration.grantOne(id);
        else if (action === 'sub') Inspiration.removeOne(id);
        else if (action === 'set') {
          const current = (this._cachedParty || []).find((c) => c.id === id);
          const v = prompt(`Ustaw Inspirację dla ${current?.name || 'postaci'}:`, String(current?.inspiration || 0));
          if (v === null) return;
          Inspiration.setExact(id, parseInt(v, 10) || 0);
        }
      });
    });
    if (!this._inspGrantAllBound) {
      this._inspGrantAllBound = true;
      document.getElementById('dm-insp-grant-all')?.addEventListener('click', () => {
        if (typeof Inspiration === 'undefined') return;
        Inspiration.grantAll(1);
      });
    }
  },

  refreshInspirationOverview() {
    if (App.currentCampaign && App.currentCampaign.role === 'dm') {
      this.loadPartyOverview();
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
    setTimeout(() => {
      if (typeof AISuggest !== 'undefined') {
        AISuggest.attachToGenericModal('custom_npc', () => ({
          name: document.getElementById('npc-name')?.value,
          race: document.getElementById('npc-race')?.value
        }), (r) => AISuggest.applyCustomNpc(r));
      }
    }, 0);
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

};
