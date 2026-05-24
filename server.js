const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const {
  initializeDatabase, userOps, campaignOps, characterOps, messageOps, npcOps,
  initiativeOps, noteOps, mapOps, combatOps, diceLogOps, conditionOps,
  merchantOps, lootTableOps, lootGrantOps, economyOps, musicOps, resolveEntityStats,
  mapPresetOps
} = require('./database');
const { generateToken, authMiddleware, socketAuthMiddleware } = require('./auth');

const app = express();
const server = http.createServer(app);
const socketCorsOrigin = process.env.SOCKET_CORS_ORIGIN || '*';
const io = new Server(server, {
  cors: {
    origin: socketCorsOrigin === '*' ? '*' : socketCorsOrigin.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST']
  }
});

const mapUploadsDir = path.join(__dirname, 'public', 'uploads', 'maps');
const tokenUploadsDir = path.join(__dirname, 'public', 'uploads', 'tokens');
const characterUploadsDir = path.join(__dirname, 'public', 'uploads', 'characters');
const musicUploadsDir = path.join(__dirname, 'public', 'uploads', 'music');
fs.mkdirSync(mapUploadsDir, { recursive: true });
fs.mkdirSync(tokenUploadsDir, { recursive: true });
fs.mkdirSync(characterUploadsDir, { recursive: true });
fs.mkdirSync(musicUploadsDir, { recursive: true });

const MUSIC_MIME = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/webm',
  'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac'
]);

const musicPlaybackByCampaign = new Map();

function defaultMusicPlayback() {
  return { trackId: null, isPlaying: false, positionSec: 0, updatedAt: Date.now() };
}

function getSyncedMusicPosition(playback) {
  if (!playback?.trackId) return 0;
  if (!playback.isPlaying) return Math.max(0, playback.positionSec || 0);
  const elapsed = (Date.now() - (playback.updatedAt || Date.now())) / 1000;
  return Math.max(0, (playback.positionSec || 0) + elapsed);
}

async function buildMusicPayload(campaignId) {
  const tracks = await musicOps.findByCampaign(campaignId);
  const playback = musicPlaybackByCampaign.get(campaignId) || defaultMusicPlayback();
  return {
    tracks,
    playback: {
      ...playback,
      syncedPositionSec: getSyncedMusicPosition(playback)
    }
  };
}

function broadcastMusicSync(campaignId) {
  buildMusicPayload(campaignId)
    .then((payload) => io.to(campaignId).emit('music-sync', payload))
    .catch((err) => console.error('music-sync broadcast error:', err));
}

function tryDeleteMusicFile(relativePath) {
  if (!relativePath || !relativePath.startsWith('/uploads/music/')) return;
  const candidate = path.normalize(path.join(__dirname, 'public', relativePath));
  if (!candidate.startsWith(musicUploadsDir)) return;
  fs.promises.unlink(candidate).catch(() => {});
}

const musicUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, musicUploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowedExt = ['.mp3', '.ogg', '.wav', '.webm', '.m4a', '.aac', '.flac'];
      const safeExt = allowedExt.includes(ext) ? ext : '.mp3';
      cb(null, `music-${req.params.id}-${Date.now()}${safeExt}`);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (MUSIC_MIME.has(file.mimetype) || (file.mimetype || '').startsWith('audio/')) {
      return cb(null, true);
    }
    cb(new Error('Dozwolone są tylko pliki audio (mp3, ogg, wav, m4a…)'));
  }
});

function sanitizeMapSettings(settings, isDm) {
  if (!settings) return settings;
  const copy = { ...settings };
  if (!isDm) {
    delete copy.last_token_move;
  }
  return copy;
}

function buildMapPayload(campaignId) {
  return Promise.all([
    mapOps.getTokens(campaignId),
    mapOps.getSettings(campaignId),
    mapOps.getPins(campaignId),
    combatOps.getPayload(campaignId)
  ]).then(([tokens, settings, pins, combat]) => ({
    tokens,
    pins,
    settings,
    combat
  }));
}

async function broadcastCombatUpdate(campaignId) {
  const combat = await combatOps.getPayload(campaignId);
  io.to(campaignId).emit('combat-update', combat);
  return combat;
}

async function afterInitiativeTurnChange(campaignId) {
  await combatOps.syncTurnWithInitiative(campaignId);
  const state = await initiativeOps.getState(campaignId);
  io.to(campaignId).emit('initiative-update', state);
  await broadcastCombatUpdate(campaignId);
  const active = state.entries.find((e) => e.is_active);
  if (active?.map_token_id) {
    io.to(campaignId).emit('initiative-highlight', {
      entryId: active.id,
      mapTokenId: active.map_token_id
    });
  }
  return state;
}

async function userOwnsPlayerToken(userId, campaignId, token) {
  if (!token || token.entity_type !== 'player' || !token.entity_id) return false;
  const char = await characterOps.findById(token.entity_id);
  return char && char.user_id === userId && char.campaign_id === campaignId;
}

const mapBackgroundUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mapUploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowedExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
      const safeExt = allowedExt.includes(ext) ? ext : '.png';
      cb(null, `${req.params.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Dozwolone są tylko pliki graficzne'));
    }
    cb(null, true);
  }
});

const tokenImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tokenUploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowedExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
      const safeExt = allowedExt.includes(ext) ? ext : '.png';
      cb(null, `token-${req.params.tokenId}-${Date.now()}${safeExt}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Dozwolone są tylko pliki graficzne'));
    }
    cb(null, true);
  }
});

function tryDeleteMapBackground(relativePath) {
  if (!relativePath || !relativePath.startsWith('/uploads/maps/')) return;
  const candidate = path.normalize(path.join(__dirname, 'public', relativePath));
  if (!candidate.startsWith(mapUploadsDir)) return;
  fs.promises.unlink(candidate).catch(() => {});
}

async function copyMapBackgroundForPreset(srcPath, presetId) {
  if (!srcPath || !srcPath.startsWith('/uploads/maps/')) return srcPath || '';
  const src = path.normalize(path.join(__dirname, 'public', srcPath));
  if (!src.startsWith(mapUploadsDir) || !fs.existsSync(src)) return srcPath;
  const ext = path.extname(src) || '.png';
  const destName = `preset-${presetId}${ext}`;
  const dest = path.join(mapUploadsDir, destName);
  await fs.promises.copyFile(src, dest);
  return `/uploads/maps/${destName}`;
}

async function finalizePresetBackground(presetId, presetData) {
  const data = { ...presetData };
  const bg = data.settings?.background_image;
  if (bg) {
    const copied = await copyMapBackgroundForPreset(bg, presetId);
    if (copied && copied !== bg) {
      data.settings = { ...data.settings, background_image: copied };
    }
  }
  return data;
}

function tryDeleteCharacterImage(relativePath) {
  if (!relativePath || !relativePath.startsWith('/uploads/characters/')) return;
  const candidate = path.normalize(path.join(__dirname, 'public', relativePath));
  if (!candidate.startsWith(characterUploadsDir)) return;
  fs.promises.unlink(candidate).catch(() => {});
}

async function canEditCharacter(req, character) {
  if (!character) return false;
  if (character.user_id === req.user.id) return true;
  if (character.campaign_id && (await campaignOps.isDm(character.campaign_id, req.user.id))) return true;
  return false;
}

const characterImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, characterUploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowedExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
      const safeExt = allowedExt.includes(ext) ? ext : '.png';
      const kind = req.params.kind || 'img';
      cb(null, `char-${req.params.id}-${kind}-${Date.now()}${safeExt}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Dozwolone są tylko pliki graficzne'));
    }
    cb(null, true);
  }
});

function handleCharacterImageUpload(field, kind) {
  return async (req, res) => {
    const character = await characterOps.findById(req.params.id);
    if (!character) return res.status(404).json({ error: 'Postać nie znaleziona' });
    if (!(await canEditCharacter(req, character))) {
      return res.status(403).json({ error: 'Brak uprawnień' });
    }

    req.params.kind = kind;
    characterImageUpload.single('image')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Błąd uploadu' });
      if (!req.file) return res.status(400).json({ error: 'Nie przesłano pliku' });

      const imageUrl = `/uploads/characters/${req.file.filename}`;
      const oldUrl = character[field] || '';
      try {
        const isOwner = character.user_id === req.user.id;
        const isDm = character.campaign_id && (await campaignOps.isDm(character.campaign_id, req.user.id));
        const updated = isDm && !isOwner
          ? await characterOps.dmUpdate(req.params.id, character.campaign_id, { [field]: imageUrl })
          : await characterOps.update(req.params.id, req.user.id, { [field]: imageUrl });

        if (oldUrl && oldUrl !== imageUrl) tryDeleteCharacterImage(oldUrl);
        if (character.campaign_id) {
          io.to(character.campaign_id).emit('character-inventory-updated', { characterId: updated.id });
        }
        res.json(updated);
      } catch (uploadError) {
        tryDeleteCharacterImage(imageUrl);
        console.error('Character image upload error:', uploadError);
        res.status(500).json({ error: 'Nie udało się zapisać obrazu' });
      }
    });
  };
}

function handleCharacterImageDelete(field) {
  return async (req, res) => {
    const character = await characterOps.findById(req.params.id);
    if (!character) return res.status(404).json({ error: 'Postać nie znaleziona' });
    if (!(await canEditCharacter(req, character))) {
      return res.status(403).json({ error: 'Brak uprawnień' });
    }
    const oldUrl = character[field] || '';
    const isOwner = character.user_id === req.user.id;
    const isDm = character.campaign_id && (await campaignOps.isDm(character.campaign_id, req.user.id));
    const updated = isDm && !isOwner
      ? await characterOps.dmUpdate(req.params.id, character.campaign_id, { [field]: '' })
      : await characterOps.update(req.params.id, req.user.id, { [field]: '' });
    if (oldUrl) tryDeleteCharacterImage(oldUrl);
    if (character.campaign_id) {
      io.to(character.campaign_id).emit('character-inventory-updated', { characterId: updated.id });
    }
    res.json(updated);
  };
}

// Middleware
const isProduction = process.env.NODE_ENV === 'production';
const useHttps = process.env.USE_HTTPS === 'true';
app.use(helmet({
  hsts: useHttps,
  crossOriginOpenerPolicy: useHttps,
  originAgentCluster: useHttps,
  crossOriginResourcePolicy: useHttps ? { policy: 'cross-origin' } : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      // Dynamic HTML uses onclick/onchange (character sheet, map, initiative)
      scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      styleSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      upgradeInsecureRequests: useHttps ? [] : null
    }
  }
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Za dużo prób, spróbuj ponownie za 15 minut' }
});

// ============ AUTH ROUTES ============
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Wszystkie pola są wymagane' });
    }
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Nazwa użytkownika musi mieć 3-30 znaków' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Nazwa użytkownika może zawierać tylko litery, cyfry i podkreślenia' });
    }
    if (password.length < 10) {
      return res.status(400).json({ error: 'Hasło musi mieć minimum 10 znaków' });
    }
    if (await userOps.findByUsername(username)) {
      return res.status(400).json({ error: 'Ta nazwa użytkownika jest już zajęta' });
    }
    if (await userOps.findByEmail(email)) {
      return res.status(400).json({ error: 'Ten email jest już zarejestrowany' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userOps.create(username, email, passwordHash, displayName || username);
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Podaj login i hasło' });
    }
    const user = await userOps.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });
    }
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const user = await userOps.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
  res.json(user);
});

// ============ CAMPAIGN ROUTES ============
app.post('/api/campaigns', authMiddleware, async (req, res) => {
  try {
    const { name, description, setting, maxPlayers, deletePassword } = req.body;
    if (!name) return res.status(400).json({ error: 'Nazwa kampanii jest wymagana' });
    if (!deletePassword || String(deletePassword).length < 4) {
      return res.status(400).json({ error: 'Hasło usuwania kampanii jest wymagane (min. 4 znaki)' });
    }
    const deletePasswordHash = await bcrypt.hash(String(deletePassword), 12);
    const campaign = await campaignOps.create(
      name,
      description || '',
      req.user.id,
      setting || 'Forgotten Realms',
      maxPlayers || 6,
      deletePasswordHash
    );
    res.json(campaign);
  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

app.get('/api/campaigns', authMiddleware, async (req, res) => {
  const campaigns = await campaignOps.listForUser(req.user.id);
  res.json(campaigns);
});

app.get('/api/campaigns/:id', authMiddleware, async (req, res) => {
  const campaign = await campaignOps.findById(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Kampania nie znaleziona' });
  const membership = await campaignOps.isMember(campaign.id, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Nie jesteś członkiem tej kampanii' });
  const members = await campaignOps.getMembers(campaign.id);
  res.json({ ...campaign, members, role: membership.role });
});

app.post('/api/campaigns/join', authMiddleware, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: 'Kod zaproszenia jest wymagany' });
    const campaign = await campaignOps.findByInviteCode(inviteCode.toUpperCase());
    if (!campaign) return res.status(404).json({ error: 'Nie znaleziono kampanii o tym kodzie' });
    if (await campaignOps.isMember(campaign.id, req.user.id)) {
      return res.status(400).json({ error: 'Już jesteś członkiem tej kampanii' });
    }
    const members = await campaignOps.getMembers(campaign.id);
    if (members.length >= campaign.max_players) {
      return res.status(400).json({ error: 'Kampania jest pełna' });
    }
    await campaignOps.addMember(campaign.id, req.user.id, 'player');
    res.json({ message: 'Dołączono do kampanii', campaign });
  } catch (err) {
    console.error('Join campaign error:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

app.delete('/api/campaigns/:id/leave', authMiddleware, async (req, res) => {
  const campaign = await campaignOps.findById(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Kampania nie znaleziona' });
  if (campaign.dm_id === req.user.id) {
    return res.status(400).json({ error: 'Mistrz Gry nie może opuścić kampanii — usuń kampanię, jeśli chcesz ją zamknąć' });
  }
  await campaignOps.removeMember(req.params.id, req.user.id);
  res.json({ message: 'Opuszczono kampanię' });
});

app.delete('/api/campaigns/:id', authMiddleware, async (req, res) => {
  try {
    const campaign = await campaignOps.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Kampania nie znaleziona' });
    if (campaign.dm_id !== req.user.id) {
      return res.status(403).json({ error: 'Tylko Mistrz Gry może usunąć kampanię' });
    }
    const password = req.body?.deletePassword || req.body?.password || '';
    if (!password) {
      return res.status(400).json({ error: 'Podaj hasło usuwania kampanii' });
    }
    if (!campaign.delete_password_hash) {
      return res.status(400).json({ error: 'Ta kampania nie ma hasła usuwania — utwórz nową kampanię z hasłem' });
    }
    const valid = await bcrypt.compare(String(password), campaign.delete_password_hash);
    if (!valid) {
      return res.status(403).json({ error: 'Nieprawidłowe hasło usuwania' });
    }
    await campaignOps.delete(req.params.id);
    io.to(req.params.id).emit('campaign-deleted', { campaignId: req.params.id });
    res.json({ message: 'Kampania usunięta' });
  } catch (err) {
    console.error('Delete campaign error:', err);
    res.status(500).json({ error: 'Nie udało się usunąć kampanii' });
  }
});

// ============ CHARACTER ROUTES ============
app.post('/api/characters', authMiddleware, async (req, res) => {
  try {
    const character = await characterOps.create(req.user.id, req.body);
    res.json(character);
  } catch (err) {
    console.error('Create character error:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

app.get('/api/characters', authMiddleware, async (req, res) => {
  const characters = await characterOps.findByUser(req.user.id);
  res.json(characters);
});

app.get('/api/characters/:id', authMiddleware, async (req, res) => {
  const character = await characterOps.findById(req.params.id);
  if (!character) return res.status(404).json({ error: 'Postać nie znaleziona' });
  res.json(character);
});

app.put('/api/characters/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await characterOps.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Postać nie znaleziona' });
    const isOwner = existing.user_id === req.user.id;
    const isDm = existing.campaign_id && (await campaignOps.isDm(existing.campaign_id, req.user.id));
    let character;
    if (isOwner) {
      character = await characterOps.update(req.params.id, req.user.id, req.body);
    } else if (isDm) {
      character = await characterOps.dmUpdate(req.params.id, existing.campaign_id, req.body);
    }
    if (!character) return res.status(403).json({ error: 'Brak uprawnień' });
    res.json(character);
  } catch (err) {
    console.error('PUT /api/characters/:id', err);
    res.status(500).json({ error: 'Nie udało się zapisać postaci' });
  }
});

app.patch('/api/characters/:id/hp', authMiddleware, async (req, res) => {
  try {
    const character = await characterOps.findById(req.params.id);
    if (!character) return res.status(404).json({ error: 'Postać nie znaleziona' });
    const isOwner = character.user_id === req.user.id;
    const isDm = character.campaign_id && (await campaignOps.isDm(character.campaign_id, req.user.id));
    if (!isOwner && !isDm) return res.status(403).json({ error: 'Brak uprawnień' });

    const payload = {};
    if (req.body.current_hp !== undefined) payload.current_hp = parseInt(req.body.current_hp, 10);
    if (req.body.max_hp !== undefined) payload.max_hp = parseInt(req.body.max_hp, 10);
    if (req.body.temp_hp !== undefined) payload.temp_hp = parseInt(req.body.temp_hp, 10);
    if (req.body.conditions !== undefined) payload.conditions = req.body.conditions;

    const updated = isDm && !isOwner
      ? await characterOps.dmUpdate(req.params.id, character.campaign_id, payload)
      : await characterOps.update(req.params.id, req.user.id, payload);

    if (!updated) return res.status(404).json({ error: 'Nie udało się zaktualizować postaci' });
    if (character.campaign_id) {
      io.to(character.campaign_id).emit('character-hp-update', {
        characterId: updated.id,
        currentHp: updated.current_hp,
        maxHp: updated.max_hp,
        tempHp: updated.temp_hp,
        conditions: updated.conditions
      });
    }
    res.json(updated);
  } catch (err) {
    console.error('HP patch error:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

app.delete('/api/characters/:id', authMiddleware, async (req, res) => {
  await characterOps.delete(req.params.id, req.user.id);
  res.json({ message: 'Postać usunięta' });
});

app.get('/api/characters/:id/export', authMiddleware, async (req, res) => {
  try {
    const character = await characterOps.findById(req.params.id);
    if (!character) return res.status(404).json({ error: 'Postać nie znaleziona' });
    const isOwner = character.user_id === req.user.id;
    const isDm = character.campaign_id && (await campaignOps.isDm(character.campaign_id, req.user.id));
    if (!isOwner && !isDm) return res.status(403).json({ error: 'Brak uprawnień' });
    res.json(characterOps.exportCharacter(character));
  } catch (err) {
    console.error('GET /api/characters/:id/export', err);
    res.status(500).json({ error: 'Nie udało się wyeksportować postaci' });
  }
});

app.post('/api/characters/import', authMiddleware, async (req, res) => {
  try {
    const bundle = req.body?.bundle ?? req.body;
    let campaignId = null;
    if (req.body?.assignToCampaign && req.body?.campaignId) {
      const membership = await campaignOps.isMember(req.body.campaignId, req.user.id);
      if (!membership) return res.status(403).json({ error: 'Brak dostępu do kampanii' });
      campaignId = req.body.campaignId;
    }
    const character = await characterOps.importCharacter(req.user.id, bundle, {
      assignCampaign: !!campaignId,
      campaignId
    });
    res.status(201).json(character);
  } catch (err) {
    console.error('POST /api/characters/import', err);
    res.status(400).json({ error: err.message || 'Nie udało się zaimportować postaci' });
  }
});

app.post('/api/characters/:id/avatar', authMiddleware, handleCharacterImageUpload('avatar_url', 'avatar'));
app.post('/api/characters/:id/portrait', authMiddleware, handleCharacterImageUpload('portrait_url', 'portrait'));
app.delete('/api/characters/:id/avatar', authMiddleware, handleCharacterImageDelete('avatar_url'));
app.delete('/api/characters/:id/portrait', authMiddleware, handleCharacterImageDelete('portrait_url'));

app.get('/api/campaigns/:id/characters', authMiddleware, async (req, res) => {
  const membership = await campaignOps.isMember(req.params.id, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Brak dostępu' });
  const characters = await characterOps.findByCampaign(req.params.id);
  res.json(characters);
});

// ============ NPC ROUTES ============
app.post('/api/campaigns/:id/npcs', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może tworzyć NPC' });
  }
  const npc = await npcOps.create(req.params.id, req.user.id, req.body);
  res.json(npc);
});

app.get('/api/campaigns/:id/npcs', authMiddleware, async (req, res) => {
  const membership = await campaignOps.isMember(req.params.id, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Brak dostępu' });
  let npcs = await npcOps.findByCampaign(req.params.id);
  if (membership.role !== 'dm') {
    npcs = npcs.filter(n => n.is_visible);
  }
  res.json(npcs);
});

app.put('/api/npcs/:id', authMiddleware, async (req, res) => {
  const npc = await npcOps.findById(req.params.id);
  if (!npc) return res.status(404).json({ error: 'NPC nie znaleziony' });
  if (!(await campaignOps.isDm(npc.campaign_id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może edytować NPC' });
  }
  const updated = await npcOps.update(req.params.id, req.body);
  io.to(npc.campaign_id).emit('npc-updated', updated);
  res.json(updated);
});

async function resolveDmSpeakAs(socket, speakAs) {
  if (!speakAs?.npcId || socket.userRole !== 'dm' || !socket.campaignId) return null;
  const npc = await npcOps.findById(speakAs.npcId);
  if (!npc || npc.campaign_id !== socket.campaignId) return null;
  let entityType = 'npc';
  try {
    const meta = JSON.parse(npc.stats || '{}');
    if (meta.category === 'monster') entityType = 'monster';
  } catch (_e) { /* ignore */ }
  return {
    name: npc.name,
    rollData: JSON.stringify({ speakAs: { type: entityType, id: npc.id, name: npc.name } })
  };
}

app.delete('/api/npcs/:id', authMiddleware, async (req, res) => {
  const npc = await npcOps.findById(req.params.id);
  if (!npc) return res.status(404).json({ error: 'NPC nie znaleziony' });
  if (!(await campaignOps.isDm(npc.campaign_id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może usuwać NPC' });
  }
  await npcOps.delete(req.params.id);
  res.json({ message: 'NPC usunięty' });
});

// ============ SESSION NOTES ROUTES ============
app.post('/api/campaigns/:id/notes', authMiddleware, async (req, res) => {
  const membership = await campaignOps.isMember(req.params.id, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Brak dostępu' });
  const { title, content, isDmOnly, sessionNumber } = req.body;
  const note = await noteOps.create(req.params.id, req.user.id, title || 'Bez tytułu', content || '', isDmOnly && membership.role === 'dm', sessionNumber);
  res.json(note);
});

app.get('/api/campaigns/:id/notes', authMiddleware, async (req, res) => {
  const membership = await campaignOps.isMember(req.params.id, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Brak dostępu' });
  const notes = await noteOps.findByCampaign(req.params.id, req.user.id, membership.role === 'dm');
  res.json(notes);
});

app.put('/api/notes/:id', authMiddleware, async (req, res) => {
  const note = await noteOps.update(req.params.id, req.user.id, req.body);
  res.json(note);
});

app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
  await noteOps.delete(req.params.id, req.user.id);
  res.json({ message: 'Notatka usunięta' });
});

// ============ MESSAGES ROUTES ============
app.get('/api/campaigns/:id/messages', authMiddleware, async (req, res) => {
  const membership = await campaignOps.isMember(req.params.id, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Brak dostępu' });
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
  const before = req.query.before || null;
  let messages = await messageOps.getRecent(req.params.id, limit, before);
  // Filter whispers
  messages = messages.filter(m => {
    if (!m.is_whisper) return true;
    return m.user_id === req.user.id || m.whisper_to === req.user.username || membership.role === 'dm';
  });
  res.json(messages);
});

// ============ DICE LOG ROUTES ============
app.get('/api/campaigns/:id/dice-log', authMiddleware, async (req, res) => {
  const membership = await campaignOps.isMember(req.params.id, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Brak dostępu' });
  const log = await diceLogOps.getRecent(req.params.id);
  res.json(log);
});

// ============ CONDITIONS REFERENCE ============
app.get('/api/conditions', async (req, res) => {
  res.json(await conditionOps.getAll());
});

// ============ MAP ROUTES ============
app.get('/api/campaigns/:id/map', authMiddleware, async (req, res) => {
  const membership = await campaignOps.isMember(req.params.id, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Brak dostępu' });
  const payload = await buildMapPayload(req.params.id);
  if (membership.role !== 'dm') payload.settings = sanitizeMapSettings(payload.settings, false);
  res.json(payload);
});

app.post('/api/campaigns/:id/map/tokens/:tokenId/image', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może zmieniać tokeny' });
  }
  const token = await mapOps.getTokenById(req.params.tokenId);
  if (!token || token.campaign_id !== req.params.id) {
    return res.status(404).json({ error: 'Token nie znaleziony' });
  }

  tokenImageUpload.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Błąd uploadu' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Nie przesłano pliku' });
    }
    const imageUrl = `/uploads/tokens/${req.file.filename}`;
    await mapOps.updateToken(req.params.tokenId, { image_url: imageUrl });
    const payload = await buildMapPayload(req.params.id);
    io.to(req.params.id).emit('map-update', payload);
    res.json(payload);
  });
});

app.post('/api/campaigns/:id/map/background', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może zmieniać tło mapy' });
  }

  mapBackgroundUpload.single('background')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Błąd uploadu pliku' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nie przesłano pliku tła' });
    }

    const newBackgroundPath = `/uploads/maps/${req.file.filename}`;
    try {
      const oldSettings = await mapOps.getSettings(req.params.id);
      const oldBackgroundPath = oldSettings?.background_image || '';

      await mapOps.updateSettings(req.params.id, { background_image: newBackgroundPath });
      if (oldBackgroundPath && oldBackgroundPath !== newBackgroundPath) {
        tryDeleteMapBackground(oldBackgroundPath);
      }

      const tokens = await mapOps.getTokens(req.params.id);
      const settings = await mapOps.getSettings(req.params.id);
      io.to(req.params.id).emit('map-update', { tokens, settings });
      res.json({ tokens, settings });
    } catch (uploadError) {
      tryDeleteMapBackground(newBackgroundPath);
      console.error('Map background upload error:', uploadError);
      res.status(500).json({ error: 'Nie udało się zapisać tła mapy' });
    }
  });
});

app.delete('/api/campaigns/:id/map/background', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może usuwać tło mapy' });
  }

  try {
    const oldSettings = await mapOps.getSettings(req.params.id);
    const oldBackgroundPath = oldSettings?.background_image || '';

    await mapOps.updateSettings(req.params.id, { background_image: '' });
    tryDeleteMapBackground(oldBackgroundPath);

    const tokens = await mapOps.getTokens(req.params.id);
    const settings = await mapOps.getSettings(req.params.id);
    io.to(req.params.id).emit('map-update', { tokens, settings });
    res.json({ tokens, settings });
  } catch (err) {
    console.error('Map background delete error:', err);
    res.status(500).json({ error: 'Nie udało się usunąć tła mapy' });
  }
});

// ============ MAP PRESETS / CREATOR ============
app.get('/api/campaigns/:id/map/presets', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isMember(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Brak dostępu' });
  }
  res.json(await mapPresetOps.listByCampaign(req.params.id));
});

app.get('/api/campaigns/:id/map/export', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry' });
  }
  res.json(await mapOps.exportSnapshot(req.params.id));
});

app.post('/api/campaigns/:id/map/presets', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry' });
  }
  let presetData = req.body.preset_data;
  if (req.body.fromCurrent) {
    presetData = await mapOps.exportSnapshot(req.params.id);
  }
  if (!presetData) {
    return res.status(400).json({ error: 'Brak danych presetu' });
  }
  const created = await mapPresetOps.create(req.params.id, req.user.id, {
    name: req.body.name || 'Nowa mapa',
    description: req.body.description || '',
    tags: req.body.tags || [],
    preset_data: presetData
  });
  const finalized = await finalizePresetBackground(created.id, created.preset_data);
  const updated = await mapPresetOps.update(created.id, { preset_data: finalized });
  res.json(updated);
});

app.get('/api/map/presets/:id', authMiddleware, async (req, res) => {
  const preset = await mapPresetOps.findById(req.params.id);
  if (!preset) return res.status(404).json({ error: 'Preset nie znaleziony' });
  if (!(await campaignOps.isMember(preset.campaign_id, req.user.id))) {
    return res.status(403).json({ error: 'Brak dostępu' });
  }
  res.json(preset);
});

app.put('/api/map/presets/:id', authMiddleware, async (req, res) => {
  const preset = await mapPresetOps.findById(req.params.id);
  if (!preset) return res.status(404).json({ error: 'Preset nie znaleziony' });
  if (!(await campaignOps.isDm(preset.campaign_id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry' });
  }
  let presetData = req.body.preset_data;
  if (presetData) {
    presetData = await finalizePresetBackground(preset.id, presetData);
  }
  const updated = await mapPresetOps.update(req.params.id, {
    name: req.body.name,
    description: req.body.description,
    tags: req.body.tags,
    preset_data: presetData
  });
  res.json(updated);
});

app.delete('/api/map/presets/:id', authMiddleware, async (req, res) => {
  const preset = await mapPresetOps.findById(req.params.id);
  if (!preset) return res.status(404).json({ error: 'Preset nie znaleziony' });
  if (!(await campaignOps.isDm(preset.campaign_id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry' });
  }
  await mapPresetOps.delete(req.params.id);
  res.json({ ok: true });
});

app.post('/api/map/presets/:id/duplicate', authMiddleware, async (req, res) => {
  const preset = await mapPresetOps.findById(req.params.id);
  if (!preset) return res.status(404).json({ error: 'Preset nie znaleziony' });
  if (!(await campaignOps.isDm(preset.campaign_id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry' });
  }
  const copy = await mapPresetOps.duplicate(req.params.id, req.user.id);
  if (copy?.preset_data) {
    const finalized = await finalizePresetBackground(copy.id, copy.preset_data);
    await mapPresetOps.update(copy.id, { preset_data: finalized });
  }
  res.json(await mapPresetOps.findById(copy.id));
});

app.post('/api/campaigns/:id/map/presets/:presetId/apply', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry' });
  }
  const preset = await mapPresetOps.findById(req.params.presetId);
  if (!preset || preset.campaign_id !== req.params.id) {
    return res.status(404).json({ error: 'Preset nie znaleziony' });
  }
  const result = await mapOps.applySnapshot(req.params.id, preset.preset_data, {
    clearTokens: req.body.clearTokens !== false,
    clearPins: req.body.clearPins !== false,
    resetFog: req.body.resetFog !== false,
    resetInitiative: !!req.body.resetInitiative
  });
  const payload = await buildMapPayload(req.params.id);
  io.to(req.params.id).emit('map-update', payload);
  io.to(req.params.id).emit('initiative-update', await initiativeOps.getState(req.params.id));
  await broadcastCombatUpdate(req.params.id);
  res.json({ ok: true, ...result });
});

app.post('/api/map/presets/:id/background', authMiddleware, async (req, res) => {
  const preset = await mapPresetOps.findById(req.params.id);
  if (!preset) return res.status(404).json({ error: 'Preset nie znaleziony' });
  if (!(await campaignOps.isDm(preset.campaign_id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry' });
  }

  const presetBgUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, mapUploadsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const allowedExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
        const safeExt = allowedExt.includes(ext) ? ext : '.png';
        cb(null, `preset-${req.params.id}${safeExt}`);
      }
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Dozwolone są tylko pliki graficzne'));
      }
      cb(null, true);
    }
  });

  presetBgUpload.single('background')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Błąd uploadu' });
    if (!req.file) return res.status(400).json({ error: 'Nie przesłano pliku' });
    const bgPath = `/uploads/maps/${req.file.filename}`;
    const data = preset.preset_data || {};
    data.settings = { ...(data.settings || {}), background_image: bgPath };
    const updated = await mapPresetOps.update(preset.id, { preset_data: data });
    res.json(updated);
  });
});

// ============ CAMPAIGN MUSIC ============
app.get('/api/campaigns/:id/music', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isMember(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Brak dostępu' });
  }
  const tracks = await musicOps.findByCampaign(req.params.id);
  const playback = musicPlaybackByCampaign.get(req.params.id) || defaultMusicPlayback();
  res.json({
    tracks,
    playback: { ...playback, syncedPositionSec: getSyncedMusicPosition(playback) }
  });
});

app.post('/api/campaigns/:id/music', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może dodawać muzykę' });
  }

  musicUpload.single('audio')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Błąd uploadu' });
    if (!req.file) return res.status(400).json({ error: 'Nie przesłano pliku' });

    const title = (req.body?.title || req.file.originalname || 'Utwór').trim().slice(0, 120);
    const fileUrl = `/uploads/music/${req.file.filename}`;

    try {
      const track = await musicOps.create(req.params.id, req.user.id, {
        title,
        file_url: fileUrl,
        file_size: req.file.size,
        mime_type: req.file.mimetype
      });
      broadcastMusicSync(req.params.id);
      res.json(track);
    } catch (uploadError) {
      tryDeleteMusicFile(fileUrl);
      console.error('Music upload error:', uploadError);
      res.status(500).json({ error: 'Nie udało się zapisać utworu' });
    }
  });
});

app.delete('/api/campaigns/:id/music/:trackId', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może usuwać muzykę' });
  }
  const track = await musicOps.findById(req.params.trackId);
  if (!track || track.campaign_id !== req.params.id) {
    return res.status(404).json({ error: 'Utwór nie znaleziony' });
  }

  await musicOps.delete(req.params.trackId);
  tryDeleteMusicFile(track.file_url);

  const playback = musicPlaybackByCampaign.get(req.params.id);
  if (playback?.trackId === track.id) {
    musicPlaybackByCampaign.set(req.params.id, defaultMusicPlayback());
  }
  broadcastMusicSync(req.params.id);
  res.json({ message: 'Utwór usunięty' });
});

// ============ SOCKET.IO ============
io.use(socketAuthMiddleware);

// Track online users per campaign
const campaignRooms = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.username}`);

  // Join campaign room
  socket.on('join-campaign', async (campaignId) => {
    const membership = await campaignOps.isMember(campaignId, socket.user.id);
    if (!membership) return;
    
    socket.join(campaignId);
    socket.campaignId = campaignId;
    socket.userRole = membership.role;

    if (!campaignRooms.has(campaignId)) {
      campaignRooms.set(campaignId, new Map());
    }
    campaignRooms.get(campaignId).set(socket.user.id, {
      id: socket.user.id,
      username: socket.user.username,
      display_name: socket.user.display_name,
      role: membership.role
    });

    io.to(campaignId).emit('online-users', Array.from(campaignRooms.get(campaignId).values()));
    io.to(campaignId).emit('system-message', { content: `${socket.user.display_name} dołączył/a do sesji`, type: 'join' });

    try {
      const musicPayload = await buildMusicPayload(campaignId);
      socket.emit('music-sync', musicPayload);
    } catch (musicErr) {
      console.error('music-sync on join error:', musicErr);
    }
  });

  socket.on('music-request-sync', async () => {
    if (!socket.campaignId) return;
    try {
      socket.emit('music-sync', await buildMusicPayload(socket.campaignId));
    } catch (err) {
      console.error('music-request-sync error:', err);
    }
  });

  socket.on('music-control', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    const campaignId = socket.campaignId;
    let state = musicPlaybackByCampaign.get(campaignId) || defaultMusicPlayback();
    const action = data?.action;

    if (action === 'play') {
      const track = await musicOps.findById(data.trackId);
      if (!track || track.campaign_id !== campaignId) return;
      const pos = Math.max(0, parseFloat(data.positionSec) || 0);
      state = { trackId: track.id, isPlaying: true, positionSec: pos, updatedAt: Date.now() };
    } else if (action === 'pause') {
      if (!state.trackId) return;
      const pos = Math.max(0, parseFloat(data.positionSec) ?? getSyncedMusicPosition(state));
      state = { ...state, isPlaying: false, positionSec: pos, updatedAt: Date.now() };
    } else if (action === 'seek') {
      if (!state.trackId && data.trackId) {
        const track = await musicOps.findById(data.trackId);
        if (!track || track.campaign_id !== campaignId) return;
        state.trackId = track.id;
      }
      if (!state.trackId) return;
      const pos = Math.max(0, parseFloat(data.positionSec) || 0);
      state = { ...state, positionSec: pos, updatedAt: Date.now(), isPlaying: !!data.isPlaying };
    } else if (action === 'stop') {
      state = defaultMusicPlayback();
    } else {
      return;
    }

    musicPlaybackByCampaign.set(campaignId, state);
    broadcastMusicSync(campaignId);
  });

  // Chat message
  socket.on('chat-message', async (data) => {
    if (!socket.campaignId) return;
    const speak = await resolveDmSpeakAs(socket, data.speakAs);
    const displayName = speak?.name || socket.user.display_name || socket.user.username;
    const rollData = speak?.rollData || (data.rollData ? JSON.stringify(data.rollData) : '');
    const msg = await messageOps.create(
      socket.campaignId, socket.user.id, displayName,
      data.content, data.type || 'chat', data.isWhisper, data.whisperTo, rollData
    );
    
    if (data.isWhisper && data.whisperTo) {
      // Send whisper only to sender, recipient, and DM
      const room = campaignRooms.get(socket.campaignId);
      if (room) {
        for (const [sid, s] of io.of('/').sockets) {
          if (s.campaignId === socket.campaignId) {
            const isRecipient = s.user.username === data.whisperTo;
            const isSender = s.user.id === socket.user.id;
            const isDm = s.userRole === 'dm';
            if (isRecipient || isSender || isDm) {
              s.emit('chat-message', { ...msg, created_at: new Date().toISOString() });
            }
          }
        }
      }
    } else {
      io.to(socket.campaignId).emit('chat-message', { ...msg, created_at: new Date().toISOString() });
    }
  });

  // Dice roll
  socket.on('dice-roll', async (data) => {
    if (!socket.campaignId) return;
    const { expression, rolls, total, rollType } = data;
    const speak = await resolveDmSpeakAs(socket, data.speakAs);
    const displayName = speak?.name || socket.user.display_name || socket.user.username;
    const characterName = speak?.name || data.characterName || '';
    await diceLogOps.create(socket.campaignId, socket.user.id, displayName, expression, rolls, total, rollType);
    
    const rollMsg = {
      type: 'dice-roll',
      username: displayName,
      characterName: speak ? '' : (characterName || ''),
      expression,
      rolls,
      total,
      rollType: rollType || 'manual',
      timestamp: new Date().toISOString()
    };

    if (data.isSecret) {
      // Secret roll - only DM and roller see it
      for (const [sid, s] of io.of('/').sockets) {
        if (s.campaignId === socket.campaignId) {
          if (s.user.id === socket.user.id || s.userRole === 'dm') {
            s.emit('dice-roll', { ...rollMsg, isSecret: true });
          }
        }
      }
    } else {
      io.to(socket.campaignId).emit('dice-roll', rollMsg);
    }

    // Also post to chat
    const chatContent = data.isSecret
      ? `🎲 [Tajny rzut] ${expression} = [${rolls.join(', ')}] = ${total}`
      : `🎲 ${expression} = [${rolls.join(', ')}] = ${total}`;
    
    const rollPayload = { ...data, characterName };
    if (speak?.rollData) {
      try {
        rollPayload.speakAsMeta = JSON.parse(speak.rollData).speakAs;
      } catch (_e) { /* ignore */ }
    }
    await messageOps.create(socket.campaignId, socket.user.id, displayName, chatContent, 'roll', data.isSecret, '', JSON.stringify(rollPayload));
  });

  // Initiative
  socket.on('initiative-add', async (data) => {
    if (!socket.campaignId) return;
    const entityType = data.entityType || 'player';
    const entityId = data.entityId || '';

    if (entityType === 'player' && entityId) {
      const char = await characterOps.findById(entityId);
      if (!char || char.campaign_id !== socket.campaignId) return;
      if (socket.userRole !== 'dm' && char.user_id !== socket.user.id) return;
    } else if (socket.userRole !== 'dm') {
      return;
    }

    let mapTokenId = data.mapTokenId || '';
    if (!mapTokenId && entityId) {
      const linked = await mapOps.findTokenByEntity(socket.campaignId, entityType, entityId);
      if (linked) mapTokenId = linked.id;
    }

    const state = await initiativeOps.upsert(
      socket.campaignId,
      data.entityName,
      entityType,
      entityId,
      data.initiativeRoll,
      mapTokenId || null
    );
    io.to(socket.campaignId).emit('initiative-update', state);
    await combatOps.syncTurnWithInitiative(socket.campaignId);
    await broadcastCombatUpdate(socket.campaignId);
  });

  socket.on('initiative-remove', async (data) => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    await initiativeOps.remove(data.id);
    const state = await initiativeOps.getState(socket.campaignId);
    io.to(socket.campaignId).emit('initiative-update', state);
  });

  socket.on('initiative-clear', async () => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    await initiativeOps.clear(socket.campaignId);
    await combatOps.enableCombat(socket.campaignId, false);
    io.to(socket.campaignId).emit('initiative-update', { entries: [], round: 1 });
    await broadcastCombatUpdate(socket.campaignId);
  });

  socket.on('initiative-end-turn', async () => {
    if (!socket.campaignId) return;
    const result = await initiativeOps.endTurn(socket.campaignId, socket.user.id, socket.userRole);
    if (result.error === 'not_your_turn') {
      socket.emit('initiative-error', { message: 'To nie twoja tura.' });
      return;
    }
    if (result.error === 'no_active') {
      socket.emit('initiative-error', { message: 'Brak aktywnej postaci w kolejce.' });
      return;
    }
    const { entries, round, previousActive } = result;
    await combatOps.syncTurnWithInitiative(socket.campaignId);
    io.to(socket.campaignId).emit('initiative-update', { entries, round });
    await broadcastCombatUpdate(socket.campaignId);
    const active = entries.find((e) => e.is_active);
    if (active) {
      const ended = previousActive?.entity_name || '?';
      io.to(socket.campaignId).emit('system-message', {
        content: `Koniec tury: ${ended} → teraz: ${active.entity_name} (runda ${round})`,
        type: 'initiative'
      });
      if (active.map_token_id) {
        io.to(socket.campaignId).emit('initiative-highlight', {
          entryId: active.id,
          mapTokenId: active.map_token_id
        });
      }
    }
  });

  socket.on('initiative-next', async () => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    await afterInitiativeTurnChange(socket.campaignId);
    const state = await initiativeOps.getState(socket.campaignId);
    const active = state.entries.find((e) => e.is_active);
    if (active) {
      io.to(socket.campaignId).emit('system-message', {
        content: `Tura: ${active.entity_name} (runda ${state.round})`,
        type: 'initiative'
      });
    }
  });

  socket.on('initiative-set-active', async (data) => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    await initiativeOps.setActive(socket.campaignId, data.id);
    await combatOps.startTurnForEntry(socket.campaignId, data.id);
    await afterInitiativeTurnChange(socket.campaignId);
  });

  socket.on('get-initiative', async () => {
    if (!socket.campaignId) return;
    const state = await initiativeOps.getState(socket.campaignId);
    socket.emit('initiative-update', state);
  });

  // Map tokens
  socket.on('map-add-token', async (data) => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    const { id: tokenId } = await mapOps.addToken(socket.campaignId, data);
    if (data.entity_id && data.sync_initiative !== false) {
      const stats = await resolveEntityStats(data.entity_type || 'player', data.entity_id);
      if (stats) {
        const initState = await initiativeOps.syncEntityLink(
          socket.campaignId,
          stats.entity_type,
          data.entity_id,
          stats.name,
          tokenId,
          data.initiative_roll != null ? data.initiative_roll : null
        );
        io.to(socket.campaignId).emit('initiative-update', initState);
      }
    }
    io.to(socket.campaignId).emit('map-update', await buildMapPayload(socket.campaignId));
  });

  socket.on('map-link-token', async (data) => {
    if (!socket.campaignId || !data?.tokenId) return;
    const token = await mapOps.getTokenById(data.tokenId);
    if (!token || token.campaign_id !== socket.campaignId) return;

    const entityId = data.entityId || '';
    const entityType = data.entityType || 'player';

    if (entityId) {
      if (entityType === 'player') {
        const char = await characterOps.findById(entityId);
        if (!char || char.campaign_id !== socket.campaignId) {
          socket.emit('combat-error', { message: 'Nie znaleziono postaci.' });
          return;
        }
        if (socket.userRole !== 'dm' && char.user_id !== socket.user.id) {
          socket.emit('combat-error', { message: 'Możesz powiązać tylko własną postać.' });
          return;
        }
      } else if (socket.userRole !== 'dm') {
        socket.emit('combat-error', { message: 'Tylko MG może powiązywać NPC.' });
        return;
      }
    } else if (socket.userRole !== 'dm') {
      socket.emit('combat-error', { message: 'Tylko MG może odłączać tokeny.' });
      return;
    }

    const result = await mapOps.linkToEntity(
      socket.campaignId,
      data.tokenId,
      entityType,
      entityId,
      {
        syncInitiative: data.syncInitiative !== false,
        initiativeRoll: data.initiativeRoll != null ? data.initiativeRoll : null
      }
    );
    if (!result.ok) {
      socket.emit('combat-error', { message: 'Nie udało się powiązać tokenu.' });
      return;
    }
    io.to(socket.campaignId).emit('map-update', await buildMapPayload(socket.campaignId));
    if (entityId && data.syncInitiative !== false) {
      const initState = await initiativeOps.getState(socket.campaignId);
      io.to(socket.campaignId).emit('initiative-update', initState);
      await combatOps.syncTurnWithInitiative(socket.campaignId);
      await broadcastCombatUpdate(socket.campaignId);
    }
  });

  socket.on('map-move-token', async (data) => {
    if (!socket.campaignId) return;
    try {
      const token = await mapOps.getTokenById(data.id);
      if (!token || token.campaign_id !== socket.campaignId) return;
      if (token.is_locked) return;

      const isDm = socket.userRole === 'dm';
      const isOwnToken = await userOwnsPlayerToken(socket.user.id, socket.campaignId, token);
      if (!isDm && !isOwnToken) return;

      const validation = await combatOps.validateMove(
        socket.campaignId,
        data.id,
        data.x,
        data.y,
        socket.user.id,
        socket.userRole
      );
      if (!validation.ok) {
        socket.emit('combat-error', {
          message: validation.reason === 'no_movement'
            ? `Za mało ruchu (potrzeba ${validation.costFt} ft, zostało ${validation.remaining} ft)`
            : validation.reason === 'not_your_turn'
              ? 'To nie twoja tura.'
              : 'Nie można wykonać ruchu.'
        });
        return;
      }

      const prevX = token.x;
      const prevY = token.y;
      const lastMove = JSON.stringify({
        id: token.id,
        prevX,
        prevY,
        x: data.x,
        y: data.y,
        movedBy: socket.user.id,
        at: Date.now()
      });
      await mapOps.updateSettings(socket.campaignId, { last_token_move: lastMove });
      await combatOps.applyMove(socket.campaignId, data.id, data.x, data.y, validation);

      const settings = await mapOps.getSettings(socket.campaignId);
      if (settings?.trails_enabled) {
        await mapOps.appendMovementTrail(socket.campaignId, token.id, prevX, prevY);
        await mapOps.appendMovementTrail(socket.campaignId, token.id, data.x, data.y);
      }

      io.to(socket.campaignId).emit('map-token-moved', {
        id: data.id,
        x: data.x,
        y: data.y,
        prevX,
        prevY,
        trailsEnabled: !!settings?.trails_enabled
      });
      await broadcastCombatUpdate(socket.campaignId);
    } catch (err) {
      console.error('map-move-token', err);
      socket.emit('combat-error', { message: 'Błąd ruchu tokena' });
    }
  });

  socket.on('map-undo-move', async () => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    const settings = await mapOps.getSettings(socket.campaignId);
    if (!settings?.last_token_move) return;
    let lastMove;
    try {
      lastMove = JSON.parse(settings.last_token_move);
    } catch (_err) {
      return;
    }
    if (!lastMove?.id) return;
    await mapOps.moveToken(lastMove.id, lastMove.prevX, lastMove.prevY);
    await mapOps.updateSettings(socket.campaignId, { last_token_move: '' });
    const payload = await buildMapPayload(socket.campaignId);
    io.to(socket.campaignId).emit('map-update', payload);
  });

  socket.on('map-update-fog', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    const patch = {};
    if (data.fogEnabled !== undefined) patch.fog_enabled = data.fogEnabled ? 1 : 0;
    if (data.fogRevealed) patch.fog_revealed = JSON.stringify(data.fogRevealed);
    if (Object.keys(patch).length) await mapOps.updateSettings(socket.campaignId, patch);
    const payload = await buildMapPayload(socket.campaignId);
    io.to(socket.campaignId).emit('map-update', payload);
  });

  socket.on('map-pointer', (data) => {
    if (!socket.campaignId) return;
    io.to(socket.campaignId).emit('map-pointer', {
      x: data.x,
      y: data.y,
      userId: socket.user.id,
      displayName: socket.user.display_name || socket.user.username,
      color: data.color || '#c9a227'
    });
  });

  socket.on('map-clear-trails', async () => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    await mapOps.clearMovementTrails(socket.campaignId);
    const payload = await buildMapPayload(socket.campaignId);
    io.to(socket.campaignId).emit('map-update', payload);
  });

  socket.on('map-toggle-trails', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    await mapOps.updateSettings(socket.campaignId, { trails_enabled: data.enabled ? 1 : 0 });
    const payload = await buildMapPayload(socket.campaignId);
    io.to(socket.campaignId).emit('map-update', payload);
  });

  socket.on('map-add-pin', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    await mapOps.addPin(socket.campaignId, data);
    io.to(socket.campaignId).emit('map-update', await buildMapPayload(socket.campaignId));
  });

  socket.on('map-update-pin', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    if (!data?.id) return;
    await mapOps.updatePin(data.id, data);
    const payload = await buildMapPayload(socket.campaignId);
    io.to(socket.campaignId).emit('map-update', payload);
  });

  socket.on('map-remove-pin', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    if (!data?.id) return;
    await mapOps.removePin(data.id);
    const payload = await buildMapPayload(socket.campaignId);
    io.to(socket.campaignId).emit('map-update', payload);
  });

  socket.on('map-clear-pins', async () => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    await mapOps.clearPins(socket.campaignId);
    const payload = await buildMapPayload(socket.campaignId);
    io.to(socket.campaignId).emit('map-update', payload);
  });

  socket.on('map-update-token', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    if (!data?.id) return;
    await mapOps.updateToken(data.id, data);
    const payload = await buildMapPayload(socket.campaignId);
    io.to(socket.campaignId).emit('map-update', payload);
  });

  socket.on('map-remove-token', async (data) => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    await mapOps.removeToken(data.id);
    io.to(socket.campaignId).emit('map-update', await buildMapPayload(socket.campaignId));
  });

  socket.on('map-clear', async () => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    await mapOps.clearTokens(socket.campaignId);
    io.to(socket.campaignId).emit('map-update', await buildMapPayload(socket.campaignId));
  });

  socket.on('map-update-settings', async (data) => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    await mapOps.updateSettings(socket.campaignId, data);
    io.to(socket.campaignId).emit('map-update', await buildMapPayload(socket.campaignId));
  });

  socket.on('get-map', async () => {
    if (!socket.campaignId) return;
    const payload = await buildMapPayload(socket.campaignId);
    if (socket.userRole !== 'dm') {
      payload.settings = sanitizeMapSettings(payload.settings, false);
    }
    socket.emit('map-update', payload);
  });

  socket.on('combat-get-state', async () => {
    if (!socket.campaignId) return;
    try {
      const combat = await combatOps.getPayload(socket.campaignId);
      socket.emit('combat-update', combat);
    } catch (err) {
      console.error('combat-get-state', err);
    }
  });

  socket.on('combat-enable', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    try {
      await combatOps.enableCombat(socket.campaignId, !!data?.enabled);
      if (data?.enabled) await combatOps.syncTurnWithInitiative(socket.campaignId);
      await broadcastCombatUpdate(socket.campaignId);
    } catch (err) {
      console.error('combat-enable', err);
    }
  });

  socket.on('combat-set-movement', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    try {
      const result = await combatOps.setTokenMovement(socket.campaignId, data.tokenId, {
        reset: !!data.reset,
        movementRemainingFt: data.movementRemainingFt,
        movementMaxFt: data.movementMaxFt
      });
      if (!result.ok) {
        socket.emit('combat-error', { message: 'Nie udało się ustawić ruchu' });
        return;
      }
      await broadcastCombatUpdate(socket.campaignId);
    } catch (err) {
      console.error('combat-set-movement', err);
    }
  });

  socket.on('combat-check-los', async (data) => {
    if (!socket.campaignId) return;
    try {
      const result = await combatOps.checkLineOfSight(
        socket.campaignId,
        data.fromTokenId,
        data.toTokenId,
        socket.userRole
      );
      socket.emit('combat-los-result', { ...result, requestId: data.requestId });
    } catch (err) {
      console.error('combat-check-los', err);
    }
  });

  socket.on('combat-validate-target', async (data) => {
    if (!socket.campaignId) return;
    try {
      let weapon = data.weapon || null;
      let spell = data.spell || null;
      if (data.weaponId && data.characterId) {
        const char = await characterOps.findById(data.characterId);
        if (char?.weapons) {
          try {
            const weapons = JSON.parse(char.weapons);
            weapon = weapons.find((w) => (w.id || w.templateId) === data.weaponId) || weapon;
          } catch (_e) { /* ignore */ }
        }
      }
      const result = await combatOps.validateAttackTarget(
        socket.campaignId,
        data.attackerTokenId,
        data.targetTokenId,
        socket.user.id,
        socket.userRole,
        { weapon, spell }
      );
      if (result.ok && data.spendAction !== false) {
        await combatOps.spendAction(socket.campaignId, data.attackerTokenId, 'action');
        await broadcastCombatUpdate(socket.campaignId);
      }
      socket.emit('combat-target-result', {
        ok: result.ok,
        reason: result.reason,
        targetTokenId: data.targetTokenId,
        requestId: data.requestId,
        target: result.target ? { id: result.target.id, entity_name: result.target.entity_name } : null
      });
    } catch (err) {
      console.error('combat-validate-target', err);
      socket.emit('combat-target-result', { ok: false, requestId: data?.requestId });
    }
  });

  socket.on('combat-apply-damage', async (data) => {
    if (!socket.campaignId) return;
    try {
      const isDm = socket.userRole === 'dm';
      const active = await combatOps.isActiveCombatToken(socket.campaignId, data.attackerTokenId);
      if (!isDm && !active) {
        socket.emit('combat-error', { message: 'Brak uprawnień do zadania obrażeń' });
        return;
      }
      const result = await combatOps.applyDamageToToken(
        data.targetTokenId,
        data.amount,
        socket.campaignId
      );
      const payload = await buildMapPayload(socket.campaignId);
      io.to(socket.campaignId).emit('map-update', payload);
      await broadcastCombatUpdate(socket.campaignId);
      socket.emit('combat-damage-applied', result);
      if (result?.prop?.ok) {
        io.to(socket.campaignId).emit('map-prop-triggered', result.prop);
      }
    } catch (err) {
      console.error('combat-apply-damage', err);
    }
  });

  socket.on('combat-attack-fx', (data) => {
    if (!socket.campaignId) return;
    io.to(socket.campaignId).emit('combat-attack-fx', {
      ...data,
      userId: socket.user.id
    });
  });

  socket.on('combat-bonus-action', async (data) => {
    if (!socket.campaignId) return;
    try {
      const token = await mapOps.getTokenById(data.tokenId);
      if (!token) return;
      const control = await combatOps.canControlToken(
        socket.campaignId,
        socket.user.id,
        socket.userRole,
        token
      );
      if (!control.ok) return;
      const result = await combatOps.applyBonusAction(
        socket.campaignId,
        data.tokenId,
        data.actionId
      );
      if (!result.ok) {
        socket.emit('combat-error', { message: 'Akcja dodatkowa niedostępna' });
        return;
      }
      await broadcastCombatUpdate(socket.campaignId);
    } catch (err) {
      console.error('combat-bonus-action', err);
    }
  });

  socket.on('map-update-blocking', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    try {
      await combatOps.updateBlocking(socket.campaignId, data.cells || []);
      const payload = await buildMapPayload(socket.campaignId);
      io.to(socket.campaignId).emit('map-update', payload);
    } catch (err) {
      console.error('map-update-blocking', err);
    }
  });

  socket.on('map-update-zones', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    try {
      await combatOps.updateZones(socket.campaignId, data.zones || []);
      const payload = await buildMapPayload(socket.campaignId);
      io.to(socket.campaignId).emit('map-update', payload);
    } catch (err) {
      console.error('map-update-zones', err);
    }
  });

  socket.on('map-trigger-prop', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    try {
      const result = await combatOps.resolvePropTrigger(
        socket.campaignId,
        data.tokenId,
        'manual'
      );
      if (!result.ok) {
        socket.emit('combat-error', { message: 'Nie można aktywować rekwizytu' });
        return;
      }
      const payload = await buildMapPayload(socket.campaignId);
      io.to(socket.campaignId).emit('map-update', payload);
      io.to(socket.campaignId).emit('map-prop-triggered', result);
    } catch (err) {
      console.error('map-trigger-prop', err);
    }
  });

  socket.on('combat-aoe-resolve', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    try {
      const result = await combatOps.resolveAoeSpell(
        socket.campaignId,
        socket.user.id,
        socket.user.display_name || socket.user.username,
        data
      );
      if (!result.ok) {
        socket.emit('combat-error', { message: result.reason || 'Nie udało się rozstrzygnąć AoE' });
        return;
      }
      const payload = await buildMapPayload(socket.campaignId);
      io.to(socket.campaignId).emit('map-update', payload);
      io.to(socket.campaignId).emit('combat-aoe-result', result);
      if (result.logEntry) {
        io.to(socket.campaignId).emit('dice-log-entry', result.logEntry);
      }
      await broadcastCombatUpdate(socket.campaignId);
    } catch (err) {
      console.error('combat-aoe-resolve', err);
      socket.emit('combat-error', { message: err.message });
    }
  });

  // Character HP update (real-time)
  socket.on('character-hp-update', (data) => {
    if (!socket.campaignId) return;
    io.to(socket.campaignId).emit('character-hp-update', {
      characterId: data.characterId,
      currentHp: data.currentHp,
      maxHp: data.maxHp,
      tempHp: data.tempHp
    });
  });

  // DM screen - visibility toggle for info
  socket.on('dm-broadcast', (data) => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    io.to(socket.campaignId).emit('dm-broadcast', data);
  });

  socket.on('merchant-open', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    try {
      const merchant = await merchantOps.update(data.merchantId, { is_open: true });
      const msg = await messageOps.create(
        socket.campaignId, socket.user.id, socket.user.display_name || socket.user.username,
        `🏪 Handlarz «${merchant.name}» przyjmuje klientów!`, 'trade', false, '', JSON.stringify({ kind: 'merchant', merchantId: merchant.id, merchantName: merchant.name })
      );
      io.to(socket.campaignId).emit('chat-message', msg);
      io.to(socket.campaignId).emit('merchant-opened', { merchant });
    } catch (err) {
      socket.emit('economy-error', { message: err.message });
    }
  });

  socket.on('merchant-close', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    try {
      await merchantOps.update(data.merchantId, { is_open: false });
      io.to(socket.campaignId).emit('merchant-closed', { merchantId: data.merchantId });
    } catch (err) {
      socket.emit('economy-error', { message: err.message });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.campaignId && campaignRooms.has(socket.campaignId)) {
      campaignRooms.get(socket.campaignId).delete(socket.user.id);
      io.to(socket.campaignId).emit('online-users', Array.from(campaignRooms.get(socket.campaignId).values()));
      io.to(socket.campaignId).emit('system-message', { content: `${socket.user.display_name} opuścił/a sesję`, type: 'leave' });
    }
    console.log(`User disconnected: ${socket.user.username}`);
  });
});

// ============ ECONOMY: MERCHANTS & LOOT ============
async function requireCampaignMember(campaignId, userId) {
  const membership = await campaignOps.isMember(campaignId, userId);
  return membership;
}

app.get('/api/campaigns/:id/merchants', authMiddleware, async (req, res) => {
  if (!(await requireCampaignMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  res.json(await merchantOps.listByCampaign(req.params.id));
});

app.post('/api/campaigns/:id/merchants', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  const merchant = await merchantOps.create(req.params.id, req.body);
  res.json(merchant);
});

app.put('/api/merchants/:id', authMiddleware, async (req, res) => {
  const m = await merchantOps.findById(req.params.id);
  if (!m) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(m.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  res.json(await merchantOps.update(req.params.id, req.body));
});

app.delete('/api/merchants/:id', authMiddleware, async (req, res) => {
  const m = await merchantOps.findById(req.params.id);
  if (!m) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(m.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  await merchantOps.delete(req.params.id);
  res.json({ ok: true });
});

app.get('/api/campaigns/:id/loot-tables', authMiddleware, async (req, res) => {
  if (!(await requireCampaignMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  res.json(await lootTableOps.listByCampaign(req.params.id));
});

app.post('/api/campaigns/:id/loot-tables', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  res.json(await lootTableOps.create(req.params.id, req.body));
});

app.put('/api/loot-tables/:id', authMiddleware, async (req, res) => {
  const t = await lootTableOps.findById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(t.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  res.json(await lootTableOps.update(req.params.id, req.body));
});

app.delete('/api/loot-tables/:id', authMiddleware, async (req, res) => {
  const t = await lootTableOps.findById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(t.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  await lootTableOps.delete(req.params.id);
  res.json({ ok: true });
});

app.get('/api/characters/:id/loot-grants', authMiddleware, async (req, res) => {
  const char = await characterOps.findById(req.params.id);
  if (!char) return res.status(404).json({ error: 'Postać nie znaleziona' });
  const isOwner = char.user_id === req.user.id;
  const isDm = char.campaign_id && (await campaignOps.isDm(char.campaign_id, req.user.id));
  if (!isOwner && !isDm) return res.status(403).json({ error: 'Brak uprawnień' });
  res.json(await lootGrantOps.listForCharacter(req.params.id, req.query.pending !== 'false'));
});

app.post('/api/campaigns/:id/loot-grants', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  const { characterId, lootTableId, label, items } = req.body;
  const char = await characterOps.findById(characterId);
  if (!char || char.campaign_id !== req.params.id) return res.status(400).json({ error: 'Nieprawidłowa postać' });
  const grant = await lootGrantOps.create(req.params.id, characterId, {
    loot_table_id: lootTableId || '',
    label: label || 'Paczka łupu',
    resolved_items: items || []
  });
  const msg = await messageOps.create(
    req.params.id, req.user.id, req.user.display_name || req.user.username,
    `🎁 ${char.name} otrzymuje: ${grant.label}`, 'trade', false, '', JSON.stringify({ kind: 'loot', grantId: grant.id, characterId, label: grant.label })
  );
  io.to(req.params.id).emit('chat-message', msg);
  io.to(req.params.id).emit('loot-granted', { grant, characterName: char.name });
  res.json(grant);
});

app.post('/api/loot-grants/:id/open', authMiddleware, async (req, res) => {
  try {
    const result = await economyOps.openLoot(req.params.id, req.user.id);
    const char = result.character;
    if (char.campaign_id) {
      io.to(char.campaign_id).emit('character-inventory-updated', { characterId: char.id });
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/merchants/:id/purchase', authMiddleware, async (req, res) => {
  try {
    const { characterId, shopItemId } = req.body;
    const result = await economyOps.purchase(characterId, req.user.id, req.params.id, shopItemId);
    const char = result.character;
    if (char.campaign_id) {
      io.to(char.campaign_id).emit('character-inventory-updated', { characterId: char.id });
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/characters/:id/grant-currency', authMiddleware, async (req, res) => {
  const char = await characterOps.findById(req.params.id);
  if (!char) return res.status(404).json({ error: 'Postać nie znaleziona' });
  const isDm = char.campaign_id && (await campaignOps.isDm(char.campaign_id, req.user.id));
  if (!isDm) return res.status(403).json({ error: 'Tylko MG' });
  try {
    const delta = parseInt(req.body.deltaCopper, 10);
    if (Number.isNaN(delta)) return res.status(400).json({ error: 'Podaj deltaCopper' });
    const updated = await economyOps.grantCurrency(req.params.id, req.user.id, true, char.campaign_id, delta);
    if (char.campaign_id) io.to(char.campaign_id).emit('character-inventory-updated', { characterId: char.id });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/trades/item', authMiddleware, async (req, res) => {
  try {
    const { sourceCharacterId, targetCharacterId, itemId, quantity } = req.body || {};
    if (!sourceCharacterId || !targetCharacterId || !itemId) {
      return res.status(400).json({ error: 'sourceCharacterId, targetCharacterId i itemId są wymagane' });
    }
    const source = await characterOps.findById(sourceCharacterId);
    const target = await characterOps.findById(targetCharacterId);
    if (!source || !target) return res.status(404).json({ error: 'Nie znaleziono postaci' });
    if (!source.campaign_id || source.campaign_id !== target.campaign_id) {
      return res.status(400).json({ error: 'Postacie muszą należeć do tej samej kampanii' });
    }
    const membership = await campaignOps.isMember(source.campaign_id, req.user.id);
    if (!membership) return res.status(403).json({ error: 'Brak dostępu do kampanii' });

    const isDm = membership.role === 'dm';
    const isSourceOwner = source.user_id === req.user.id;
    if (!isDm && !isSourceOwner) {
      return res.status(403).json({ error: 'Możesz przekazywać tylko przedmioty swojej postaci' });
    }

    const result = await economyOps.transferItemBetweenCharacters(
      sourceCharacterId,
      targetCharacterId,
      itemId,
      quantity
    );
    io.to(source.campaign_id).emit('character-inventory-updated', { characterId: sourceCharacterId });
    io.to(source.campaign_id).emit('character-inventory-updated', { characterId: targetCharacterId });

    const actorName = req.user.display_name || req.user.username;
    const qty = parseInt(result.item?.quantity, 10) || 1;
    const itemName = result.item?.name || 'przedmiot';
    const msg = await messageOps.create(
      source.campaign_id,
      req.user.id,
      actorName,
      `🔁 ${result.sourceCharacter.name} przekazuje ${qty}× ${itemName} do ${result.targetCharacter.name}`,
      'trade',
      false,
      '',
      JSON.stringify({
        kind: 'player-item-trade',
        sourceCharacterId: result.sourceCharacter.id,
        targetCharacterId: result.targetCharacter.id,
        itemId,
        itemName,
        quantity: qty
      })
    );
    io.to(source.campaign_id).emit('chat-message', msg);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Nie udało się przekazać przedmiotu' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  if (isProduction) {
    const secret = process.env.JWT_SECRET || '';
    if (!secret || secret === 'change-this-secret-in-production' || secret.length < 32) {
      console.error('Ustaw silny JWT_SECRET (min. 32 znaki) w produkcji.');
      process.exit(1);
    }
  }
  await initializeDatabase();
  server.listen(PORT, () => {
    console.log(`\n⚔️  Dedeki D&D VTT działa na http://localhost:${PORT}\n`);
  });
}

startServer().catch(err => {
  console.error('Błąd uruchamiania serwera:', err);
  process.exit(1);
});
