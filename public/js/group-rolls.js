// ===== Group rolls =====
// MG inicjuje rzut grupowy → każdy gracz dostaje prompt → zbiorcze podsumowanie w czacie.
const GroupRolls = {
  activeSessionId: null,    // id ostatniej widocznej sesji (na DM-progress lub player-prompt)
  _isProgressOpen: false,
  _isPromptOpen: false,

  init() {
    document.getElementById('btn-dm-group-roll')?.addEventListener('click', () => this.openComposer());
  },

  bindSocketEvents(socket) {
    socket.on('group-roll-prompt', (data) => this._showPlayerPrompt(data));
    socket.on('group-roll-progress', (data) => this._handleProgress(data));
    socket.on('group-roll-complete', (data) => this._handleComplete(data));
    socket.on('group-roll-cancelled', (data) => this._handleCancelled(data));
    socket.on('group-roll-error', (data) => showToast(data?.message || 'Błąd grupowego rzutu', 'error'));
  },

  // ===== DM: composer modal =====
  openComposer() {
    if (App.currentCampaign?.role !== 'dm') {
      showToast('Tylko MG może inicjować rzut grupowy', 'warning');
      return;
    }
    const players = (Characters.campaignCharacters || []).filter((c) => c.user_id);
    if (!players.length) {
      showToast('Brak postaci graczy w kampanii', 'warning');
      return;
    }

    const skillOpts = Object.keys(DND_SKILLS).map((k) =>
      `<option value="${k}">${escapeHtml(DND_SKILL_NAMES_PL[k] || k)} (${escapeHtml(ABILITY_SHORT[DND_SKILLS[k]] || '')})</option>`
    ).join('');
    const abilityOpts = Object.keys(ABILITY_NAMES_PL).map((k) =>
      `<option value="${k}">${escapeHtml(ABILITY_NAMES_PL[k])}</option>`
    ).join('');

    const playerRows = players.map((c) => `
      <label class="gr-participant">
        <input type="checkbox" data-char-id="${c.id}" checked>
        <span>${escapeHtml(c.name)}</span>
        <span class="gr-participant-player">${escapeHtml(c.player_name || '')}</span>
      </label>
    `).join('');

    showGenericModal('🎯 Rzut grupowy', `
      <div class="group-roll-composer">
        <p class="sheet-hint">Każdy zaznaczony gracz dostanie prośbę o rzut. Po wszystkich rzutach wynik trafi do czatu.</p>

        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label>Typ rzutu</label>
            <select id="gr-type">
              <option value="skill" selected>Test umiejętności</option>
              <option value="ability">Test atrybutu</option>
              <option value="save">Rzut obronny</option>
              <option value="custom">Własna formuła</option>
            </select>
          </div>
          <div class="form-group" style="flex:1">
            <label>DC (opcjonalnie)</label>
            <input type="number" id="gr-dc" placeholder="np. 15" min="1" max="40">
          </div>
        </div>

        <div id="gr-fields-skill" class="gr-cat-fields">
          <label>Umiejętność</label>
          <select id="gr-skill">${skillOpts}</select>
          <div class="gr-quick-skills">
            <button type="button" class="btn btn-xs btn-secondary gr-quick" data-skill="Stealth">🥷 Skradanie</button>
            <button type="button" class="btn btn-xs btn-secondary gr-quick" data-skill="Perception">👁 Percepcja</button>
            <button type="button" class="btn btn-xs btn-secondary gr-quick" data-skill="Insight">🧠 Wnikliwość</button>
            <button type="button" class="btn btn-xs btn-secondary gr-quick" data-skill="Investigation">🔍 Śledztwo</button>
            <button type="button" class="btn btn-xs btn-secondary gr-quick" data-skill="Athletics">💪 Atletyka</button>
            <button type="button" class="btn btn-xs btn-secondary gr-quick" data-skill="Acrobatics">🤸 Akrobatyka</button>
          </div>
        </div>

        <div id="gr-fields-ability" class="gr-cat-fields" style="display:none">
          <label>Atrybut</label>
          <select id="gr-ability">${abilityOpts}</select>
        </div>

        <div id="gr-fields-save" class="gr-cat-fields" style="display:none">
          <label>Atrybut rzutu obronnego</label>
          <select id="gr-save-ability">${abilityOpts}</select>
        </div>

        <div id="gr-fields-custom" class="gr-cat-fields" style="display:none">
          <label>Etykieta (np. „Inicjatywa" lub „Wytrzymałość vs trucizna")</label>
          <input type="text" id="gr-custom-label" placeholder="Etykieta widoczna graczom">
          <label style="margin-top:8px">Formuła (np. <code>1d20+CON</code> — gracz uzupełni modyfikator)</label>
          <input type="text" id="gr-custom-expr" placeholder="np. 1d20" value="1d20">
        </div>

        <div class="form-row" style="margin-top:10px">
          <label class="gr-flag"><input type="checkbox" id="gr-advantage"> Przewaga</label>
          <label class="gr-flag"><input type="checkbox" id="gr-disadvantage"> Utrudnienie</label>
        </div>

        <h4 style="margin:14px 0 6px">Uczestnicy</h4>
        <div class="gr-participants" id="gr-participants">${playerRows}</div>

        <div class="form-row" style="margin-top:14px">
          <button type="button" class="btn btn-primary" id="gr-submit">🎯 Wyślij prośby o rzut</button>
          <button type="button" class="btn btn-secondary" id="gr-cancel">Anuluj</button>
        </div>
      </div>
    `, 'modal-lg');

    const refreshFields = () => {
      const t = document.getElementById('gr-type').value;
      ['skill', 'ability', 'save', 'custom'].forEach((k) => {
        const el = document.getElementById(`gr-fields-${k}`);
        if (el) el.style.display = (k === t) ? '' : 'none';
      });
    };
    document.getElementById('gr-type').addEventListener('change', refreshFields);
    document.getElementById('gr-advantage').addEventListener('change', (e) => {
      if (e.target.checked) document.getElementById('gr-disadvantage').checked = false;
    });
    document.getElementById('gr-disadvantage').addEventListener('change', (e) => {
      if (e.target.checked) document.getElementById('gr-advantage').checked = false;
    });
    document.querySelectorAll('.gr-quick').forEach((b) => {
      b.addEventListener('click', () => {
        document.getElementById('gr-skill').value = b.dataset.skill;
      });
    });

    document.getElementById('gr-cancel').addEventListener('click', () => closeModal('generic-modal'));
    document.getElementById('gr-submit').addEventListener('click', () => this._dmSubmit());
  },

  _dmSubmit() {
    const type = document.getElementById('gr-type').value;
    const dcRaw = document.getElementById('gr-dc').value;
    const dc = dcRaw ? parseInt(dcRaw, 10) : null;
    const advantage = document.getElementById('gr-advantage').checked;
    const disadvantage = document.getElementById('gr-disadvantage').checked;

    const payload = {};
    let label = '';
    if (type === 'skill') {
      const sk = document.getElementById('gr-skill').value;
      payload.skill = sk;
      label = DND_SKILL_NAMES_PL[sk] || sk;
    } else if (type === 'ability') {
      const ab = document.getElementById('gr-ability').value;
      payload.ability = ab;
      label = `Test ${ABILITY_NAMES_PL[ab] || ab}`;
    } else if (type === 'save') {
      const ab = document.getElementById('gr-save-ability').value;
      payload.ability = ab;
      label = `Rzut obronny ${ABILITY_NAMES_PL[ab] || ab}`;
    } else if (type === 'custom') {
      const customLabel = document.getElementById('gr-custom-label').value.trim();
      const expr = document.getElementById('gr-custom-expr').value.trim() || '1d20';
      label = customLabel || expr;
      payload.expression = expr;
      payload.customLabel = customLabel;
    }

    const participantCharIds = [...document.querySelectorAll('#gr-participants input[type="checkbox"]:checked')]
      .map((cb) => cb.dataset.charId);
    if (!participantCharIds.length) {
      showToast('Zaznacz co najmniej jednego gracza', 'warning');
      return;
    }

    closeModal('generic-modal');
    App.socket?.emit('group-roll-start', {
      type, payload, dc, label, advantage, disadvantage,
      participantCharIds,
      isSecret: false
    });
    showToast(`🎯 Wysłano ${participantCharIds.length} prośb${participantCharIds.length === 1 ? 'ę' : 'y'} o rzut`, 'info');
  },

  // ===== DM: progress modal (live) =====
  _showProgressModal(data) {
    if (App.currentCampaign?.role !== 'dm') return;
    if (this._isProgressOpen) {
      this._renderProgressBody(data);
      return;
    }
    this.activeSessionId = data.sessionId;
    this._isProgressOpen = true;
    showGenericModal(`🎯 ${escapeHtml(data.label)}${data.dc ? ` — DC ${data.dc}` : ''}`, `
      <div class="group-roll-progress">
        <div class="gr-progress-list" id="gr-progress-list">${this._participantRows(data)}</div>
        <div class="form-row" style="margin-top:14px">
          <button type="button" class="btn btn-primary" id="gr-finalize">✅ Zakończ teraz</button>
          <button type="button" class="btn btn-danger" id="gr-cancel-session">✕ Anuluj rzut</button>
        </div>
      </div>
    `, 'modal-lg');

    document.getElementById('gr-finalize').addEventListener('click', () => {
      App.socket?.emit('group-roll-finalize', { sessionId: this.activeSessionId });
    });
    document.getElementById('gr-cancel-session').addEventListener('click', () => {
      App.socket?.emit('group-roll-cancel', { sessionId: this.activeSessionId });
    });
    // Override modal close — pyta o anulowanie sesji
    const modalCloseBtn = document.querySelector('#generic-modal .modal-close');
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', () => { this._isProgressOpen = false; }, { once: true });
    }
  },

  _renderProgressBody(data) {
    const list = document.getElementById('gr-progress-list');
    if (list) list.innerHTML = this._participantRows(data);
  },

  _participantRows(data) {
    return data.participants.map((p) => {
      const status = p.status === 'rolled'
        ? `<span class="gr-status gr-rolled">${p.result?.total ?? '?'}${p.result?.success === true ? ' ✅' : p.result?.success === false ? ' ❌' : ''}</span>`
        : p.status === 'skipped'
        ? '<span class="gr-status gr-skipped">pominięto</span>'
        : '<span class="gr-status gr-pending">⏳ czekam…</span>';
      return `<div class="gr-progress-row">
        <span class="gr-participant-name">${escapeHtml(p.characterName)}</span>
        ${status}
      </div>`;
    }).join('');
  },

  // ===== Player: prompt modal =====
  _showPlayerPrompt(data) {
    if (this._isPromptOpen) closeModal('generic-modal');
    this._isPromptOpen = true;
    this.activeSessionId = data.sessionId;

    const char = (Characters.campaignCharacters || []).find((c) => c.id === data.characterId)
      || Characters.myCampaignCharacter;
    const charName = char?.name || data.characterName || 'Postać';
    const advHint = data.advantage ? ' (z przewagą)' : data.disadvantage ? ' (z utrudnieniem)' : '';
    const dcHint = data.dc ? ` <span class="gr-dc">DC ${data.dc}</span>` : '';

    showGenericModal(`🎯 MG prosi o rzut`, `
      <div class="group-roll-player-prompt">
        <p class="gr-prompt-label">${escapeHtml(data.label)}${dcHint}${escapeHtml(advHint)}</p>
        <p class="gr-prompt-char">Postać: <strong>${escapeHtml(charName)}</strong></p>

        <div class="gr-prompt-actions">
          <button type="button" class="btn btn-primary btn-large" id="gr-roll-btn">🎲 Rzuć</button>
          <button type="button" class="btn btn-secondary" id="gr-skip-btn">Pomiń</button>
        </div>
      </div>
    `);
    // Zapamiętaj prompt-data dla _autoRollForPrompt
    this._currentPrompt = data;
    document.getElementById('gr-roll-btn').addEventListener('click', () => this._autoRollForPrompt());
    document.getElementById('gr-skip-btn').addEventListener('click', () => {
      App.socket?.emit('group-roll-submit', { sessionId: data.sessionId, skipped: true });
      this._isPromptOpen = false;
      this._currentPrompt = null;
      closeModal('generic-modal');
    });
  },

  _autoRollForPrompt() {
    const data = this._currentPrompt;
    if (!data) return;

    const char = (Characters.campaignCharacters || []).find((c) => c.id === data.characterId);
    if (!char) {
      showToast('Nie znaleziono postaci — pomijam', 'warning');
      App.socket?.emit('group-roll-submit', { sessionId: data.sessionId, skipped: true });
      this._isPromptOpen = false;
      this._currentPrompt = null;
      closeModal('generic-modal');
      return;
    }

    // Ustaw advantage/disadvantage w UI tymczasowo
    const advBox = document.getElementById('dice-advantage');
    const disBox = document.getElementById('dice-disadvantage');
    const prevAdv = advBox?.checked, prevDis = disBox?.checked;
    if (advBox) advBox.checked = !!data.advantage;
    if (disBox) disBox.checked = !!data.disadvantage;

    let result = null;
    try {
      if (data.type === 'skill' && data.payload?.skill) {
        result = Dice._rollSkill(char, data.payload.skill);
      } else if (data.type === 'ability' && data.payload?.ability) {
        result = Dice._rollAbility(char, data.payload.ability);
      } else if (data.type === 'save' && data.payload?.ability) {
        result = Dice._rollSave(char, data.payload.ability);
      } else if (data.type === 'custom' && data.payload?.expression) {
        // Wysyła w czacie zwykły custom, podpisując etykietą
        const rolled = Dice.rollExpression(data.payload.expression);
        const expr = `${data.payload.expression} (${data.label})`;
        Dice._emitRoll(char, expr, rolled.rolls, rolled.total, data.label, 20);
        result = { expr, rolls: rolled.rolls, total: rolled.total, rollType: data.label };
      }
    } catch (err) {
      console.error('group roll exec error', err);
    }

    // Przywróć stan adv/dis
    if (advBox) advBox.checked = prevAdv;
    if (disBox) disBox.checked = prevDis;

    if (!result) {
      showToast('Nie udało się rzucić — pomijam', 'error');
      App.socket?.emit('group-roll-submit', { sessionId: data.sessionId, skipped: true });
    } else {
      App.socket?.emit('group-roll-submit', {
        sessionId: data.sessionId,
        total: result.total,
        roll: result.rolls?.[0] ?? result.total,
        expr: result.expr || ''
      });
    }

    this._isPromptOpen = false;
    this._currentPrompt = null;
    closeModal('generic-modal');
  },

  // ===== Common: progress / complete =====
  _handleProgress(data) {
    if (App.currentCampaign?.role === 'dm') {
      // DM widzi modal postępu (jeśli to początek sesji — otwórz; jeśli już otwarty — odśwież)
      if (!this._isProgressOpen || this.activeSessionId !== data.sessionId) {
        this._showProgressModal(data);
      } else {
        this._renderProgressBody(data);
      }
    }
  },

  _handleComplete(data) {
    // Zamknij progress modal jeśli otwarty
    if (this._isProgressOpen && this.activeSessionId === data.sessionId) {
      closeModal('generic-modal');
      this._isProgressOpen = false;
    }
    if (this._isPromptOpen && this.activeSessionId === data.sessionId) {
      closeModal('generic-modal');
      this._isPromptOpen = false;
      this._currentPrompt = null;
    }
    this.activeSessionId = null;

    // Krótki toast — szczegóły są w czacie
    if (typeof data.dc === 'number' && data.dc > 0) {
      const rolled = data.participants.filter((p) => p.status === 'rolled');
      const successes = rolled.filter((p) => p.result?.success).length;
      showToast(`🎯 ${data.label}: ${successes}/${rolled.length} sukces (DC ${data.dc})`, successes >= rolled.length ? 'success' : 'info');
    } else {
      showToast(`🎯 ${data.label} — zakończono`, 'info');
    }
  },

  _handleCancelled(data) {
    if (this.activeSessionId === data.sessionId) {
      this.activeSessionId = null;
      this._isProgressOpen = false;
      this._isPromptOpen = false;
      this._currentPrompt = null;
      closeModal('generic-modal');
      showToast('Rzut grupowy anulowany', 'warning');
    }
  }
};
