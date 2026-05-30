// ===== Main App Orchestrator =====
const App = {
  socket: null,
  currentCampaign: null,
  user: null,
  joinedCampaignId: null,

  init() {
    if (typeof Themes !== 'undefined') Themes.init();
    Auth.init();
    Campaigns.init();
    Characters.init();
    PlayerHud.init();
    Dice.init();
    if (typeof DiceSkins !== 'undefined') DiceSkins.init();
    Chat.init();
    CampaignMusic.init();
    BattleMap.init();
    MapCreator.init();
    MapCombat.init();
    Initiative.init();
    Notes.init();
    DMPanel.init();
    Economy.init();
    DMEconomy.init();
    if (typeof TokenLibrary !== 'undefined') TokenLibrary.init();
    if (typeof GroupRolls !== 'undefined') GroupRolls.init();
    if (typeof Spellbook !== 'undefined') Spellbook.init();
    if (typeof Inspiration !== 'undefined') Inspiration.init();
    if (typeof Bestiary !== 'undefined') Bestiary.init();
    if (typeof NpcGenerator !== 'undefined') NpcGenerator.init();
    if (typeof WorldState !== 'undefined') WorldState.init();
    if (typeof ExportBackup !== 'undefined') ExportBackup.init();
    if (typeof Soundboard !== 'undefined') Soundboard.init();
    if (typeof RandomTables !== 'undefined') RandomTables.init();

    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal').classList.remove('active');
      });
    });
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    });

    document.querySelectorAll('.session-tab').forEach(tab => {
      tab.addEventListener('click', (event) => {
        // Jeśli użytkownik ręcznie zmienia panel podczas oczekującego powrotu po rzucie kości — anuluj powrót.
        // Auto-switch wewnętrzny (Dice._maybeSwitchToDicePanel) wywołuje .click() syntetycznie,
        // ale ustawia _pendingReturnTab PRZED kliknięciem, więc auto-clicki nie anulują same siebie.
        // Tu rozróżniamy: tylko isTrusted ruchy ludzkie anulują pending return.
        if (event.isTrusted && typeof Dice !== 'undefined' && Dice.cancelReturn) {
          Dice.cancelReturn();
        }

        document.querySelectorAll('.session-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.session-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.panel).classList.add('active');

        if (tab.dataset.panel === 'characters-panel' && App.currentCampaign?.role === 'dm' && typeof DMPanel !== 'undefined') {
          DMPanel.loadPartyOverview();
        }
        if (tab.dataset.panel === 'map-panel') {
          BattleMap.loadMap();
        }
        if (tab.dataset.panel === 'world-calendar-panel' && typeof WorldState !== 'undefined') {
          WorldState.onPanelActivate();
        }
        if (tab.dataset.panel === 'quests-panel' && typeof Quests !== 'undefined') {
          Quests.onPanelActivate();
        }
        if (tab.dataset.panel === 'handouts-panel' && typeof Handouts !== 'undefined') {
          Handouts.onPanelActivate();
        }
        if (tab.dataset.panel === 'spellbook-panel' && typeof Spellbook !== 'undefined') {
          Spellbook.onPanelActivate();
        }
        if (tab.dataset.panel === 'soundboard-panel' && typeof Soundboard !== 'undefined') {
          Soundboard.onPanelActivate();
        }
        if (tab.dataset.panel === 'campaign-music-panel' && typeof CampaignMusic !== 'undefined') {
          CampaignMusic.onPanelActivate();
        }
        if (tab.dataset.panel === 'bestiary-panel' && typeof Bestiary !== 'undefined') {
          Bestiary.onPanelActivate();
        }
        if (tab.dataset.panel === 'npc-generator-panel' && typeof NpcGenerator !== 'undefined') {
          NpcGenerator.onPanelActivate();
        }
        if (tab.dataset.panel === 'random-tables-panel' && typeof RandomTables !== 'undefined') {
          RandomTables.onPanelActivate();
        }
        if (tab.dataset.panel === 'dm-economy-panel' && typeof DMEconomy !== 'undefined') {
          DMEconomy.onPanelActivate();
        }
        if (tab.dataset.panel === 'dm-panel' && typeof DMPanel !== 'undefined') {
          DMPanel.onPanelActivate();
        }
      });
    });

    document.getElementById('btn-back-dashboard').addEventListener('click', () => {
      this.leaveCampaign();
    });

    const user = Auth.checkSession();
    if (user) {
      this.onLogin(user);
    }
  },

  _lastCampaignStorageKey() {
    const uid = this.user?.id ?? getUser()?.id;
    return uid ? `dedeki-last-campaign-${uid}` : null;
  },

  _saveLastCampaign(campaignId) {
    const key = this._lastCampaignStorageKey();
    if (key && campaignId) localStorage.setItem(key, String(campaignId));
  },

  _clearLastCampaign() {
    const key = this._lastCampaignStorageKey();
    if (key) localStorage.removeItem(key);
  },

  async onLogin(user) {
    this.user = user;
    document.getElementById('user-display-name').textContent = `🎮 ${user.display_name || user.username}`;

    const savedId = this._lastCampaignStorageKey() && localStorage.getItem(this._lastCampaignStorageKey());
    if (savedId) {
      try {
        await this.enterCampaign(savedId);
        return;
      } catch {
        this._clearLastCampaign();
      }
    }

    showScreen('dashboard-screen');
    Campaigns.load();
  },

  async enterCampaign(campaignId) {
    try {
      const campaign = await apiFetch(`/campaigns/${campaignId}`);
      this.currentCampaign = campaign;
      this.joinedCampaignId = campaign.id;
      this._saveLastCampaign(campaign.id);

      document.getElementById('campaign-name-header').textContent = campaign.name;
      const badge = document.getElementById('campaign-role-badge');
      badge.textContent = campaign.role === 'dm' ? '👑 Mistrz Gry' : '🎮 Gracz';
      badge.className = `role-badge ${campaign.role}`;

      const isDm = campaign.role === 'dm';
      document.body.classList.toggle('is-dm', isDm);
      document.querySelectorAll('.dm-only').forEach(el => {
        el.style.removeProperty('display');
      });
      document.querySelectorAll('.dm-only-tab').forEach(el => {
        el.classList.toggle('visible', isDm);
      });

      showScreen('session-screen');
      this.connectSocket(campaign.id);
      CampaignMusic.onEnterCampaign();
    } catch (err) {
      if (String(campaignId) === localStorage.getItem(this._lastCampaignStorageKey() || '')) {
        this._clearLastCampaign();
      }
      showToast('Błąd wejścia do kampanii: ' + err.message, 'error');
      throw err;
    }
  },

  resyncSessionData() {
    if (!this.currentCampaign) return;
    Characters.loadCampaignCharacters();
    Chat.loadHistory();
    CampaignMusic.requestSync();
    Initiative.load();
    Notes.load();
    BattleMap.loadMap();
    if (typeof MapCombat !== 'undefined') MapCombat.load();
    if (this.currentCampaign.role === 'dm') {
      DMPanel.load();
      Chat.loadCampaignNpcs();
    } else if (typeof DMEconomy !== 'undefined') {
      DMEconomy.load();
    }
    if (typeof TokenLibrary !== 'undefined') TokenLibrary.load();
    if (typeof Bestiary !== 'undefined' && App.currentCampaign?.role === 'dm') Bestiary.load();
    if (typeof Quests !== 'undefined') Quests.load();
    if (typeof Handouts !== 'undefined') Handouts.load();
    if (typeof WorldState !== 'undefined') WorldState.load();
    if (typeof Soundboard !== 'undefined') Soundboard.load();
    if (App.socket) {
      App.socket.emit('get-initiative');
    }
    Dice.loadDiceLog?.();
  },

  setConnectionStatus(state, message) {
    const banner = document.getElementById('connection-banner');
    if (!banner) return;
    banner.classList.remove('hidden', 'connecting', 'disconnected', 'connected');
    if (state === 'hidden') {
      banner.classList.add('hidden');
      return;
    }
    banner.classList.add(state);
    banner.textContent = message || '';
  },

  connectSocket(campaignId) {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    this.joinedCampaignId = campaignId;
    this.setConnectionStatus('connecting', 'Łączenie z sesją kampanii…');

    this.socket = io({
      auth: { token: getToken() },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    const joinRoom = () => {
      if (!this.joinedCampaignId) return;
      this.socket.emit('join-campaign', this.joinedCampaignId);
    };

    this.socket.io.on('reconnect_attempt', () => {
      this.setConnectionStatus('connecting', 'Utracono połączenie — ponawianie…');
    });

    this.socket.on('connect', () => {
      joinRoom();
      if (this.socket.recovered) {
        this.setConnectionStatus('connected', 'Połączenie przywrócone');
        setTimeout(() => this.setConnectionStatus('hidden'), 2500);
      } else {
        this.setConnectionStatus('hidden');
      }
      this.resyncSessionData();
    });

    this.socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        this.setConnectionStatus('hidden');
        return;
      }
      this.setConnectionStatus('disconnected', 'Brak połączenia z serwerem — ponawianie…');
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket error:', err.message);
      if (err.message.includes('autoryzacji') || err.message.includes('token')) {
        Auth.logout();
        showToast('Sesja wygasła, zaloguj się ponownie', 'warning');
        return;
      }
      this.setConnectionStatus('disconnected', 'Błąd połączenia — ponawianie…');
    });

    this.socket.on('chat-message', (data) => Chat.addMessage(data));
    this.socket.on('chat-cleared', (data) => {
      if (!this.currentCampaign || data?.campaignId !== this.currentCampaign.id) return;
      Chat.onChatCleared(data.by);
    });
    this.socket.on('system-message', (data) => Chat.addSystemMessage(data));

    this.socket.on('dice-roll', (data) => {
      Dice.addToLog(data);
      Chat.addDiceRollMessage(data);
    });

    if (typeof GroupRolls !== 'undefined') GroupRolls.bindSocketEvents(this.socket);
    if (typeof Inspiration !== 'undefined') Inspiration.bindSocketEvents(this.socket);
    if (typeof Quests !== 'undefined') Quests.bindSocketEvents(this.socket);
    if (typeof Handouts !== 'undefined') Handouts.bindSocketEvents(this.socket);
    if (typeof WorldState !== 'undefined') WorldState.bindSocketEvents(this.socket);
    if (typeof Soundboard !== 'undefined') Soundboard.bindSocketEvents(this.socket);

    this.socket.on('campaign-restored', (data) => {
      if (!App.currentCampaign || data?.campaignId !== App.currentCampaign.id) return;
      showToast('MG przywrócił backup kampanii — odświeżanie…', 'info');
      setTimeout(() => window.location.reload(), 800);
    });

    this.socket.on('online-users', (users) => Chat.updateOnlineUsers(users));
    this.socket.on('initiative-update', (payload) => {
      Initiative.update(payload);
      if (typeof MapCombat !== 'undefined') MapCombat.onInitiativeUpdate();
    });
    this.socket.on('initiative-error', (data) => showToast(data.message || 'Błąd inicjatywy', 'error'));
    this.socket.on('combat-update', (payload) => {
      if (typeof MapCombat !== 'undefined') MapCombat.update(payload);
    });
    this.socket.on('combat-error', (data) => {
      showToast(data.message || 'Błąd walki', 'error');
      BattleMap.loadMap();
    });
    this.socket.on('combat-damage-applied', (data) => {
      if (!data || data.damage <= 0) return;
      const token = BattleMap.tokens?.find((t) => t.id === data.tokenId);
      const name = token?.entity_name || 'Cel';
      showToast(`💥 ${name}: −${data.damage} HP (${data.hpCurrent}/${data.hpMax || '?'})`, 'success');
    });
    this.socket.on('combat-target-result', (data) => {
      if (typeof MapCombat !== 'undefined') MapCombat.onTargetResult(data);
    });
    this.socket.on('combat-attack-fx', (data) => {
      if (typeof MapCombat !== 'undefined') MapCombat.playAttackFx(data, false);
    });
    this.socket.on('map-update', (data) => BattleMap.updateMap(data));
    this.socket.on('map-settings-error', (data) => {
      showToast(data?.message || 'Błąd zapisu ustawień mapy', 'error');
    });
    this.socket.on('map-prop-triggered', (data) => {
      const msg = data?.name ? `${data.icon || '📦'} ${data.name} — efekt na mapie!` : 'Rekwizyt aktywowany';
      showToast(msg, 'info');
      BattleMap.loadMap();
    });

    this.socket.on('combat-aoe-result', (data) => {
      if (typeof MapZones !== 'undefined') MapZones.onAoeResolved(data);
      BattleMap.loadMap();
    });
    this.socket.on('combat-aoo-trigger', (data) => {
      if (typeof MapCombat !== 'undefined') MapCombat.onAooTrigger?.(data);
    });
    this.socket.on('map-hazard-tick', (data) => {
      const kind = data.kind === 'turn_start' ? 'zaczyna turę w' : 'wchodzi w';
      const msg = `${data.icon || '⚠️'} ${data.tokenName} ${kind} ${data.label} → ${data.amount} obrażeń (${data.damage} ${data.damageType})`;
      showToast(msg, 'warning');
    });
    this.socket.on('combat-aoo-reaction-result', (data) => {
      if (typeof MapCombat !== 'undefined') MapCombat.onAooReactionResult?.(data);
    });
    this.socket.on('dice-log-entry', (entry) => {
      if (typeof Dice !== 'undefined' && Dice.onLogEntry) Dice.onLogEntry(entry);
    });
    this.socket.on('character-slots-update', (data) => {
      // Odśwież kartę postaci jeśli akurat otwarta lub jeśli to nasz aktywny token
      if (typeof Characters !== 'undefined' && Characters.refreshOpenSheetIfMatches) {
        Characters.refreshOpenSheetIfMatches(data?.characterId);
      }
      if (typeof Chat !== 'undefined' && Chat.refreshDmPuppetPanel) Chat.refreshDmPuppetPanel();
    });
    this.socket.on('character-resources-update', (data) => {
      if (typeof Characters !== 'undefined' && Characters.refreshOpenSheetIfMatches) {
        Characters.refreshOpenSheetIfMatches(data?.characterId);
      }
    });
    this.socket.on('character-rest', (data) => {
      const name = data?.characterName ? `${data.characterName}: ` : '';
      if (data?.type === 'long') {
        showToast(`${name}😴 Długi odpoczynek — pełne HP i sloty`, 'success');
      } else if (data?.type === 'short') {
        const healMsg = data.healed ? `, leczy ${data.healed} HP` : '';
        showToast(`${name}🛌 Krótki odpoczynek (${data.hitDiceSpent || 0} HD${healMsg})`, 'info');
      }
    });
    this.socket.on('map-token-moved', (data) => BattleMap.moveToken(data));
    this.socket.on('map-pointer', (data) => BattleMap.showPointer(data));

    this.socket.on('initiative-highlight', (data) => {
      Initiative.highlightEntry(data.entryId);
      if (typeof MapCombat !== 'undefined') MapCombat.onHighlight(data);
    });

    this.socket.on('character-hp-update', () => {
      Characters.loadCampaignCharacters();
    });

    this.socket.on('characters-bulk-update', () => {
      Characters.loadCampaignCharacters();
    });

    this.socket.on('npc-updated', (npc) => {
      if (typeof Chat !== 'undefined') Chat.onNpcUpdated(npc);
      if (typeof DMPanel !== 'undefined' && App.currentCampaign?.role === 'dm') {
        DMPanel.loadNpcs?.();
      }
    });

    this.socket.on('dm-broadcast', (data) => {
      showToast(`📢 MG: ${data.message}`, 'warning');
    });

    this.socket.on('merchant-opened', () => {
      if (typeof DMEconomy !== 'undefined') DMEconomy.load();
    });

    this.socket.on('character-inventory-updated', () => {
      Characters.loadCampaignCharacters();
      if (Characters.sheetCharacter) {
        apiFetch(`/characters/${Characters.sheetCharacter.id}`).then((c) => {
          Characters.sheetCharacter = c;
          if (document.getElementById('character-modal')?.classList.contains('active')) {
            Characters.renderSheet(c);
            Characters.bindSheetActions(c, Characters.canEditCharacter(c));
          }
        }).catch(() => {});
      }
      PlayerHud?.render();
    });

    this.socket.on('loot-granted', (data) => {
      if (Characters.activeCharacter?.id === data.grant?.character_id) {
        Economy.refreshPendingLootBanner(Characters.activeCharacter.id);
      }
    });

    this.socket.on('economy-error', (data) => showToast(data.message || 'Błąd ekonomii', 'error'));

    this.socket.on('campaign-deleted', (data) => {
      if (data?.campaignId && App.currentCampaign?.id === data.campaignId) {
        showToast('Kampania została usunięta przez MG', 'warning');
        App.leaveCampaign();
        Campaigns.load();
      }
    });

    this.socket.on('music-sync', (data) => {
      if (typeof CampaignMusic !== 'undefined') CampaignMusic.applySyncPayload(data);
    });
  },

  leaveCampaign() {
    this._clearLastCampaign();
    if (typeof WorldState !== 'undefined') WorldState.onLeaveCampaign();
    if (typeof CampaignMusic !== 'undefined') CampaignMusic.onLeaveCampaign();
    this.joinedCampaignId = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.setConnectionStatus('hidden');
    this.currentCampaign = null;
    Characters.activeCharacter = null;
    Characters.myCampaignCharacter = null;
    PlayerHud.render();

    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('map-chat-messages')?.replaceChildren();
    document.getElementById('initiative-list').innerHTML = '';
    document.getElementById('notes-list').innerHTML = '';
    document.getElementById('dice-log').innerHTML = '';
    document.getElementById('campaign-characters').innerHTML = '';

    document.querySelectorAll('.session-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.session-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('.session-tab').classList.add('active');
    document.getElementById('chat-panel').classList.add('active');

    showScreen('dashboard-screen');
    Campaigns.load();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
