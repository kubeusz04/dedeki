// ===== Main App Orchestrator =====
const App = {
  socket: null,
  currentCampaign: null,
  user: null,
  joinedCampaignId: null,

  init() {
    Auth.init();
    Campaigns.init();
    Characters.init();
    PlayerHud.init();
    Dice.init();
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
      tab.addEventListener('click', () => {
        document.querySelectorAll('.session-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.session-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.panel).classList.add('active');

        if (tab.dataset.panel === 'map-panel') {
          BattleMap.loadMap();
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

  onLogin(user) {
    this.user = user;
    document.getElementById('user-display-name').textContent = `🎮 ${user.display_name || user.username}`;
    showScreen('dashboard-screen');
    Campaigns.load();
  },

  async enterCampaign(campaignId) {
    try {
      const campaign = await apiFetch(`/campaigns/${campaignId}`);
      this.currentCampaign = campaign;
      this.joinedCampaignId = campaign.id;

      document.getElementById('campaign-name-header').textContent = campaign.name;
      const badge = document.getElementById('campaign-role-badge');
      badge.textContent = campaign.role === 'dm' ? '👑 Mistrz Gry' : '🎮 Gracz';
      badge.className = `role-badge ${campaign.role}`;

      const isDm = campaign.role === 'dm';
      document.querySelectorAll('.dm-only').forEach(el => {
        el.style.display = isDm ? '' : 'none';
      });
      document.querySelectorAll('.dm-only-tab').forEach(el => {
        el.classList.toggle('visible', isDm);
      });

      showScreen('session-screen');
      this.connectSocket(campaign.id);
      CampaignMusic.onEnterCampaign();
    } catch (err) {
      showToast('Błąd wejścia do kampanii: ' + err.message, 'error');
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
    this.socket.on('system-message', (data) => Chat.addSystemMessage(data));

    this.socket.on('dice-roll', (data) => {
      Dice.addToLog(data);
      Chat.addDiceRollMessage(data);
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
    this.socket.on('combat-target-result', (data) => {
      if (typeof MapCombat !== 'undefined') MapCombat.onTargetResult(data);
    });
    this.socket.on('combat-attack-fx', (data) => {
      if (typeof MapCombat !== 'undefined') MapCombat.playAttackFx(data, false);
    });
    this.socket.on('map-update', (data) => BattleMap.updateMap(data));
    this.socket.on('map-token-moved', (data) => BattleMap.moveToken(data));
    this.socket.on('map-pointer', (data) => BattleMap.showPointer(data));

    this.socket.on('initiative-highlight', (data) => {
      Initiative.highlightEntry(data.entryId);
      if (typeof MapCombat !== 'undefined') MapCombat.onHighlight(data);
    });

    this.socket.on('character-hp-update', () => {
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
