// ===== Entity ↔ Token linking helpers =====
const EntityLink = {
  npcEntityType(npc) {
    try {
      const meta = JSON.parse(npc.stats || '{}');
      return meta.category === 'monster' ? 'monster' : 'npc';
    } catch (_e) {
      return 'npc';
    }
  },

  encodePick(entityType, entityId) {
    if (!entityId) return '';
    return `${entityType}:${entityId}`;
  },

  decodePick(value) {
    if (!value || !value.includes(':')) {
      return { entityType: '', entityId: '' };
    }
    const [entityType, ...rest] = value.split(':');
    return { entityType, entityId: rest.join(':') };
  },

  async loadEntities() {
    if (!App.currentCampaign) return { characters: [], npcs: [], allCharacters: [] };
    const cid = App.currentCampaign.id;
    const isDm = App.currentCampaign.role === 'dm';
    const myId = getUser()?.id;
    let allCharacters = [];
    let npcs = [];
    try {
      allCharacters = await apiFetch(`/campaigns/${cid}/characters`);
    } catch (_e) { /* ignore */ }
    try {
      npcs = await apiFetch(`/campaigns/${cid}/npcs`);
    } catch (_e) { /* ignore */ }
    const characters = isDm
      ? allCharacters
      : allCharacters.filter((c) => c.user_id === myId);
    return { characters, npcs, allCharacters };
  },

  buildSelectHtml(selectId, entities, options = {}) {
    const {
      includeNone = true,
      noneLabel = '— brak powiązania —',
      selectedPick = '',
      manualOption = true,
      manualLabel = '— ręczna nazwa —'
    } = options;

    const { characters = [], npcs = [] } = entities;
    let html = `<select id="${selectId}" class="entity-link-select">`;
    if (includeNone) {
      html += `<option value="">${escapeHtml(noneLabel)}</option>`;
    }
    if (manualOption) {
      html += `<option value="__manual__"${selectedPick === '__manual__' ? ' selected' : ''}>${escapeHtml(manualLabel)}</option>`;
    }
    if (characters.length) {
      html += '<optgroup label="🎮 Postacie graczy">';
      characters.forEach((c) => {
        const pick = this.encodePick('player', c.id);
        const label = `${c.name}${c.player_name ? ` (${c.player_name})` : ''}`;
        html += `<option value="${pick}" data-name="${escapeHtml(c.name)}" data-type="player"${pick === selectedPick ? ' selected' : ''}>${escapeHtml(label)}</option>`;
      });
      html += '</optgroup>';
    }
    if (npcs.length) {
      html += '<optgroup label="🧙 NPC / 👹 Potwory">';
      npcs.forEach((n) => {
        const et = this.npcEntityType(n);
        const pick = this.encodePick(et, n.id);
        const icon = et === 'monster' ? '👹' : '🧙';
        html += `<option value="${pick}" data-name="${escapeHtml(n.name)}" data-type="${et}"${pick === selectedPick ? ' selected' : ''}>${icon} ${escapeHtml(n.name)}</option>`;
      });
      html += '</optgroup>';
    }
    html += '</select>';
    return html;
  },

  wireSelect(selectEl, { nameInput, typeSelect, onChange } = {}) {
    if (!selectEl) return;
    const apply = () => {
      const val = selectEl.value;
      if (val === '__manual__' || val === '') {
        if (onChange) onChange(null);
        return;
      }
      const { entityType, entityId } = this.decodePick(val);
      const opt = selectEl.selectedOptions[0];
      if (nameInput && opt?.dataset.name) nameInput.value = opt.dataset.name;
      if (typeSelect && opt?.dataset.type) typeSelect.value = opt.dataset.type;
      if (onChange) onChange({ entityType, entityId, name: opt?.dataset.name || '' });
    };
    selectEl.addEventListener('change', apply);
    apply();
  },

  currentPickForToken(token) {
    if (!token?.entity_id) return '';
    return this.encodePick(token.entity_type, token.entity_id);
  },

  findInitiativeEntry(entityType, entityId, mapTokenId) {
    if (typeof Initiative === 'undefined') return null;
    if (entityId) {
      const byEntity = Initiative.entries.find((e) => e.entity_id === entityId);
      if (byEntity) return byEntity;
    }
    if (mapTokenId) {
      return Initiative.entries.find((e) => e.map_token_id === mapTokenId) || null;
    }
    return null;
  },

  linkLabel(token) {
    if (!token?.entity_id) return null;
    if (token.entity_type === 'player') {
      const char = (Characters.campaignCharacters || []).find((c) => c.id === token.entity_id);
      return char ? `🎮 ${char.name}` : `🎮 ${token.entity_name}`;
    }
    if (token.entity_type === 'monster') return `👹 ${token.entity_name}`;
    if (token.entity_type === 'npc') return `🧙 ${token.entity_name}`;
    return token.entity_name;
  }
};
