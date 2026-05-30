// ===== DM Economy tools =====
const DMEconomy = {
  merchants: [],
  lootTables: [],
  customItems: [],

  init() {},

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  openTab() {
    document.querySelector('.session-tab[data-panel="dm-economy-panel"]')?.click();
  },

  open() {
    if (!App.currentCampaign) return;
    if (!this.isDm()) {
      showToast('Ekonomia i handel są dostępne tylko dla MG', 'warning');
      return;
    }
    this.openTab();
  },

  async onPanelActivate() {
    if (!App.currentCampaign || !this.isDm()) return;
    await this.load();
    this._renderPanel();
  },

  _getMount() {
    return document.getElementById('dm-economy-panel-root');
  },

  _isPanelMounted() {
    return !!document.getElementById('dm-economy-hub-body');
  },

  _charOptionsHtml() {
    return Characters.campaignCharacters?.map((c) =>
      `<option value="${c.id}">${escapeHtml(c.name)}</option>`
    ).join('') || '';
  },

  async load() {
    if (!App.currentCampaign) return;
    const isDm = App.currentCampaign.role === 'dm';
    try {
      // Każdy członek kampanii może zobaczyć katalog własnych przedmiotów (potrzebne
      // graczom do oglądania w karcie / sklepie). Tylko MG ładuje pełne sklepy/tabele.
      const customItems = await apiFetch(`/campaigns/${App.currentCampaign.id}/custom-items`).catch(() => []);
      this.customItems = customItems || [];
      if (isDm) {
        const [merchants, lootTables] = await Promise.all([
          apiFetch(`/campaigns/${App.currentCampaign.id}/merchants`),
          apiFetch(`/campaigns/${App.currentCampaign.id}/loot-tables`)
        ]);
        this.merchants = merchants;
        this.lootTables = lootTables;
        this._refreshPanel();
      }
    } catch (err) {
      console.error('DMEconomy load', err);
    }
  },

  _renderSummary() {
    const el = document.getElementById('dm-economy-summary');
    if (!el) return;
    const open = this.merchants.filter((m) => m.is_open).length;
    el.innerHTML = `
      <div class="treasury-stat"><span class="treasury-stat__icon">🏪</span><span>Handlarze <strong>${this.merchants.length}</strong> <em>(otwartych: ${open})</em></span></div>
      <div class="treasury-stat"><span class="treasury-stat__icon">📦</span><span>Tabele łupu <strong>${this.lootTables.length}</strong></span></div>
      <div class="treasury-stat"><span class="treasury-stat__icon">🛠️</span><span>Własne przedmioty <strong>${this.customItems.length}</strong></span></div>
    `;
  },

  _refreshPanel() {
    if (!this._isPanelMounted()) return;
    this._renderSummary();
    const body = document.getElementById('dm-economy-hub-body');
    if (!body) return;
    body.innerHTML = this._renderHubHtml();
    this._bindListEvents();
  },

  _renderPanel() {
    const mount = this._getMount();
    if (!mount) return;
    if (this._isPanelMounted()) {
      this._refreshPanel();
      return;
    }
    mount.innerHTML = `
      <div class="treasury-chamber treasury-chamber--panel" role="region" aria-label="Ekonomia i handel">
        <div class="treasury-chamber__coins" aria-hidden="true"></div>
        <header class="treasury-chamber__head">
          <span class="treasury-chamber__seal" aria-hidden="true">💰</span>
          <div>
            <h2 class="treasury-chamber__title">Księga Skarbu</h2>
            <p class="treasury-chamber__sub">Ekonomia i handel kampanii</p>
          </div>
        </header>
        <div id="dm-economy-summary" class="treasury-stats"></div>
        <div class="treasury-chamber__scroll">
          <div id="dm-economy-hub-body" class="dm-economy-hub"></div>
        </div>
      </div>`;
    this._bindPanelEvents();
    this._refreshPanel();
  },

  _renderHubHtml() {
    return `
      <div class="dm-economy-actions treasury-actions">
        <button type="button" class="btn btn-sm btn-primary" id="dm-eco-new-merchant">➕ Nowy handlarz</button>
        <button type="button" class="btn btn-sm btn-secondary" id="dm-eco-new-loot-table">📦 Tabela łupu</button>
        <button type="button" class="btn btn-sm btn-success" id="dm-eco-new-item">🛠️ Własny przedmiot</button>
        <button type="button" class="btn btn-sm btn-secondary" id="dm-eco-grant-coins">🪙 Przyznaj monety</button>
        <button type="button" class="btn btn-sm btn-warning" id="dm-eco-send-loot">🎁 Wyślij łup</button>
      </div>
      <section class="treasury-section">
        <h4 class="treasury-section__title">🏪 Handlarze</h4>
        <div class="dm-merchant-list">${this.renderMerchantList()}</div>
      </section>
      <section class="treasury-section">
        <h4 class="treasury-section__title">📦 Tabele łupu</h4>
        <div class="dm-loot-table-list">${this.renderLootTableList()}</div>
      </section>
      <section class="treasury-section">
        <h4 class="treasury-section__title">🛠️ Własne przedmioty</h4>
        <div class="dm-custom-item-list">${this.renderCustomItemList()}</div>
      </section>`;
  },

  _bindPanelEvents() {
    const mount = this._getMount();
    if (!mount || mount.dataset.bound === '1') return;
    mount.dataset.bound = '1';
    mount.addEventListener('click', (e) => {
      if (e.target.closest('#dm-eco-new-merchant')) { this.showCreateMerchant(); return; }
      if (e.target.closest('#dm-eco-new-loot-table')) { this.showCreateLootTable(); return; }
      if (e.target.closest('#dm-eco-new-item')) { this.showCreateCustomItem(); return; }
      if (e.target.closest('#dm-eco-grant-coins')) { this.showGrantCoins(this._charOptionsHtml()); return; }
      if (e.target.closest('#dm-eco-send-loot')) { this.showSendLoot(this._charOptionsHtml()); return; }
    });
  },

  _bindListEvents() {
    const body = document.getElementById('dm-economy-hub-body');
    if (!body || body.dataset.listBound === '1') return;
    body.dataset.listBound = '1';
    body.addEventListener('click', async (e) => {
      const openBtn = e.target.closest('.dm-merchant-open');
      if (openBtn) {
        App.socket?.emit('merchant-open', { merchantId: openBtn.dataset.id });
        showToast('Handlarz ogłoszony na czacie', 'success');
        await this.load();
        return;
      }
      const editM = e.target.closest('.dm-merchant-edit');
      if (editM) { this.showEditMerchant(editM.dataset.id); return; }
      const delM = e.target.closest('.dm-merchant-del');
      if (delM) {
        if (!confirm('Usunąć handlarza?')) return;
        await apiFetch(`/merchants/${delM.dataset.id}`, { method: 'DELETE' });
        await this.load();
        return;
      }
      const editL = e.target.closest('.dm-loot-edit');
      if (editL) { this.showEditLootTable(editL.dataset.id); return; }
      const delL = e.target.closest('.dm-loot-del');
      if (delL) {
        if (!confirm('Usunąć tabelę?')) return;
        await apiFetch(`/loot-tables/${delL.dataset.id}`, { method: 'DELETE' });
        await this.load();
        return;
      }
      const editC = e.target.closest('.dm-custom-edit');
      if (editC) { this.showEditCustomItem(editC.dataset.id); return; }
      const delC = e.target.closest('.dm-custom-del');
      if (delC) {
        if (!confirm('Usunąć ten przedmiot? Sklepy/łupy które już go zawierają zostaną nietknięte.')) return;
        await apiFetch(`/custom-items/${delC.dataset.id}`, { method: 'DELETE' });
        await this.load();
      }
    });
  },

  // ===== Custom items helpers =====
  // Buduje obiekt zgodny z DndRules.itemFromTemplate, ale dla własnego przedmiotu.
  itemFromCustomTemplate(custom) {
    if (!custom) return null;
    const cat = String(custom.category || 'gear').toLowerCase();
    const d = custom.data || {};
    const base = {
      id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      templateId: `custom:${custom.id}`,
      name: custom.name,
      category: cat,
      quantity: 1,
      weight: parseFloat(custom.weight) || 0,
      description: custom.description || ''
    };
    if (cat === 'weapon' || d.damage) {
      return {
        ...base,
        category: 'weapon',
        damage: d.damage || '1d4',
        damageType: d.damageType || 'bludgeoning',
        ability: d.ability || 'strength',
        properties: Array.isArray(d.properties) ? [...d.properties] : [],
        range: d.range || '',
        attackBonus: parseInt(d.attackBonus, 10) || 0,
        damageBonus: parseInt(d.damageBonus, 10) || 0,
        isProficient: true
      };
    }
    if (cat === 'armor') {
      return {
        ...base,
        equipSlot: 'armor',
        armorClass: parseInt(d.armorClass, 10) || 10,
        dexBonusMax: d.dexBonusMax === undefined ? 99 : parseInt(d.dexBonusMax, 10),
        stealthDisadvantage: !!d.stealthDisadvantage
      };
    }
    if (cat === 'shield') {
      return { ...base, equipSlot: 'shield', acBonus: parseInt(d.acBonus, 10) || 2 };
    }
    return { ...base, equipSlot: d.equipSlot || '' };
  },

  // Zwraca pseudo-szablon używany w listach (np. catalogOptions): {id, namePl, priceCopper, ...}
  customAsTemplate(custom) {
    return {
      id: `custom:${custom.id}`,
      namePl: custom.name,
      category: custom.category,
      priceCopper: custom.price_copper || 0,
      weight: custom.weight || 0,
      __custom: true,
      __ref: custom
    };
  },

  // Generuje item z dowolnego id — zarówno wbudowanego (DndRules) jak i własnego (`custom:<uuid>`).
  itemFromAnyTemplate(templateId) {
    if (!templateId) return null;
    if (String(templateId).startsWith('custom:')) {
      const id = String(templateId).slice('custom:'.length);
      const custom = this.customItems.find((c) => c.id === id);
      return this.itemFromCustomTemplate(custom);
    }
    return DndRules.itemFromTemplate(templateId);
  },

  // Zwraca szablon (dla cen domyślnych) — wbudowany lub własny.
  templateById(templateId) {
    if (!templateId) return null;
    if (String(templateId).startsWith('custom:')) {
      const id = String(templateId).slice('custom:'.length);
      const c = this.customItems.find((x) => x.id === id);
      return c ? this.customAsTemplate(c) : null;
    }
    return DndRules.getItemTemplate(templateId);
  },

  renderMerchantList() {
    if (!this.merchants.length) return '<p class="info-text">Brak handlarzy.</p>';
    return this.merchants.map((m) => `
      <div class="dm-merchant-row" data-id="${m.id}">
        <div>
          <strong>${escapeHtml(m.name)}</strong>
          <span class="dm-tag ${m.is_open ? 'open' : ''}">${m.is_open ? 'OTWARTY' : 'zamknięty'}</span>
          <div class="dm-meta">${(m.inventory || []).length} pozycji · ${escapeHtml((m.description || '').slice(0, 60))}</div>
        </div>
        <div class="dm-row-btns">
          <button type="button" class="btn btn-sm btn-primary dm-merchant-open" data-id="${m.id}" ${m.is_open ? 'disabled' : ''}>Otwórz w czacie</button>
          <button type="button" class="btn btn-sm btn-secondary dm-merchant-edit" data-id="${m.id}">Edytuj</button>
          <button type="button" class="btn btn-sm btn-danger dm-merchant-del" data-id="${m.id}">✕</button>
        </div>
      </div>
    `).join('');
  },

  renderLootTableList() {
    if (!this.lootTables.length) return '<p class="info-text">Brak tabel.</p>';
    return this.lootTables.map((t) => `
      <div class="dm-loot-row" data-id="${t.id}">
        <strong>${escapeHtml(t.name)}</strong> — ${(t.entries || []).length} wpisów
        <button type="button" class="btn btn-sm btn-secondary dm-loot-edit" data-id="${t.id}">Edytuj</button>
        <button type="button" class="btn btn-sm btn-danger dm-loot-del" data-id="${t.id}">✕</button>
      </div>
    `).join('');
  },

  renderCustomItemList() {
    if (!this.customItems.length) return '<p class="info-text">Brak własnych przedmiotów. Stwórz pierwszy, by używać go w sklepach i łupach.</p>';
    const catLabels = { weapon: '⚔ broń', armor: '🛡 zbroja', shield: '🛡 tarcza', gear: '🎒 wyposażenie', potion: '🧪 mikstura', wondrous: '✨ cudowne', scroll: '📜 zwój', tool: '🔧 narzędzia' };
    return this.customItems.map((it) => `
      <div class="dm-custom-item-row" data-id="${it.id}">
        <div>
          <strong>${escapeHtml(it.name)}</strong>
          <span class="dm-tag">${escapeHtml(catLabels[it.category] || it.category || 'gear')}</span>
          <span class="dm-tag">${escapeHtml(DndRules.formatPriceCopper(it.price_copper || 0))}</span>
          <div class="dm-meta">${escapeHtml((it.description || '').slice(0, 80))}</div>
        </div>
        <div class="dm-row-btns">
          <button type="button" class="btn btn-sm btn-secondary dm-custom-edit" data-id="${it.id}">Edytuj</button>
          <button type="button" class="btn btn-sm btn-danger dm-custom-del" data-id="${it.id}">✕</button>
        </div>
      </div>
    `).join('');
  },

  catalogOptions() {
    const builtin = DndRules.ALL_ITEM_TEMPLATES().map((t) =>
      `<option value="${t.id}">${escapeHtml(t.namePl)} (${DndRules.formatPriceCopper(t.priceCopper || 100)})</option>`
    ).join('');
    if (!this.customItems.length) return builtin;
    const customOpts = this.customItems.map((c) =>
      `<option value="custom:${c.id}">🛠️ ${escapeHtml(c.name)} (${DndRules.formatPriceCopper(c.price_copper || 0)})</option>`
    ).join('');
    return `<optgroup label="🛠️ Własne (${this.customItems.length})">${customOpts}</optgroup><optgroup label="📚 Katalog 5e">${builtin}</optgroup>`;
  },

  showCreateMerchant() {
    showGenericModal('➕ Nowy handlarz', `
      <div class="form-group"><label>Nazwa NPC / sklepu</label><input type="text" id="dm-merchant-name" placeholder="np. Thorin — kuźnia"></div>
      <div class="form-group"><label>Opis</label><textarea id="dm-merchant-desc" rows="2"></textarea></div>
      <div class="form-group"><label>Kwestia powitalna (czat)</label><textarea id="dm-merchant-flavor" rows="2" placeholder="Witaj, poszukiwaczu przygód!"></textarea></div>
      <p><strong>Asortyment</strong> — dodaj z katalogu:</p>
      <div class="form-row">
        <select id="dm-shop-template" style="flex:2">${this.catalogOptions()}</select>
        <input type="number" id="dm-shop-price" placeholder="Cena MC" min="0" style="width:100px">
        <input type="number" id="dm-shop-stock" placeholder="Szt (-1=∞)" value="-1" style="width:90px">
        <button type="button" class="btn btn-sm btn-secondary" id="dm-shop-add-line">Dodaj</button>
      </div>
      <div id="dm-shop-lines"></div>
      <button type="button" class="btn btn-primary" id="dm-merchant-save" style="margin-top:12px">Zapisz handlarza</button>
    `, 'modal-lg');

    setTimeout(() => {
      if (typeof AISuggest !== 'undefined') {
        AISuggest.attachToGenericModal('merchant', () => ({
          name: document.getElementById('dm-merchant-name')?.value
        }), (r) => {
          AISuggest.applyMerchant(r);
          if (r.suggestedItems?.length) {
            showToast(`AI zasugerowało ${r.suggestedItems.length} pozycji — dodaj je ręcznie z katalogu`, 'info');
          }
        });
      }
    }, 0);

    const lines = [];
    const renderLines = () => {
      document.getElementById('dm-shop-lines').innerHTML = lines.map((l, i) =>
        `<div class="dm-shop-line">${escapeHtml(l.name)} — ${DndRules.formatPriceCopper(l.priceCopper)} 
        <button type="button" class="btn btn-xs btn-danger" data-i="${i}">✕</button></div>`
      ).join('');
      document.getElementById('dm-shop-lines').querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => { lines.splice(parseInt(b.dataset.i, 10), 1); renderLines(); });
      });
    };

    document.getElementById('dm-shop-add-line').addEventListener('click', () => {
      const tplId = document.getElementById('dm-shop-template').value;
      const item = this.itemFromAnyTemplate(tplId);
      if (!item) return;
      const price = parseInt(document.getElementById('dm-shop-price').value, 10);
      const tpl = this.templateById(tplId);
      lines.push({
        id: `si-${Date.now()}-${lines.length}`,
        name: item.name,
        category: item.category,
        priceCopper: Number.isNaN(price) ? (tpl?.priceCopper || 100) : price,
        stock: parseInt(document.getElementById('dm-shop-stock').value, 10),
        grantAs: item.damage ? 'weapon' : 'backpack',
        itemData: item
      });
      renderLines();
    });

    document.getElementById('dm-merchant-save').addEventListener('click', async () => {
      const name = document.getElementById('dm-merchant-name').value.trim();
      if (!name) return showToast('Podaj nazwę', 'warning');
      await apiFetch(`/campaigns/${App.currentCampaign.id}/merchants`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: document.getElementById('dm-merchant-desc').value.trim(),
          flavor: document.getElementById('dm-merchant-flavor').value.trim(),
          inventory: lines
        })
      });
      closeModal('generic-modal');
      showToast('Handlarz utworzony', 'success');
      await this.load();
    });
  },

  showEditMerchant(id) {
    const m = this.merchants.find((x) => x.id === id);
    if (!m) return;
    this.showCreateMerchant();
    setTimeout(() => {
      document.getElementById('dm-merchant-name').value = m.name;
      document.getElementById('dm-merchant-desc').value = m.description || '';
      document.getElementById('dm-merchant-flavor').value = m.flavor || '';
      const linesEl = document.getElementById('dm-shop-lines');
      const lines = [...(m.inventory || [])];
      const renderLines = () => {
        linesEl.innerHTML = lines.map((l, i) =>
          `<div class="dm-shop-line">${escapeHtml(l.name)} — ${DndRules.formatPriceCopper(l.priceCopper)}
          <button type="button" class="btn btn-xs btn-danger" data-i="${i}">✕</button></div>`
        ).join('');
        linesEl.querySelectorAll('button').forEach((b) => {
          b.addEventListener('click', () => { lines.splice(parseInt(b.dataset.i, 10), 1); renderLines(); });
        });
      };
      renderLines();
      document.getElementById('dm-merchant-save').onclick = async () => {
        await apiFetch(`/merchants/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: document.getElementById('dm-merchant-name').value.trim(),
            description: document.getElementById('dm-merchant-desc').value.trim(),
            flavor: document.getElementById('dm-merchant-flavor').value.trim(),
            inventory: lines
          })
        });
        closeModal('generic-modal');
        await this.load();
        this._refreshPanel();
      };
    }, 50);
  },

  showCreateLootTable() {
    showGenericModal('📦 Tabela łupu', `
      <div class="form-group"><label>Nazwa</label><input type="text" id="dm-loot-name" placeholder="Skrzynia lochu"></div>
      <div class="form-group"><label>Opis</label><textarea id="dm-loot-desc" rows="2"></textarea></div>
      <p>Dodaj wpisy (waga = szansa względna):</p>
      <div class="form-row">
        <select id="dm-loot-template" style="flex:2">${this.catalogOptions()}</select>
        <input type="number" id="dm-loot-weight" value="1" min="1" style="width:70px" title="Waga">
        <button type="button" class="btn btn-sm btn-secondary" id="dm-loot-add-entry">Dodaj</button>
      </div>
      <div id="dm-loot-entries"></div>
      <button type="button" class="btn btn-primary" id="dm-loot-save">Zapisz tabelę</button>
    `, 'modal-lg');

    setTimeout(() => {
      if (typeof AISuggest !== 'undefined') {
        AISuggest.attachToGenericModal('loot_table', () => ({
          name: document.getElementById('dm-loot-name')?.value
        }), (r) => AISuggest.applyLootTable(r));
      }
    }, 0);

    const entries = [];
    const render = () => {
      document.getElementById('dm-loot-entries').innerHTML = entries.map((e, i) =>
        `<div>${escapeHtml(e.item?.name || '?')} (waga ${e.weight}) <button type="button" data-i="${i}" class="btn btn-xs btn-danger">✕</button></div>`
      ).join('');
      document.getElementById('dm-loot-entries').querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => { entries.splice(parseInt(b.dataset.i, 10), 1); render(); });
      });
    };
    document.getElementById('dm-loot-add-entry').addEventListener('click', () => {
      const item = this.itemFromAnyTemplate(document.getElementById('dm-loot-template').value);
      if (!item) return;
      entries.push({ weight: parseInt(document.getElementById('dm-loot-weight').value, 10) || 1, item });
      render();
    });
    document.getElementById('dm-loot-save').addEventListener('click', async () => {
      const name = document.getElementById('dm-loot-name').value.trim();
      if (!name) return showToast('Podaj nazwę', 'warning');
      await apiFetch(`/campaigns/${App.currentCampaign.id}/loot-tables`, {
        method: 'POST',
        body: JSON.stringify({ name, description: document.getElementById('dm-loot-desc').value.trim(), entries })
      });
      closeModal('generic-modal');
      await this.load();
      showToast('Tabela zapisana', 'success');
    });
  },

  showEditLootTable(id) {
    const t = this.lootTables.find((x) => x.id === id);
    if (!t) return;
    this.showCreateLootTable();
    setTimeout(() => {
      document.getElementById('dm-loot-name').value = t.name;
      document.getElementById('dm-loot-desc').value = t.description || '';
      const entries = [...(t.entries || [])];
      const render = () => {
        document.getElementById('dm-loot-entries').innerHTML = entries.map((e, i) =>
          `<div>${escapeHtml(e.item?.name || '?')} (waga ${e.weight}) <button type="button" data-i="${i}" class="btn btn-xs btn-danger">✕</button></div>`
        ).join('');
        document.getElementById('dm-loot-entries').querySelectorAll('button').forEach((b) => {
          b.addEventListener('click', () => { entries.splice(parseInt(b.dataset.i, 10), 1); render(); });
        });
      };
      render();
      document.getElementById('dm-loot-save').onclick = async () => {
        await apiFetch(`/loot-tables/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: document.getElementById('dm-loot-name').value.trim(),
            description: document.getElementById('dm-loot-desc').value.trim(),
            entries
          })
        });
        closeModal('generic-modal');
        await this.load();
        this._refreshPanel();
      };
    }, 50);
  },

  showGrantCoins(charOptions) {
    showGenericModal('🪙 Przyznaj monety', `
      <div class="form-group"><label>Postać</label><select id="dm-coin-char">${charOptions}</select></div>
      <div class="form-group"><label>Kwota (w miedziakach — 100 MC = 1 MZ)</label><input type="number" id="dm-coin-delta" value="100"></div>
      <p class="info-text">Ujemna wartość odejmie monety.</p>
      <button type="button" class="btn btn-primary" id="dm-coin-submit">Przyznaj</button>
    `);
    document.getElementById('dm-coin-submit').addEventListener('click', async () => {
      const charId = document.getElementById('dm-coin-char').value;
      const delta = parseInt(document.getElementById('dm-coin-delta').value, 10);
      try {
        await apiFetch(`/characters/${charId}/grant-currency`, {
          method: 'POST',
          body: JSON.stringify({ deltaCopper: delta })
        });
        showToast('Monety zaktualizowane', 'success');
        closeModal('generic-modal');
        Characters.loadCampaignCharacters();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },

  showSendLoot(charOptions) {
    if (!charOptions) {
      charOptions = Characters.campaignCharacters?.map((c) =>
        `<option value="${c.id}">${escapeHtml(c.name)}</option>`
      ).join('') || '';
    }
    const tableOpts = this.lootTables.map((t) =>
      `<option value="${t.id}">${escapeHtml(t.name)}</option>`
    ).join('');
    showGenericModal('🎁 Wyślij łup do otwarcia', `
      <div class="form-group"><label>Postać</label><select id="dm-loot-char">${charOptions}</select></div>
      <div class="form-group"><label>Etykieta (czat)</label><input type="text" id="dm-loot-label" value="Tajemnicza paczka"></div>
      <div class="form-group"><label>Tabela losowa (opcjonalnie)</label>
        <select id="dm-loot-table"><option value="">— stały łup poniżej —</option>${tableOpts}</select>
      </div>
      <p>Lub dodaj stałe przedmioty:</p>
      <div class="form-row">
        <select id="dm-loot-item-tpl" style="flex:1">${this.catalogOptions()}</select>
        <button type="button" class="btn btn-sm btn-secondary" id="dm-loot-item-add">Dodaj</button>
      </div>
      <div id="dm-loot-fixed-items"></div>
      <button type="button" class="btn btn-warning" id="dm-loot-send">Wyślij do postaci</button>
    `);
    const fixed = [];
    const renderFixed = () => {
      document.getElementById('dm-loot-fixed-items').innerHTML = fixed.map((it, i) =>
        `<div>${escapeHtml(it.name)} <button type="button" class="btn btn-xs btn-danger" data-i="${i}">✕</button></div>`
      ).join('');
      document.getElementById('dm-loot-fixed-items').querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => { fixed.splice(parseInt(b.dataset.i, 10), 1); renderFixed(); });
      });
    };
    document.getElementById('dm-loot-item-add').addEventListener('click', () => {
      const it = this.itemFromAnyTemplate(document.getElementById('dm-loot-item-tpl').value);
      if (it) { fixed.push(it); renderFixed(); }
    });
    document.getElementById('dm-loot-send').addEventListener('click', async () => {
      const characterId = document.getElementById('dm-loot-char').value;
      const lootTableId = document.getElementById('dm-loot-table').value;
      try {
        await apiFetch(`/campaigns/${App.currentCampaign.id}/loot-grants`, {
          method: 'POST',
          body: JSON.stringify({
            characterId,
            lootTableId: lootTableId || undefined,
            label: document.getElementById('dm-loot-label').value.trim(),
            items: lootTableId ? [] : fixed
          })
        });
        showToast('Łup wysłany — gracz zobaczy w czacie', 'success');
        closeModal('generic-modal');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },

  // ===== Custom item editor =====
  showCreateCustomItem(existing = null) {
    const isEdit = !!existing;
    const e = existing || {};
    const cat = e.category || 'gear';
    const d = e.data || {};
    showGenericModal(isEdit ? '✏️ Edytuj przedmiot' : '🛠️ Nowy własny przedmiot', `
      <div class="custom-item-editor">
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label>Nazwa</label>
            <input type="text" id="ci-name" value="${escapeHtml(e.name || '')}" placeholder="np. Klinga Cienia">
          </div>
          <div class="form-group" style="flex:1">
            <label>Kategoria</label>
            <select id="ci-category">
              <option value="weapon"${cat === 'weapon' ? ' selected' : ''}>⚔ Broń</option>
              <option value="armor"${cat === 'armor' ? ' selected' : ''}>🛡 Zbroja</option>
              <option value="shield"${cat === 'shield' ? ' selected' : ''}>🛡 Tarcza</option>
              <option value="gear"${cat === 'gear' ? ' selected' : ''}>🎒 Wyposażenie</option>
              <option value="potion"${cat === 'potion' ? ' selected' : ''}>🧪 Mikstura</option>
              <option value="wondrous"${cat === 'wondrous' ? ' selected' : ''}>✨ Cudowne</option>
              <option value="scroll"${cat === 'scroll' ? ' selected' : ''}>📜 Zwój</option>
              <option value="tool"${cat === 'tool' ? ' selected' : ''}>🔧 Narzędzia</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label>Cena (w miedziakach, 100 MC = 1 MZ)</label>
            <input type="number" id="ci-price" min="0" value="${parseInt(e.price_copper, 10) || 0}">
          </div>
          <div class="form-group" style="flex:1">
            <label>Waga (lb)</label>
            <input type="number" id="ci-weight" min="0" step="0.1" value="${parseFloat(e.weight) || 0}">
          </div>
        </div>
        <div class="form-group">
          <label>Opis / efekt</label>
          <textarea id="ci-desc" rows="2" placeholder="np. Lekka klinga drow, w mroku zadaje +1d4 nekrotycznych...">${escapeHtml(e.description || '')}</textarea>
        </div>

        <div id="ci-fields-weapon" class="custom-item-cat-fields">
          <h4>⚔ Broń</h4>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label>Kości obrażeń</label>
              <input type="text" id="ci-w-damage" placeholder="1d8" value="${escapeHtml(d.damage || '')}">
            </div>
            <div class="form-group" style="flex:1">
              <label>Typ</label>
              <select id="ci-w-damageType">
                ${['slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning', 'thunder', 'poison', 'acid', 'necrotic', 'radiant', 'psychic', 'force']
                  .map((t) => `<option value="${t}"${(d.damageType || 'slashing') === t ? ' selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label>Atrybut</label>
              <select id="ci-w-ability">
                <option value="strength"${(d.ability || 'strength') === 'strength' ? ' selected' : ''}>Siła</option>
                <option value="dexterity"${d.ability === 'dexterity' ? ' selected' : ''}>Zręczność</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label>Zasięg (np. 20/60, opcj.)</label>
              <input type="text" id="ci-w-range" value="${escapeHtml(d.range || '')}" placeholder="dla broni dystansowych">
            </div>
            <div class="form-group" style="flex:1">
              <label>Bonus atak</label>
              <input type="number" id="ci-w-atkb" value="${parseInt(d.attackBonus, 10) || 0}">
            </div>
            <div class="form-group" style="flex:1">
              <label>Bonus obraż.</label>
              <input type="number" id="ci-w-dmgb" value="${parseInt(d.damageBonus, 10) || 0}">
            </div>
          </div>
          <div class="form-group">
            <label>Cechy</label>
            <div class="custom-item-props">
              ${['light', 'heavy', 'finesse', 'two-handed', 'versatile', 'thrown', 'reach', 'ammunition', 'loading', 'special', 'magical', 'silvered']
                .map((p) => `<label class="prop-chip"><input type="checkbox" data-prop="${p}"${(d.properties || []).includes(p) ? ' checked' : ''}>${p}</label>`).join('')}
            </div>
          </div>
        </div>

        <div id="ci-fields-armor" class="custom-item-cat-fields" style="display:none">
          <h4>🛡 Zbroja</h4>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label>Klasa Pancerza (KP)</label>
              <input type="number" id="ci-a-ac" min="10" max="22" value="${parseInt(d.armorClass, 10) || 11}">
            </div>
            <div class="form-group" style="flex:1">
              <label>Max bonus Zręczności</label>
              <select id="ci-a-dexmax">
                <option value="99"${(d.dexBonusMax === undefined || d.dexBonusMax === 99) ? ' selected' : ''}>bez limitu (lekka)</option>
                <option value="2"${d.dexBonusMax === 2 ? ' selected' : ''}>+2 (średnia)</option>
                <option value="0"${d.dexBonusMax === 0 ? ' selected' : ''}>+0 (ciężka)</option>
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label><input type="checkbox" id="ci-a-stealth"${d.stealthDisadvantage ? ' checked' : ''}> Utrudn. skradania</label>
            </div>
          </div>
        </div>

        <div id="ci-fields-shield" class="custom-item-cat-fields" style="display:none">
          <h4>🛡 Tarcza</h4>
          <div class="form-group">
            <label>Bonus KP</label>
            <input type="number" id="ci-s-acbonus" value="${parseInt(d.acBonus, 10) || 2}" min="1" max="5">
          </div>
        </div>

        <div id="ci-fields-gear" class="custom-item-cat-fields" style="display:none">
          <h4>🎒 Wyposażenie / inne</h4>
          <div class="form-group">
            <label>Slot ekwipunku (opcjonalnie — np. head, cloak, gloves, feet, amulet, ring1)</label>
            <input type="text" id="ci-g-slot" value="${escapeHtml(d.equipSlot || '')}" placeholder="zostaw puste = trafia do plecaka">
          </div>
        </div>

        <div class="form-row" style="margin-top:14px">
          <button type="button" class="btn btn-primary" id="ci-save">${isEdit ? 'Zapisz zmiany' : 'Utwórz przedmiot'}</button>
          <button type="button" class="btn btn-secondary" id="ci-cancel">Anuluj</button>
        </div>
      </div>
    `, 'modal-lg');

    setTimeout(() => {
      if (typeof AISuggest !== 'undefined') {
        AISuggest.attachToGenericModal('custom_item', () => ({
          name: document.getElementById('ci-name')?.value,
          category: document.getElementById('ci-category')?.value
        }), (r) => AISuggest.applyCustomItem(r));
      }
    }, 0);

    const fields = ['weapon', 'armor', 'shield', 'gear'];
    const refreshFields = () => {
      const c = document.getElementById('ci-category').value;
      const showAs = ({ weapon: 'weapon', armor: 'armor', shield: 'shield' }[c]) || 'gear';
      fields.forEach((f) => {
        const el = document.getElementById(`ci-fields-${f}`);
        if (el) el.style.display = (f === showAs) ? '' : 'none';
      });
    };
    document.getElementById('ci-category').addEventListener('change', refreshFields);
    refreshFields();

    document.getElementById('ci-cancel').addEventListener('click', () => closeModal('generic-modal'));

    document.getElementById('ci-save').addEventListener('click', async () => {
      const name = document.getElementById('ci-name').value.trim();
      if (!name) return showToast('Podaj nazwę', 'warning');
      const category = document.getElementById('ci-category').value;
      const priceCopper = parseInt(document.getElementById('ci-price').value, 10) || 0;
      const weight = parseFloat(document.getElementById('ci-weight').value) || 0;
      const description = document.getElementById('ci-desc').value.trim();

      const data = {};
      if (category === 'weapon') {
        data.damage = document.getElementById('ci-w-damage').value.trim() || '1d4';
        data.damageType = document.getElementById('ci-w-damageType').value;
        data.ability = document.getElementById('ci-w-ability').value;
        data.range = document.getElementById('ci-w-range').value.trim();
        data.attackBonus = parseInt(document.getElementById('ci-w-atkb').value, 10) || 0;
        data.damageBonus = parseInt(document.getElementById('ci-w-dmgb').value, 10) || 0;
        data.properties = [...document.querySelectorAll('#ci-fields-weapon [data-prop]:checked')].map((cb) => cb.dataset.prop);
      } else if (category === 'armor') {
        data.armorClass = parseInt(document.getElementById('ci-a-ac').value, 10) || 11;
        data.dexBonusMax = parseInt(document.getElementById('ci-a-dexmax').value, 10);
        data.stealthDisadvantage = document.getElementById('ci-a-stealth').checked;
      } else if (category === 'shield') {
        data.acBonus = parseInt(document.getElementById('ci-s-acbonus').value, 10) || 2;
      } else {
        const slot = document.getElementById('ci-g-slot').value.trim();
        if (slot) data.equipSlot = slot;
      }

      const payload = { name, category, priceCopper, weight, description, data };
      try {
        if (isEdit) {
          await apiFetch(`/custom-items/${existing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
          showToast('Przedmiot zaktualizowany', 'success');
        } else {
          await apiFetch(`/campaigns/${App.currentCampaign.id}/custom-items`, { method: 'POST', body: JSON.stringify(payload) });
          showToast('Przedmiot utworzony', 'success');
        }
        closeModal('generic-modal');
        await this.load();
        this._refreshPanel();
      } catch (err) {
        showToast(err.message || 'Błąd zapisu', 'error');
      }
    });
  },

  showEditCustomItem(id) {
    const it = this.customItems.find((c) => c.id === id);
    if (!it) return;
    this.showCreateCustomItem(it);
  }
};
