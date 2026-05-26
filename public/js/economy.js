// ===== Economy: inventory, shops, loot =====
const Economy = {
  EQUIP_SLOTS: [
    { key: 'armor', label: 'Zbroja', icon: '🛡️' },
    { key: 'shield', label: 'Tarcza', icon: '🛡️' },
    { key: 'head', label: 'Głowa', icon: '🪖' },
    { key: 'cloak', label: 'Płaszcz', icon: '🧥' },
    { key: 'hands', label: 'Ręce', icon: '🧤' },
    { key: 'feet', label: 'Stopy', icon: '👢' },
    { key: 'amulet', label: 'Amulet', icon: '📿' },
    { key: 'ring1', label: 'Pierścień I', icon: '💍' },
    { key: 'ring2', label: 'Pierścień II', icon: '💍' }
  ],

  init() {
    document.getElementById('shop-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'shop-modal') closeModal('shop-modal');
    });
    document.getElementById('loot-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'loot-modal') closeModal('loot-modal');
    });
  },

  parseJson(val) {
    return Characters.parseJSON(val);
  },

  normalizeEquipment(raw) {
    const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.version === 2) {
      const equipped = { armor: null, shield: null, head: null, hands: null, feet: null, cloak: null, amulet: null, ring1: null, ring2: null, ...(parsed.equipped || {}) };
      return { version: 2, equipped, backpack: Array.isArray(parsed.backpack) ? parsed.backpack : [] };
    }
    const legacy = Array.isArray(parsed) ? parsed : [];
    const backpack = legacy.map((item) => {
      if (typeof item === 'string') return { id: `it-${Date.now()}`, category: 'gear', name: item, quantity: 1 };
      return { id: item.id || `it-${Date.now()}`, category: item.category || 'gear', name: item.name || '?', quantity: item.quantity || 1, ...item };
    });
    return { version: 2, equipped: { armor: null, shield: null, head: null, hands: null, feet: null, cloak: null, amulet: null, ring1: null, ring2: null }, backpack };
  },

  walletToCopper(c) {
    return (parseInt(c.copper, 10) || 0) + (parseInt(c.silver, 10) || 0) * 10
      + (parseInt(c.electrum, 10) || 0) * 50 + (parseInt(c.gold, 10) || 0) * 100
      + (parseInt(c.platinum, 10) || 0) * 1000;
  },

  formatWallet(c) {
    const parts = [];
    if (c.platinum) parts.push(`${c.platinum} MP`);
    if (c.gold) parts.push(`${c.gold} MZ`);
    if (c.electrum) parts.push(`${c.electrum} ME`);
    if (c.silver) parts.push(`${c.silver} MS`);
    if (c.copper) parts.push(`${c.copper} MC`);
    return parts.length ? parts.join(' · ') : '0 MC';
  },

  suggestedAC(c, inv) {
    const dex = calcModifier(c.dexterity || 10);
    let base = 10 + dex;
    const armor = inv.equipped?.armor;
    const shield = inv.equipped?.shield;
    if (armor?.armorClass) {
      const maxDex = armor.dexBonusMax === 0 ? 0 : (armor.dexBonusMax ?? 99);
      base = parseInt(armor.armorClass, 10) + Math.min(dex, maxDex);
    }
    if (shield?.acBonus) base += parseInt(shield.acBonus, 10) || 2;
    return base;
  },

  itemMetaLine(item) {
    const bits = [];
    if (item.armorClass) bits.push(`KP ${item.armorClass}`);
    if (item.acBonus) bits.push(`+${item.acBonus} KP`);
    if (item.damage) bits.push(item.damage);
    if (item.weight) bits.push(`${item.weight} lb`);
    if (item.description) bits.push(item.description);
    return bits.join(' · ');
  },

  renderInventorySection(c, canEdit) {
    const inv = this.normalizeEquipment(c.equipment);
    const suggested = this.suggestedAC(c, inv);
    const walletStr = this.formatWallet(c);
    const totalCp = this.walletToCopper(c);

    const slotHtml = this.EQUIP_SLOTS.map(({ key, label, icon }) => {
      const item = inv.equipped[key];
      return `<div class="inv-slot" data-inv-slot="${key}">
        <div class="inv-slot-label">${icon} ${label}</div>
        <div class="inv-slot-item ${item ? 'filled' : 'empty'}">
          ${item ? `<strong>${escapeHtml(item.name)}</strong><span class="inv-meta">${escapeHtml(this.itemMetaLine(item))}</span>` : '<span class="inv-empty">— pusto —</span>'}
        </div>
        ${canEdit && item ? `<button type="button" class="btn btn-xs btn-secondary" data-inv-action="unequip" data-slot="${key}">Zdejmij</button>` : ''}
      </div>`;
    }).join('');

    const backpackHtml = inv.backpack.length
      ? inv.backpack.map((item, idx) => `
        <div class="inv-backpack-row" data-backpack-idx="${idx}">
          <span class="inv-cat inv-cat-${item.category || 'gear'}">${escapeHtml(item.category || 'gear')}</span>
          <span class="inv-name">${escapeHtml(item.name)}${item.quantity > 1 ? ` ×${item.quantity}` : ''}</span>
          <span class="inv-meta-sm">${escapeHtml(this.itemMetaLine(item))}</span>
          ${canEdit ? `<button type="button" class="btn btn-xs btn-primary" data-inv-action="equip" data-idx="${idx}">Załóż</button>
          <button type="button" class="btn btn-xs btn-secondary" data-inv-action="trade" data-idx="${idx}">Przekaż</button>
          <button type="button" class="btn btn-xs btn-danger" data-inv-action="drop" data-idx="${idx}">Usuń</button>` : ''}
        </div>`).join('')
      : '<p class="sheet-empty">Plecak pusty — kup u handlarza lub odbierz łup od MG.</p>';

    return `
      <div class="sheet-section sheet-inventory-section" id="sheet-inventory-root">
        <h3>🎒 Ekwipunek i zbroja</h3>
        <div class="inv-summary">
          <span>💰 Portfel: <strong>${escapeHtml(walletStr)}</strong> <em>(${totalCp} MC)</em></span>
          <span>🛡️ Szac. KP (z wyposażenia): <strong>${suggested}</strong> · zapisane KP: ${c.armor_class}</span>
        </div>
        <div class="inv-equipped-grid">${slotHtml}</div>
        <h4 class="inv-subtitle">Plecak</h4>
        <div class="inv-backpack">${backpackHtml}</div>
        ${canEdit ? `
        <details class="inv-add-details">
          <summary>➕ Dodaj przedmiot z katalogu</summary>
          <div class="inv-catalog-tabs">
            <button type="button" class="btn btn-sm btn-secondary inv-cat-btn active" data-cat="gear">Wyposażenie</button>
            <button type="button" class="btn btn-sm btn-secondary inv-cat-btn" data-cat="armor">Zbroje</button>
            <button type="button" class="btn btn-sm btn-secondary inv-cat-btn" data-cat="weapon">Bronie</button>
            <button type="button" class="btn btn-sm btn-secondary inv-cat-btn" data-cat="custom">🛠️ Własne</button>
          </div>
          <div class="inv-catalog-grid" id="inv-catalog-grid"></div>
        </details>` : ''}
        <h3 style="margin-top:16px;">💰 Waluta (zapisz kartę)</h3>
        <div class="sheet-currency">
          ${['copper', 'silver', 'electrum', 'gold', 'platinum'].map((coin, i) => {
            const labels = ['MC', 'MS', 'ME', 'MZ', 'MP'];
            const classes = ['cur-cp', 'cur-sp', 'cur-ep', 'cur-gp', 'cur-pp'];
            return `<div class="currency-item">
              <div class="cur-label">${labels[i]}</div>
              <div class="cur-value ${classes[i]}">${canEdit
                ? `<input type="number" min="0" value="${c[coin]}" data-field="${coin}" style="width:80px;text-align:center;background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-primary);border-radius:4px;padding:4px;">`
                : c[coin]}</div>
              ${canEdit ? `<div style="display:flex;gap:4px;justify-content:center;margin-top:4px;">
                <button type="button" class="btn btn-sm btn-secondary" onclick="Characters.adjustCurrency('${coin}', -1)">-1</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="Characters.adjustCurrency('${coin}', 1)">+1</button>
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div id="pending-loot-banner" class="pending-loot-banner hidden"></div>
      </div>`;
  },

  bindInventoryActions(c, canEdit) {
    const root = document.getElementById('sheet-inventory-root');
    if (!root || !canEdit) return;

    root.querySelectorAll('[data-inv-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.invAction;
        if (action === 'unequip') await this.unequipSlot(c.id, btn.dataset.slot);
        if (action === 'equip') await this.equipFromBackpack(c.id, parseInt(btn.dataset.idx, 10));
        if (action === 'trade') await this.showPlayerTradeDialog(c.id, null, null, null, parseInt(btn.dataset.idx, 10));
        if (action === 'drop') await this.removeFromBackpack(c.id, parseInt(btn.dataset.idx, 10));
      });
    });

    const grid = document.getElementById('inv-catalog-grid');
    const renderCatalog = (cat) => {
      let list = [];
      if (cat === 'armor') list = DndRules.ARMOR_TEMPLATES;
      else if (cat === 'weapon') list = DndRules.WEAPON_TEMPLATES;
      else if (cat === 'custom') {
        const customs = (typeof DMEconomy !== 'undefined' ? DMEconomy.customItems : []) || [];
        if (!customs.length) {
          grid.innerHTML = '<p class="info-text">MG nie utworzył jeszcze żadnych własnych przedmiotów. Otwórz panel „💰 Ekonomia → 🛠️ Własny przedmiot".</p>';
          return;
        }
        list = customs.map((cu) => ({ id: `custom:${cu.id}`, namePl: cu.name }));
      } else list = DndRules.GEAR_TEMPLATES;
      grid.innerHTML = list.map((t) =>
        `<button type="button" class="btn btn-sm btn-secondary inv-tpl-btn" data-template-id="${t.id}">${escapeHtml(t.namePl)}</button>`
      ).join('');
      grid.querySelectorAll('.inv-tpl-btn').forEach((b) => {
        b.addEventListener('click', () => this.addTemplateToCharacter(c.id, b.dataset.templateId));
      });
    };
    renderCatalog('gear');
    root.querySelectorAll('.inv-cat-btn').forEach((b) => {
      b.addEventListener('click', () => {
        root.querySelectorAll('.inv-cat-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        renderCatalog(b.dataset.cat);
      });
    });

    this.refreshPendingLootBanner(c.id);
  },

  async persistInventory(charId, inv, extra = {}) {
    const payload = { equipment: JSON.stringify(inv), ...extra };
    const updated = await Characters.patchCharacterFields(charId, payload, false);
    if (Characters.sheetCharacter?.id === charId) {
      Characters.sheetCharacter = updated;
      Characters.renderSheet(updated);
      Characters.bindSheetActions(updated, Characters.canEditCharacter(updated));
    }
    if (Characters.activeCharacter?.id === charId) Characters.setActiveCharacter(updated);
    return updated;
  },

  async addTemplateToCharacter(charId, templateId) {
    const item = (typeof DMEconomy !== 'undefined' && DMEconomy.itemFromAnyTemplate)
      ? DMEconomy.itemFromAnyTemplate(templateId)
      : DndRules.itemFromTemplate(templateId);
    if (!item) return;
    const c = Characters.sheetCharacter || Characters.activeCharacter;
    if (!c) return;
    if (item.damage) {
      const weapons = Characters.parseJSON(c.weapons);
      weapons.push({
        id: `w-${Date.now()}`,
        templateId: item.templateId,
        name: item.name,
        damage: item.damage,
        damageType: item.damageType,
        ability: item.ability,
        properties: item.properties || [],
        attackBonus: 0,
        damageBonus: 0,
        isProficient: true
      });
      await Characters.patchCharacterFields(charId, { weapons: JSON.stringify(weapons) }, false);
      showToast(`Dodano broń: ${item.name}`, 'success');
    } else {
      const inv = this.normalizeEquipment(c.equipment);
      inv.backpack.push(item);
      await this.persistInventory(charId, inv);
      showToast(`Dodano: ${item.name}`, 'success');
    }
    const updated = await apiFetch(`/characters/${charId}`);
    if (Characters.sheetCharacter?.id === charId) {
      Characters.renderSheet(updated);
      Characters.bindSheetActions(updated, Characters.canEditCharacter(updated));
    }
  },

  async equipFromBackpack(charId, idx) {
    const c = Characters.sheetCharacter;
    const inv = this.normalizeEquipment(c.equipment);
    const item = inv.backpack[idx];
    if (!item) return;
    const slot = item.equipSlot || (item.category === 'armor' ? 'armor' : item.category === 'shield' ? 'shield' : '');
    inv.backpack.splice(idx, 1);
    if (slot && inv.equipped[slot] !== undefined) {
      if (inv.equipped[slot]) inv.backpack.push(inv.equipped[slot]);
      inv.equipped[slot] = item;
    } else {
      inv.backpack.push(item);
      showToast('Ten przedmiot nie ma slotu — zostaje w plecaku', 'warning');
      return;
    }
    await this.persistInventory(charId, inv);
  },

  async unequipSlot(charId, slot) {
    const c = Characters.sheetCharacter;
    const inv = this.normalizeEquipment(c.equipment);
    const item = inv.equipped[slot];
    if (!item) return;
    inv.equipped[slot] = null;
    inv.backpack.push(item);
    await this.persistInventory(charId, inv);
  },

  async removeFromBackpack(charId, idx) {
    if (!confirm('Usunąć przedmiot z plecaka?')) return;
    const c = Characters.sheetCharacter;
    const inv = this.normalizeEquipment(c.equipment);
    inv.backpack.splice(idx, 1);
    await this.persistInventory(charId, inv);
  },

  async refreshPendingLootBanner(charId) {
    const el = document.getElementById('pending-loot-banner');
    if (!el) return;
    try {
      const grants = await apiFetch(`/characters/${charId}/loot-grants?pending=true`);
      if (!grants.length) {
        el.classList.add('hidden');
        return;
      }
      el.classList.remove('hidden');
      el.innerHTML = grants.map((g) =>
        `<button type="button" class="btn btn-sm btn-warning loot-open-btn" data-grant-id="${g.id}">🎁 Otwórz: ${escapeHtml(g.label)}</button>`
      ).join('');
      el.querySelectorAll('.loot-open-btn').forEach((btn) => {
        btn.addEventListener('click', () => this.openLootPackage(btn.dataset.grantId));
      });
    } catch (_e) {
      el.classList.add('hidden');
    }
  },

  async openLootPackage(grantId) {
    try {
      const result = await apiFetch(`/loot-grants/${grantId}/open`, { method: 'POST' });
      const names = (result.items || []).map((i) => i.name).join(', ');
      showToast(`Łup odebrany: ${names}`, 'success');
      closeModal('loot-modal');
      if (Characters.sheetCharacter?.id === result.character.id) {
        Characters.renderSheet(result.character);
        Characters.bindSheetActions(result.character, Characters.canEditCharacter(result.character));
      }
      if (Characters.activeCharacter?.id === result.character.id) {
        Characters.setActiveCharacter(result.character);
      }
      PlayerHud?.render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async openShop(merchantId) {
    const merchants = await apiFetch(`/campaigns/${App.currentCampaign.id}/merchants`);
    const merchant = merchants.find((m) => m.id === merchantId);
    if (!merchant || !merchant.is_open) {
      showToast('Ten handlarz nie przyjmuje już klientów', 'warning');
      return;
    }
    const char = Characters.activeCharacter || Characters.myCampaignCharacter;
    if (!char) {
      showToast('Wybierz postać w panelu Postacie', 'warning');
      return;
    }
    const balance = this.walletToCopper(char);
    const items = merchant.inventory || [];
    document.getElementById('shop-modal-title').textContent = `🏪 ${merchant.name}`;
    document.getElementById('shop-modal-body').innerHTML = `
      <p class="shop-flavor">${escapeHtml(merchant.flavor || merchant.description || '')}</p>
      <p class="shop-balance">Portfel <strong>${escapeHtml(char.name)}</strong>: ${escapeHtml(this.formatWallet(char))} <em>(${balance} MC)</em></p>
      <div class="shop-grid">
        ${items.length ? items.map((si) => {
          const price = parseInt(si.priceCopper, 10) || 0;
          const stock = si.stock;
          const out = stock === 0;
          const data = si.itemData || si.item || {};
          return `<div class="shop-item ${out ? 'sold-out' : ''}">
            <div class="shop-item-name">${escapeHtml(si.name || data.name)}</div>
            <div class="shop-item-meta">${escapeHtml(si.category || data.category || '')} · ${DndRules.formatPriceCopper(price)}${stock >= 0 && stock !== -1 ? ` · szt: ${stock}` : ''}</div>
            <div class="shop-item-desc">${escapeHtml(data.description || Economy.itemMetaLine(data))}</div>
            <button type="button" class="btn btn-sm btn-primary shop-buy-btn" data-shop-id="${escapeHtml(si.id)}"
              ${out || balance < price ? 'disabled' : ''}>Kup</button>
          </div>`;
        }).join('') : '<p>Brak towarów.</p>'}
      </div>`;
    document.getElementById('shop-modal-body').querySelectorAll('.shop-buy-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await apiFetch(`/merchants/${merchantId}/purchase`, {
            method: 'POST',
            body: JSON.stringify({ characterId: char.id, shopItemId: btn.dataset.shopId })
          });
          showToast('Kupiono!', 'success');
          Characters.setActiveCharacter(res.character);
          if (Characters.sheetCharacter?.id === char.id) {
            Characters.sheetCharacter = res.character;
            Characters.renderSheet(res.character);
            Characters.bindSheetActions(res.character, Characters.canEditCharacter(res.character));
          }
          PlayerHud?.render();
          this.openShop(merchantId);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
    openModal('shop-modal');
  },

  async transferItem(sourceCharacterId, targetCharacterId, itemId, quantity = 1) {
    const res = await apiFetch('/trades/item', {
      method: 'POST',
      body: JSON.stringify({
        sourceCharacterId,
        targetCharacterId,
        itemId,
        quantity
      })
    });
    if (res?.sourceCharacter?.id === Characters.activeCharacter?.id) {
      Characters.setActiveCharacter(res.sourceCharacter);
    }
    if (res?.targetCharacter?.id === Characters.activeCharacter?.id) {
      Characters.setActiveCharacter(res.targetCharacter);
    }
    if (App.currentCampaign) await Characters.loadCampaignCharacters();
    return res;
  },

  async showPlayerTradeDialog(sourceCharacterId, itemId = null, itemName = '', maxQty = null, backpackIdx = null) {
    const source = (Characters.campaignCharacters || []).find((c) => c.id === sourceCharacterId)
      || Characters.sheetCharacter
      || Characters.activeCharacter;
    if (!source) return;
    const inv = this.normalizeEquipment(source.equipment);
    let item = null;
    if (backpackIdx !== null && backpackIdx >= 0) item = inv.backpack[backpackIdx];
    if (!item && itemId) item = inv.backpack.find((it) => it.id === itemId) || null;
    if (!item) {
      showToast('Nie znaleziono przedmiotu w plecaku', 'warning');
      return;
    }
    const recipients = (Characters.campaignCharacters || [])
      .filter((c) => c.id !== source.id);
    if (!recipients.length) {
      showToast('Brak odbiorcy w kampanii', 'warning');
      return;
    }

    const max = Math.max(1, maxQty || parseInt(item.quantity, 10) || 1);
    const html = `
      <form id="player-trade-form">
        <p><strong>Przedmiot:</strong> ${escapeHtml(itemName || item.name)}${max > 1 ? ` (max ${max})` : ''}</p>
        <div class="form-group">
          <label>Odbiorca</label>
          <select id="player-trade-target">
            ${recipients.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.player_name || c.char_class || 'postać')})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Ilość</label>
          <input type="number" id="player-trade-qty" value="1" min="1" max="${max}">
        </div>
        <button type="submit" class="btn btn-primary btn-full">📦 Przekaż przedmiot</button>
      </form>
    `;
    showGenericModal('Wymiana między graczami', html);
    document.getElementById('player-trade-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const targetCharacterId = document.getElementById('player-trade-target').value;
        const quantity = Math.max(1, parseInt(document.getElementById('player-trade-qty').value, 10) || 1);
        await this.transferItem(source.id, targetCharacterId, item.id, quantity);
        closeModal('generic-modal');
        showToast('Przedmiot przekazany', 'success');
      } catch (err) {
        showToast(err.message || 'Nie udało się przekazać przedmiotu', 'error');
      }
    });
  },

  handleTradeMessage(data) {
    let meta = {};
    try {
      meta = typeof data.roll_data === 'string' ? JSON.parse(data.roll_data) : (data.roll_data || {});
    } catch (_e) { return null; }
    if (meta.kind === 'merchant') {
      return { kind: 'merchant', merchantId: meta.merchantId, merchantName: meta.merchantName };
    }
    if (meta.kind === 'loot') {
      return { kind: 'loot', grantId: meta.grantId, characterId: meta.characterId, label: meta.label };
    }
    if (meta.kind === 'player-item-trade') {
      return {
        kind: 'player-item-trade',
        sourceCharacterId: meta.sourceCharacterId,
        targetCharacterId: meta.targetCharacterId,
        itemId: meta.itemId,
        itemName: meta.itemName,
        quantity: meta.quantity || 1
      };
    }
    return null;
  },

  renderTradeActions(meta) {
    if (meta.kind === 'merchant') {
      return `<button type="button" class="btn btn-sm btn-primary chat-trade-btn" data-merchant-id="${escapeHtml(meta.merchantId)}">🏪 Otwórz handel: ${escapeHtml(meta.merchantName)}</button>`;
    }
    if (meta.kind === 'loot' && Characters.activeCharacter?.id === meta.characterId) {
      return `<button type="button" class="btn btn-sm btn-warning chat-trade-btn" data-grant-id="${escapeHtml(meta.grantId)}">🎁 Otwórz łup: ${escapeHtml(meta.label)}</button>`;
    }
    if (meta.kind === 'player-item-trade' && Characters.activeCharacter?.id === meta.sourceCharacterId) {
      return `<button type="button" class="btn btn-sm btn-secondary chat-trade-btn"
        data-source-char-id="${escapeHtml(meta.sourceCharacterId)}"
        data-item-id="${escapeHtml(meta.itemId)}"
        data-item-name="${escapeHtml(meta.itemName)}"
        data-quantity="${escapeHtml(String(meta.quantity || 1))}">🔁 Przekaż ponownie: ${escapeHtml(meta.itemName)}</button>`;
    }
    return '';
  }
};
