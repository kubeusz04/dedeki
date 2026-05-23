// ===== Dice Module =====
const DAMAGE_TYPE_PL = {
  piercing: 'przeszywające',
  slashing: 'sieczne',
  bludgeoning: 'obuchowe',
  fire: 'ogień',
  cold: 'zimno',
  lightning: 'piorun',
  acid: 'kwas',
  poison: 'trucizna',
  psychic: 'psychiczne',
  radiant: 'światło',
  necrotic: 'nekrotyczne',
  force: 'moc',
  thunder: 'grzmot'
};

const Dice = {
  init() {
    document.getElementById('btn-roll-dice').addEventListener('click', () => this.rollFromBuilder());
    document.getElementById('btn-roll-custom').addEventListener('click', () => this.rollCustomExpression());
    document.getElementById('dice-custom-expr').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.rollCustomExpression();
    });
    document.getElementById('dice-advantage').addEventListener('change', (e) => {
      if (e.target.checked) document.getElementById('dice-disadvantage').checked = false;
    });
    document.getElementById('dice-disadvantage').addEventListener('change', (e) => {
      if (e.target.checked) document.getElementById('dice-advantage').checked = false;
    });

    // Quick dice buttons in sidebar
    document.querySelectorAll('.dice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dice = btn.dataset.dice;
        const sides = parseInt(dice.replace('d', ''));
        this.rollAndSend(1, sides, 0, `1${dice}`, 'quick');
      });
    });

    // Ability check buttons
    document.querySelectorAll('.btn-ability').forEach(btn => {
      btn.addEventListener('click', () => this.rollAbilityCheck(btn.dataset.ability));
    });
    document.querySelectorAll('.btn-save').forEach(btn => {
      btn.addEventListener('click', () => this.rollSavingThrow(btn.dataset.save));
    });

    document.getElementById('btn-roll-attack')?.addEventListener('click', () => this.rollAttackFlow());
    document.getElementById('btn-roll-spell')?.addEventListener('click', () => this.rollSpellFlow());
  },

  rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
  },

  diceSpeakPayload() {
    return {
      characterName: typeof Chat !== 'undefined' ? Chat.getRollCharacterName() : (Characters.activeCharacter?.name || ''),
      speakAs: typeof Chat !== 'undefined' ? Chat.getSpeakAsPayload() : null
    };
  },

  rollMultiple(count, sides) {
    const rolls = [];
    for (let i = 0; i < count; i++) {
      rolls.push(this.rollDie(sides));
    }
    return rolls;
  },

  parseExpression(expr) {
    // Parse expressions like "2d6+3", "1d20+5", "4d8+2d4+5"
    expr = expr.replace(/\s/g, '').toLowerCase();
    const parts = [];
    let modifier = 0;
    const regex = /([+-]?)(\d+)d(\d+)|([+-]?\d+)/g;
    let match;
    while ((match = regex.exec(expr)) !== null) {
      if (match[2] && match[3]) {
        const sign = match[1] === '-' ? -1 : 1;
        parts.push({ count: parseInt(match[2]) * sign, sides: parseInt(match[3]) });
      } else if (match[4]) {
        modifier += parseInt(match[4]);
      }
    }
    return { parts, modifier };
  },

  rollExpression(expr) {
    const { parts, modifier } = this.parseExpression(expr);
    const allRolls = [];
    let total = modifier;
    for (const part of parts) {
      const count = Math.abs(part.count);
      const sign = part.count >= 0 ? 1 : -1;
      for (let i = 0; i < count; i++) {
        const roll = this.rollDie(part.sides);
        allRolls.push(roll * sign);
        total += roll * sign;
      }
    }
    return { rolls: allRolls, total, modifier };
  },

  rollFromBuilder() {
    const count = parseInt(document.getElementById('dice-count').value) || 1;
    const sides = parseInt(document.getElementById('dice-type').value) || 20;
    const mod = parseInt(document.getElementById('dice-modifier').value) || 0;
    const advantage = document.getElementById('dice-advantage').checked;
    const disadvantage = document.getElementById('dice-disadvantage').checked;
    const isSecret = document.getElementById('dice-secret').checked;

    if (advantage || disadvantage) {
      this.rollAdvantage(sides, mod, disadvantage, isSecret);
    } else {
      const expr = `${count}d${sides}${mod !== 0 ? (mod > 0 ? '+' + mod : mod) : ''}`;
      this.rollAndSend(count, sides, mod, expr, 'manual', isSecret);
    }
  },

  rollAdvantage(sides, mod, isDisadvantage, isSecret) {
    const roll1 = this.rollDie(sides);
    const roll2 = this.rollDie(sides);
    const chosen = isDisadvantage ? Math.min(roll1, roll2) : Math.max(roll1, roll2);
    const total = chosen + mod;
    const type = isDisadvantage ? 'Utrudnienie' : 'Przewaga';
    const expr = `1d${sides}${mod !== 0 ? (mod > 0 ? '+' + mod : mod) : ''} (${type})`;

    this.displayResult(expr, [roll1, roll2], total, type, sides);
    
    if (App.socket && App.currentCampaign) {
      App.socket.emit('dice-roll', {
        expression: expr,
        rolls: [roll1, roll2],
        total,
        rollType: type,
        isSecret,
        ...this.diceSpeakPayload()
      });
    }
  },

  rollAndSend(count, sides, mod, expr, rollType, isSecret) {
    const rolls = this.rollMultiple(count, sides);
    const total = rolls.reduce((a, b) => a + b, 0) + mod;

    this.displayResult(expr, rolls, total, rollType, sides);

    if (App.socket && App.currentCampaign) {
      App.socket.emit('dice-roll', {
        expression: expr,
        rolls,
        total,
        rollType: rollType || 'manual',
        isSecret: isSecret || false,
        ...this.diceSpeakPayload()
      });
    }
  },

  rollCustomExpression() {
    const expr = document.getElementById('dice-custom-expr').value.trim();
    if (!expr) return;
    const isSecret = document.getElementById('dice-secret').checked;
    const result = this.rollExpression(expr);
    this.displayResult(expr, result.rolls, result.total, 'custom');

    if (App.socket && App.currentCampaign) {
      App.socket.emit('dice-roll', {
        expression: expr,
        rolls: result.rolls,
        total: result.total,
        rollType: 'custom',
        isSecret,
        ...this.diceSpeakPayload()
      });
    }
  },

  parseDieSidesFromRoll(expr, rolls, fallbackSides) {
    const list = [];
    const regex = /(\d+)d(\d+)/gi;
    let match;
    while ((match = regex.exec(expr))) {
      const count = parseInt(match[1], 10);
      const dieSides = parseInt(match[2], 10);
      for (let i = 0; i < count; i++) list.push(dieSides);
    }
    if (list.length >= rolls.length) return list.slice(0, rolls.length);
    const fb = fallbackSides || 20;
    while (list.length < rolls.length) list.push(fb);
    return list.length ? list : rolls.map(() => fb);
  },

  shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  SLOT_ITEM_HEIGHT: 56,

  buildReelItems(sides, finalValue) {
    const items = [];
    const cycles = 4 + Math.floor(Math.random() * 2);
    for (let c = 0; c < cycles - 1; c++) {
      const cycle = Array.from({ length: sides }, (_, i) => i + 1);
      this.shuffleArray(cycle);
      items.push(...cycle);
    }
    const tail = 8 + Math.floor(Math.random() * sides);
    for (let i = 0; i < tail; i++) {
      items.push(Math.floor(Math.random() * sides) + 1);
    }
    items.push(finalValue);
    return items;
  },

  buildSlotReel(sides, finalValue) {
    const clamped = Math.max(1, Math.min(sides, finalValue || 1));
    const items = this.buildReelItems(sides, clamped);
    const targetIndex = items.length - 1;

    const reel = document.createElement('div');
    reel.className = `slot-machine-reel die-d${sides}`;
    reel.innerHTML = `
      <div class="slot-reel-label">d${sides}</div>
      <div class="slot-reel-window">
        <div class="slot-reel-strip"></div>
        <div class="slot-reel-marker" aria-hidden="true"></div>
      </div>
    `;

    const strip = reel.querySelector('.slot-reel-strip');
    strip.innerHTML = items.map((n) =>
      `<div class="slot-reel-item">${n}</div>`
    ).join('');

    return {
      reel,
      strip,
      targetY: targetIndex * this.SLOT_ITEM_HEIGHT,
      finalValue: clamped
    };
  },

  getSlotAnimationTiming(rollCount) {
    const count = Math.max(1, rollCount || 1);
    const spinMs = Math.min(2800, 1800 + count * 160);
    const staggerMs = 140;
    const totalMs = spinMs + (count - 1) * staggerMs + 120;
    return { spinMs, staggerMs, totalMs };
  },

  startDiceAnimation(rolls, sidesList) {
    const stage = document.getElementById('dice-animation');
    if (!stage) return 0;

    clearTimeout(this._slotFinishTimer);
    stage.innerHTML = '';
    stage.classList.add('is-rolling');
    stage.setAttribute('aria-hidden', 'false');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const machine = document.createElement('div');
      machine.className = 'slot-machine slot-machine-static';
      rolls.forEach((finalVal, i) => {
        const s = sidesList[i] ?? sidesList[sidesList.length - 1] ?? 20;
        const { reel } = this.buildSlotReel(s, finalVal);
        reel.classList.add('is-stopped');
        const strip = reel.querySelector('.slot-reel-strip');
        if (strip) {
          strip.style.transform = `translateY(-${(strip.children.length - 1) * this.SLOT_ITEM_HEIGHT}px)`;
        }
        machine.appendChild(reel);
      });
      stage.appendChild(machine);
      return 0;
    }

    const machine = document.createElement('div');
    machine.className = 'slot-machine is-spinning';
    const timing = this.getSlotAnimationTiming(rolls.length);

    this._slotReels = rolls.map((finalVal, i) => {
      const s = sidesList[i] ?? sidesList[sidesList.length - 1] ?? 20;
      const built = this.buildSlotReel(s, finalVal);
      machine.appendChild(built.reel);
      return built;
    });
    stage.appendChild(machine);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._slotReels.forEach(({ strip, targetY }, idx) => {
          const delay = idx * timing.staggerMs;
          const dur = timing.spinMs - delay * 0.35;
          strip.style.transition = `transform ${dur}ms cubic-bezier(0.08, 0.82, 0.12, 1) ${delay}ms`;
          strip.style.transform = `translateY(-${targetY}px)`;
        });
      });
    });

    return timing.totalMs;
  },

  stopDiceAnimation(rolls) {
    clearTimeout(this._slotFinishTimer);
    const stage = document.getElementById('dice-animation');
    if (!stage) return;

    const machine = stage.querySelector('.slot-machine');
    if (machine) machine.classList.remove('is-spinning');

    if (this._slotReels) {
      this._slotReels.forEach(({ reel, strip, targetY, finalValue }, i) => {
        strip.style.transition = 'none';
        strip.style.transform = `translateY(-${targetY}px)`;
        const lastItem = strip.querySelector('.slot-reel-item:last-child');
        if (lastItem) lastItem.textContent = rolls[i] ?? finalValue ?? rolls[0];
        reel.classList.add('is-stopped');
      });
    }

    stage.classList.remove('is-rolling');
    this._slotFinishTimer = setTimeout(() => {
      stage.innerHTML = '';
      stage.setAttribute('aria-hidden', 'true');
      this._slotReels = null;
    }, 650);
  },

  displayResult(expr, rolls, total, rollType, sides) {
    const resultEl = document.getElementById('dice-result-display');
    const textEl = document.getElementById('dice-result-text');
    if (!resultEl || !textEl) return;

    const sidesList = this.parseDieSidesFromRoll(expr, rolls, sides);
    const duration = this.startDiceAnimation(rolls, sidesList) || 0;
    const waitMs = duration > 0 ? duration : 0;

    resultEl.className = 'dice-result is-rolling';
    textEl.classList.add('is-hidden');

    setTimeout(() => {
      this.stopDiceAnimation(rolls);

      resultEl.classList.remove('is-rolling');
      resultEl.classList.remove('nat20', 'nat1');

      const mainSides = sidesList[0] || sides || 20;
      if (mainSides === 20 && rolls.length >= 1) {
        const mainRoll = rollType === 'Przewaga' ? Math.max(...rolls)
          : rollType === 'Utrudnienie' ? Math.min(...rolls) : rolls[0];
        if (mainRoll === 20) resultEl.classList.add('nat20');
        else if (mainRoll === 1) resultEl.classList.add('nat1');
      }

      textEl.classList.remove('is-hidden');
      textEl.innerHTML = `
        <div class="result-expression">${escapeHtml(expr)}</div>
        <div class="result-rolls">[${rolls.join(', ')}]</div>
        <div class="result-total">${total}</div>
        ${rollType ? `<div class="result-type">${escapeHtml(rollType)}</div>` : ''}
      `;
    }, waitMs);
  },

  rollAbilityCheck(ability) {
    const char = Characters.activeCharacter;
    if (!char) return;
    this.rollForCharacter(char, 'ability', { ability });
  },

  rollSavingThrow(ability, charOverride) {
    const char = charOverride || Characters.activeCharacter;
    if (!char) {
      showToast('Wybierz postać', 'warning');
      return;
    }
    this.rollForCharacter(char, 'save', { ability });
  },

  rollSkillCheck(skill) {
    const char = Characters.activeCharacter;
    if (!char) return;
    this.rollForCharacter(char, 'skill', { skill });
  },

  rollForCharacter(char, type, payload = {}) {
    if (!char) return;
    switch (type) {
      case 'ability':
        return this._rollAbility(char, payload.ability);
      case 'save':
        return this._rollSave(char, payload.ability);
      case 'skill':
        return this._rollSkill(char, payload.skill);
      case 'death':
        return this.rollDeathSave(char);
      case 'weapon-attack':
        return this.rollWeaponAttack(char, payload.weapon);
      case 'weapon-damage':
        return this.rollWeaponDamage(char, payload.weapon);
      case 'spell':
        return this.rollSpell(char, payload.spell, payload.mode);
      default:
        return null;
    }
  },

  getCharacterSpells(char) {
    return DndSpells.parseSpellsKnown(char);
  },

  rollSpellFlow() {
    const char = Characters.activeCharacter;
    if (!char) {
      showToast('Wybierz postać w panelu Postacie', 'warning');
      return;
    }
    const spells = this.getCharacterSpells(char);
    if (!spells.length) {
      showToast('Dodaj czary na karcie postaci (sekcja Czary)', 'warning');
      return;
    }
    if (spells.length === 1) {
      this.showSpellRollPicker(char, spells[0]);
      return;
    }
    this.showSpellPicker(char, (spell) => this.showSpellRollPicker(char, spell));
  },

  showSpellPicker(char, onPick) {
    const spells = this.getCharacterSpells(char);
    const rows = spells.map((sp) => {
      const sid = sp.id || sp.templateId || '';
      const lvl = DndSpells.levelLabel(sp.level ?? 0);
      return `<button type="button" class="spell-pick-btn" data-spell-id="${escapeHtml(sid)}">
        <span class="spell-pick-name">${escapeHtml(sp.name)}</span>
        <span class="spell-pick-meta">${escapeHtml(lvl)} · ${escapeHtml(DndSpells.SCHOOLS_PL[sp.school] || '')}</span>
      </button>`;
    }).join('');
    showGenericModal(`🔮 Wybierz czar — ${escapeHtml(char.name)}`, `
      <div class="spell-picker-list">${rows}</div>
    `);
    document.getElementById('generic-modal-body').querySelectorAll('.spell-pick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const spell = Characters.getSpellById(char, btn.dataset.spellId);
        if (!spell) return;
        closeModal('generic-modal');
        onPick(spell);
      });
    });
  },

  showSpellRollPicker(char, spell) {
    const sp = DndSpells.normalizeSpell(spell);
    const dc = char.spell_save_dc || DndSpells.getSpellSaveDc(char);
    const atk = char.spell_attack_bonus ?? DndSpells.getSpellAttackBonus(char);
    const btns = [];
    if (sp.attackType === 'attack') {
      btns.push(`<button type="button" class="btn btn-primary" id="spell-roll-atk">🎯 Atak czarem ${modString(atk)}</button>`);
    }
    if (sp.attackType === 'save') {
      btns.push(`<button type="button" class="btn btn-secondary" id="spell-roll-save">🛡️ ST ${ABILITY_SHORT[sp.saveAbility] || '?'} DC ${dc} + obrażenia</button>`);
    }
    if (sp.damage && sp.attackType !== 'save') {
      btns.push(`<button type="button" class="btn btn-secondary" id="spell-roll-dmg">💥 Obrażenia ${escapeHtml(sp.damage)}</button>`);
    }
    if (sp.healing || sp.attackType === 'heal') {
      btns.push(`<button type="button" class="btn btn-success" id="spell-roll-heal">💚 Leczenie ${escapeHtml(sp.healing || '')}</button>`);
    }
    if (!btns.length) {
      btns.push(`<button type="button" class="btn btn-secondary" id="spell-roll-note">📢 Ogłoś użycie (bez rzutu)</button>`);
    }
    showGenericModal(`🔮 ${escapeHtml(sp.name)}`, `
      <p class="spell-roll-desc">${escapeHtml(sp.description || '')}</p>
      <p class="spell-roll-meta">${escapeHtml(sp.castingTime || '')} · ${escapeHtml(sp.range || '')}${sp.concentration ? ' · koncentracja' : ''}</p>
      <div class="spell-roll-actions">${btns.join('')}</div>
    `);
    document.getElementById('spell-roll-atk')?.addEventListener('click', () => {
      closeModal('generic-modal');
      this.rollSpell(char, sp, 'attack');
    });
    document.getElementById('spell-roll-save')?.addEventListener('click', () => {
      closeModal('generic-modal');
      this.rollSpell(char, sp, 'save');
    });
    document.getElementById('spell-roll-dmg')?.addEventListener('click', () => {
      closeModal('generic-modal');
      this.rollSpell(char, sp, 'damage');
    });
    document.getElementById('spell-roll-heal')?.addEventListener('click', () => {
      closeModal('generic-modal');
      this.rollSpell(char, sp, 'heal');
    });
    document.getElementById('spell-roll-note')?.addEventListener('click', () => {
      closeModal('generic-modal');
      this._emitRoll(char, `${escapeHtml(sp.name)} (użyty)`, [], 0, `Czar: ${sp.name}`, 20);
    });
  },

  rollSpell(char, spell, mode) {
    const sp = DndSpells.normalizeSpell(spell);
    const isSecret = document.getElementById('dice-secret')?.checked;
    const atkBonus = char.spell_attack_bonus ?? DndSpells.getSpellAttackBonus(char);
    const dc = char.spell_save_dc || DndSpells.getSpellSaveDc(char);
    const spellAb = DndSpells.getSpellcastingAbility(char);
    const mod = spellAb ? calcModifier(char[spellAb] || 10) : 0;

    if (mode === 'attack') {
      const advantage = document.getElementById('dice-advantage')?.checked;
      const disadvantage = document.getElementById('dice-disadvantage')?.checked;
      if (advantage || disadvantage) {
        const roll1 = this.rollDie(20);
        const roll2 = this.rollDie(20);
        const chosen = disadvantage ? Math.min(roll1, roll2) : Math.max(roll1, roll2);
        const total = chosen + atkBonus;
        const rollType = disadvantage ? 'Utrudnienie' : 'Przewaga';
        const expr = `1d20${modString(atkBonus)} (${sp.name}, atak czarem, ${rollType})`;
        return this._emitRoll(char, expr, [roll1, roll2], total, `Atak czarem: ${sp.name}`, 20, isSecret);
      }
      const roll = this.rollDie(20);
      const total = roll + atkBonus;
      const expr = `1d20${modString(atkBonus)} (${sp.name}, atak czarem)`;
      return this._emitRoll(char, expr, [roll], total, `Atak czarem: ${sp.name}`, 20, isSecret);
    }

    if (mode === 'save') {
      const dmg = sp.damage ? DndRules.rollDamageExpr(sp.damage) : { rolls: [], total: 0 };
      const saveAb = ABILITY_SHORT[sp.saveAbility] || sp.saveAbility || '?';
      const type = this.formatDamageType(sp.damageType);
      const expr = `ST ${saveAb} DC ${dc} · ${sp.damage || '—'}${type ? ` (${type})` : ''} = [${dmg.rolls.join(', ')}] → ${dmg.total}`;
      return this._emitRoll(char, expr, dmg.rolls.length ? dmg.rolls : [dc], dmg.total || dc, `Czar: ${sp.name}`, 20, isSecret);
    }

    if (mode === 'damage' && sp.damage) {
      const dmg = DndRules.rollDamageExpr(sp.damage);
      const type = this.formatDamageType(sp.damageType);
      const expr = `${sp.damage}${type ? ` (${type})` : ''} · ${sp.name}`;
      const sides = this.parseDieSidesFromRoll(sp.damage, dmg.rolls)[0];
      return this._emitRoll(char, expr, dmg.rolls, dmg.total, `Obrażenia: ${sp.name}`, sides, isSecret);
    }

    if (mode === 'heal') {
      const healExpr = sp.healing || '1d8';
      const heal = DndRules.rollDamageExpr(healExpr);
      const total = heal.total + mod;
      const expr = `${healExpr}${modString(mod)} (${sp.name})`;
      return this._emitRoll(char, expr, heal.rolls, total, `Leczenie: ${sp.name}`, 8, isSecret);
    }

    return null;
  },

  _emitRoll(char, expr, rolls, total, rollType, sides = 20, isSecret = false) {
    this.displayResult(expr, rolls, total, rollType, sides);
    this.displaySheetRoll(expr, rolls, total, rollType);
    if (App.socket && App.currentCampaign) {
      App.socket.emit('dice-roll', {
        expression: expr,
        rolls,
        total,
        rollType,
        isSecret: !!isSecret,
        characterName: char.name || ''
      });
    }
    return { expr, rolls, total, rollType };
  },

  formatDamageType(type) {
    if (!type) return '';
    return DAMAGE_TYPE_PL[type] || type;
  },

  getCharacterWeapons(char) {
    return Characters.parseJSON(char?.weapons);
  },

  weaponAttackBonus(char, weapon) {
    const ab = DndRules.attackAbility(char, weapon);
    const mod = calcModifier(char[ab]);
    const pb = weapon.isProficient !== false ? (char.proficiency_bonus || 2) : 0;
    return mod + pb + (weapon.attackBonus || 0);
  },

  weaponDamageBonus(char, weapon) {
    const ab = DndRules.attackAbility(char, weapon);
    return calcModifier(char[ab]) + (weapon.damageBonus || 0);
  },

  rollAttackFlow() {
    const char = Characters.activeCharacter;
    if (!char) {
      showToast('Wybierz postać w panelu Postacie', 'warning');
      return;
    }
    const weapons = this.getCharacterWeapons(char);
    if (!weapons.length) {
      showToast('Dodaj broń na karcie postaci (sekcja Broń)', 'warning');
      return;
    }
    if (weapons.length === 1) {
      this.executeWeaponAttack(char, weapons[0]);
      return;
    }
    this.showWeaponPicker(char, (weapon) => this.executeWeaponAttack(char, weapon));
  },

  showWeaponPicker(char, onPick) {
    const weapons = this.getCharacterWeapons(char);
    const rows = weapons.map((w) => {
      const wid = w.id || w.templateId || '';
      const atk = this.weaponAttackBonus(char, w);
      const dmg = this.weaponDamageBonus(char, w);
      const typeLabel = this.formatDamageType(w.damageType);
      return `<button type="button" class="weapon-pick-btn" data-weapon-id="${escapeHtml(wid)}">
        <span class="weapon-pick-name">${escapeHtml(w.name)}</span>
        <span class="weapon-pick-meta">Atak ${modString(atk)} · ${escapeHtml(w.damage || '1d4')}${modString(dmg)} ${escapeHtml(typeLabel)}</span>
      </button>`;
    }).join('');

    showGenericModal(`⚔ Którą broń używasz?`, `
      <p class="info-text">Postać: <strong>${escapeHtml(char.name)}</strong></p>
      <div class="weapon-picker-list">${rows}</div>
    `);

    const body = document.getElementById('generic-modal-body');
    body.querySelectorAll('.weapon-pick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const weapon = Characters.getWeaponById(char, btn.dataset.weaponId);
        if (!weapon) return;
        closeModal('generic-modal');
        onPick(weapon);
      });
    });
  },

  executeWeaponAttack(char, weapon, options = {}) {
    const advantage = document.getElementById('dice-advantage')?.checked;
    const disadvantage = document.getElementById('dice-disadvantage')?.checked;
    const isSecret = document.getElementById('dice-secret')?.checked;

    const result = (advantage || disadvantage)
      ? this.rollWeaponAttackAdv(char, weapon, disadvantage, isSecret, options.mapContext)
      : this.rollWeaponAttack(char, weapon, isSecret, options.mapContext);

    this.showAttackFollowUp(char, weapon, result, isSecret, options);
  },

  showAttackFollowUp(char, weapon, attackResult, isSecret, options = {}) {
    const mapCtx = options.mapContext;
    const mainRoll = attackResult.rollType === 'Utrudnienie'
      ? Math.min(...attackResult.rolls)
      : attackResult.rollType === 'Przewaga'
        ? Math.max(...attackResult.rolls)
        : attackResult.rolls[0];
    const isCrit = mainRoll === 20;
    const isFumble = mainRoll === 1;
    const dmgBonus = this.weaponDamageBonus(char, weapon);
    const typeLabel = this.formatDamageType(weapon.damageType);

    const statusLine = isCrit
      ? '<p class="attack-status attack-crit">Krytyczne trafienie! Podwój kości obrażeń.</p>'
      : isFumble
        ? '<p class="attack-status attack-fumble">Krytyczna porażka (1 na k20).</p>'
        : '<p class="attack-status">Jeśli trafiłeś, rzuć obrażenia wybraną bronią.</p>';

    showGenericModal(`Atak: ${escapeHtml(weapon.name)}`, `
      <div class="attack-result-summary">
        <div class="attack-result-total">${attackResult.total}</div>
        <div class="attack-result-detail">${escapeHtml(attackResult.expr)}</div>
        <div class="attack-result-rolls">[${attackResult.rolls.join(', ')}]</div>
      </div>
      ${statusLine}
      <div class="attack-followup-actions">
        <button type="button" class="btn btn-primary" id="btn-attack-roll-damage">
          💥 Obrażenia: ${escapeHtml(weapon.damage || '1d4')}${modString(dmgBonus)} ${escapeHtml(typeLabel)}
        </button>
        <button type="button" class="btn btn-secondary" id="btn-attack-close">Zamknij</button>
      </div>
    `);

    document.getElementById('btn-attack-roll-damage')?.addEventListener('click', () => {
      closeModal('generic-modal');
      this.rollWeaponDamage(char, weapon, isSecret, isCrit, mapCtx);
    });
    document.getElementById('btn-attack-close')?.addEventListener('click', () => {
      closeModal('generic-modal');
    });
  },

  displaySheetRoll(expr, rolls, total, rollType) {
    const el = document.getElementById('sheet-last-roll');
    if (!el) return;
    el.classList.remove('hidden');
    el.innerHTML = `
      <span class="sheet-roll-type">${escapeHtml(rollType || '')}</span>
      <span class="sheet-roll-expr">${escapeHtml(expr)}</span>
      <span class="sheet-roll-total">${total}</span>
      <span class="sheet-roll-rolls">[${rolls.join(', ')}]</span>
    `;
  },

  _rollAbility(char, ability) {
    const mod = calcModifier(char[ability]);
    const label = `Test ${ABILITY_NAMES_PL[ability]}`;
    const expr = `1d20${modString(mod)} (${label})`;
    const roll = this.rollDie(20);
    const total = roll + mod;
    return this._emitRoll(char, expr, [roll], total, label, 20);
  },

  _rollSave(char, ability) {
    const mod = calcModifier(char[ability]);
    const saveProficiencies = Characters.parseJSON(char.saving_throw_proficiencies);
    const prof = saveProficiencies.includes(ability) ? (char.proficiency_bonus || 2) : 0;
    const totalMod = mod + prof;
    const label = `Rzut obr. ${ABILITY_NAMES_PL[ability]}`;
    const expr = `1d20${modString(totalMod)} (${label})`;
    const roll = this.rollDie(20);
    const total = roll + totalMod;
    return this._emitRoll(char, expr, [roll], total, label, 20);
  },

  _rollSkill(char, skill) {
    const ability = DND_SKILLS[skill];
    const mod = calcModifier(char[ability]);
    const proficiencies = Characters.parseJSON(char.skill_proficiencies);
    const expertises = Characters.parseJSON(char.skill_expertises);
    const isExpert = expertises.includes(skill);
    const isProf = proficiencies.includes(skill);
    const pb = char.proficiency_bonus || 2;
    const bonus = mod + (isExpert ? pb * 2 : isProf ? pb : 0);
    const skillName = DND_SKILL_NAMES_PL[skill] || skill;
    const expr = `1d20${modString(bonus)} (${skillName})`;
    const roll = this.rollDie(20);
    const total = roll + bonus;
    return this._emitRoll(char, expr, [roll], total, skillName, 20);
  },

  async rollDeathSave(char) {
    if (!char?.id) return;
    if (this._deathSaveRolling) return;
    this._deathSaveRolling = true;

    const liveChar = Characters.sheetCharacter?.id === char.id
      ? Characters.sheetCharacter
      : Characters.activeCharacter?.id === char.id
        ? Characters.activeCharacter
        : char;
    const roll = this.rollDie(20);
    let { successes, failures } = Characters.getDeathSaveCounts(liveChar);
    let note = '';

    if (roll === 20) {
      successes = Math.min(3, successes + 2);
      note = 'Krytyk! +2 sukcesy';
    } else if (roll === 1) {
      failures = Math.min(3, failures + 2);
      note = 'Krytyk! +2 porażki';
    } else if (roll >= 10) {
      successes = Math.min(3, successes + 1);
      note = 'Sukces (≥10)';
    } else {
      failures = Math.min(3, failures + 1);
      note = 'Porażka (<10)';
    }

    let stabilized = false;
    if (successes >= 3) {
      stabilized = true;
      successes = 0;
      failures = 0;
      note += note ? '; stabilizacja — pipy wyzerowane' : 'Stabilizacja — pipy wyzerowane';
    }

    const expr = `1d20 = ${roll} (Rzut ratunkowy${note ? ', ' + note : ''})`;
    this._emitRoll(char, expr, [roll], roll, 'Rzut ratunkowy', 20);

    try {
      const updated = await apiFetch(`/characters/${char.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          death_save_successes: successes,
          death_save_failures: failures
        })
      });
      Characters.applyDeathSaveUpdate(char.id, updated);
      if (stabilized) showToast('3 sukcesy — postać stabilna! Rzuty wyzerowane.', 'success');
      else if (failures >= 3) showToast('3 porażki — śmierć postaci', 'error');
      return updated;
    } catch (err) {
      showToast(err.message, 'error');
      return null;
    } finally {
      this._deathSaveRolling = false;
    }
  },

  rollWeaponAttack(char, weapon, isSecret = false, mapContext) {
    if (!weapon) return null;
    const totalMod = this.weaponAttackBonus(char, weapon);
    const targetSuffix = mapContext?.targetName ? ` → ${mapContext.targetName}` : '';
    const label = `Atak: ${weapon.name}${targetSuffix}`;
    const expr = `1d20${modString(totalMod)} (${label})`;
    const roll = this.rollDie(20);
    const total = roll + totalMod;
    return this._emitRoll(char, expr, [roll], total, label, 20, isSecret);
  },

  rollWeaponAttackAdv(char, weapon, isDisadvantage, isSecret = false, mapContext) {
    if (!weapon) return null;
    const totalMod = this.weaponAttackBonus(char, weapon);
    const roll1 = this.rollDie(20);
    const roll2 = this.rollDie(20);
    const chosen = isDisadvantage ? Math.min(roll1, roll2) : Math.max(roll1, roll2);
    const total = chosen + totalMod;
    const rollType = isDisadvantage ? 'Utrudnienie' : 'Przewaga';
    const targetSuffix = mapContext?.targetName ? ` → ${mapContext.targetName}` : '';
    const label = `Atak: ${weapon.name}${targetSuffix}`;
    const expr = `1d20${modString(totalMod)} (${label}, ${rollType})`;
    return this._emitRoll(char, expr, [roll1, roll2], total, rollType, 20, isSecret);
  },

  rollWeaponDamage(char, weapon, isSecret = false, isCrit = false, mapContext) {
    if (!weapon) return null;
    const mod = this.weaponDamageBonus(char, weapon);
    let damageExpr = weapon.damage || '1d4';
    if (isCrit) {
      damageExpr = damageExpr.replace(/(\d+)d(\d+)/gi, (_, n, s) => `${parseInt(n, 10) * 2}d${s}`);
    }
    const dmg = DndRules.rollDamageExpr(damageExpr);
    const total = dmg.total + mod;
    const type = this.formatDamageType(weapon.damageType);
    const label = isCrit ? `Obrażenia (krytyk): ${weapon.name}` : `Obrażenia: ${weapon.name}`;
    const expr = `${damageExpr}${modString(mod)}${type ? ` (${type})` : ''}`;
    const rolls = [...dmg.rolls];
    const sides = this.parseDieSidesFromRoll(damageExpr, rolls)[0];
    const result = this._emitRoll(char, expr, rolls, total, label, sides, isSecret);
    if (mapContext?.targetTokenId && typeof MapCombat !== 'undefined') {
      MapCombat.applyDamageToTarget(mapContext.targetTokenId, total);
    }
    return result;
  },

  updateAbilityButtons(char) {
    const attackBtn = document.getElementById('btn-roll-attack');
    const attackHint = document.getElementById('attack-weapon-hint');
    if (!char) {
      document.getElementById('char-select-info').style.display = '';
      if (attackBtn) {
        attackBtn.disabled = true;
        attackBtn.textContent = '⚔ Atak';
      }
      if (attackHint) {
        attackHint.style.display = '';
        attackHint.textContent = 'Wybierz postać i dodaj broń na karcie, aby atakować.';
      }
      return;
    }
    document.getElementById('char-select-info').style.display = 'none';

    const weapons = this.getCharacterWeapons(char);
    if (attackBtn) {
      attackBtn.disabled = weapons.length === 0;
      attackBtn.textContent = weapons.length === 1
        ? `⚔ Atak: ${weapons[0].name}`
        : weapons.length > 1
          ? `⚔ Atak (wybierz broń · ${weapons.length})`
          : '⚔ Atak';
    }
    if (attackHint) {
      if (weapons.length) {
        attackHint.style.display = 'none';
      } else {
        attackHint.style.display = '';
        attackHint.textContent = 'Brak broni — dodaj w sekcji Broń na karcie postaci.';
      }
    }

    this.updateSpellRollUI(null);

    // Enable ability check buttons
    document.querySelectorAll('.btn-ability').forEach(btn => {
      btn.disabled = false;
      const ab = btn.dataset.ability;
      const mod = calcModifier(char[ab]);
      btn.textContent = `${ABILITY_NAMES_PL[ab]} (${modString(mod)})`;
    });

    // Enable saving throw buttons
    const saveProficiencies = Characters.parseJSON(char.saving_throw_proficiencies);
    document.querySelectorAll('.btn-save').forEach(btn => {
      btn.disabled = false;
      const ab = btn.dataset.save;
      const mod = calcModifier(char[ab]);
      const prof = saveProficiencies.includes(ab) ? char.proficiency_bonus : 0;
      btn.textContent = `${ABILITY_SHORT[ab]} ${modString(mod + prof)}${prof ? ' ●' : ''}`;
    });

    // Build skill buttons
    const skillContainer = document.getElementById('skill-roll-buttons');
    const proficiencies = Characters.parseJSON(char.skill_proficiencies);
    const expertises = Characters.parseJSON(char.skill_expertises);
    skillContainer.innerHTML = Object.entries(DND_SKILLS).map(([skill, ab]) => {
      const mod = calcModifier(char[ab]);
      const isExpert = expertises.includes(skill);
      const isProf = proficiencies.includes(skill);
      const bonus = mod + (isExpert ? char.proficiency_bonus * 2 : isProf ? char.proficiency_bonus : 0);
      const marker = isExpert ? ' ◆' : isProf ? ' ●' : '';
      return `<button class="btn-skill" data-skill="${skill}">${DND_SKILL_NAMES_PL[skill] || skill} (${modString(bonus)}${marker})</button>`;
    }).join('');

    skillContainer.querySelectorAll('.btn-skill').forEach(btn => {
      btn.addEventListener('click', () => this.rollSkillCheck(btn.dataset.skill));
    });

    this.updateSpellRollUI(char);
  },

  updateSpellRollUI(char) {
    const btn = document.getElementById('btn-roll-spell');
    const hint = document.getElementById('spell-roll-hint');
    const list = document.getElementById('spell-quick-list');
    if (!btn) return;

    if (!char) {
      btn.disabled = true;
      btn.textContent = '🔮 Rzuć czar';
      if (hint) {
        hint.style.display = '';
        hint.textContent = 'Wybierz postać z czarami na karcie.';
      }
      if (list) list.innerHTML = '';
      return;
    }

    const spells = this.getCharacterSpells(char);
    const hasCasting = !!DndSpells.getSpellcastingAbility(char);
    btn.disabled = !spells.length && !hasCasting;
    btn.textContent = spells.length === 1
      ? `🔮 ${spells[0].name}`
      : spells.length > 1
        ? `🔮 Czar (${spells.length})`
        : '🔮 Rzuć czar';

    if (hint) {
      if (spells.length) hint.style.display = 'none';
      else {
        hint.style.display = '';
        hint.textContent = hasCasting
          ? 'Dodaj czary w sekcji Czary na karcie postaci.'
          : 'Ta klasa nie ma standardowej listy czarów.';
      }
    }

    if (list) {
      list.innerHTML = spells.slice(0, 8).map((sp) => {
        const sid = sp.id || sp.templateId || '';
        return `<button type="button" class="btn btn-xs btn-spell-quick" data-spell-quick="${escapeHtml(sid)}">${escapeHtml(sp.name)}</button>`;
      }).join('');
      list.querySelectorAll('.btn-spell-quick').forEach((b) => {
        b.addEventListener('click', () => {
          const spell = Characters.getSpellById(char, b.dataset.spellQuick);
          if (spell) this.showSpellRollPicker(char, spell);
        });
      });
    }
  },

  async loadDiceLog() {
    if (!App.currentCampaign) return;
    try {
      const log = await apiFetch(`/campaigns/${App.currentCampaign.id}/dice-log`);
      const logContainer = document.getElementById('dice-log');
      if (!logContainer) return;
      logContainer.innerHTML = '';
      log.forEach(entry => {
        this.addToLog({
          username: entry.username,
          expression: entry.roll_expression,
          rolls: typeof entry.individual_rolls === 'string' ? JSON.parse(entry.individual_rolls) : entry.individual_rolls,
          total: entry.total,
          rollType: entry.roll_type,
          timestamp: entry.created_at
        });
      });
    } catch (err) {
      console.error('Dice log load failed', err);
    }
  },

  updateRollTemplates(char) {
    const section = document.getElementById('roll-templates-section');
    const list = document.getElementById('roll-templates-list');
    if (!section || !list) return;
    if (!char) {
      section.classList.add('hidden');
      return;
    }
    const templates = Characters.parseJSON(char.roll_templates);
    if (!templates.length) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    list.innerHTML = templates.map(t => {
      const name = t.name || 'Rzut';
      const expr = t.expression || '';
      return `<button type="button" class="btn btn-sm btn-secondary roll-template-btn" data-expr="${escapeHtml(expr)}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
    }).join('');
    list.querySelectorAll('.roll-template-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const expr = btn.dataset.expr;
        const name = btn.dataset.name;
        const result = this.rollExpression(expr);
        this.displayResult(expr, result.rolls, result.total, name);
        if (App.socket && App.currentCampaign) {
          App.socket.emit('dice-roll', {
            expression: expr,
            rolls: result.rolls,
            total: result.total,
            rollType: name,
            characterName: char.name
          });
        }
      });
    });
  },

  addToLog(data) {
    const logContainer = document.getElementById('dice-log');
    const entry = document.createElement('div');
    entry.className = 'dice-log-entry';
    entry.innerHTML = `
      <span class="log-author">${escapeHtml(data.username)}${data.characterName ? ` (${escapeHtml(data.characterName)})` : ''}</span>
      <span class="log-expr">${escapeHtml(data.expression)}</span>
      = <span class="log-result">${data.total}</span>
      [${(data.rolls || []).join(', ')}]
      ${data.isSecret ? '<span style="color:var(--accent-gold);">🤫 Tajny</span>' : ''}
      <br><span class="log-time">${formatTime(data.timestamp || new Date().toISOString())}</span>
    `;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }
};
