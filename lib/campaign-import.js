/**
 * Przywracanie kampanii z eksportu (campaign.json / ZIP).
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function getPool() {
  return require('../database').pool;
}

function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Nieprawidłowy plik backupu');
  if (!raw.meta || !raw.campaign) {
    throw new Error('Brak wymaganych pól meta / campaign — użyj eksportu z Roll 1');
  }
  if (raw.meta.schema_version != null && Number(raw.meta.schema_version) > 1) {
    throw new Error(`Nieobsługiwana wersja schematu: ${raw.meta.schema_version}`);
  }
  return raw;
}

function remapUsersInJson(val, mapUser) {
  if (val == null || val === '') return val;
  try {
    const arr = typeof val === 'string' ? JSON.parse(val) : val;
    if (!Array.isArray(arr)) return val;
    const next = arr.map((id) => mapUser(id));
    return typeof val === 'string' ? JSON.stringify(next) : next;
  } catch {
    return val;
  }
}

function remapJsonString(val, idMap) {
  if (val == null || val === '') return val;
  let s = typeof val === 'string' ? val : JSON.stringify(val);
  for (const [oldId, newId] of idMap) {
    if (oldId && newId && oldId !== newId) s = s.split(oldId).join(newId);
  }
  return typeof val === 'string' ? s : JSON.parse(s);
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn((sql, params) => client.query(sql, params));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function insertRow(q, table, row) {
  const data = { ...row };
  delete data.member_count;
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (!keys.length) return;
  const cols = keys.map((k) => `"${k}"`).join(', ');
  const ph = keys.map((_, i) => `$${i + 1}`).join(', ');
  await q(`INSERT INTO ${table} (${cols}) VALUES (${ph})`, keys.map((k) => data[k]));
}

async function clearCampaignData(q, campaignId) {
  const tables = [
    'loot_grants', 'initiative_entries', 'map_pins', 'map_tokens',
    'messages', 'dice_log', 'session_notes', 'encounters', 'npcs', 'characters',
    'merchants', 'loot_tables', 'custom_items', 'custom_monsters', 'token_images',
    'campaign_music', 'map_presets', 'quests', 'handouts', 'sound_effects',
    'campaign_world_state', 'map_settings'
  ];
  for (const t of tables) {
    await q(`DELETE FROM ${t} WHERE campaign_id = $1`, [campaignId]);
  }
}

function copyImportFiles(snapshot, filesRoot, projectRoot) {
  const copied = [];
  const missing = [];
  const urls = snapshot.referenced_files || [];
  for (const url of urls) {
    if (typeof url !== 'string' || !url.startsWith('/')) continue;
    const rel = url.replace(/^\//, '');
    const src = filesRoot ? path.join(filesRoot, rel) : null;
    let dest;
    if (rel.startsWith('handout-files/')) {
      dest = path.join(projectRoot, 'private_uploads', 'handouts', path.basename(rel));
    } else if (rel.startsWith('uploads/')) {
      dest = path.join(projectRoot, 'public', rel);
    } else continue;
    if (!src || !fs.existsSync(src)) {
      missing.push(url);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copied.push(url);
  }
  return { copied, missing };
}

/**
 * @param {string} targetCampaignId — kampania docelowa (zachowuje id, MG, członków)
 * @param {object} snapshot — campaign.json
 * @param {{ dmUserId: string, memberUserIds: Set<string>, filesRoot?: string, projectRoot?: string }} options
 */
async function restoreCampaignFromSnapshot(targetCampaignId, snapshot, options) {
  const snap = normalizeSnapshot(snapshot);
  const dmUserId = options.dmUserId;
  const memberUserIds = options.memberUserIds || new Set();
  memberUserIds.add(dmUserId);

  const mapUser = (uid) => {
    if (!uid) return dmUserId;
    return memberUserIds.has(uid) ? uid : dmUserId;
  };

  const idMap = new Map();
  const newId = (oldId) => {
    if (!oldId) return oldId;
    if (!idMap.has(oldId)) idMap.set(oldId, uuidv4());
    return idMap.get(oldId);
  };

  const stats = await withTransaction(async (q) => {
    await clearCampaignData(q, targetCampaignId);

    const c = snap.campaign;
    if (c) {
      await q(
        `UPDATE campaigns SET name = $1, description = $2, setting = $3, max_players = $4,
         initiative_round = COALESCE($5, initiative_round), status = COALESCE($6, status)
         WHERE id = $7`,
        [
          c.name || 'Kampania',
          c.description ?? '',
          c.setting ?? 'Forgotten Realms',
          c.max_players ?? 6,
          c.initiative_round ?? null,
          c.status ?? null,
          targetCampaignId
        ]
      );
    }

    const counts = {};

    const addEntities = async (key, table, extra = () => ({})) => {
      const rows = snap[key] || [];
      counts[key] = 0;
      for (const row of rows) {
        const r = { ...row, ...extra(row) };
        if (r.id) r.id = newId(r.id);
        r.campaign_id = targetCampaignId;
        await insertRow(q, table, r);
        counts[key] += 1;
      }
    };

    await addEntities('characters', 'characters', (r) => ({
      user_id: mapUser(r.user_id)
    }));
    await addEntities('npcs', 'npcs', (r) => ({
      dm_id: mapUser(r.dm_id)
    }));
    await addEntities('custom_monsters', 'custom_monsters');
    await addEntities('merchants', 'merchants');
    await addEntities('loot_tables', 'loot_tables');
    await addEntities('custom_items', 'custom_items');
    await addEntities('token_images', 'token_images', (r) => ({
      uploaded_by: mapUser(r.uploaded_by)
    }));
    await addEntities('campaign_music', 'campaign_music', (r) => ({
      uploaded_by: mapUser(r.uploaded_by)
    }));
    await addEntities('sound_effects', 'sound_effects', (r) => ({
      dm_id: mapUser(r.dm_id)
    }));
    await addEntities('quests', 'quests', (r) => ({
      linked_npc_ids: remapJsonString(r.linked_npc_ids, idMap),
      objectives: remapJsonString(r.objectives, idMap)
    }));
    await addEntities('handouts', 'handouts', (r) => ({
      dm_id: mapUser(r.dm_id),
      recipient_user_ids: remapUsersInJson(r.recipient_user_ids, mapUser)
    }));
    await addEntities('map_presets', 'map_presets', (r) => ({
      dm_id: mapUser(r.dm_id),
      preset_data: remapJsonString(r.preset_data, idMap)
    }));
    await addEntities('encounters', 'encounters', (r) => ({
      monsters: remapJsonString(r.monsters, idMap)
    }));
    await addEntities('session_notes', 'session_notes', (r) => ({
      user_id: mapUser(r.user_id)
    }));
    await addEntities('messages', 'messages', (r) => ({
      user_id: mapUser(r.user_id)
    }));
    await addEntities('dice_log', 'dice_log', (r) => ({
      user_id: mapUser(r.user_id)
    }));

    const lootGrants = snap.loot_grants || [];
    counts.loot_grants = 0;
    for (const row of lootGrants) {
      const r = { ...row };
      if (r.id) r.id = newId(r.id);
      r.campaign_id = targetCampaignId;
      if (r.character_id) r.character_id = newId(r.character_id);
      if (r.loot_table_id) r.loot_table_id = newId(r.loot_table_id);
      await insertRow(q, 'loot_grants', r);
      counts.loot_grants += 1;
    }

    const mapTokens = snap.map_tokens || [];
    counts.map_tokens = 0;
    for (const row of mapTokens) {
      const r = { ...row };
      if (r.id) r.id = newId(r.id);
      r.campaign_id = targetCampaignId;
      if (r.entity_id) r.entity_id = newId(r.entity_id);
      await insertRow(q, 'map_tokens', r);
      counts.map_tokens += 1;
    }

    const initiative = snap.initiative || [];
    counts.initiative = 0;
    for (const row of initiative) {
      const r = { ...row };
      if (r.id) r.id = newId(r.id);
      r.campaign_id = targetCampaignId;
      if (r.entity_id) r.entity_id = newId(r.entity_id);
      if (r.map_token_id) r.map_token_id = newId(r.map_token_id);
      await insertRow(q, 'initiative_entries', r);
      counts.initiative += 1;
    }

    const mapPins = snap.map_pins || [];
    counts.map_pins = 0;
    for (const row of mapPins) {
      const r = { ...row };
      if (r.id) r.id = newId(r.id);
      r.campaign_id = targetCampaignId;
      if (r.loot_grant_id) r.loot_grant_id = newId(r.loot_grant_id);
      await insertRow(q, 'map_pins', r);
      counts.map_pins += 1;
    }

    if (snap.map_settings) {
      const ms = { ...snap.map_settings };
      ms.campaign_id = targetCampaignId;
      ms.fog_revealed = remapJsonString(ms.fog_revealed, idMap);
      ms.movement_trails = remapJsonString(ms.movement_trails, idMap);
      ms.combat_state = remapJsonString(ms.combat_state, idMap);
      ms.map_blocking = remapJsonString(ms.map_blocking, idMap);
      ms.map_zones = remapJsonString(ms.map_zones, idMap);
      ms.last_token_move = remapJsonString(ms.last_token_move, idMap);
      await insertRow(q, 'map_settings', ms);
      counts.map_settings = 1;
    }

    if (snap.world_state) {
      const ws = { ...snap.world_state };
      ws.campaign_id = targetCampaignId;
      await insertRow(q, 'campaign_world_state', ws);
      counts.world_state = 1;
    }

    return counts;
  });

  let files = { copied: [], missing: [] };
  if (options.filesRoot && options.projectRoot) {
    files = copyImportFiles(snap, options.filesRoot, options.projectRoot);
  }

  return {
    stats,
    files,
    sourceCampaignId: snap.meta.campaign_id,
    exportedAt: snap.meta.exported_at
  };
}

module.exports = { normalizeSnapshot, restoreCampaignFromSnapshot, copyImportFiles };
