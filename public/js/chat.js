// ===== Chat Module =====
const Chat = {
  oldestLoadedAt: null,
  hasMore: true,
  campaignNpcs: [],
  puppetPickAfterCreate: false,

  init() {
    document.getElementById('btn-send-chat').addEventListener('click', () => this.sendMessage(false));
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage(false);
    });
    document.getElementById('chat-type').addEventListener('change', (e) => {
      this.syncWhisperField(e.target.value, 'whisper-target');
    });
    document.getElementById('btn-load-older-chat')?.addEventListener('click', () => this.loadOlder());
    document.getElementById('btn-map-send-chat')?.addEventListener('click', () => this.sendMessage(true));
    document.getElementById('map-chat-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage(true);
    });
    document.getElementById('map-chat-type')?.addEventListener('change', (e) => {
      this.syncWhisperField(e.target.value, 'map-whisper-target');
    });
    document.getElementById('btn-map-chat-expand')?.addEventListener('click', () => {
      document.querySelector('.session-tab[data-panel="chat-panel"]')?.click();
      document.getElementById('chat-input')?.focus();
    });
    this.bindPartyClicks();
    this.updateChatInputPlaceholder();
  },

  getMessageContainers() {
    return [
      document.getElementById('chat-messages'),
      document.getElementById('map-chat-messages')
    ].filter(Boolean);
  },

  syncWhisperField(chatType, targetId) {
    const whisperInput = document.getElementById(targetId);
    if (!whisperInput) return;
    whisperInput.classList.toggle('hidden', chatType !== 'whisper');
  },

  getChatContext(useMini = false) {
    if (useMini) {
      return {
        input: document.getElementById('map-chat-input'),
        typeSelect: document.getElementById('map-chat-type'),
        whisperInput: document.getElementById('map-whisper-target')
      };
    }
    return {
      input: document.getElementById('chat-input'),
      typeSelect: document.getElementById('chat-type'),
      whisperInput: document.getElementById('whisper-target')
    };
  },

  appendMessageToContainers(elementFactory, opts = {}) {
    this.getMessageContainers().forEach((container) => {
      const compact = container.id === 'map-chat-messages';
      const el = elementFactory({ compact });
      if (opts.prepend) {
        container.insertBefore(el, container.firstChild);
      } else {
        container.appendChild(el);
      }
      if (!opts.skipScroll) {
        container.scrollTop = container.scrollHeight;
      }
    });
  },

  clearMessageContainers() {
    this.getMessageContainers().forEach((c) => { c.innerHTML = ''; });
  },

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  puppetStorageKey() {
    return App.currentCampaign ? `dm-puppet-${App.currentCampaign.id}` : '';
  },

  parseSpeakAs(data) {
    if (!data?.roll_data) return null;
    try {
      const parsed = typeof data.roll_data === 'string' ? JSON.parse(data.roll_data) : data.roll_data;
      return parsed?.speakAs || parsed?.speakAsMeta || null;
    } catch (_e) {
      return null;
    }
  },

  getNpcEntityType(npc) {
    try {
      const meta = JSON.parse(npc.stats || '{}');
      return meta.category === 'monster' ? 'monster' : 'npc';
    } catch (_e) {
      return 'npc';
    }
  },

  getActivePuppet() {
    if (!this.isDm()) return null;
    const id = sessionStorage.getItem(this.puppetStorageKey());
    if (!id) return null;
    return this.campaignNpcs.find((n) => n.id === id) || null;
  },

  setActivePuppet(npc) {
    if (!this.isDm() || !App.currentCampaign) return;
    const key = this.puppetStorageKey();
    if (!npc) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, npc.id);
    }
    this.updateChatInputPlaceholder();
    this.renderCombatants();
  },

  getSpeakAsPayload() {
    const puppet = this.getActivePuppet();
    if (puppet) return { npcId: puppet.id };
    return null;
  },

  getRollCharacterName() {
    const puppet = this.getActivePuppet();
    if (puppet) return puppet.name;
    return Characters.activeCharacter?.name || '';
  },

  updateChatInputPlaceholder() {
    const puppet = this.getActivePuppet();
    const placeholder = !this.isDm()
      ? 'Napisz wiadomość...'
      : puppet
        ? `Mów jako ${puppet.name}…`
        : 'Napisz jako MG lub wybierz NPC po prawej…';
    const main = document.getElementById('chat-input');
    const mini = document.getElementById('map-chat-input');
    if (main) main.placeholder = placeholder;
    if (mini) {
      mini.placeholder = this.isDm() && puppet
        ? `${puppet.name}…`
        : 'Wiadomość…';
    }
  },

  async loadCampaignNpcs() {
    if (!this.isDm() || !App.currentCampaign) {
      this.campaignNpcs = [];
      return;
    }
    try {
      this.campaignNpcs = await apiFetch(`/campaigns/${App.currentCampaign.id}/npcs`);
      const storedId = sessionStorage.getItem(this.puppetStorageKey());
      if (storedId && !this.campaignNpcs.some((n) => n.id === storedId)) {
        sessionStorage.removeItem(this.puppetStorageKey());
      }
      this.renderCombatants();
      this.updateChatInputPlaceholder();
    } catch (err) {
      console.error('Failed to load NPCs for chat:', err);
    }
  },

  onNpcCreated(npc) {
    if (!npc?.id) return;
    const idx = this.campaignNpcs.findIndex((n) => n.id === npc.id);
    if (idx >= 0) this.campaignNpcs[idx] = npc;
    else this.campaignNpcs.push(npc);
    this.campaignNpcs.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pl'));
    if (this.puppetPickAfterCreate) {
      this.puppetPickAfterCreate = false;
      this.setActivePuppet(npc);
      showToast(`Sterujesz: ${npc.name}`, 'success');
    }
    this.renderCombatants();
  },

  onNpcUpdated(npc) {
    if (!npc?.id) return;
    const idx = this.campaignNpcs.findIndex((n) => n.id === npc.id);
    if (idx >= 0) this.campaignNpcs[idx] = npc;
    else if (this.isDm()) this.campaignNpcs.push(npc);
    if (this.getActivePuppet()?.id === npc.id) {
      this.renderCombatants();
    } else {
      this.renderCombatants();
    }
  },

  bindPartyClicks() {
    const onClick = (e) => {
      if (e.target.closest('.chat-hp-btn, .chat-dm-puppet-actions, [data-dm-switch-puppet]')) return;
      const charCard = e.target.closest('[data-chat-char-id]');
      if (charCard) {
        Characters.openSheet(charCard.dataset.chatCharId);
        return;
      }
      const npcCard = e.target.closest('[data-chat-npc-id]');
      if (npcCard && this.isDm()) {
        const npc = this.campaignNpcs.find((n) => n.id === npcCard.dataset.chatNpcId);
        if (npc) this.setActivePuppet(npc);
      }
    };
    document.getElementById('chat-party-me')?.addEventListener('click', onClick);
    document.getElementById('chat-party-others')?.addEventListener('click', onClick);

    document.getElementById('chat-party-me')?.addEventListener('click', (e) => {
      const hpBtn = e.target.closest('[data-puppet-hp-delta]');
      if (!hpBtn) return;
      e.stopPropagation();
      this.adjustPuppetHp(parseInt(hpBtn.dataset.puppetHpDelta, 10) || 0);
    });
  },

  async adjustPuppetHp(delta) {
    const puppet = this.getActivePuppet();
    if (!puppet || !delta) return;
    const max = Math.max(0, parseInt(puppet.max_hp, 10) || 0);
    const next = Math.max(0, Math.min(max || 9999, (parseInt(puppet.current_hp, 10) || 0) + delta));
    try {
      const updated = await apiFetch(`/npcs/${puppet.id}`, {
        method: 'PUT',
        body: JSON.stringify({ current_hp: next })
      });
      this.onNpcUpdated(updated);
    } catch (err) {
      showToast(err.message || 'Nie udało się zmienić HP', 'error');
    }
  },

  showPuppetPickerModal() {
    if (!this.isDm()) return;
    const list = this.campaignNpcs || [];
    const rows = list.length
      ? list.map((npc) => {
          const kind = this.getNpcEntityType(npc) === 'monster' ? '👹' : '🧙';
          const active = this.getActivePuppet()?.id === npc.id ? ' chat-puppet-pick-active' : '';
          return `
            <button type="button" class="chat-puppet-pick-row${active}" data-pick-npc-id="${npc.id}">
              <span class="chat-puppet-pick-icon">${kind}</span>
              <span class="chat-puppet-pick-name">${escapeHtml(npc.name)}</span>
              <span class="chat-puppet-pick-meta">❤ ${npc.current_hp}/${npc.max_hp} · 🛡 ${npc.armor_class}</span>
            </button>
          `;
        }).join('')
      : '<p class="sheet-hint">Brak NPC w kampanii — dodaj ze szablonu lub utwórz własnego.</p>';

    const html = `
      <p class="sheet-hint">Wybierz postać, którą odgrywasz w czacie. Wiadomości i rzuty będą podpisane jej imieniem.</p>
      <div id="chat-puppet-pick-list" class="chat-puppet-pick-list">${rows}</div>
      <div class="chat-puppet-pick-toolbar">
        <button type="button" class="btn btn-sm btn-secondary" id="chat-puppet-new-tpl">📚 Szablony</button>
        <button type="button" class="btn btn-sm btn-secondary" id="chat-puppet-new-custom">✏️ Własny</button>
        <button type="button" class="btn btn-sm btn-secondary" id="chat-puppet-clear">👑 Tylko MG</button>
      </div>
    `;
    showGenericModal('🎭 Zmień sterowaną postać', html, 'modal-lg');

    document.getElementById('chat-puppet-pick-list')?.addEventListener('click', (e) => {
      const row = e.target.closest('[data-pick-npc-id]');
      if (!row) return;
      const npc = this.campaignNpcs.find((n) => n.id === row.dataset.pickNpcId);
      if (npc) {
        this.setActivePuppet(npc);
        closeModal('generic-modal');
        showToast(`Sterujesz: ${npc.name}`, 'success');
      }
    });

    document.getElementById('chat-puppet-new-tpl')?.addEventListener('click', () => {
      this.puppetPickAfterCreate = true;
      closeModal('generic-modal');
      if (typeof DMPanel !== 'undefined') DMPanel.showTemplateBrowser();
    });
    document.getElementById('chat-puppet-new-custom')?.addEventListener('click', () => {
      this.puppetPickAfterCreate = true;
      closeModal('generic-modal');
      if (typeof DMPanel !== 'undefined') DMPanel.showCustomNpcForm();
    });
    document.getElementById('chat-puppet-clear')?.addEventListener('click', () => {
      this.setActivePuppet(null);
      closeModal('generic-modal');
      showToast('Piszesz jako Mistrz Gry', 'info');
    });
  },

  getPlayedCharacter() {
    const active = Characters.activeCharacter;
    if (active && active.user_id === getUser()?.id) return active;
    return Characters.myCampaignCharacter || null;
  },

  renderHpCard(c, side, opts = {}) {
    const hpMax = Math.max(0, parseInt(c.max_hp, 10) || 0);
    const hpNow = Math.max(0, parseInt(c.current_hp, 10) || 0);
    const pct = hpMax > 0 ? Math.round((hpNow / hpMax) * 100) : 0;
    const hpClass = pct > 50 ? 'ok' : pct > 25 ? 'warn' : 'crit';
    const dataAttr = opts.isNpc
      ? `data-chat-npc-id="${c.id}"`
      : `data-chat-char-id="${c.id}"`;
    const kindIcon = opts.isNpc
      ? (this.getNpcEntityType(c) === 'monster' ? '👹 ' : '🧙 ')
      : '';
    return `
      <button type="button" class="chat-hp-card ${side}${opts.isPuppet ? ' chat-hp-puppet' : ''}" ${dataAttr}>
        <div class="chat-hp-name">${kindIcon}${escapeHtml(c.name)}</div>
        <div class="chat-hp-line">
          <span class="chat-hp-values">${hpNow}/${hpMax}</span>
        </div>
        <div class="chat-hp-bar"><span class="chat-hp-fill ${hpClass}" style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>
      </button>
    `;
  },

  renderDmPuppetPanel(puppet) {
    const kind = this.getNpcEntityType(puppet) === 'monster' ? 'Potwór' : 'NPC';
    return `
      <div class="chat-dm-puppet-wrap">
        ${this.renderHpCard(puppet, 'me', { isNpc: true, isPuppet: true })}
        <div class="chat-dm-puppet-actions">
          <button type="button" class="chat-hp-btn" data-puppet-hp-delta="-5" title="−5 HP">−5</button>
          <button type="button" class="chat-hp-btn" data-puppet-hp-delta="-1" title="−1 HP">−1</button>
          <button type="button" class="chat-hp-btn" data-puppet-hp-delta="1" title="+1 HP">+1</button>
          <button type="button" class="chat-hp-btn" data-puppet-hp-delta="5" title="+5 HP">+5</button>
        </div>
        <button type="button" class="btn btn-sm btn-primary btn-full" data-dm-switch-puppet>🔄 Zmień postać</button>
        <p class="chat-dm-puppet-hint sheet-hint">${escapeHtml(kind)} · kliknij kartę NPC po lewej, aby szybko przełączyć</p>
      </div>
    `;
  },

  renderCombatants() {
    const myContainer = document.getElementById('chat-party-me');
    const othersContainer = document.getElementById('chat-party-others');
    const meTitle = document.getElementById('chat-party-me-title');
    const othersTitle = document.querySelector('.chat-party-left h4');
    if (!myContainer || !othersContainer) return;

    if (this.isDm()) {
      if (meTitle) meTitle.textContent = '👑 Sterowana postać';
      if (othersTitle) othersTitle.textContent = '🧑‍🤝‍🧑 Scena';

      const puppet = this.getActivePuppet();
      const chars = Characters.campaignCharacters || [];
      const otherNpcs = (this.campaignNpcs || []).filter((n) => !puppet || n.id !== puppet.id);

      if (!puppet) {
        myContainer.innerHTML = `
          <p class="chat-party-empty">Wybierz NPC lub potwora do odgrywania w czacie.</p>
          <button type="button" class="btn btn-sm btn-primary btn-full" data-dm-switch-puppet>🎭 Wybierz postać</button>
        `;
      } else {
        myContainer.innerHTML = this.renderDmPuppetPanel(puppet);
      }

      myContainer.querySelector('[data-dm-switch-puppet]')?.addEventListener('click', () => this.showPuppetPickerModal());

      const parts = [];
      if (chars.length) {
        parts.push('<div class="chat-scene-group"><div class="chat-scene-label">Gracze</div>');
        parts.push(chars.map((c) => this.renderHpCard(c, 'other')).join(''));
        parts.push('</div>');
      }
      if (otherNpcs.length) {
        parts.push('<div class="chat-scene-group"><div class="chat-scene-label">NPC / potwory</div>');
        parts.push(otherNpcs.map((n) => this.renderHpCard(n, 'other', { isNpc: true })).join(''));
        parts.push('</div>');
      }
      if (!parts.length) {
        othersContainer.innerHTML = '<p class="chat-party-empty">Brak postaci i NPC w kampanii.</p>';
      } else {
        othersContainer.innerHTML = parts.join('');
      }
      return;
    }

    if (meTitle) meTitle.textContent = '🎭 Twoja postać';
    if (othersTitle) othersTitle.textContent = '🧑‍🤝‍🧑 Pozostali';

    const chars = Characters.campaignCharacters || [];
    const me = this.getPlayedCharacter();
    const others = chars.filter((c) => !me || c.id !== me.id);

    if (!me) {
      myContainer.innerHTML = '<p class="chat-party-empty">Wybierz swoją postać w zakładce Postacie.</p>';
    } else {
      myContainer.innerHTML = this.renderHpCard(me, 'me');
    }

    if (!others.length) {
      othersContainer.innerHTML = '<p class="chat-party-empty">Brak innych postaci w kampanii.</p>';
    } else {
      othersContainer.innerHTML = others.map((c) => this.renderHpCard(c, 'other')).join('');
    }
  },

  formatMessageAuthor(data) {
    const speakAs = this.parseSpeakAs(data);
    const name = escapeHtml(data.username || '');
    if (speakAs) {
      const icon = speakAs.type === 'monster' ? '👹' : '🧙';
      return `${icon} ${name}`;
    }
    return name;
  },

  sendMessage(useMini = false) {
    const { input, typeSelect, whisperInput } = this.getChatContext(useMini);
    const content = input?.value.trim();
    if (!content || !App.socket) return;

    const chatType = typeSelect?.value || 'chat';
    const isWhisper = chatType === 'whisper';
    const whisperTo = isWhisper ? (whisperInput?.value.trim() || '') : '';

    if (content.startsWith('/roll ') || content.startsWith('/r ')) {
      const expr = content.replace(/^\/(roll|r)\s+/, '');
      const result = Dice.rollExpression(expr);
      Dice.displayResult(expr, result.rolls, result.total, 'chat-command');
      App.socket.emit('dice-roll', {
        expression: expr,
        rolls: result.rolls,
        total: result.total,
        rollType: 'chat-command',
        characterName: this.getRollCharacterName(),
        speakAs: this.getSpeakAsPayload()
      });
      input.value = '';
      return;
    }

    let displayContent = content;
    if (chatType === 'ic') {
      displayContent = content;
    } else if (chatType === 'action') {
      displayContent = `*${content}*`;
    }

    const payload = {
      content: displayContent,
      type: chatType,
      isWhisper,
      whisperTo
    };
    const speakAs = this.getSpeakAsPayload();
    if (speakAs) payload.speakAs = speakAs;

    App.socket.emit('chat-message', payload);
    input.value = '';
  },

  addMessage(data, opts = {}) {
    this.appendMessageToContainers(() => this.buildMessageElement(data), opts);
  },

  addSystemMessage(data) {
    this.appendMessageToContainers(() => {
      const msg = document.createElement('div');
      msg.className = 'chat-msg system';
      msg.innerHTML = `${data.type === 'initiative' ? '⚔️' : '📢'} ${escapeHtml(data.content)}`;
      return msg;
    });
  },

  addDiceRollMessage(data) {
    this.appendMessageToContainers(({ compact }) => {
      const msg = document.createElement('div');
      msg.className = 'chat-msg roll';
      const author = this.formatMessageAuthor(data);
      const charSuffix = data.characterName && !this.parseSpeakAs(data)
        ? ` (${escapeHtml(data.characterName)})`
        : '';
      const rollDetail = compact
        ? `<strong style="color:var(--accent-gold);">${data.total}</strong>`
        : `🎲 ${escapeHtml(data.expression)} = [${(data.rolls || []).join(', ')}] = <strong style="color:var(--accent-gold);font-size:1.1em;">${data.total}</strong>`;
      msg.innerHTML = `
        <span class="msg-author">${author}${charSuffix}</span>
        ${rollDetail}
        ${!compact && data.rollType ? `<em style="color:var(--text-muted);"> (${escapeHtml(data.rollType)})</em>` : ''}
        ${data.isSecret ? '<span style="color:var(--accent-gold);"> 🤫</span>' : ''}
        <span class="msg-time">${formatTime(data.timestamp || new Date().toISOString())}</span>
      `;
      return msg;
    });
  },

  async loadHistory() {
    if (!App.currentCampaign) return;
    this.oldestLoadedAt = null;
    this.hasMore = true;
    if (this.isDm()) await this.loadCampaignNpcs();
    try {
      const messages = await apiFetch(`/campaigns/${App.currentCampaign.id}/messages?limit=100`);
      this.clearMessageContainers();
      messages.forEach((m) => this.addMessage(m, { skipScroll: true }));
      if (messages.length > 0) {
        this.oldestLoadedAt = messages[0].created_at;
      }
      this.hasMore = messages.length >= 100;
      this.getMessageContainers().forEach((c) => { c.scrollTop = c.scrollHeight; });
      this.updateLoadOlderButton();
      this.renderCombatants();
    } catch (err) {
      console.error('Failed to load chat history:', err);
    }
  },

  async loadOlder() {
    if (!App.currentCampaign || !this.oldestLoadedAt || !this.hasMore) return;
    const btn = document.getElementById('btn-load-older-chat');
    if (btn) btn.disabled = true;
    try {
      const mainContainer = document.getElementById('chat-messages');
      const prevHeight = mainContainer?.scrollHeight || 0;
      const messages = await apiFetch(
        `/campaigns/${App.currentCampaign.id}/messages?limit=50&before=${encodeURIComponent(this.oldestLoadedAt)}`
      );
      if (messages.length === 0) {
        this.hasMore = false;
        this.updateLoadOlderButton();
        return;
      }
      messages.forEach((m) => {
        this.appendMessageToContainers(() => this.buildMessageElement(m), { prepend: true, skipScroll: true });
      });
      this.oldestLoadedAt = messages[0].created_at;
      this.hasMore = messages.length >= 50;
      if (mainContainer) {
        mainContainer.scrollTop = mainContainer.scrollHeight - prevHeight;
      }
      this.updateLoadOlderButton();
    } catch (err) {
      showToast('Nie udało się wczytać starszych wiadomości', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  updateLoadOlderButton() {
    const btn = document.getElementById('btn-load-older-chat');
    if (!btn) return;
    btn.classList.toggle('hidden', !this.hasMore);
  },

  buildMessageElement(data) {
    const msg = document.createElement('div');
    let cssClass = 'chat-msg';
    let prefix = '';

    if (data.message_type === 'roll' || data.type === 'dice-roll') {
      cssClass += ' roll';
    } else if (data.message_type === 'trade') {
      cssClass += ' trade';
      prefix = '🏪 ';
    } else if (data.is_whisper || data.message_type === 'whisper') {
      cssClass += ' whisper';
      prefix = '🤫 [Szept] ';
    } else if (data.message_type === 'ic') {
      cssClass += ' ic';
      prefix = '🎭 ';
    } else if (data.message_type === 'action') {
      cssClass += ' action';
    }

    if (this.parseSpeakAs(data)) cssClass += ' chat-msg-puppet';

    msg.className = cssClass;
    const tradeMeta = data.message_type === 'trade' && typeof Economy !== 'undefined'
      ? Economy.handleTradeMessage(data) : null;
    const tradeHtml = tradeMeta ? `<div class="chat-trade-actions">${Economy.renderTradeActions(tradeMeta)}</div>` : '';

    msg.innerHTML = `
      <span class="msg-author">${prefix}${this.formatMessageAuthor(data)}</span>
      <span class="msg-content">${escapeHtml(data.content || '')}</span>
      ${tradeHtml}
      <span class="msg-time">${formatTime(data.created_at || new Date().toISOString())}</span>
    `;

    msg.querySelectorAll('.chat-trade-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.merchantId) Economy.openShop(btn.dataset.merchantId);
        if (btn.dataset.grantId) Economy.openLootPackage(btn.dataset.grantId);
        if (btn.dataset.sourceCharId && btn.dataset.itemId && btn.dataset.itemName) {
          Economy.showPlayerTradeDialog(btn.dataset.sourceCharId, btn.dataset.itemId, btn.dataset.itemName, parseInt(btn.dataset.quantity, 10) || 1);
        }
      });
    });

    return msg;
  },

  updateOnlineUsers(users) {
    document.getElementById('online-count').textContent = users.length;
    const list = document.getElementById('online-users-list');
    list.innerHTML = users.map(u => `
      <div class="online-user ${u.role === 'dm' ? 'dm' : ''}">
        <span class="role-icon">${u.role === 'dm' ? '👑' : '🎮'}</span>
        <span>${escapeHtml(u.display_name || u.username)}</span>
      </div>
    `).join('');
    this.renderCombatants();
  }
};
