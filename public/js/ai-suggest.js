// ===== Podpowiedzi AI (Gemini) dla formularzy MG =====
const AISuggest = {
  _busy: false,

  isDm() {
    return App.currentCampaign?.role === 'dm';
  },

  barHtml() {
    return `
      <div class="ai-suggest-bar">
        <input type="text" class="ai-suggest-hint" placeholder="Wskazówka dla AI (opcjonalnie): klimat, lokacja, CR…" autocomplete="off">
        <button type="button" class="btn btn-sm btn-ai-suggest">✨ Zasugeruj (Gemini)</button>
      </div>`;
  },

  getHint(root) {
    return root?.querySelector('.ai-suggest-hint')?.value?.trim() || '';
  },

  async request(type, context = {}) {
    if (!this.isDm()) {
      showToast('Tylko MG może używać podpowiedzi AI', 'warning');
      return null;
    }
    if (!App.currentCampaign?.id) {
      showToast('Wejdź w kampanię', 'warning');
      return null;
    }
    if (this._busy) {
      showToast('AI już pracuje…', 'info');
      return null;
    }
    this._busy = true;
    const btn = context._btn;
    if (btn) {
      btn.disabled = true;
      btn.dataset.prevText = btn.textContent;
      btn.textContent = '⏳ Gemini…';
    }
    try {
      const payload = { ...context };
      delete payload._btn;
      const data = await apiFetch('/ai/suggest', {
        method: 'POST',
        body: JSON.stringify({
          campaignId: App.currentCampaign.id,
          type,
          context: payload
        })
      });
      return data.result;
    } catch (err) {
      showToast(err.message || 'Błąd AI', 'error');
      return null;
    } finally {
      this._busy = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.prevText || '✨ Zasugeruj (Gemini)';
      }
    }
  },

  /** Wstaw pasek AI na górę #generic-modal-body */
  attachToGenericModal(type, getContext, apply) {
    const body = document.getElementById('generic-modal-body');
    if (!body || body.querySelector('.ai-suggest-bar')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = this.barHtml();
    body.insertBefore(wrap.firstElementChild, body.firstChild);
    this._bindBar(body.querySelector('.ai-suggest-bar'), type, getContext, apply);
  },

  attachToElement(parent, type, getContext, apply) {
    if (!parent || parent.querySelector('.ai-suggest-bar')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = this.barHtml();
    parent.insertBefore(wrap.firstElementChild, parent.firstChild);
    this._bindBar(parent.querySelector('.ai-suggest-bar'), type, getContext, apply);
  },

  _bindBar(bar, type, getContext, apply) {
    if (!bar) return;
    const btn = bar.querySelector('.btn-ai-suggest');
    btn.addEventListener('click', async () => {
      const ctx = typeof getContext === 'function' ? getContext(bar) : {};
      ctx.hint = this.getHint(bar);
      ctx._btn = btn;
      const result = await this.request(type, ctx);
      if (result && typeof apply === 'function') apply(result, bar);
    });
  },

  setVal(id, v) {
    const el = document.getElementById(id);
    if (el && v != null && v !== '') el.value = v;
  },

  applyCustomNpc(r) {
    this.setVal('npc-name', r.name);
    this.setVal('npc-race', r.race);
    this.setVal('npc-description', r.description);
    if (r.max_hp != null) this.setVal('npc-hp', r.max_hp);
    if (r.armor_class != null) this.setVal('npc-ac', r.armor_class);
    this.setVal('npc-notes', r.notes);
    showToast('Pola NPC uzupełnione', 'success');
  },

  applyBestiary(data, dataObj) {
    const set = (id, v) => this.setVal(id, v);
    set('be-name', data.name);
    set('be-cr', data.cr);
    set('be-alignment', data.alignment);
    set('be-ac', data.ac);
    set('be-hp', data.hp_max);
    set('be-hpformula', data.hp_formula);
    set('be-speed', data.speed);
    set('be-dr', data.damage_resistances);
    set('be-di', data.damage_immunities);
    set('be-ci', data.condition_immunities);
    set('be-senses', data.senses);
    set('be-langs', data.languages);
    set('be-notes', data.notes);
    if (data.size) {
      const sel = document.getElementById('be-size');
      if (sel) [...sel.options].forEach((o) => { if (o.text === data.size) sel.value = o.text; });
    }
    if (data.monster_type) set('be-type', data.monster_type);
    if (data.stats) {
      Object.keys(data.stats).forEach((k) => set(`be-stat-${k}`, data.stats[k]));
    }
    if (data.saving_throws?.length) set('be-saves', data.saving_throws.join(', '));
    if (data.skills?.length) set('be-skills', data.skills.join(', '));
    if (dataObj) {
      if (data.attacks?.length) dataObj.attacks = data.attacks;
      if (data.traits?.length) dataObj.traits = data.traits;
      if (data.actions?.length) dataObj.actions = data.actions;
      if (data.reactions?.length) dataObj.reactions = data.reactions;
      if (data.legendary_actions?.length) dataObj.legendary_actions = data.legendary_actions;
      if (typeof dataObj._rerenderLists === 'function') dataObj._rerenderLists();
    }
    showToast('Stat block uzupełniony — sprawdź listy ataków/cech', 'success');
  },

  applyMerchant(r) {
    this.setVal('dm-merchant-name', r.name);
    this.setVal('dm-merchant-desc', r.description);
    this.setVal('dm-merchant-flavor', r.flavor);
    showToast('Handlarz uzupełniony — dodaj pozycje z katalogu lub AI', 'success');
  },

  applyLootTable(r) {
    this.setVal('dm-loot-name', r.name);
    this.setVal('dm-loot-desc', r.description);
    showToast('Tabela uzupełniona — dodaj wpisy z listy lub katalogu', 'info');
  },

  applyCustomItem(r) {
    this.setVal('ci-name', r.name);
    this.setVal('ci-price', r.priceCopper);
    this.setVal('ci-weight', r.weight);
    this.setVal('ci-desc', r.description);
    if (r.category) {
      const sel = document.getElementById('ci-category');
      if (sel) sel.value = r.category;
      sel?.dispatchEvent(new Event('change'));
    }
    const d = r.data || {};
    if (r.category === 'weapon') {
      this.setVal('ci-w-damage', d.damage);
      if (d.damageType) this.setVal('ci-w-damageType', d.damageType);
      if (d.ability) this.setVal('ci-w-ability', d.ability);
      this.setVal('ci-w-range', d.range);
    } else if (r.category === 'armor') {
      if (d.armorClass != null) this.setVal('ci-a-ac', d.armorClass);
      if (d.dexBonusMax != null) this.setVal('ci-a-dexmax', d.dexBonusMax);
    } else if (r.category === 'shield' && d.acBonus != null) {
      this.setVal('ci-s-acbonus', d.acBonus);
    }
    showToast('Przedmiot uzupełniony', 'success');
  },

  applyNpcGenerator(r) {
    if (!NpcGenerator.current) NpcGenerator.current = NpcGenerator.generate();
    const n = NpcGenerator.current;
    const race = NpcGenerator.TABLES.races.find((x) =>
      x.label === r.raceLabel || x.key === r.raceKey
    ) || NpcGenerator.TABLES.races[0];
    n.race = race;
    n.gender = r.gender === 'female' ? 'female' : 'male';
    n.name = r.name || NpcGenerator.pickName(race.key, n.gender);
    n.age = r.age || n.age;
    n.profession = r.profession || n.profession;
    n.appearance = r.appearance || n.appearance;
    n.trait = r.trait || n.trait;
    n.desire = r.desire || n.desire;
    n.bond = r.bond || n.bond;
    n.flaw = r.flaw || n.flaw;
    n.secret = r.secret || n.secret;
    NpcGenerator._renderCard();
    showToast('NPC wygenerowany przez AI', 'success');
  }
};
