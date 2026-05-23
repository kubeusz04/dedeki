// ===== DM Economy tools =====
const DMEconomy = {
  merchants: [],
  lootTables: [],

  init() {
    document.getElementById('btn-dm-economy')?.addEventListener('click', () => this.showHub());
    document.getElementById('btn-dm-merchant-quick')?.addEventListener('click', () => this.showCreateMerchant());
    document.getElementById('btn-dm-loot-quick')?.addEventListener('click', () => this.showSendLoot());
  },

  async load() {
    if (!App.currentCampaign || App.currentCampaign.role !== 'dm') return;
    try {
      const [merchants, lootTables] = await Promise.all([
        apiFetch(`/campaigns/${App.currentCampaign.id}/merchants`),
        apiFetch(`/campaigns/${App.currentCampaign.id}/loot-tables`)
      ]);
      this.merchants = merchants;
      this.lootTables = lootTables;
      this.renderSidebar();
    } catch (err) {
      console.error('DMEconomy load', err);
    }
  },

  renderSidebar() {
    const el = document.getElementById('dm-economy-summary');
    if (!el) return;
    const open = this.merchants.filter((m) => m.is_open).length;
    el.innerHTML = `
      <p>Handlarze: <strong>${this.merchants.length}</strong> (otwartych: ${open})</p>
      <p>Tabele łupu: <strong>${this.lootTables.length}</strong></p>
    `;
  },

  showHub() {
    const chars = document.querySelectorAll('#campaign-characters .character-card');
    const charOptions = Characters.campaignCharacters?.map((c) =>
      `<option value="${c.id}">${escapeHtml(c.name)}</option>`
    ).join('') || '';

    showGenericModal('💰 Ekonomia kampanii', `
      <div class="dm-economy-hub">
        <div class="dm-economy-actions">
          <button type="button" class="btn btn-primary" id="dm-eco-new-merchant">➕ Nowy handlarz</button>
          <button type="button" class="btn btn-secondary" id="dm-eco-new-loot-table">📦 Tabela łupu</button>
          <button type="button" class="btn btn-secondary" id="dm-eco-grant-coins">🪙 Przyznaj monety</button>
          <button type="button" class="btn btn-warning" id="dm-eco-send-loot">🎁 Wyślij łup</button>
        </div>
        <h4>Handlarze</h4>
        <div class="dm-merchant-list">${this.renderMerchantList()}</div>
        <h4>Tabele łupu</h4>
        <div class="dm-loot-table-list">${this.renderLootTableList()}</div>
      </div>
    `, 'modal-xl');

    document.getElementById('dm-eco-new-merchant')?.addEventListener('click', () => this.showCreateMerchant());
    document.getElementById('dm-eco-new-loot-table')?.addEventListener('click', () => this.showCreateLootTable());
    document.getElementById('dm-eco-grant-coins')?.addEventListener('click', () => this.showGrantCoins(charOptions));
    document.getElementById('dm-eco-send-loot')?.addEventListener('click', () => this.showSendLoot(charOptions));
    this.bindMerchantListEvents();
    this.bindLootTableListEvents();
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

  bindMerchantListEvents() {
    document.querySelectorAll('.dm-merchant-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        App.socket?.emit('merchant-open', { merchantId: btn.dataset.id });
        showToast('Handlarz ogłoszony na czacie', 'success');
        this.load();
      });
    });
    document.querySelectorAll('.dm-merchant-edit').forEach((btn) => {
      btn.addEventListener('click', () => this.showEditMerchant(btn.dataset.id));
    });
    document.querySelectorAll('.dm-merchant-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Usunąć handlarza?')) return;
        await apiFetch(`/merchants/${btn.dataset.id}`, { method: 'DELETE' });
        await this.load();
        this.showHub();
      });
    });
  },

  bindLootTableListEvents() {
    document.querySelectorAll('.dm-loot-edit').forEach((btn) => {
      btn.addEventListener('click', () => this.showEditLootTable(btn.dataset.id));
    });
    document.querySelectorAll('.dm-loot-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Usunąć tabelę?')) return;
        await apiFetch(`/loot-tables/${btn.dataset.id}`, { method: 'DELETE' });
        await this.load();
        this.showHub();
      });
    });
  },

  catalogOptions() {
    return DndRules.ALL_ITEM_TEMPLATES().map((t) =>
      `<option value="${t.id}">${escapeHtml(t.namePl)} (${DndRules.formatPriceCopper(t.priceCopper || 100)})</option>`
    ).join('');
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
      const item = DndRules.itemFromTemplate(tplId);
      if (!item) return;
      const price = parseInt(document.getElementById('dm-shop-price').value, 10);
      const tpl = DndRules.getItemTemplate(tplId);
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
        this.showHub();
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
      const item = DndRules.itemFromTemplate(document.getElementById('dm-loot-template').value);
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
        this.showHub();
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
      const it = DndRules.itemFromTemplate(document.getElementById('dm-loot-item-tpl').value);
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
  }
};
