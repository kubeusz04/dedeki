require('dotenv').config();

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const MapTactics = require('./public/js/map-tactics.js');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // SSL tylko gdy jawnie włączone (np. managed PostgreSQL). Docker db = bez SSL.
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function query(sql, params = []) {
  return pool.query(sql, params);
}

function one(result) {
  return result.rows[0] || null;
}

function toPgPlaceholders(start, count) {
  return Array.from({ length: count }, (_, i) => `$${start + i}`);
}

function pickDefined(data, fields) {
  return fields.filter((field) => data[field] !== undefined);
}

const CHARACTER_INT_FIELDS = new Set([
  'level', 'experience_points',
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
  'max_hp', 'current_hp', 'temp_hp', 'armor_class', 'initiative_bonus', 'speed',
  'hit_dice_remaining', 'death_save_successes', 'death_save_failures',
  'proficiency_bonus', 'spell_save_dc', 'spell_attack_bonus',
  'copper', 'silver', 'electrum', 'gold', 'platinum', 'inspiration'
]);

function sanitizeCharacterPayload(data) {
  const out = { ...data };
  for (const field of CHARACTER_INT_FIELDS) {
    if (out[field] === undefined) continue;
    if (out[field] === '' || out[field] === null) {
      delete out[field];
      continue;
    }
    const n = parseInt(out[field], 10);
    if (Number.isNaN(n)) delete out[field];
    else out[field] = n;
  }
  return out;
}

const CHARACTER_EXPORT_STRIP = new Set([
  'id', 'user_id', 'campaign_id', 'created_at', 'updated_at', 'player_name'
]);

const CHARACTER_IMPORT_FIELDS = [
  'name', 'race', 'char_class', 'subclass', 'level', 'experience_points', 'background', 'alignment',
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
  'max_hp', 'current_hp', 'temp_hp', 'armor_class', 'initiative_bonus', 'speed',
  'hit_dice', 'hit_dice_remaining', 'death_save_successes', 'death_save_failures',
  'proficiency_bonus', 'skill_proficiencies', 'skill_expertises', 'saving_throw_proficiencies',
  'armor_proficiencies', 'weapon_proficiencies', 'tool_proficiencies', 'languages',
  'equipment', 'copper', 'silver', 'electrum', 'gold', 'platinum',
  'features', 'spellcasting_ability', 'spell_save_dc', 'spell_attack_bonus',
  'spell_slots', 'spells_known', 'prepared_spells',
  'age', 'height', 'weight', 'eyes', 'skin', 'hair', 'appearance_notes',
  'personality_traits', 'ideals', 'bonds', 'flaws', 'backstory', 'notes',
  'conditions', 'inspiration', 'roll_templates', 'weapons', 'avatar_url', 'portrait_url'
];

function pickCharacterImportData(raw) {
  const out = {};
  for (const field of CHARACTER_IMPORT_FIELDS) {
    if (raw[field] !== undefined) out[field] = raw[field];
  }
  return sanitizeCharacterPayload(out);
}

function parseCharacterImportBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Nieprawidłowy plik importu');
  }
  if (bundle.format === 'dedeki-character' && bundle.character) {
    return bundle.character;
  }
  if (bundle.character && typeof bundle.character === 'object') {
    return bundle.character;
  }
  if (bundle.name) {
    return bundle;
  }
  throw new Error('Nierozpoznany format pliku postaci');
}

async function initializeDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      dm_id TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      setting TEXT DEFAULT 'Forgotten Realms',
      max_players INTEGER DEFAULT 6,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dm_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS campaign_members (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player',
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(campaign_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      campaign_id TEXT,
      name TEXT NOT NULL,
      race TEXT DEFAULT 'Human',
      char_class TEXT DEFAULT 'Fighter',
      subclass TEXT DEFAULT '',
      level INTEGER DEFAULT 1,
      experience_points INTEGER DEFAULT 0,
      background TEXT DEFAULT 'Folk Hero',
      alignment TEXT DEFAULT 'True Neutral',
      strength INTEGER DEFAULT 10,
      dexterity INTEGER DEFAULT 10,
      constitution INTEGER DEFAULT 10,
      intelligence INTEGER DEFAULT 10,
      wisdom INTEGER DEFAULT 10,
      charisma INTEGER DEFAULT 10,
      max_hp INTEGER DEFAULT 10,
      current_hp INTEGER DEFAULT 10,
      temp_hp INTEGER DEFAULT 0,
      armor_class INTEGER DEFAULT 10,
      initiative_bonus INTEGER DEFAULT 0,
      speed INTEGER DEFAULT 30,
      hit_dice TEXT DEFAULT '1d10',
      hit_dice_remaining INTEGER DEFAULT 1,
      death_save_successes INTEGER DEFAULT 0,
      death_save_failures INTEGER DEFAULT 0,
      proficiency_bonus INTEGER DEFAULT 2,
      skill_proficiencies TEXT DEFAULT '[]',
      skill_expertises TEXT DEFAULT '[]',
      saving_throw_proficiencies TEXT DEFAULT '[]',
      armor_proficiencies TEXT DEFAULT '',
      weapon_proficiencies TEXT DEFAULT '',
      tool_proficiencies TEXT DEFAULT '',
      languages TEXT DEFAULT 'Common',
      equipment TEXT DEFAULT '[]',
      copper INTEGER DEFAULT 0,
      silver INTEGER DEFAULT 0,
      electrum INTEGER DEFAULT 0,
      gold INTEGER DEFAULT 10,
      platinum INTEGER DEFAULT 0,
      features TEXT DEFAULT '[]',
      spellcasting_ability TEXT DEFAULT '',
      spell_save_dc INTEGER DEFAULT 0,
      spell_attack_bonus INTEGER DEFAULT 0,
      spell_slots TEXT DEFAULT '{}',
      spells_known TEXT DEFAULT '[]',
      prepared_spells TEXT DEFAULT '[]',
      age TEXT DEFAULT '',
      height TEXT DEFAULT '',
      weight TEXT DEFAULT '',
      eyes TEXT DEFAULT '',
      skin TEXT DEFAULT '',
      hair TEXT DEFAULT '',
      appearance_notes TEXT DEFAULT '',
      personality_traits TEXT DEFAULT '',
      ideals TEXT DEFAULT '',
      bonds TEXT DEFAULT '',
      flaws TEXT DEFAULT '',
      backstory TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      conditions TEXT DEFAULT '[]',
      inspiration INTEGER DEFAULT 0,
      avatar_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      message_type TEXT DEFAULT 'chat',
      is_whisper INTEGER DEFAULT 0,
      whisper_to TEXT DEFAULT '',
      roll_data TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS npcs (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      dm_id TEXT NOT NULL,
      name TEXT NOT NULL,
      race TEXT DEFAULT '',
      description TEXT DEFAULT '',
      stats TEXT DEFAULT '{}',
      notes TEXT DEFAULT '',
      is_visible INTEGER DEFAULT 0,
      avatar_url TEXT DEFAULT '',
      current_hp INTEGER DEFAULT 10,
      max_hp INTEGER DEFAULT 10,
      armor_class INTEGER DEFAULT 10,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (dm_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS initiative_entries (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      entity_type TEXT DEFAULT 'player',
      entity_id TEXT DEFAULT '',
      initiative_roll INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_notes (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      is_dm_only INTEGER DEFAULT 0,
      session_number INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS map_tokens (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      entity_type TEXT DEFAULT 'player',
      entity_id TEXT DEFAULT '',
      x INTEGER DEFAULT 0,
      y INTEGER DEFAULT 0,
      color TEXT DEFAULT '#4a90d9',
      size INTEGER DEFAULT 1,
      is_visible INTEGER DEFAULT 1,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS map_settings (
      campaign_id TEXT PRIMARY KEY,
      grid_size INTEGER DEFAULT 40,
      grid_width INTEGER DEFAULT 25,
      grid_height INTEGER DEFAULT 18,
      background_color TEXT DEFAULT '#2a2a2a',
      background_image TEXT DEFAULT '',
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS encounters (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      monsters TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dice_log (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      roll_expression TEXT NOT NULL,
      individual_rolls TEXT NOT NULL,
      total INTEGER NOT NULL,
      roll_type TEXT DEFAULT 'manual',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conditions_ref (
      name TEXT PRIMARY KEY,
      description TEXT NOT NULL
    );
  `);

  const conditionsCount = await query('SELECT COUNT(*)::int as cnt FROM conditions_ref');
  if (Number(conditionsCount.rows[0].cnt) === 0) {
    const conditions = [
      ['Blinded', 'A blinded creature can\'t see and automatically fails any ability check that requires sight. Attack rolls against the creature have advantage, and the creature\'s attack rolls have disadvantage.'],
      ['Charmed', 'A charmed creature can\'t attack the charmer or target the charmer with harmful abilities or magical effects. The charmer has advantage on any ability check to interact socially with the creature.'],
      ['Deafened', 'A deafened creature can\'t hear and automatically fails any ability check that requires hearing.'],
      ['Frightened', 'A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight. The creature can\'t willingly move closer to the source of its fear.'],
      ['Grappled', 'A grappled creature\'s speed becomes 0, and it can\'t benefit from any bonus to its speed. The condition ends if the grappler is incapacitated or if an effect removes the grappled creature from the grappler\'s reach.'],
      ['Incapacitated', 'An incapacitated creature can\'t take actions or reactions.'],
      ['Invisible', 'An invisible creature is impossible to see without the aid of magic or a special sense. The creature\'s location can be detected by noise or tracks. Attack rolls against the creature have disadvantage, and the creature\'s attack rolls have advantage.'],
      ['Paralyzed', 'A paralyzed creature is incapacitated and can\'t move or speak. The creature automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage. Any attack that hits is a critical hit if the attacker is within 5 feet.'],
      ['Petrified', 'A petrified creature is transformed into a solid inanimate substance. Its weight increases by a factor of ten. The creature is incapacitated, can\'t move or speak, and is unaware of its surroundings.'],
      ['Poisoned', 'A poisoned creature has disadvantage on attack rolls and ability checks.'],
      ['Prone', 'A prone creature\'s only movement option is to crawl. The creature has disadvantage on attack rolls. An attack roll against the creature has advantage if the attacker is within 5 feet, otherwise disadvantage.'],
      ['Restrained', 'A restrained creature\'s speed becomes 0. Attack rolls against the creature have advantage, and the creature\'s attack rolls have disadvantage. The creature has disadvantage on Dexterity saving throws.'],
      ['Stunned', 'A stunned creature is incapacitated, can\'t move, and can speak only falteringly. The creature automatically fails Strength and Dexterity saving throws. Attack rolls against the creature have advantage.'],
      ['Unconscious', 'An unconscious creature is incapacitated, can\'t move or speak, and is unaware of its surroundings. The creature drops what it\'s holding and falls prone. Attack rolls against the creature have advantage. Any attack that hits is a critical hit if the attacker is within 5 feet.'],
      ['Exhaustion', 'Exhaustion has 6 levels. Level 1: Disadvantage on ability checks. Level 2: Speed halved. Level 3: Disadvantage on attack rolls and saving throws. Level 4: Hit point maximum halved. Level 5: Speed reduced to 0. Level 6: Death.'],
      ['Concentration', 'Some spells require concentration to maintain. Taking damage requires a Constitution saving throw (DC 10 or half damage, whichever is higher) to maintain concentration.']
    ];

    for (const [name, desc] of conditions) {
      await query('INSERT INTO conditions_ref (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [name, desc]);
    }
  }

  await runMigrations();
}

async function runMigrations() {
  const migrations = [
    'ALTER TABLE map_tokens ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT \'\'',
    'ALTER TABLE map_tokens ADD COLUMN IF NOT EXISTS is_locked INTEGER DEFAULT 0',
    'ALTER TABLE initiative_entries ADD COLUMN IF NOT EXISTS map_token_id TEXT DEFAULT \'\'',
    'ALTER TABLE map_settings ADD COLUMN IF NOT EXISTS fog_enabled INTEGER DEFAULT 0',
    'ALTER TABLE map_settings ADD COLUMN IF NOT EXISTS fog_revealed TEXT DEFAULT \'[]\'',
    'ALTER TABLE map_settings ADD COLUMN IF NOT EXISTS last_token_move TEXT DEFAULT \'\'',
    'ALTER TABLE characters ADD COLUMN IF NOT EXISTS roll_templates TEXT DEFAULT \'[]\'',
    'ALTER TABLE characters ADD COLUMN IF NOT EXISTS weapons TEXT DEFAULT \'[]\'',
    'ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS initiative_round INTEGER DEFAULT 1',
    'ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS delete_password_hash TEXT DEFAULT \'\'',
    'ALTER TABLE characters ADD COLUMN IF NOT EXISTS portrait_url TEXT DEFAULT \'\'',
    'ALTER TABLE map_tokens ADD COLUMN IF NOT EXISTS hp_max INTEGER DEFAULT 0',
    'ALTER TABLE map_tokens ADD COLUMN IF NOT EXISTS hp_current INTEGER DEFAULT 0',
    'ALTER TABLE map_tokens ADD COLUMN IF NOT EXISTS ac INTEGER DEFAULT 0',
    'ALTER TABLE map_tokens ADD COLUMN IF NOT EXISTS stat_notes TEXT DEFAULT \'\'',
    'ALTER TABLE map_tokens ADD COLUMN IF NOT EXISTS speed_ft INTEGER DEFAULT 0',
    'ALTER TABLE map_settings ADD COLUMN IF NOT EXISTS movement_trails TEXT DEFAULT \'{}\'',
    'ALTER TABLE map_settings ADD COLUMN IF NOT EXISTS trails_enabled INTEGER DEFAULT 1',
    'ALTER TABLE map_settings ADD COLUMN IF NOT EXISTS combat_state TEXT DEFAULT \'{}\'',
    'ALTER TABLE map_settings ADD COLUMN IF NOT EXISTS map_blocking TEXT DEFAULT \'[]\'',
    'ALTER TABLE map_settings ADD COLUMN IF NOT EXISTS los_fog_blocks INTEGER DEFAULT 1',
    `CREATE TABLE IF NOT EXISTS map_pins (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      x INTEGER NOT NULL DEFAULT 0,
      y INTEGER NOT NULL DEFAULT 0,
      pin_type TEXT DEFAULT 'note',
      label TEXT DEFAULT '',
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#c9a227',
      loot_grant_id TEXT DEFAULT '',
      is_visible INTEGER DEFAULT 1,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      flavor TEXT DEFAULT '',
      inventory TEXT DEFAULT '[]',
      is_open INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS loot_tables (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      entries TEXT DEFAULT '[]',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS loot_grants (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      label TEXT DEFAULT 'Paczka łupu',
      loot_table_id TEXT DEFAULT '',
      resolved_items TEXT DEFAULT '[]',
      is_opened INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS campaign_music (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      title TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      mime_type TEXT DEFAULT '',
      uploaded_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS map_presets (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      dm_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      preset_data TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (dm_id) REFERENCES users(id)
    )`
  ];
  for (const sql of migrations) {
    await query(sql);
  }
}

const economyLib = {
  COIN_CP: { copper: 1, silver: 10, electrum: 50, gold: 100, platinum: 1000 },

  parseJson(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return []; }
  },

  normalizeEquipment(raw) {
    const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.version === 2) {
      const equipped = { armor: null, shield: null, head: null, hands: null, feet: null, cloak: null, amulet: null, ring1: null, ring2: null, ...(parsed.equipped || {}) };
      return { version: 2, equipped, backpack: Array.isArray(parsed.backpack) ? parsed.backpack : [] };
    }
    const legacy = Array.isArray(parsed) ? parsed : [];
    const backpack = legacy.map((item) => {
      if (typeof item === 'string') return { id: `it-${uuidv4().slice(0, 8)}`, category: 'gear', name: item, quantity: 1 };
      return { id: item.id || `it-${uuidv4().slice(0, 8)}`, category: item.category || 'gear', name: item.name || '?', quantity: item.quantity || 1, ...item };
    });
    return { version: 2, equipped: { armor: null, shield: null, head: null, hands: null, feet: null, cloak: null, amulet: null, ring1: null, ring2: null }, backpack };
  },

  serializeEquipment(inv) {
    return JSON.stringify(inv);
  },

  walletToCopper(c) {
    const w = c || {};
    return (parseInt(w.copper, 10) || 0) * 1
      + (parseInt(w.silver, 10) || 0) * 10
      + (parseInt(w.electrum, 10) || 0) * 50
      + (parseInt(w.gold, 10) || 0) * 100
      + (parseInt(w.platinum, 10) || 0) * 1000;
  },

  copperToWallet(cp) {
    let r = Math.max(0, Math.floor(cp));
    const platinum = Math.floor(r / 1000); r %= 1000;
    const gold = Math.floor(r / 100); r %= 100;
    const electrum = Math.floor(r / 50); r %= 50;
    const silver = Math.floor(r / 10); r %= 10;
    return { copper: r, silver, electrum, gold, platinum };
  },

  newItemId() {
    return `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  },

  cloneItem(item) {
    return JSON.parse(JSON.stringify({ ...item, id: this.newItemId() }));
  },

  rollLootEntries(entries) {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return [];
    const totalWeight = list.reduce((s, e) => s + (parseInt(e.weight, 10) || 1), 0);
    let roll = Math.random() * totalWeight;
    let chosen = list[0];
    for (const e of list) {
      roll -= parseInt(e.weight, 10) || 1;
      if (roll <= 0) { chosen = e; break; }
    }
    const minQ = parseInt(chosen.quantityMin, 10) || 1;
    const maxQ = parseInt(chosen.quantityMax, 10) || minQ;
    const qty = minQ + Math.floor(Math.random() * (maxQ - minQ + 1));
    const base = chosen.item || chosen.itemData || { name: 'Przedmiot', category: 'gear' };
    const items = [];
    for (let i = 0; i < qty; i++) items.push(economyLib.cloneItem({ ...base, quantity: 1 }));
    return items;
  },

  suggestedAC(char, inv) {
    const dex = Math.floor(((parseInt(char.dexterity, 10) || 10) - 10) / 2);
    let base = 10 + dex;
    const armor = inv.equipped?.armor;
    const shield = inv.equipped?.shield;
    if (armor?.armorClass) {
      const ac = parseInt(armor.armorClass, 10);
      const maxDex = armor.dexBonusMax === 0 ? 0 : (armor.dexBonusMax ?? 99);
      const dexPart = Math.min(dex, maxDex);
      base = ac + dexPart;
    }
    if (shield?.acBonus) base += parseInt(shield.acBonus, 10) || 2;
    return base;
  }
};

async function saveDb() {
  return;
}

const userOps = {
  async create(username, email, passwordHash, displayName) {
    const id = uuidv4();
    await query(
      'INSERT INTO users (id, username, email, password_hash, display_name) VALUES ($1, $2, $3, $4, $5)',
      [id, username, email, passwordHash, displayName]
    );
    return { id, username, email, display_name: displayName };
  },

  async findByUsername(username) {
    const res = await query('SELECT * FROM users WHERE username = $1', [username]);
    return one(res);
  },

  async findByEmail(email) {
    const res = await query('SELECT * FROM users WHERE email = $1', [email]);
    return one(res);
  },

  async findById(id) {
    const res = await query('SELECT id, username, email, display_name, avatar_url, created_at FROM users WHERE id = $1', [id]);
    return one(res);
  }
};

const campaignOps = {
  async create(name, description, dmId, setting, maxPlayers, deletePasswordHash = '') {
    const id = uuidv4();
    const inviteCode = uuidv4().substring(0, 8).toUpperCase();

    await query(
      'INSERT INTO campaigns (id, name, description, dm_id, invite_code, setting, max_players, delete_password_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, name, description, dmId, inviteCode, setting, maxPlayers, deletePasswordHash || '']
    );
    await query(
      'INSERT INTO campaign_members (id, campaign_id, user_id, role) VALUES ($1, $2, $3, $4)',
      [uuidv4(), id, dmId, 'dm']
    );
    await query('INSERT INTO map_settings (campaign_id) VALUES ($1) ON CONFLICT (campaign_id) DO NOTHING', [id]);

    return { id, name, description, dm_id: dmId, invite_code: inviteCode, setting, max_players: maxPlayers };
  },

  async findById(id) {
    const res = await query('SELECT * FROM campaigns WHERE id = $1', [id]);
    return one(res);
  },

  async findByInviteCode(code) {
    const res = await query('SELECT * FROM campaigns WHERE invite_code = $1', [code]);
    return one(res);
  },

  async listForUser(userId) {
    const res = await query(
      `
      SELECT c.*, cm.role,
        (SELECT COUNT(*) FROM campaign_members WHERE campaign_id = c.id) as member_count
      FROM campaigns c
      JOIN campaign_members cm ON c.id = cm.campaign_id
      WHERE cm.user_id = $1
      ORDER BY c.created_at DESC
      `,
      [userId]
    );
    return res.rows;
  },

  async getMembers(campaignId) {
    const res = await query(
      `
      SELECT u.id, u.username, u.display_name, u.avatar_url, cm.role, cm.joined_at
      FROM campaign_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.campaign_id = $1
      ORDER BY cm.role DESC, cm.joined_at ASC
      `,
      [campaignId]
    );
    return res.rows;
  },

  async addMember(campaignId, userId, role) {
    const id = uuidv4();
    await query(
      'INSERT INTO campaign_members (id, campaign_id, user_id, role) VALUES ($1, $2, $3, $4) ON CONFLICT (campaign_id, user_id) DO NOTHING',
      [id, campaignId, userId, role]
    );
  },

  async removeMember(campaignId, userId) {
    await query('DELETE FROM campaign_members WHERE campaign_id = $1 AND user_id = $2', [campaignId, userId]);
  },

  async isMember(campaignId, userId) {
    const res = await query('SELECT * FROM campaign_members WHERE campaign_id = $1 AND user_id = $2', [campaignId, userId]);
    return one(res);
  },

  async isDm(campaignId, userId) {
    const res = await query('SELECT 1 FROM campaign_members WHERE campaign_id = $1 AND user_id = $2 AND role = $3', [campaignId, userId, 'dm']);
    return !!one(res);
  },

  async delete(campaignId) {
    await query('DELETE FROM campaigns WHERE id = $1', [campaignId]);
  }
};

const characterOps = {
  async create(userId, data) {
    const id = uuidv4();
    const fields = [
      'user_id', 'name', 'race', 'char_class', 'subclass', 'level', 'background', 'alignment',
      'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
      'max_hp', 'current_hp', 'armor_class', 'speed', 'campaign_id'
    ];

    const payload = { ...data, user_id: userId };
    const used = pickDefined(payload, fields);
    const cols = ['id', ...used];
    const values = [id, ...used.map((f) => payload[f])];
    const placeholders = toPgPlaceholders(1, cols.length);

    await query(
      `INSERT INTO characters (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values
    );
    return this.findById(id);
  },

  async findById(id) {
    const res = await query('SELECT * FROM characters WHERE id = $1', [id]);
    return one(res);
  },

  async findByUser(userId) {
    const res = await query('SELECT * FROM characters WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.rows;
  },

  async findByCampaign(campaignId) {
    const res = await query(
      'SELECT c.*, u.display_name as player_name FROM characters c JOIN users u ON c.user_id = u.id WHERE c.campaign_id = $1 ORDER BY c.name',
      [campaignId]
    );
    return res.rows;
  },

  async update(id, userId, data) {
    const existingRes = await query('SELECT * FROM characters WHERE id = $1 AND user_id = $2', [id, userId]);
    const existing = one(existingRes);
    if (!existing) return null;

    data = sanitizeCharacterPayload(data);

    const allowedFields = [
      'name', 'race', 'char_class', 'subclass', 'level', 'experience_points', 'background', 'alignment',
      'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
      'max_hp', 'current_hp', 'temp_hp', 'armor_class', 'initiative_bonus', 'speed',
      'hit_dice', 'hit_dice_remaining', 'death_save_successes', 'death_save_failures',
      'proficiency_bonus', 'skill_proficiencies', 'skill_expertises', 'saving_throw_proficiencies',
      'armor_proficiencies', 'weapon_proficiencies', 'tool_proficiencies', 'languages',
      'equipment', 'copper', 'silver', 'electrum', 'gold', 'platinum',
      'features', 'spellcasting_ability', 'spell_save_dc', 'spell_attack_bonus',
      'spell_slots', 'spells_known', 'prepared_spells',
      'age', 'height', 'weight', 'eyes', 'skin', 'hair', 'appearance_notes',
      'personality_traits', 'ideals', 'bonds', 'flaws', 'backstory', 'notes',
      'conditions', 'inspiration', 'campaign_id', 'roll_templates', 'weapons',
      'avatar_url', 'portrait_url'
    ];

    const used = pickDefined(data, allowedFields);
    if (used.length === 0) return existing;

    const setParts = used.map((field, idx) => `${field} = $${idx + 1}`);
    const values = used.map((field) => data[field]);
    setParts.push('updated_at = CURRENT_TIMESTAMP');

    values.push(id);
    await query(`UPDATE characters SET ${setParts.join(', ')} WHERE id = $${values.length}`, values);

    return this.findById(id);
  },

  async dmUpdate(id, campaignId, data) {
    const existingRes = await query('SELECT * FROM characters WHERE id = $1 AND campaign_id = $2', [id, campaignId]);
    const existing = one(existingRes);
    if (!existing) return null;

    data = sanitizeCharacterPayload(data);

    const allowedFields = [
      'name', 'race', 'char_class', 'subclass', 'level', 'experience_points', 'background', 'alignment',
      'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
      'max_hp', 'current_hp', 'temp_hp', 'armor_class', 'initiative_bonus', 'speed',
      'hit_dice', 'hit_dice_remaining', 'death_save_successes', 'death_save_failures',
      'proficiency_bonus', 'skill_proficiencies', 'skill_expertises', 'saving_throw_proficiencies',
      'armor_proficiencies', 'weapon_proficiencies', 'tool_proficiencies', 'languages',
      'equipment', 'copper', 'silver', 'electrum', 'gold', 'platinum',
      'features', 'spellcasting_ability', 'spell_save_dc', 'spell_attack_bonus',
      'spell_slots', 'spells_known', 'prepared_spells',
      'age', 'height', 'weight', 'eyes', 'skin', 'hair', 'appearance_notes',
      'personality_traits', 'ideals', 'bonds', 'flaws', 'backstory', 'notes',
      'conditions', 'inspiration', 'campaign_id', 'roll_templates', 'weapons',
      'avatar_url', 'portrait_url'
    ];

    const used = pickDefined(data, allowedFields);
    if (used.length === 0) return existing;

    const setParts = used.map((field, idx) => `${field} = $${idx + 1}`);
    const values = used.map((field) => data[field]);
    setParts.push('updated_at = CURRENT_TIMESTAMP');

    values.push(id);
    await query(`UPDATE characters SET ${setParts.join(', ')} WHERE id = $${values.length}`, values);

    return this.findById(id);
  },

  async delete(id, userId) {
    await query('DELETE FROM characters WHERE id = $1 AND user_id = $2', [id, userId]);
  },

  exportCharacter(character) {
    if (!character) return null;
    const payload = {};
    for (const [key, value] of Object.entries(character)) {
      if (!CHARACTER_EXPORT_STRIP.has(key)) payload[key] = value;
    }
    return {
      format: 'dedeki-character',
      version: 1,
      exportedAt: new Date().toISOString(),
      sourceName: character.name || '',
      character: payload
    };
  },

  async importCharacter(userId, bundle, options = {}) {
    const raw = parseCharacterImportBundle(bundle);
    const data = pickCharacterImportData(raw);
    if (!data.name || !String(data.name).trim()) {
      throw new Error('Import wymaga nazwy postaci');
    }

    const createPayload = {
      name: String(data.name).trim(),
      race: data.race || 'Human',
      char_class: data.char_class || 'Fighter',
      subclass: data.subclass || '',
      level: data.level || 1,
      background: data.background || 'Folk Hero',
      alignment: data.alignment || 'True Neutral',
      strength: data.strength ?? 10,
      dexterity: data.dexterity ?? 10,
      constitution: data.constitution ?? 10,
      intelligence: data.intelligence ?? 10,
      wisdom: data.wisdom ?? 10,
      charisma: data.charisma ?? 10,
      max_hp: data.max_hp ?? 10,
      current_hp: data.current_hp ?? data.max_hp ?? 10,
      armor_class: data.armor_class ?? 10,
      speed: data.speed ?? 30
    };

    if (options.assignCampaign && options.campaignId) {
      createPayload.campaign_id = options.campaignId;
    }

    const created = await this.create(userId, createPayload);
    const updated = await this.update(created.id, userId, data);
    return updated || created;
  }
};

const messageOps = {
  async create(campaignId, userId, username, content, messageType, isWhisper, whisperTo, rollData) {
    const id = uuidv4();
    await query(
      'INSERT INTO messages (id, campaign_id, user_id, username, content, message_type, is_whisper, whisper_to, roll_data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [id, campaignId, userId, username, content, messageType || 'chat', isWhisper ? 1 : 0, whisperTo || '', rollData || '']
    );
    return {
      id,
      campaign_id: campaignId,
      user_id: userId,
      username,
      content,
      message_type: messageType || 'chat',
      is_whisper: isWhisper ? 1 : 0,
      whisper_to: whisperTo || '',
      roll_data: rollData || ''
    };
  },

  async getRecent(campaignId, limit = 100, before = null) {
    if (before) {
      const res = await query(
        'SELECT * FROM messages WHERE campaign_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3',
        [campaignId, before, limit]
      );
      return res.rows.reverse();
    }
    const res = await query('SELECT * FROM messages WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT $2', [campaignId, limit]);
    return res.rows.reverse();
  }
};

const npcOps = {
  async create(campaignId, dmId, data) {
    const id = uuidv4();
    await query(
      'INSERT INTO npcs (id, campaign_id, dm_id, name, race, description, stats, notes, is_visible, max_hp, current_hp, armor_class) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
      [
        id,
        campaignId,
        dmId,
        data.name || 'Unnamed NPC',
        data.race || '',
        data.description || '',
        data.stats || '{}',
        data.notes || '',
        data.is_visible ? 1 : 0,
        data.max_hp || 10,
        data.current_hp || 10,
        data.armor_class || 10
      ]
    );
    return this.findById(id);
  },

  async findById(id) {
    const res = await query('SELECT * FROM npcs WHERE id = $1', [id]);
    return one(res);
  },

  async findByCampaign(campaignId) {
    const res = await query('SELECT * FROM npcs WHERE campaign_id = $1 ORDER BY name', [campaignId]);
    return res.rows;
  },

  async update(id, data) {
    const allowedFields = [
      'name', 'race', 'description', 'stats', 'notes', 'is_visible', 'avatar_url',
      'current_hp', 'max_hp', 'armor_class'
    ];
    const used = pickDefined(data, allowedFields);
    if (used.length === 0) return this.findById(id);

    const setParts = used.map((field, idx) => `${field} = $${idx + 1}`);
    const values = used.map((field) => data[field]);
    values.push(id);

    await query(`UPDATE npcs SET ${setParts.join(', ')} WHERE id = $${values.length}`, values);
    return this.findById(id);
  },

  async delete(id) {
    await query('DELETE FROM npcs WHERE id = $1', [id]);
  }
};

const initiativeOps = {
  async getRound(campaignId) {
    const res = await query('SELECT initiative_round FROM campaigns WHERE id = $1', [campaignId]);
    return res.rows[0]?.initiative_round || 1;
  },

  async setRound(campaignId, round) {
    await query('UPDATE campaigns SET initiative_round = $1 WHERE id = $2', [round, campaignId]);
  },

  async getAll(campaignId) {
    const res = await query('SELECT * FROM initiative_entries WHERE campaign_id = $1 ORDER BY initiative_roll DESC, sort_order ASC', [campaignId]);
    return res.rows;
  },

  async getState(campaignId) {
    return {
      entries: await this.getAll(campaignId),
      round: await this.getRound(campaignId)
    };
  },

  async upsert(campaignId, entityName, entityType, entityId, initiativeRoll, mapTokenId = null) {
    if (entityId) {
      const existingRes = await query(
        'SELECT * FROM initiative_entries WHERE campaign_id = $1 AND entity_id = $2',
        [campaignId, entityId]
      );
      const existing = one(existingRes);
      if (existing) {
        const linkedToken = mapTokenId || existing.map_token_id || '';
        await query(
          'UPDATE initiative_entries SET entity_name = $1, entity_type = $2, initiative_roll = $3, map_token_id = $4 WHERE id = $5',
          [entityName, entityType, initiativeRoll, linkedToken, existing.id]
        );
        await this.ensureActive(campaignId);
        return this.getState(campaignId);
      }
    }

    if (mapTokenId) {
      const byTokenRes = await query(
        'SELECT * FROM initiative_entries WHERE campaign_id = $1 AND map_token_id = $2',
        [campaignId, mapTokenId]
      );
      const byToken = one(byTokenRes);
      if (byToken) {
        await query(
          'UPDATE initiative_entries SET entity_name = $1, entity_type = $2, entity_id = $3, initiative_roll = $4 WHERE id = $5',
          [entityName, entityType, entityId || byToken.entity_id || '', initiativeRoll, byToken.id]
        );
        await this.ensureActive(campaignId);
        return this.getState(campaignId);
      }
    }

    const id = uuidv4();
    await query(
      'INSERT INTO initiative_entries (id, campaign_id, entity_name, entity_type, entity_id, initiative_roll, map_token_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, campaignId, entityName, entityType, entityId || '', initiativeRoll, mapTokenId || '']
    );
    await this.ensureActive(campaignId);
    return this.getState(campaignId);
  },

  async syncEntityLink(campaignId, entityType, entityId, entityName, mapTokenId, initiativeRoll = null) {
    const entries = await this.getAll(campaignId);
    let entry = entityId ? entries.find((e) => e.entity_id === entityId) : null;
    if (!entry && mapTokenId) {
      entry = entries.find((e) => e.map_token_id === mapTokenId);
    }
    const roll = initiativeRoll != null ? initiativeRoll : (entry?.initiative_roll ?? 10);

    if (entry) {
      await query(
        `UPDATE initiative_entries SET entity_name = $1, entity_type = $2, entity_id = $3, map_token_id = $4, initiative_roll = $5 WHERE id = $6`,
        [entityName, entityType, entityId || entry.entity_id || '', mapTokenId, roll, entry.id]
      );
    } else {
      const id = uuidv4();
      await query(
        'INSERT INTO initiative_entries (id, campaign_id, entity_name, entity_type, entity_id, initiative_roll, map_token_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, campaignId, entityName, entityType, entityId || '', roll, mapTokenId]
      );
    }
    await this.ensureActive(campaignId);
    return this.getState(campaignId);
  },

  async ensureActive(campaignId) {
    const entries = await this.getAll(campaignId);
    if (!entries.length) return;
    if (entries.some((e) => e.is_active)) return;
    await query('UPDATE initiative_entries SET is_active = 1 WHERE id = $1', [entries[0].id]);
  },

  async remove(id) {
    await query('DELETE FROM initiative_entries WHERE id = $1', [id]);
  },

  async clear(campaignId) {
    await query('DELETE FROM initiative_entries WHERE campaign_id = $1', [campaignId]);
    await this.setRound(campaignId, 1);
    await query(
      `UPDATE map_settings SET combat_state = '{}' WHERE campaign_id = $1`,
      [campaignId]
    );
  },

  async clearMapTokenLink(mapTokenId) {
    await query(
      'UPDATE initiative_entries SET map_token_id = \'\' WHERE map_token_id = $1',
      [mapTokenId]
    );
  },

  async setActive(campaignId, entryId) {
    await query('UPDATE initiative_entries SET is_active = 0 WHERE campaign_id = $1', [campaignId]);
    await query('UPDATE initiative_entries SET is_active = 1 WHERE id = $1', [entryId]);
    return this.getState(campaignId);
  },

  async nextTurn(campaignId) {
    const entries = await this.getAll(campaignId);
    if (entries.length === 0) return this.getState(campaignId);

    const activeIdx = entries.findIndex((e) => e.is_active);
    let nextIdx = 0;
    let newRound = false;

    if (activeIdx < 0) {
      nextIdx = 0;
    } else {
      nextIdx = (activeIdx + 1) % entries.length;
      newRound = nextIdx === 0;
    }

    if (newRound) {
      const round = await this.getRound(campaignId);
      await this.setRound(campaignId, round + 1);
    }

    await query('UPDATE initiative_entries SET is_active = 0 WHERE campaign_id = $1', [campaignId]);
    await query('UPDATE initiative_entries SET is_active = 1 WHERE id = $1', [entries[nextIdx].id]);

    return this.getState(campaignId);
  },

  async canEndTurn(campaignId, userId, userRole) {
    const entries = await this.getAll(campaignId);
    const active = entries.find((e) => e.is_active);
    if (!active) return { ok: false, reason: 'no_active' };

    if (userRole === 'dm') {
      return { ok: true, active };
    }

    if (active.entity_type !== 'player' || !active.entity_id) {
      return { ok: false, reason: 'not_your_turn' };
    }

    const charRes = await query('SELECT user_id FROM characters WHERE id = $1 AND campaign_id = $2', [active.entity_id, campaignId]);
    const char = one(charRes);
    if (!char || char.user_id !== userId) {
      return { ok: false, reason: 'not_your_turn' };
    }

    return { ok: true, active };
  },

  async endTurn(campaignId, userId, userRole) {
    const check = await this.canEndTurn(campaignId, userId, userRole);
    if (!check.ok) return { error: check.reason, ...(await this.getState(campaignId)) };
    const state = await this.nextTurn(campaignId);
    return { ...state, previousActive: check.active };
  }
};

const noteOps = {
  async create(campaignId, userId, title, content, isDmOnly, sessionNumber) {
    const id = uuidv4();
    await query(
      'INSERT INTO session_notes (id, campaign_id, user_id, title, content, is_dm_only, session_number) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, campaignId, userId, title, content, isDmOnly ? 1 : 0, sessionNumber || 1]
    );
    return this.findById(id);
  },

  async findById(id) {
    const res = await query('SELECT * FROM session_notes WHERE id = $1', [id]);
    return one(res);
  },

  async findByCampaign(campaignId, userId, isDm) {
    if (isDm) {
      const res = await query('SELECT * FROM session_notes WHERE campaign_id = $1 ORDER BY session_number DESC, created_at DESC', [campaignId]);
      return res.rows;
    }

    const res = await query(
      'SELECT * FROM session_notes WHERE campaign_id = $1 AND (is_dm_only = 0 OR user_id = $2) ORDER BY session_number DESC, created_at DESC',
      [campaignId, userId]
    );
    return res.rows;
  },

  async update(id, userId, data) {
    const allowedFields = ['title', 'content', 'is_dm_only', 'session_number'];
    const used = pickDefined(data, allowedFields);
    if (used.length === 0) return this.findById(id);

    const setParts = used.map((field, idx) => `${field} = $${idx + 1}`);
    const values = used.map((field) => data[field]);
    setParts.push('updated_at = CURRENT_TIMESTAMP');

    values.push(id, userId);
    await query(
      `UPDATE session_notes SET ${setParts.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
      values
    );

    return this.findById(id);
  },

  async delete(id, userId) {
    await query('DELETE FROM session_notes WHERE id = $1 AND user_id = $2', [id, userId]);
  }
};

async function resolveEntityStats(entityType, entityId) {
  if (!entityId) return null;
  if (entityType === 'player') {
    const char = await characterOps.findById(entityId);
    if (!char) return null;
    return {
      name: char.name,
      entity_type: 'player',
      entity_id: entityId,
      hp_max: char.max_hp,
      hp_current: char.current_hp,
      ac: char.armor_class,
      image_url: char.avatar_url || ''
    };
  }
  if (entityType === 'npc' || entityType === 'monster') {
    const npc = await npcOps.findById(entityId);
    if (!npc) return null;
    let resolvedType = 'npc';
    try {
      const meta = JSON.parse(npc.stats || '{}');
      if (meta.category === 'monster') resolvedType = 'monster';
    } catch (_e) { /* ignore */ }
    return {
      name: npc.name,
      entity_type: resolvedType,
      entity_id: entityId,
      hp_max: npc.max_hp,
      hp_current: npc.current_hp,
      ac: npc.armor_class,
      image_url: npc.avatar_url || ''
    };
  }
  return null;
}

const mapOps = {
  async getTokens(campaignId) {
    const res = await query('SELECT * FROM map_tokens WHERE campaign_id = $1', [campaignId]);
    return res.rows;
  },

  async getSettings(campaignId) {
    const res = await query('SELECT * FROM map_settings WHERE campaign_id = $1', [campaignId]);
    return one(res);
  },

  async addToken(campaignId, data) {
    const id = uuidv4();
    await query(
      `INSERT INTO map_tokens (
        id, campaign_id, entity_name, entity_type, entity_id, x, y, color, size,
        is_visible, image_url, is_locked, hp_max, hp_current, ac, stat_notes, speed_ft
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        id,
        campaignId,
        data.entity_name,
        data.entity_type || 'player',
        data.entity_id || '',
        data.x || 0,
        data.y || 0,
        data.color || '#8b6914',
        data.size || 1,
        data.is_visible !== undefined ? (data.is_visible ? 1 : 0) : 1,
        data.image_url || '',
        data.is_locked ? 1 : 0,
        data.hp_max || 0,
        data.hp_current != null ? data.hp_current : (data.hp_max || 0),
        data.ac || 0,
        data.stat_notes || '',
        data.speed_ft || 0
      ]
    );
    return { id, tokens: await this.getTokens(campaignId) };
  },

  async findTokenByEntity(campaignId, entityType, entityId) {
    if (!entityId) return null;
    const res = await query(
      'SELECT * FROM map_tokens WHERE campaign_id = $1 AND entity_id = $2 LIMIT 1',
      [campaignId, entityId]
    );
    return one(res);
  },

  async linkToEntity(campaignId, tokenId, entityType, entityId, options = {}) {
    const token = await this.getTokenById(tokenId);
    if (!token || token.campaign_id !== campaignId) {
      return { ok: false, reason: 'no_token' };
    }

    if (!entityId) {
      await this.updateToken(tokenId, { entity_id: '', entity_type: 'object' });
      await initiativeOps.clearMapTokenLink(tokenId);
      return { ok: true, unlinked: true, token: await this.getTokenById(tokenId) };
    }

    const stats = await resolveEntityStats(entityType, entityId);
    if (!stats) return { ok: false, reason: 'no_entity' };

    await query(
      `UPDATE map_tokens SET entity_id = '', entity_type = 'object'
       WHERE campaign_id = $1 AND entity_id = $2 AND id != $3`,
      [campaignId, entityId, tokenId]
    );

    const patch = {
      entity_name: stats.name,
      entity_type: stats.entity_type,
      entity_id: entityId,
      hp_max: stats.hp_max,
      hp_current: stats.hp_current,
      ac: stats.ac
    };
    if (stats.image_url) patch.image_url = stats.image_url;
    await this.updateToken(tokenId, patch);

    if (options.syncInitiative !== false) {
      await initiativeOps.syncEntityLink(
        campaignId,
        stats.entity_type,
        entityId,
        stats.name,
        tokenId,
        options.initiativeRoll
      );
    }

    return { ok: true, token: await this.getTokenById(tokenId) };
  },

  async updateToken(id, data) {
    const allowedFields = [
      'entity_name', 'entity_type', 'entity_id', 'color', 'size', 'is_visible',
      'image_url', 'is_locked', 'hp_max', 'hp_current', 'ac', 'stat_notes', 'speed_ft'
    ];
    const used = pickDefined(data, allowedFields);
    if (used.length === 0) return;
    const setParts = used.map((field, idx) => {
      if (field === 'is_visible' || field === 'is_locked') {
        return `${field} = $${idx + 1}`;
      }
      return `${field} = $${idx + 1}`;
    });
    const values = used.map((field) => {
      if (field === 'is_visible' || field === 'is_locked') {
        return data[field] ? 1 : 0;
      }
      return data[field];
    });
    values.push(id);
    await query(`UPDATE map_tokens SET ${setParts.join(', ')} WHERE id = $${values.length}`, values);
  },

  async getTokenById(id) {
    const res = await query('SELECT * FROM map_tokens WHERE id = $1', [id]);
    return one(res);
  },

  async moveToken(id, x, y) {
    await query('UPDATE map_tokens SET x = $1, y = $2 WHERE id = $3', [x, y, id]);
  },

  async removeToken(id) {
    await initiativeOps.clearMapTokenLink(id);
    await query('DELETE FROM map_tokens WHERE id = $1', [id]);
  },

  async clearTokens(campaignId) {
    await query('DELETE FROM map_tokens WHERE campaign_id = $1', [campaignId]);
  },

  async getPins(campaignId) {
    const res = await query('SELECT * FROM map_pins WHERE campaign_id = $1 ORDER BY label', [campaignId]);
    return res.rows;
  },

  async addPin(campaignId, data) {
    const id = uuidv4();
    await query(
      `INSERT INTO map_pins (id, campaign_id, x, y, pin_type, label, description, color, loot_grant_id, is_visible)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        campaignId,
        data.x ?? 0,
        data.y ?? 0,
        data.pin_type || 'note',
        data.label || '',
        data.description || '',
        data.color || '#c9a227',
        data.loot_grant_id || '',
        data.is_visible !== false ? 1 : 0
      ]
    );
    return this.getPins(campaignId);
  },

  async updatePin(id, data) {
    const allowedFields = ['x', 'y', 'pin_type', 'label', 'description', 'color', 'loot_grant_id', 'is_visible'];
    const used = pickDefined(data, allowedFields);
    if (used.length === 0) return;
    const setParts = used.map((field, idx) => `${field} = $${idx + 1}`);
    const values = used.map((field) => {
      if (field === 'is_visible') return data[field] ? 1 : 0;
      return data[field];
    });
    values.push(id);
    await query(`UPDATE map_pins SET ${setParts.join(', ')} WHERE id = $${values.length}`, values);
  },

  async getPinById(id) {
    const res = await query('SELECT * FROM map_pins WHERE id = $1', [id]);
    return one(res);
  },

  async removePin(id) {
    await query('DELETE FROM map_pins WHERE id = $1', [id]);
  },

  async clearPins(campaignId) {
    await query('DELETE FROM map_pins WHERE campaign_id = $1', [campaignId]);
  },

  async appendMovementTrail(campaignId, tokenId, x, y) {
    const settings = await this.getSettings(campaignId);
    let trails = {};
    try {
      trails = JSON.parse(settings?.movement_trails || '{}');
    } catch (_err) {
      trails = {};
    }
    if (!Array.isArray(trails[tokenId])) trails[tokenId] = [];
    const path = trails[tokenId];
    const last = path[path.length - 1];
    if (!last || last.x !== x || last.y !== y) {
      path.push({ x, y, t: Date.now() });
      if (path.length > 80) path.shift();
    }
    await this.updateSettings(campaignId, { movement_trails: JSON.stringify(trails) });
    return trails;
  },

  async clearMovementTrails(campaignId) {
    await this.updateSettings(campaignId, { movement_trails: '{}' });
  },

  async updateSettings(campaignId, data) {
    const allowedFields = [
      'grid_size', 'grid_width', 'grid_height', 'background_color', 'background_image',
      'fog_enabled', 'fog_revealed', 'last_token_move', 'movement_trails', 'trails_enabled',
      'combat_state', 'map_blocking', 'los_fog_blocks'
    ];
    const used = pickDefined(data, allowedFields);
    if (used.includes('fog_enabled')) {
      data.fog_enabled = data.fog_enabled ? 1 : 0;
    }
    if (used.includes('trails_enabled')) {
      data.trails_enabled = data.trails_enabled ? 1 : 0;
    }
    if (used.includes('los_fog_blocks')) {
      data.los_fog_blocks = data.los_fog_blocks ? 1 : 0;
    }
    if (used.length === 0) return this.getSettings(campaignId);

    const setParts = used.map((field, idx) => `${field} = $${idx + 1}`);
    const values = used.map((field) => data[field]);
    values.push(campaignId);

    await query(`UPDATE map_settings SET ${setParts.join(', ')} WHERE campaign_id = $${values.length}`, values);
    return this.getSettings(campaignId);
  },

  async exportSnapshot(campaignId) {
    const [tokens, settings, pins] = await Promise.all([
      this.getTokens(campaignId),
      this.getSettings(campaignId),
      this.getPins(campaignId)
    ]);
    let map_blocking = [];
    try {
      map_blocking = JSON.parse(settings?.map_blocking || '[]');
    } catch (_e) { /* ignore */ }

    return {
      version: 1,
      settings: {
        grid_size: settings?.grid_size ?? 40,
        grid_width: settings?.grid_width ?? 25,
        grid_height: settings?.grid_height ?? 18,
        background_color: settings?.background_color || '#3b2618',
        background_image: settings?.background_image || '',
        map_blocking,
        fog_enabled: !!settings?.fog_enabled,
        los_fog_blocks: settings?.los_fog_blocks !== 0
      },
      tokens: tokens.map((t) => ({
        entity_name: t.entity_name,
        entity_type: t.entity_type === 'player' ? 'npc' : (t.entity_type || 'monster'),
        x: t.x ?? 0,
        y: t.y ?? 0,
        color: t.color || '#8b6914',
        size: t.size || 1,
        hp_max: t.hp_max || 0,
        hp_current: t.hp_current ?? t.hp_max ?? 0,
        ac: t.ac || 0,
        stat_notes: t.stat_notes || '',
        image_url: t.image_url || '',
        is_visible: t.is_visible !== 0,
        is_locked: !!t.is_locked,
        npc_template_id: ''
      })),
      pins: pins.map((p) => {
        let loot_table_id = '';
        let description = p.description || '';
        if (description.startsWith('{')) {
          try {
            const meta = JSON.parse(description);
            loot_table_id = meta.loot_table_id || '';
            description = meta.note || meta.description || '';
          } catch (_e) { /* ignore */ }
        }
        return {
          x: p.x ?? 0,
          y: p.y ?? 0,
          pin_type: p.pin_type || 'note',
          label: p.label || '',
          description,
          color: p.color || '',
          is_visible: p.is_visible !== 0,
          loot_table_id
        };
      })
    };
  },

  async applySnapshot(campaignId, presetData, options = {}) {
    const {
      clearTokens = true,
      clearPins = true,
      resetFog = true,
      resetInitiative = false
    } = options;
    const data = presetData || {};
    const s = data.settings || {};

    if (clearTokens) {
      const existing = await this.getTokens(campaignId);
      for (const t of existing) {
        await initiativeOps.clearMapTokenLink(t.id);
      }
      await this.clearTokens(campaignId);
    }
    if (clearPins) await this.clearPins(campaignId);

    await this.updateSettings(campaignId, {
      grid_size: s.grid_size ?? 40,
      grid_width: s.grid_width ?? 25,
      grid_height: s.grid_height ?? 18,
      background_color: s.background_color || '#3b2618',
      background_image: s.background_image || '',
      map_blocking: JSON.stringify(s.map_blocking || []),
      fog_enabled: s.fog_enabled ? 1 : 0,
      los_fog_blocks: s.los_fog_blocks === false ? 0 : 1,
      fog_revealed: resetFog ? '[]' : undefined,
      movement_trails: '{}',
      last_token_move: '',
      combat_state: '{}'
    });

    for (const t of data.tokens || []) {
      await this.addToken(campaignId, {
        entity_name: t.entity_name || 'Token',
        entity_type: t.entity_type || 'monster',
        entity_id: '',
        x: t.x ?? 0,
        y: t.y ?? 0,
        color: t.color || '#5c1010',
        size: t.size || 1,
        hp_max: t.hp_max || 0,
        hp_current: t.hp_current ?? t.hp_max ?? 0,
        ac: t.ac || 0,
        stat_notes: t.stat_notes || '',
        image_url: t.image_url || '',
        is_visible: t.is_visible !== false,
        is_locked: !!t.is_locked
      });
    }

    for (const p of data.pins || []) {
      let description = p.description || '';
      if (p.loot_table_id) {
        description = JSON.stringify({ loot_table_id: p.loot_table_id, note: p.description || '' });
      }
      await this.addPin(campaignId, {
        x: p.x ?? 0,
        y: p.y ?? 0,
        pin_type: p.pin_type || 'note',
        label: p.label || '',
        description,
        color: p.color || '#c9a227',
        is_visible: p.is_visible !== false,
        loot_grant_id: ''
      });
    }

    if (resetInitiative) {
      await initiativeOps.clear(campaignId);
    }
    await combatOps.enableCombat(campaignId, false);
    return {
      tokens: await this.getTokens(campaignId),
      settings: await this.getSettings(campaignId),
      pins: await this.getPins(campaignId)
    };
  }
};

function defaultCombatState() {
  return {
    enabled: false,
    round: 1,
    activeEntryId: '',
    tokens: {}
  };
}

function defaultTokenTurnState(speedFt, x, y) {
  const s = Math.max(0, parseInt(speedFt, 10) || 30);
  return {
    movementRemainingFt: s,
    movementMaxFt: s,
    turnStartX: x ?? null,
    turnStartY: y ?? null,
    actionUsed: false,
    bonusUsed: false,
    reactionAvailable: true,
    freeInteractionUsed: false,
    dashBonusFt: 0
  };
}

const combatOps = {
  parseCombatState(settings) {
    if (!settings?.combat_state) return defaultCombatState();
    try {
      const s = JSON.parse(settings.combat_state);
      return { ...defaultCombatState(), ...s, tokens: s.tokens || {} };
    } catch (_err) {
      return defaultCombatState();
    }
  },

  parseBlocking(settings) {
    return MapTactics.parseBlockingList(settings?.map_blocking || '[]');
  },

  async saveCombatState(campaignId, state) {
    await mapOps.updateSettings(campaignId, { combat_state: JSON.stringify(state) });
    return state;
  },

  async getSpeedForToken(token) {
    if (!token) return 30;
    const tokenSpeed = parseInt(token.speed_ft, 10);
    if (tokenSpeed > 0) return tokenSpeed;
    if (token.entity_id && token.entity_type === 'player') {
      const char = await characterOps.findById(token.entity_id);
      if (char?.speed) return parseInt(char.speed, 10) || 30;
    }
    return 30;
  },

  async isMovementLimited(campaignId) {
    const initiative = await initiativeOps.getState(campaignId);
    return initiative.entries.length > 0;
  },

  async getPayload(campaignId) {
    const settings = await mapOps.getSettings(campaignId);
    const initiative = await initiativeOps.getState(campaignId);
    const combat = this.parseCombatState(settings);
    combat.round = initiative.round;
    const active = initiative.entries.find((e) => e.is_active);
    if (active) combat.activeEntryId = active.id;
    return {
      combat,
      blocking: MapTactics.blockingToArray(this.parseBlocking(settings)),
      losFogBlocks: !!settings?.los_fog_blocks
    };
  },

  async enableCombat(campaignId, enabled = true) {
    const state = (await this.getPayload(campaignId)).combat;
    state.enabled = !!enabled;
    if (state.enabled || (await this.isMovementLimited(campaignId))) {
      await this.syncTurnWithInitiative(campaignId);
    }
    return this.saveCombatState(campaignId, state);
  },

  async syncTurnWithInitiative(campaignId) {
    const settings = await mapOps.getSettings(campaignId);
    let state = this.parseCombatState(settings);
    const initiative = await initiativeOps.getState(campaignId);
    const active = initiative.entries.find((e) => e.is_active);
    state.enabled = initiative.entries.length > 0;
    state.round = initiative.round;
    state.activeEntryId = active?.id || '';

    if (!active?.map_token_id) {
      return this.saveCombatState(campaignId, state);
    }

    const token = await mapOps.getTokenById(active.map_token_id);
    if (!token) {
      return this.saveCombatState(campaignId, state);
    }

    const speed = await this.getSpeedForToken(token);
    state.tokens[token.id] = defaultTokenTurnState(speed, token.x, token.y);

    return this.saveCombatState(campaignId, state);
  },

  async startTurnForEntry(campaignId, entryId) {
    const settings = await mapOps.getSettings(campaignId);
    const state = this.parseCombatState(settings);
    const initiative = await initiativeOps.getState(campaignId);
    const entry = initiative.entries.find((e) => e.id === entryId);
    if (!entry) return state;

    state.activeEntryId = entry.id;
    state.round = initiative.round;
    state.enabled = true;

    if (entry.map_token_id) {
      const token = await mapOps.getTokenById(entry.map_token_id);
      if (token) {
        const speed = await this.getSpeedForToken(token);
        state.tokens[token.id] = defaultTokenTurnState(speed, token.x, token.y);
      }
    }

    return this.saveCombatState(campaignId, state);
  },

  getTokenTurnState(state, tokenId) {
    return state.tokens[tokenId] || null;
  },

  async canControlToken(campaignId, userId, userRole, token) {
    if (!token) return { ok: false, reason: 'no_token' };
    if (userRole === 'dm') return { ok: true };
    if (token.entity_type !== 'player' || !token.entity_id) {
      return { ok: false, reason: 'not_owner' };
    }
    const char = await characterOps.findById(token.entity_id);
    if (!char || char.user_id !== userId || char.campaign_id !== campaignId) {
      return { ok: false, reason: 'not_owner' };
    }
    return { ok: true };
  },

  async isActiveCombatToken(campaignId, tokenId) {
    const initiative = await initiativeOps.getState(campaignId);
    const active = initiative.entries.find((e) => e.is_active);
    return active?.map_token_id === tokenId;
  },

  async validateMove(campaignId, tokenId, newX, newY, userId, userRole) {
    const token = await mapOps.getTokenById(tokenId);
    if (!token || token.campaign_id !== campaignId) {
      return { ok: false, reason: 'no_token' };
    }

    const control = await this.canControlToken(campaignId, userId, userRole, token);
    if (!control.ok) return control;

    const settings = await mapOps.getSettings(campaignId);
    const state = this.parseCombatState(settings);
    const movementLimited = await this.isMovementLimited(campaignId);
    if (!movementLimited) {
      return { ok: true, skipCombat: true };
    }

    const isActive = await this.isActiveCombatToken(campaignId, tokenId);
    if (!isActive && userRole !== 'dm') {
      return { ok: false, reason: 'not_your_turn' };
    }

    let turnState = state.tokens[tokenId];
    if (!turnState && isActive) {
      const speed = await this.getSpeedForToken(token);
      turnState = defaultTokenTurnState(speed, token.x, token.y);
      state.tokens[tokenId] = turnState;
      await this.saveCombatState(campaignId, state);
    }
    if (!turnState && userRole !== 'dm') {
      return { ok: false, reason: 'no_turn_state' };
    }

    if (userRole === 'dm' && !isActive) {
      return { ok: true, skipCombat: true };
    }

    const distCells = MapTactics.chebyshevCells(token.x, token.y, newX, newY);
    const costFt = MapTactics.cellsToFeet(distCells);
    const remaining = (turnState?.movementRemainingFt ?? 0) + (turnState?.dashBonusFt ?? 0);

    if (costFt > remaining) {
      return { ok: false, reason: 'no_movement', costFt, remaining };
    }

    return { ok: true, costFt, turn: turnState, state, token };
  },

  async setTokenMovement(campaignId, tokenId, opts = {}) {
    const settings = await mapOps.getSettings(campaignId);
    const state = this.parseCombatState(settings);
    const token = await mapOps.getTokenById(tokenId);
    if (!token || token.campaign_id !== campaignId) {
      return { ok: false, reason: 'no_token' };
    }

    if (opts.reset) {
      const speed = await this.getSpeedForToken(token);
      state.tokens[tokenId] = defaultTokenTurnState(speed, token.x, token.y);
    } else {
      let turn = state.tokens[tokenId];
      if (!turn) {
        const speed = await this.getSpeedForToken(token);
        turn = defaultTokenTurnState(speed, token.x, token.y);
      }
      if (opts.movementRemainingFt != null) {
        turn.movementRemainingFt = Math.max(0, parseInt(opts.movementRemainingFt, 10) || 0);
      }
      if (opts.movementMaxFt != null) {
        turn.movementMaxFt = Math.max(0, parseInt(opts.movementMaxFt, 10) || 0);
      }
      state.tokens[tokenId] = turn;
    }

    await this.saveCombatState(campaignId, state);
    return { ok: true, turn: state.tokens[tokenId], state };
  },

  async applyMove(campaignId, tokenId, newX, newY, validation) {
    const settings = await mapOps.getSettings(campaignId);
    const state = validation.state || this.parseCombatState(settings);
    const turn = state.tokens[tokenId];
    if (turn && validation.costFt) {
      turn.movementRemainingFt = Math.max(0, turn.movementRemainingFt - validation.costFt);
      state.tokens[tokenId] = turn;
      await this.saveCombatState(campaignId, state);
    }
    await mapOps.moveToken(tokenId, newX, newY);
    return state;
  },

  async spendAction(campaignId, tokenId, type = 'action') {
    const settings = await mapOps.getSettings(campaignId);
    const state = this.parseCombatState(settings);
    const turn = state.tokens[tokenId];
    if (!turn) return { ok: false, reason: 'no_turn' };

    if (type === 'bonus') {
      if (turn.bonusUsed) return { ok: false, reason: 'bonus_used' };
      turn.bonusUsed = true;
    } else if (type === 'reaction') {
      if (!turn.reactionAvailable) return { ok: false, reason: 'no_reaction' };
      turn.reactionAvailable = false;
    } else {
      if (turn.actionUsed) return { ok: false, reason: 'action_used' };
      turn.actionUsed = true;
    }

    state.tokens[tokenId] = turn;
    await this.saveCombatState(campaignId, state);
    return { ok: true, turn, state };
  },

  async applyBonusAction(campaignId, tokenId, actionId) {
    const spend = await this.spendAction(campaignId, tokenId, 'bonus');
    if (!spend.ok) return spend;

    const token = await mapOps.getTokenById(tokenId);
    const state = spend.state;
    const turn = state.tokens[tokenId];

    if (actionId === 'dash') {
      const speed = await this.getSpeedForToken(token);
      turn.dashBonusFt = (turn.dashBonusFt || 0) + speed;
      turn.movementRemainingFt += speed;
    }

    state.tokens[tokenId] = turn;
    await this.saveCombatState(campaignId, state);
    return { ok: true, state, turn };
  },

  async checkLineOfSight(campaignId, fromTokenId, toTokenId, viewerRole = 'player') {
    const from = await mapOps.getTokenById(fromTokenId);
    const to = await mapOps.getTokenById(toTokenId);
    if (!from || !to) return { ok: false, reason: 'no_token' };

    const settings = await mapOps.getSettings(campaignId);
    const blocking = this.parseBlocking(settings);
    let fogRevealed = null;
    if (settings?.fog_enabled && settings?.los_fog_blocks && viewerRole !== 'dm') {
      try {
        fogRevealed = new Set(JSON.parse(settings.fog_revealed || '[]'));
      } catch (_err) {
        fogRevealed = new Set();
      }
    }

    return MapTactics.hasLineOfSight(from, to, blocking, {
      fogRevealed,
      fogBlocksLos: !!settings?.los_fog_blocks && viewerRole !== 'dm'
    });
  },

  async validateAttackTarget(campaignId, attackerTokenId, targetTokenId, userId, userRole, opts = {}) {
    const attacker = await mapOps.getTokenById(attackerTokenId);
    const target = await mapOps.getTokenById(targetTokenId);
    if (!attacker || !target) return { ok: false, reason: 'no_token' };

    const control = await this.canControlToken(campaignId, userId, userRole, attacker);
    if (!control.ok) return control;

    const isActive = await this.isActiveCombatToken(campaignId, attackerTokenId);
    if (!isActive) return { ok: false, reason: 'not_your_turn' };

    const settings = await mapOps.getSettings(campaignId);
    const state = this.parseCombatState(settings);
    const turn = state.tokens[attackerTokenId];
    if (turn?.actionUsed && !opts.allowFree) {
      return { ok: false, reason: 'action_used' };
    }

    let rangeCheck = { ok: true };
    if (opts.weapon) {
      rangeCheck = MapTactics.inWeaponRange(attacker, target, opts.weapon);
    } else if (opts.spell) {
      rangeCheck = MapTactics.inSpellRange(attacker, target, opts.spell);
    }

    if (!rangeCheck.ok) {
      return { ok: false, reason: 'out_of_range', rangeCheck };
    }

    const los = await this.checkLineOfSight(campaignId, attackerTokenId, targetTokenId, userRole);
    if (!los.ok) {
      return { ok: false, reason: 'no_los', los };
    }

    return { ok: true, attacker, target, rangeCheck, state, turn };
  },

  async applyDamageToToken(tokenId, amount) {
    const token = await mapOps.getTokenById(tokenId);
    if (!token) return null;

    let hpCurrent = token.hp_current;
    let hpMax = token.hp_max;

    if (token.entity_id && token.entity_type === 'player') {
      const char = await characterOps.findById(token.entity_id);
      if (char) {
        hpCurrent = char.current_hp;
        hpMax = char.max_hp;
      }
    }

    const dmg = Math.max(0, parseInt(amount, 10) || 0);
    const next = Math.max(0, (hpCurrent ?? 0) - dmg);

    await mapOps.updateToken(tokenId, {
      hp_current: next,
      hp_max: hpMax || token.hp_max
    });

    if (token.entity_id && token.entity_type === 'player') {
      await query(
        'UPDATE characters SET current_hp = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [next, token.entity_id]
      );
    }

    return { tokenId, hpCurrent: next, hpMax, damage: dmg };
  },

  async updateBlocking(campaignId, cells) {
    const arr = Array.isArray(cells) ? cells : [];
    await mapOps.updateSettings(campaignId, { map_blocking: JSON.stringify(arr) });
    return arr;
  }
};

const diceLogOps = {
  async create(campaignId, userId, username, rollExpression, individualRolls, total, rollType) {
    const id = uuidv4();
    await query(
      'INSERT INTO dice_log (id, campaign_id, user_id, username, roll_expression, individual_rolls, total, roll_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, campaignId, userId, username, rollExpression, JSON.stringify(individualRolls), total, rollType || 'manual']
    );
    return {
      id,
      campaign_id: campaignId,
      user_id: userId,
      username,
      roll_expression: rollExpression,
      individual_rolls: individualRolls,
      total,
      roll_type: rollType || 'manual'
    };
  },

  async getRecent(campaignId, limit = 50) {
    const res = await query('SELECT * FROM dice_log WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT $2', [campaignId, limit]);
    return res.rows.reverse();
  }
};

const conditionOps = {
  async getAll() {
    const res = await query('SELECT * FROM conditions_ref ORDER BY name');
    return res.rows;
  }
};

const merchantOps = {
  async listByCampaign(campaignId) {
    const res = await query('SELECT * FROM merchants WHERE campaign_id = $1 ORDER BY created_at DESC', [campaignId]);
    return res.rows.map((r) => ({ ...r, inventory: economyLib.parseJson(r.inventory), is_open: !!r.is_open }));
  },

  async findById(id) {
    const res = await query('SELECT * FROM merchants WHERE id = $1', [id]);
    const row = one(res);
    if (!row) return null;
    return { ...row, inventory: economyLib.parseJson(row.inventory), is_open: !!row.is_open };
  },

  async create(campaignId, data) {
    const id = uuidv4();
    await query(
      'INSERT INTO merchants (id, campaign_id, name, description, flavor, inventory, is_open) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, campaignId, data.name, data.description || '', data.flavor || '', JSON.stringify(data.inventory || []), data.is_open ? 1 : 0]
    );
    return this.findById(id);
  },

  async update(id, data) {
    const fields = [];
    const vals = [];
    if (data.name !== undefined) { fields.push(`name = $${fields.length + 1}`); vals.push(data.name); }
    if (data.description !== undefined) { fields.push(`description = $${fields.length + 1}`); vals.push(data.description); }
    if (data.flavor !== undefined) { fields.push(`flavor = $${fields.length + 1}`); vals.push(data.flavor); }
    if (data.inventory !== undefined) { fields.push(`inventory = $${fields.length + 1}`); vals.push(JSON.stringify(data.inventory)); }
    if (data.is_open !== undefined) { fields.push(`is_open = $${fields.length + 1}`); vals.push(data.is_open ? 1 : 0); }
    if (!fields.length) return this.findById(id);
    vals.push(id);
    await query(`UPDATE merchants SET ${fields.join(', ')} WHERE id = $${vals.length}`, vals);
    return this.findById(id);
  },

  async delete(id) {
    await query('DELETE FROM merchants WHERE id = $1', [id]);
  }
};

const lootTableOps = {
  async listByCampaign(campaignId) {
    const res = await query('SELECT * FROM loot_tables WHERE campaign_id = $1 ORDER BY created_at DESC', [campaignId]);
    return res.rows.map((r) => ({ ...r, entries: economyLib.parseJson(r.entries) }));
  },

  async findById(id) {
    const res = await query('SELECT * FROM loot_tables WHERE id = $1', [id]);
    const row = one(res);
    if (!row) return null;
    return { ...row, entries: economyLib.parseJson(row.entries) };
  },

  async create(campaignId, data) {
    const id = uuidv4();
    await query(
      'INSERT INTO loot_tables (id, campaign_id, name, description, entries) VALUES ($1, $2, $3, $4, $5)',
      [id, campaignId, data.name, data.description || '', JSON.stringify(data.entries || [])]
    );
    return this.findById(id);
  },

  async update(id, data) {
    const fields = [];
    const vals = [];
    if (data.name !== undefined) { fields.push(`name = $${fields.length + 1}`); vals.push(data.name); }
    if (data.description !== undefined) { fields.push(`description = $${fields.length + 1}`); vals.push(data.description); }
    if (data.entries !== undefined) { fields.push(`entries = $${fields.length + 1}`); vals.push(JSON.stringify(data.entries)); }
    if (!fields.length) return this.findById(id);
    vals.push(id);
    await query(`UPDATE loot_tables SET ${fields.join(', ')} WHERE id = $${vals.length}`, vals);
    return this.findById(id);
  },

  async delete(id) {
    await query('DELETE FROM loot_tables WHERE id = $1', [id]);
  }
};

const lootGrantOps = {
  async listForCharacter(characterId, onlyPending = true) {
    const sql = onlyPending
      ? 'SELECT * FROM loot_grants WHERE character_id = $1 AND is_opened = 0 ORDER BY created_at DESC'
      : 'SELECT * FROM loot_grants WHERE character_id = $1 ORDER BY created_at DESC';
    const res = await query(sql, [characterId]);
    return res.rows.map((r) => ({ ...r, resolved_items: economyLib.parseJson(r.resolved_items), is_opened: !!r.is_opened }));
  },

  async findById(id) {
    const res = await query('SELECT * FROM loot_grants WHERE id = $1', [id]);
    const row = one(res);
    if (!row) return null;
    return { ...row, resolved_items: economyLib.parseJson(row.resolved_items), is_opened: !!row.is_opened };
  },

  async create(campaignId, characterId, data) {
    const id = uuidv4();
    let items = data.resolved_items || [];
    if (data.loot_table_id && !items.length) {
      const table = await lootTableOps.findById(data.loot_table_id);
      if (table) items = economyLib.rollLootEntries(table.entries);
    }
    await query(
      'INSERT INTO loot_grants (id, campaign_id, character_id, label, loot_table_id, resolved_items, is_opened) VALUES ($1, $2, $3, $4, $5, $6, 0)',
      [id, campaignId, characterId, data.label || 'Paczka łupu', data.loot_table_id || '', JSON.stringify(items)]
    );
    return this.findById(id);
  },

  async markOpened(id) {
    await query('UPDATE loot_grants SET is_opened = 1 WHERE id = $1', [id]);
    return this.findById(id);
  }
};

const economyOps = {
  economyLib,

  async applyCharacterUpdate(characterId, userId, isDm, campaignId, fields) {
    if (isDm) return characterOps.dmUpdate(characterId, campaignId, fields);
    return characterOps.update(characterId, userId, fields);
  },

  addItemToCharacter(char, item, target = 'backpack') {
    if (target === 'weapon' || item.category === 'weapon' || item.damage) {
      const weapons = economyLib.parseJson(char.weapons);
      const w = {
        id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        templateId: item.templateId || '',
        name: item.name,
        damage: item.damage || '1d4',
        damageType: item.damageType || 'slashing',
        ability: item.ability || 'strength',
        properties: item.properties || [],
        range: item.range || '',
        attackBonus: item.attackBonus || 0,
        damageBonus: item.damageBonus || 0,
        isProficient: item.isProficient !== false
      };
      weapons.push(w);
      return { weapons: JSON.stringify(weapons) };
    }
    const inv = economyLib.normalizeEquipment(char.equipment);
    const copy = economyLib.cloneItem({ ...item, quantity: item.quantity || 1 });
    const slot = copy.equipSlot;
    if (slot && inv.equipped[slot] !== undefined && ['armor', 'shield', 'head', 'hands', 'feet', 'cloak', 'amulet', 'ring1', 'ring2'].includes(slot)) {
      if (inv.equipped[slot]) inv.backpack.push(inv.equipped[slot]);
      inv.equipped[slot] = copy;
    } else {
      inv.backpack.push(copy);
    }
    return { equipment: economyLib.serializeEquipment(inv) };
  },

  async grantCurrency(characterId, userId, isDm, campaignId, deltaCopper) {
    const char = await characterOps.findById(characterId);
    if (!char) return null;
    const total = economyLib.walletToCopper(char) + deltaCopper;
    if (total < 0) throw new Error('Niewystarczająco monet');
    const wallet = economyLib.copperToWallet(total);
    return this.applyCharacterUpdate(characterId, userId, isDm, campaignId, wallet);
  },

  async purchase(characterId, userId, merchantId, shopItemId) {
    const char = await characterOps.findById(characterId);
    if (!char || char.user_id !== userId) throw new Error('Brak uprawnień do postaci');
    const merchant = await merchantOps.findById(merchantId);
    if (!merchant || !merchant.is_open) throw new Error('Handlarz niedostępny');
    const shopItem = (merchant.inventory || []).find((i) => i.id === shopItemId);
    if (!shopItem) throw new Error('Brak towaru');
    const stock = shopItem.stock;
    if (stock === 0) throw new Error('Towar wyprzedany');
    const price = parseInt(shopItem.priceCopper, 10) || 0;
    const balance = economyLib.walletToCopper(char);
    if (balance < price) throw new Error('Za mało monet');
    const wallet = economyLib.copperToWallet(balance - price);
    const itemData = shopItem.itemData || shopItem.item || { name: shopItem.name, category: shopItem.category || 'gear' };
    const itemFields = this.addItemToCharacter(char, itemData, shopItem.grantAs || (itemData.damage ? 'weapon' : 'backpack'));
    const updated = await characterOps.update(characterId, userId, { ...wallet, ...itemFields });
    if (stock > 0 && merchant.inventory) {
      const inv = merchant.inventory.map((i) => {
        if (i.id !== shopItemId) return i;
        return { ...i, stock: i.stock - 1 };
      });
      await merchantOps.update(merchantId, { inventory: inv });
    }
    return { character: updated, merchant: await merchantOps.findById(merchantId) };
  },

  async transferItemBetweenCharacters(sourceCharacterId, targetCharacterId, itemId, quantity = 1) {
    const source = await characterOps.findById(sourceCharacterId);
    const target = await characterOps.findById(targetCharacterId);
    if (!source || !target) throw new Error('Nie znaleziono postaci');
    if (!source.campaign_id || source.campaign_id !== target.campaign_id) {
      throw new Error('Postacie muszą być w tej samej kampanii');
    }

    const sourceInv = economyLib.normalizeEquipment(source.equipment);
    const targetInv = economyLib.normalizeEquipment(target.equipment);
    const idx = sourceInv.backpack.findIndex((it) => it.id === itemId);
    if (idx < 0) throw new Error('Przedmiot nie jest w plecaku źródłowej postaci');

    const srcItem = sourceInv.backpack[idx];
    const srcQty = Math.max(1, parseInt(srcItem.quantity, 10) || 1);
    const moveQty = Math.max(1, Math.min(srcQty, parseInt(quantity, 10) || 1));
    const moved = { ...srcItem, quantity: moveQty };

    if (moveQty >= srcQty) sourceInv.backpack.splice(idx, 1);
    else sourceInv.backpack[idx] = { ...srcItem, quantity: srcQty - moveQty };

    const stackIdx = targetInv.backpack.findIndex((it) =>
      !it.equipSlot && !moved.equipSlot
      && (it.name || '').toLowerCase() === (moved.name || '').toLowerCase()
      && (it.category || 'gear') === (moved.category || 'gear')
    );
    if (stackIdx >= 0) {
      const q = Math.max(1, parseInt(targetInv.backpack[stackIdx].quantity, 10) || 1);
      targetInv.backpack[stackIdx] = { ...targetInv.backpack[stackIdx], quantity: q + moveQty };
    } else {
      targetInv.backpack.push(economyLib.cloneItem(moved));
    }

    const sourceUpdated = await characterOps.dmUpdate(source.id, source.campaign_id, {
      equipment: economyLib.serializeEquipment(sourceInv)
    });
    const targetUpdated = await characterOps.dmUpdate(target.id, target.campaign_id, {
      equipment: economyLib.serializeEquipment(targetInv)
    });
    return {
      sourceCharacter: sourceUpdated,
      targetCharacter: targetUpdated,
      item: moved
    };
  },

  async openLoot(grantId, userId) {
    const grant = await lootGrantOps.findById(grantId);
    if (!grant || grant.is_opened) throw new Error('Łup niedostępny');
    let char = await characterOps.findById(grant.character_id);
    if (!char || char.user_id !== userId) throw new Error('Brak uprawnień');
    const fields = {};
    for (const item of grant.resolved_items || []) {
      const working = { ...char, equipment: fields.equipment || char.equipment, weapons: fields.weapons || char.weapons };
      const patch = this.addItemToCharacter(working, item);
      if (patch.equipment) fields.equipment = patch.equipment;
      if (patch.weapons) fields.weapons = patch.weapons;
    }
    await lootGrantOps.markOpened(grantId);
    const updated = await characterOps.update(grant.character_id, userId, fields);
    return { character: updated, grant: await lootGrantOps.findById(grantId), items: grant.resolved_items };
  }
};

const musicOps = {
  async create(campaignId, userId, data) {
    const id = uuidv4();
    await query(
      `INSERT INTO campaign_music (id, campaign_id, title, file_url, file_size, mime_type, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        campaignId,
        data.title || 'Utwór',
        data.file_url,
        data.file_size || 0,
        data.mime_type || '',
        userId
      ]
    );
    return this.findById(id);
  },

  async findById(id) {
    const res = await query('SELECT * FROM campaign_music WHERE id = $1', [id]);
    return one(res);
  },

  async findByCampaign(campaignId) {
    const res = await query(
      'SELECT * FROM campaign_music WHERE campaign_id = $1 ORDER BY created_at DESC',
      [campaignId]
    );
    return res.rows;
  },

  async delete(id) {
    const track = await this.findById(id);
    if (!track) return null;
    await query('DELETE FROM campaign_music WHERE id = $1', [id]);
    return track;
  }
};

const mapPresetOps = {
  parsePresetData(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return null;
    }
  },

  parseTags(raw) {
    if (Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  },

  summarize(presetData) {
    const p = this.parsePresetData(presetData);
    if (!p) return { tokens: 0, pins: 0, blocks: 0, grid: '—' };
    const blocks = Array.isArray(p.settings?.map_blocking) ? p.settings.map_blocking.length : 0;
    return {
      tokens: (p.tokens || []).length,
      pins: (p.pins || []).length,
      blocks,
      grid: `${p.settings?.grid_width || 0}×${p.settings?.grid_height || 0}`,
      hasBackground: !!(p.settings?.background_image)
    };
  },

  async listByCampaign(campaignId) {
    const res = await query(
      'SELECT id, campaign_id, name, description, tags, preset_data, created_at, updated_at FROM map_presets WHERE campaign_id = $1 ORDER BY updated_at DESC',
      [campaignId]
    );
    return res.rows.map((row) => ({
      ...row,
      tags: this.parseTags(row.tags),
      summary: this.summarize(row.preset_data)
    }));
  },

  async findById(id) {
    const res = await query('SELECT * FROM map_presets WHERE id = $1', [id]);
    const row = one(res);
    if (!row) return null;
    return {
      ...row,
      tags: this.parseTags(row.tags),
      preset_data: this.parsePresetData(row.preset_data)
    };
  },

  async create(campaignId, dmId, data) {
    const id = uuidv4();
    const presetData = data.preset_data || {};
    await query(
      `INSERT INTO map_presets (id, campaign_id, dm_id, name, description, tags, preset_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        campaignId,
        dmId,
        data.name || 'Nowa mapa',
        data.description || '',
        JSON.stringify(data.tags || []),
        JSON.stringify(presetData)
      ]
    );
    return this.findById(id);
  },

  async update(id, data) {
    const fields = [];
    const vals = [];
    if (data.name !== undefined) {
      fields.push(`name = $${fields.length + 1}`);
      vals.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${fields.length + 1}`);
      vals.push(data.description);
    }
    if (data.tags !== undefined) {
      fields.push(`tags = $${fields.length + 1}`);
      vals.push(JSON.stringify(data.tags || []));
    }
    if (data.preset_data !== undefined) {
      fields.push(`preset_data = $${fields.length + 1}`);
      vals.push(JSON.stringify(data.preset_data));
    }
    if (!fields.length) return this.findById(id);
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    vals.push(id);
    await query(`UPDATE map_presets SET ${fields.join(', ')} WHERE id = $${vals.length}`, vals);
    return this.findById(id);
  },

  async delete(id) {
    await query('DELETE FROM map_presets WHERE id = $1', [id]);
  },

  async duplicate(id, dmId) {
    const src = await this.findById(id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src.preset_data || {}));
    return this.create(src.campaign_id, dmId, {
      name: `${src.name} (kopia)`,
      description: src.description,
      tags: src.tags,
      preset_data: copy
    });
  }
};

module.exports = {
  initializeDatabase,
  saveDb,
  userOps,
  campaignOps,
  characterOps,
  messageOps,
  npcOps,
  initiativeOps,
  noteOps,
  mapOps,
  combatOps,
  diceLogOps,
  conditionOps,
  merchantOps,
  lootTableOps,
  lootGrantOps,
  economyOps,
  musicOps,
  resolveEntityStats,
  mapPresetOps
};
