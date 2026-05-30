const { geminiJson } = require('./gemini');

const SYSTEM = `Jesteś kreatywnym asystentem Mistrza Gry dla sesji D&D 5e.
Pisz po polsku. Zwracaj WYŁĄCZNIE poprawny JSON (bez markdown).
Dopasuj mechanikę do poziomu mocy (CR) gdy podano. Bądź konkretny i grywalny.`;

function buildUser(type, context) {
  const ctx = context && typeof context === 'object' ? context : {};
  const hint = ctx.hint ? `\nWskazówka MG: ${ctx.hint}` : '';
  const camp = ctx.campaignName ? `\nKampania: ${ctx.campaignName}` : '';

  switch (type) {
    case 'custom_npc':
      return `${camp}${hint}
Wygeneruj NPC lub potwora do kampanii (prosty wpis w panelu MG, nie pełny stat block).
JSON: {"name":"","race":"","description":"","max_hp":10,"armor_class":12,"notes":""}
notes = statystyki SIŁ/DEX/KON/INT/MĄD/CHA, zdolności, ataki (krótko).`;

    case 'bestiary_monster':
      return `${camp}${hint}
Wygeneruj potwora do bestiariusza (D&D 5e stat block).
JSON:
{"name":"","size":"Średni","monster_type":"humanoid","alignment":"neutralny","cr":"1","ac":12,"hp_max":22,"hp_formula":"","speed":"9 m",
"stats":{"str":14,"dex":12,"con":12,"int":10,"wis":10,"cha":8},
"saving_throws":[],"skills":[],"damage_resistances":"","damage_immunities":"","condition_immunities":"","senses":"","languages":"",
"attacks":[{"name":"","kind":"Atak bronią wręcz","toHit":"+4","range":"5 ft","damage":"1d8+2","damageType":"sieczne","special":""}],
"traits":[{"name":"","desc":""}],"actions":[{"name":"","desc":""}],"reactions":[],"legendary_actions":[],"notes":""}
monster_type: aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead`;

    case 'merchant':
      return `${camp}${hint}
Wygeneruj handlarza / sklep dla kampanii fantasy.
JSON: {"name":"","description":"","flavor":"","suggestedItems":[{"name":"","category":"gear","priceCopper":50,"note":""}]}
category: weapon|armor|shield|gear|potion|wondrous|scroll|tool. flavor = kwestia powitalna w czacie (1-2 zdania). 3-5 suggestedItems.`;

    case 'loot_table':
      return `${camp}${hint}
Wygeneruj tabelę łupu (nazwa, opis, wpisy z wagą).
JSON: {"name":"","description":"","entries":[{"weight":1,"itemName":"","category":"gear","note":""}]}
5-8 entries, category jak u handlarza.`;

    case 'custom_item':
      return `${camp}${hint}
Wygeneruj magiczny lub unikalny przedmiot D&D 5e.
JSON: {"name":"","category":"weapon","priceCopper":100,"weight":2,"description":"","data":{}}
category: weapon|armor|shield|gear|potion|wondrous|scroll|tool.
Dla weapon data: damage, damageType, ability, range, properties[].
Dla armor: armorClass, dexBonusMax, stealthDisadvantage.
Dla shield: acBonus.`;

    case 'npc_generator':
      return `${camp}${hint}
Wygeneruj losowego NPC spotkanego przez drużynę (nie boss).
JSON: {"name":"","raceLabel":"Człowiek","gender":"male","age":35,"profession":"","appearance":"","trait":"","desire":"","bond":"","flaw":"","secret":""}
gender: male|female.`;

    case 'random_table_entry':
      return `${camp}
Dodaj JEDEN nowy, zaskakujący wpis do tabeli losowej "${ctx.tableName || 'Ogólna'}" (fantasy D&D).
Istniejące przykłady: ${(ctx.existing || []).slice(0, 12).join('; ')}
JSON: {"entry":""}`;

    case 'random_table_pack':
      return `${camp}${hint}
Wygeneruj NOWĄ tabelę losową MG (8-12 wpisów, krótkie, gotowe do odczytania przy stole).
JSON: {"tableName":"","options":["",""]}`;

    default:
      throw new Error(`Nieznany typ podpowiedzi: ${type}`);
  }
}

async function runAiSuggest(type, context) {
  const user = buildUser(type, context);
  return geminiJson(SYSTEM, user);
}

module.exports = { runAiSuggest };
