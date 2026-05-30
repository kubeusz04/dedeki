// ===== Inspiration tokens (5e) =====
// MG przyznaje, gracz wydaje przed rzutem dla przewagi (advantage).
const Inspiration = {
  _armedForCharId: null,
  _patchedDice: false,

  init() {
    this._patchDice();
  },

  bindSocketEvents(socket) {
    if (!socket) return;
    socket.on('character-inspiration-update', (data) => {
      // Odśwież lokalne dane postaci
      this._applyUpdate(data?.characterId, data?.inspiration);
      // Toast
      if (data?.deltaText) {
        const isMine = this._isMyCharacter(data.characterId);
        if (isMine) showToast(data.deltaText, data.kind || 'success');
      }
      // Re-render UI
      if (typeof PlayerHud !== 'undefined') PlayerHud.render();
      if (typeof Characters !== 'undefined' && Characters.refreshOpenSheetIfMatches) {
        Characters.refreshOpenSheetIfMatches(data?.characterId);
      }
      if (typeof DMPanel !== 'undefined' && DMPanel.refreshInspirationOverview) {
        DMPanel.refreshInspirationOverview();
      }
    });
  },

  _isMyCharacter(charId) {
    if (!charId) return false;
    const c = (typeof Characters !== 'undefined') && (Characters.activeCharacter || Characters.myCampaignCharacter);
    return c && c.id === charId;
  },

  _applyUpdate(charId, inspiration) {
    if (!charId || inspiration == null) return;
    if (typeof Characters === 'undefined') return;
    const val = Math.max(0, parseInt(inspiration, 10) || 0);
    if (Characters.activeCharacter?.id === charId) Characters.activeCharacter.inspiration = val;
    if (Characters.myCampaignCharacter?.id === charId) Characters.myCampaignCharacter.inspiration = val;
    if (Characters.sheetCharacter?.id === charId) Characters.sheetCharacter.inspiration = val;
  },

  // ===== Player actions =====
  isArmedFor(charId) {
    return this._armedForCharId === charId;
  },

  arm(char) {
    if (!char) return;
    if ((char.inspiration || 0) < 1) {
      showToast('Brak inspiracji do wydania', 'warning');
      return;
    }
    this._armedForCharId = char.id;
    showToast('⭐ Inspiracja uzbrojona — następny rzut z przewagą', 'info');
    if (typeof PlayerHud !== 'undefined') PlayerHud.render();
  },

  disarm() {
    if (!this._armedForCharId) return;
    this._armedForCharId = null;
    if (typeof PlayerHud !== 'undefined') PlayerHud.render();
  },

  // Wywoływane na początku każdego rzutu d20 postaci.
  // Zwraca true jeśli inspiracja została wykorzystana (rzut powinien być z przewagą).
  consumeForRoll(char) {
    if (!char || this._armedForCharId !== char.id) return false;
    if ((char.inspiration || 0) < 1) {
      this._armedForCharId = null;
      return false;
    }
    this._armedForCharId = null;
    // Optymistyczna aktualizacja lokalna
    char.inspiration = Math.max(0, (parseInt(char.inspiration, 10) || 0) - 1);
    this._applyUpdate(char.id, char.inspiration);
    if (App.socket) {
      App.socket.emit('inspiration-spend', { characterId: char.id });
    }
    showToast('⭐ Wydano Inspirację — rzut z przewagą!', 'success');
    if (typeof PlayerHud !== 'undefined') PlayerHud.render();
    return true;
  },

  // ===== DM actions =====
  grantOne(charId) {
    App.socket?.emit('inspiration-grant', { characterId: charId, amount: 1 });
  },

  removeOne(charId) {
    App.socket?.emit('inspiration-grant', { characterId: charId, amount: -1 });
  },

  setExact(charId, value) {
    App.socket?.emit('inspiration-set', { characterId: charId, value: Math.max(0, parseInt(value, 10) || 0) });
  },

  grantAll(amount = 1) {
    App.socket?.emit('inspiration-grant-all', { amount: Math.max(1, parseInt(amount, 10) || 1) });
  },

  // ===== Dice patches =====
  _patchDice() {
    if (this._patchedDice) return;
    if (typeof Dice === 'undefined') return;
    const self = this;

    // Helper: ustawia globalny checkbox advantage (used by weapon/spell methods)
    const forceAdvantageCheckbox = () => {
      const adv = document.getElementById('dice-advantage');
      const dis = document.getElementById('dice-disadvantage');
      if (adv) adv.checked = true;
      if (dis) dis.checked = false;
    };

    // ---- _rollAbility ----
    if (typeof Dice._rollAbility === 'function') {
      const orig = Dice._rollAbility.bind(Dice);
      Dice._rollAbility = function(char, ability) {
        if (self.consumeForRoll(char)) {
          const mod = calcModifier(char[ability]);
          const label = `Test ${ABILITY_NAMES_PL[ability]}`;
          const r1 = Dice.rollDie(20);
          const r2 = Dice.rollDie(20);
          const chosen = Math.max(r1, r2);
          const expr = `1d20${modString(mod)} (${label}, ⭐ Inspiracja → przewaga)`;
          return Dice._emitRoll(char, expr, [r1, r2], chosen + mod, label, 20);
        }
        return orig(char, ability);
      };
    }

    // ---- _rollSave ----
    if (typeof Dice._rollSave === 'function') {
      const orig = Dice._rollSave.bind(Dice);
      Dice._rollSave = function(char, ability) {
        if (self.consumeForRoll(char)) {
          const mod = calcModifier(char[ability]);
          const saveProficiencies = Characters.parseJSON(char.saving_throw_proficiencies);
          const prof = saveProficiencies.includes(ability) ? (char.proficiency_bonus || 2) : 0;
          const total = mod + prof;
          const label = `Rzut obronny ${ABILITY_NAMES_PL[ability]}`;
          const r1 = Dice.rollDie(20);
          const r2 = Dice.rollDie(20);
          const chosen = Math.max(r1, r2);
          const expr = `1d20${modString(total)} (${label}, ⭐ Inspiracja → przewaga)`;
          return Dice._emitRoll(char, expr, [r1, r2], chosen + total, label, 20);
        }
        return orig(char, ability);
      };
    }

    // ---- _rollSkill ----
    if (typeof Dice._rollSkill === 'function') {
      const orig = Dice._rollSkill.bind(Dice);
      Dice._rollSkill = function(char, skill) {
        if (self.consumeForRoll(char)) {
          const ability = (typeof DND_SKILLS !== 'undefined') ? DND_SKILLS[skill] : null;
          if (ability) {
            const mod = calcModifier(char[ability]);
            const proficiencies = Characters.parseJSON(char.skill_proficiencies);
            const expertises = Characters.parseJSON(char.skill_expertises);
            const isExpert = expertises.includes(skill);
            const isProf = proficiencies.includes(skill);
            const pb = char.proficiency_bonus || 2;
            const bonus = mod + (isExpert ? pb * 2 : isProf ? pb : 0);
            const skillName = (typeof DND_SKILL_NAMES_PL !== 'undefined' && DND_SKILL_NAMES_PL[skill]) || skill;
            const r1 = Dice.rollDie(20);
            const r2 = Dice.rollDie(20);
            const chosen = Math.max(r1, r2);
            const expr = `1d20${modString(bonus)} (${skillName}, ⭐ Inspiracja → przewaga)`;
            return Dice._emitRoll(char, expr, [r1, r2], chosen + bonus, skillName, 20);
          }
          // fallback: ustaw checkbox i wykonaj oryginalny
          forceAdvantageCheckbox();
        }
        return orig(char, skill);
      };
    }

    // ---- executeWeaponAttack ----
    if (typeof Dice.executeWeaponAttack === 'function') {
      const orig = Dice.executeWeaponAttack.bind(Dice);
      Dice.executeWeaponAttack = function(char, weapon, options = {}) {
        if (self.consumeForRoll(char)) forceAdvantageCheckbox();
        return orig(char, weapon, options);
      };
    }

    // ---- rollSpell (atak czarem) ----
    if (typeof Dice.rollSpell === 'function') {
      const orig = Dice.rollSpell.bind(Dice);
      Dice.rollSpell = function(char, spell, mode) {
        if (mode === 'attack' && self.consumeForRoll(char)) forceAdvantageCheckbox();
        return orig(char, spell, mode);
      };
    }

    this._patchedDice = true;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Inspiration;
}
