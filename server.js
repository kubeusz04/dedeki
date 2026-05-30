const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');

const {
  initializeDatabase, userOps, campaignOps, characterOps, messageOps, npcOps,
  initiativeOps, noteOps, mapOps, combatOps, diceLogOps, conditionOps,
  merchantOps, lootTableOps, customItemOps, customMonsterOps, questOps, handoutOps, worldStateOps, soundOps, tokenImageOps, lootGrantOps, economyOps, musicOps, musicPlaylistOps, resolveEntityStats,
  mapPresetOps, collectCampaignSnapshot
} = require('./database');
const { generateToken, authMiddleware, socketAuthMiddleware, verifyToken } = require('./auth');
const { runAiSuggest } = require('./lib/ai-suggest-server');
const { restoreCampaignFromSnapshot } = require('./lib/campaign-import');
const youtubeImport = require('./lib/youtube-import');
const AdmZip = require('adm-zip');

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
const soundUploadsDir = path.join(__dirname, 'public', 'uploads', 'sounds');
const handoutUploadsDir = path.join(__dirname, 'private_uploads', 'handouts');
fs.mkdirSync(mapUploadsDir, { recursive: true });
fs.mkdirSync(tokenUploadsDir, { recursive: true });
fs.mkdirSync(characterUploadsDir, { recursive: true });
fs.mkdirSync(musicUploadsDir, { recursive: true });
fs.mkdirSync(soundUploadsDir, { recursive: true });
fs.mkdirSync(handoutUploadsDir, { recursive: true });

const MUSIC_MIME = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/webm',
  'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac'
]);

const musicPlaybackByCampaign = new Map();

function defaultMusicPlayback() {
  return {
    trackId: null,
    isPlaying: false,
    positionSec: 0,
    updatedAt: Date.now(),
    playlistId: null,
    shuffle: false,
    autoAdvance: true,
    shuffleOrder: []
  };
}

function shuffleTrackIds(trackIds) {
  const arr = [...trackIds];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function resolvePlaylistOrder(playlistId, shuffle) {
  const pl = await musicPlaylistOps.findById(playlistId);
  if (!pl?.track_ids?.length) return { trackIds: [], shuffleOrder: [] };
  const trackIds = pl.track_ids;
  const shuffleOrder = shuffle ? shuffleTrackIds(trackIds) : trackIds;
  return { trackIds, shuffleOrder, playlist: pl };
}

async function advancePlaylistTrack(campaignId, state, direction = 1) {
  if (!state?.playlistId) return null;
  const { shuffleOrder, trackIds } = await resolvePlaylistOrder(state.playlistId, !!state.shuffle);
  const order = shuffleOrder.length ? shuffleOrder : trackIds;
  if (!order.length) return null;

  const currentIdx = order.indexOf(state.trackId);
  let nextIdx = currentIdx < 0 ? 0 : currentIdx + direction;
  if (nextIdx >= order.length) nextIdx = 0;
  if (nextIdx < 0) nextIdx = order.length - 1;

  const track = await musicOps.findById(order[nextIdx]);
  if (!track || track.campaign_id !== campaignId) return null;
  return {
    trackId: track.id,
    shuffleOrder: state.shuffle ? order : []
  };
}

function clearPlaylistFields(state) {
  return {
    ...state,
    playlistId: null,
    shuffle: false,
    autoAdvance: true,
    shuffleOrder: []
  };
}

function getSyncedMusicPosition(playback) {
  if (!playback?.trackId) return 0;
  if (!playback.isPlaying) return Math.max(0, playback.positionSec || 0);
  const elapsed = (Date.now() - (playback.updatedAt || Date.now())) / 1000;
  return Math.max(0, (playback.positionSec || 0) + elapsed);
}

async function buildMusicPayload(campaignId) {
  const [tracks, playlists] = await Promise.all([
    musicOps.findByCampaign(campaignId),
    musicPlaylistOps.listByCampaign(campaignId)
  ]);
  const playback = musicPlaybackByCampaign.get(campaignId) || defaultMusicPlayback();
  return {
    tracks,
    playlists,
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

  const active = state.entries.find((e) => e.is_active);
  if (active?.map_token_id) {
    try {
      const hits = await combatOps.resolveHazardsForTurnStart(campaignId, active.map_token_id);
      if (hits.length) {
        const payload = await buildMapPayload(campaignId);
        io.to(campaignId).emit('map-update', payload);
        for (const hit of hits) {
          io.to(campaignId).emit('map-hazard-tick', hit);
          io.to(campaignId).emit('dice-log-entry', {
            type: 'hazard',
            text: `${hit.icon} ${hit.tokenName} zaczyna turę w hazardzie i traci ${hit.amount} obrażeń (${hit.label}, ${hit.damage} ${hit.damageType})`,
            at: Date.now()
          });
        }
      }
    } catch (hzErr) {
      console.error('hazard-on-turn-start', hzErr);
    }
    // Tick stanów (czasy trwania w rundach) na początku tury aktywnego tokenu
    try {
      const tickRes = await mapOps.tickConditionsForToken(active.map_token_id);
      if (tickRes.expired.length) {
        const payload = await buildMapPayload(campaignId);
        io.to(campaignId).emit('map-update', payload);
        for (const exp of tickRes.expired) {
          io.to(campaignId).emit('dice-log-entry', {
            type: 'condition',
            text: `${exp.emoji || '⚠️'} ${active.entity_name}: efekt „${exp.name}" wygasł`,
            at: Date.now()
          });
        }
      } else if (tickRes.token && tickRes.remaining.some((c) => c.durationLeft != null)) {
        // tylko dekrement bez wygasłych — wyślij update tokenów
        io.to(campaignId).emit('map-update', await buildMapPayload(campaignId));
      }
    } catch (cErr) {
      console.error('conditions-tick', cErr);
    }
  }

  await broadcastCombatUpdate(campaignId);
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

// Upload do biblioteki tokenów (per kampania)
const tokenLibraryUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tokenUploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowedExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
      const safeExt = allowedExt.includes(ext) ? ext : '.png';
      cb(null, `lib-${req.params.id}-${Date.now()}${safeExt}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Dozwolone są tylko pliki graficzne'));
    cb(null, true);
  }
});

function tryDeleteTokenLibraryImage(relativePath) {
  if (!relativePath || !relativePath.startsWith('/uploads/tokens/')) return;
  const candidate = path.normalize(path.join(__dirname, 'public', relativePath));
  if (!candidate.startsWith(tokenUploadsDir)) return;
  fs.promises.unlink(candidate).catch(() => {});
}

const HANDOUT_ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf'
]);
const handoutUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, handoutUploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowedExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'];
      const safeExt = allowedExt.includes(ext) ? ext : '.bin';
      cb(null, `handout-${req.params.id}-${Date.now()}${safeExt}`);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!HANDOUT_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Dozwolone: PNG, JPG, WEBP, GIF, PDF'));
    }
    cb(null, true);
  }
});

function tryDeleteHandoutFile(relativePath) {
  if (!relativePath || !relativePath.startsWith('/handout-files/')) return;
  const filename = path.basename(relativePath);
  const candidate = path.normalize(path.join(handoutUploadsDir, filename));
  if (!candidate.startsWith(handoutUploadsDir)) return;
  fs.promises.unlink(candidate).catch(() => {});
}

const SOUND_ALLOWED_MIME = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/wave',
  'audio/webm', 'audio/x-wav', 'audio/mp4', 'audio/aac'
]);
const soundUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, soundUploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowedExt = ['.mp3', '.ogg', '.wav', '.webm', '.m4a', '.aac'];
      const safeExt = allowedExt.includes(ext) ? ext : '.mp3';
      cb(null, `snd-${req.params.id}-${Date.now()}${safeExt}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (SOUND_ALLOWED_MIME.has(file.mimetype) || (file.mimetype || '').startsWith('audio/')) {
      return cb(null, true);
    }
    cb(new Error('Dozwolone pliki audio: MP3, OGG, WAV, WebM, M4A'));
  }
});

function tryDeleteSoundFile(relativePath) {
  if (!relativePath || !relativePath.startsWith('/uploads/sounds/')) return;
  const candidate = path.normalize(path.join(__dirname, 'public', relativePath));
  if (!candidate.startsWith(soundUploadsDir)) return;
  fs.promises.unlink(candidate).catch(() => {});
}

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

const aiSuggestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Za dużo zapytań AI — poczekaj chwilę' }
});

const musicYoutubeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Za dużo importów YouTube — poczekaj minutę' }
});

// ============ AI (Gemini) — tylko MG ============
app.post('/api/ai/suggest', authMiddleware, aiSuggestLimiter, async (req, res) => {
  try {
    const { campaignId, type, context } = req.body || {};
    if (!campaignId || !type) {
      return res.status(400).json({ error: 'Wymagane: campaignId, type' });
    }
    if (!(await campaignOps.isDm(campaignId, req.user.id))) {
      return res.status(403).json({ error: 'Tylko Mistrz Gry może używać podpowiedzi AI' });
    }
    const campaign = await campaignOps.findById(campaignId);
    const enriched = {
      ...(context && typeof context === 'object' ? context : {}),
      campaignName: campaign?.name || ''
    };
    const result = await runAiSuggest(String(type), enriched);
    res.json({ result });
  } catch (err) {
    console.error('AI suggest error:', err.message);
    res.status(500).json({ error: err.message || 'Błąd podpowiedzi AI' });
  }
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

app.delete('/api/campaigns/:id/messages', authMiddleware, async (req, res) => {
  const campaignId = req.params.id;
  const membership = await campaignOps.isMember(campaignId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Brak dostępu' });
  if (!(await campaignOps.isDm(campaignId, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może wyczyścić czat' });
  }
  try {
    const deleted = await messageOps.deleteAllByCampaign(campaignId);
    const by = req.user.display_name || req.user.username;
    io.to(campaignId).emit('chat-cleared', { campaignId, by });
    res.json({ message: 'Czat wyczyszczony', deleted });
  } catch (err) {
    console.error('clear chat error:', err);
    res.status(500).json({ error: 'Błąd czyszczenia czatu' });
  }
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
  const playlists = await musicPlaylistOps.listByCampaign(req.params.id);
  const playback = musicPlaybackByCampaign.get(req.params.id) || defaultMusicPlayback();
  res.json({
    tracks,
    playlists,
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

app.post('/api/campaigns/:id/music/youtube', authMiddleware, musicYoutubeLimiter, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może dodawać muzykę' });
  }

  const rawUrl = (req.body?.url || '').trim();
  const customTitle = (req.body?.title || '').trim().slice(0, 120);
  const videoId = youtubeImport.parseYoutubeId(rawUrl);

  if (!videoId) {
    return res.status(400).json({ error: 'Nieprawidłowy link YouTube' });
  }

  const sourceUrl = youtubeImport.buildYoutubeUrl(videoId);

  try {
    const existing = await musicOps.findByYoutubeId(req.params.id, videoId);
    if (existing) {
      return res.json({ ...existing, duplicate: true });
    }

    await youtubeImport.assertYtdlpAvailable();

    let metaTitle = customTitle;
    if (!metaTitle) {
      try {
        const meta = await youtubeImport.fetchMetadata(sourceUrl);
        metaTitle = meta.title;
        if (meta.duration > youtubeImport.MAX_DURATION_SEC) {
          return res.status(400).json({
            error: `Film jest za długi (max ${Math.floor(youtubeImport.MAX_DURATION_SEC / 60)} min)`
          });
        }
      } catch (metaErr) {
        console.warn('YouTube metadata fetch failed:', metaErr.message);
        metaTitle = `YouTube ${videoId}`;
      }
    }

    const filename = `music-${req.params.id}-yt-${videoId}-${Date.now()}.mp3`;
    const destPath = path.join(musicUploadsDir, filename);
    const fileUrl = `/uploads/music/${filename}`;

    let downloaded;
    try {
      downloaded = await youtubeImport.downloadAudioToFile({ videoId, destPath });
    } catch (dlErr) {
      tryDeleteMusicFile(fileUrl);
      throw dlErr;
    }

    const track = await musicOps.create(req.params.id, req.user.id, {
      title: metaTitle || `YouTube ${videoId}`,
      file_url: fileUrl,
      file_size: downloaded.fileSize,
      mime_type: downloaded.mimeType,
      source_type: 'youtube',
      youtube_id: videoId,
      source_url: sourceUrl
    });

    broadcastMusicSync(req.params.id);
    res.json(track);
  } catch (err) {
    console.error('YouTube music import error:', err);
    const code = err.code || '';
    if (code === 'YTDLP_DISABLED' || code === 'YTDLP_MISSING') {
      return res.status(503).json({
        error: err.message || 'Import YouTube niedostępny — zainstaluj yt-dlp i ffmpeg'
      });
    }
    if (code === 'YTDLP_TIMEOUT') {
      return res.status(504).json({ error: err.message || 'Przekroczono czas pobierania' });
    }
    if (code === 'YTDLP_FAILED') {
      return res.status(502).json({
        error: err.message || 'Nie udało się pobrać audio z YouTube'
      });
    }
    res.status(500).json({ error: err.message || 'Błąd importu YouTube' });
  }
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

app.get('/api/campaigns/:id/music/playlists', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isMember(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Brak dostępu' });
  }
  res.json(await musicPlaylistOps.listByCampaign(req.params.id));
});

app.post('/api/campaigns/:id/music/playlists', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może tworzyć playlisty' });
  }
  const trackIds = Array.isArray(req.body?.track_ids) ? req.body.track_ids : (req.body?.trackIds || []);
  const validIds = [];
  for (const tid of trackIds) {
    const track = await musicOps.findById(tid);
    if (track && track.campaign_id === req.params.id) validIds.push(track.id);
  }
  try {
    const playlist = await musicPlaylistOps.create(req.params.id, {
      name: req.body?.name,
      shuffle: !!req.body?.shuffle,
      auto_advance: req.body?.auto_advance !== false,
      track_ids: validIds
    });
    broadcastMusicSync(req.params.id);
    res.json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Nie udało się utworzyć playlisty' });
  }
});

app.put('/api/music/playlists/:id', authMiddleware, async (req, res) => {
  const pl = await musicPlaylistOps.findById(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Playlista nie znaleziona' });
  if (!(await campaignOps.isDm(pl.campaign_id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry' });
  }
  let trackIds;
  if (req.body?.track_ids !== undefined || req.body?.trackIds !== undefined) {
    const raw = req.body.track_ids || req.body.trackIds || [];
    trackIds = [];
    for (const tid of raw) {
      const track = await musicOps.findById(tid);
      if (track && track.campaign_id === pl.campaign_id) trackIds.push(track.id);
    }
  }
  const updated = await musicPlaylistOps.update(req.params.id, {
    name: req.body?.name,
    shuffle: req.body?.shuffle,
    auto_advance: req.body?.auto_advance,
    track_ids: trackIds
  });
  broadcastMusicSync(pl.campaign_id);
  res.json(updated);
});

app.delete('/api/music/playlists/:id', authMiddleware, async (req, res) => {
  const pl = await musicPlaylistOps.findById(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Playlista nie znaleziona' });
  if (!(await campaignOps.isDm(pl.campaign_id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry' });
  }
  await musicPlaylistOps.delete(req.params.id);
  const playback = musicPlaybackByCampaign.get(pl.campaign_id);
  if (playback?.playlistId === pl.id) {
    musicPlaybackByCampaign.set(pl.campaign_id, defaultMusicPlayback());
  }
  broadcastMusicSync(pl.campaign_id);
  res.json({ ok: true });
});

// ============ SOCKET.IO ============
io.use(socketAuthMiddleware);

// Track online users per campaign
const campaignRooms = new Map();
// Per-campaign ambient mixer state: { sound_id: { volume, started_at } }.
// Persists for the lifetime of the server process (not in DB).
const ambientState = new Map();
function getAmbientState(campaignId) {
  if (!ambientState.has(campaignId)) ambientState.set(campaignId, {});
  return ambientState.get(campaignId);
}

// In-memory sesje grupowych rzutów (zerowane przy restarcie serwera).
// sessionId -> { campaignId, dmUserId, type, payload, dc, label, advantage, disadvantage, participants[], createdAt }
const groupRollSessions = new Map();
const GROUP_ROLL_TTL_MS = 5 * 60 * 1000;

async function finalizeGroupRoll(session) {
  if (!session) return;
  groupRollSessions.delete(session.id);

  const rolled = session.participants.filter((p) => p.status === 'rolled');
  let summaryHead;
  if (typeof session.dc === 'number' && session.dc > 0) {
    const successes = rolled.filter((p) => p.result?.success).length;
    summaryHead = `🎯 Grupowy rzut: ${session.label} — DC ${session.dc} → ${successes}/${rolled.length} sukces`;
  } else {
    summaryHead = `🎯 Grupowy rzut: ${session.label} — ${rolled.length} rzutów`;
  }

  const lines = session.participants.map((p) => {
    if (p.status === 'skipped') return `• ${p.characterName}: pominięto`;
    if (p.status === 'pending')  return `• ${p.characterName}: brak odpowiedzi`;
    const r = p.result || {};
    const succ = r.success === true ? ' ✅' : r.success === false ? ' ❌' : '';
    return `• ${p.characterName}: ${r.total ?? '?'}${succ}`;
  });

  const body = summaryHead + '\n' + lines.join('\n');

  try {
    const dmUser = await userOps.findById(session.dmUserId);
    const dmName = dmUser?.display_name || dmUser?.username || 'MG';
    const msg = await messageOps.create(
      session.campaignId, session.dmUserId, dmName,
      body, 'system', false, '',
      JSON.stringify({ kind: 'group-roll', sessionId: session.id, label: session.label, dc: session.dc, results: session.participants })
    );
    io.to(session.campaignId).emit('chat-message', msg);
  } catch (e) {
    console.error('finalizeGroupRoll chat post error:', e);
  }

  io.to(session.campaignId).emit('group-roll-complete', {
    sessionId: session.id,
    label: session.label,
    dc: session.dc,
    participants: session.participants
  });
}

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

    if (action === 'play-playlist') {
      const pl = await musicPlaylistOps.findById(data.playlistId);
      if (!pl || pl.campaign_id !== campaignId) return;
      if (!pl.track_ids.length) return;
      const shuffle = data.shuffle !== undefined ? !!data.shuffle : !!pl.shuffle;
      const autoAdvance = data.autoAdvance !== undefined ? !!data.autoAdvance : !!pl.auto_advance;
      const { shuffleOrder } = await resolvePlaylistOrder(pl.id, shuffle);
      let startId = data.trackId && pl.track_ids.includes(data.trackId) ? data.trackId : shuffleOrder[0];
      const track = await musicOps.findById(startId);
      if (!track || track.campaign_id !== campaignId) return;
      state = {
        trackId: track.id,
        isPlaying: true,
        positionSec: Math.max(0, parseFloat(data.positionSec) || 0),
        updatedAt: Date.now(),
        playlistId: pl.id,
        shuffle,
        autoAdvance,
        shuffleOrder
      };
    } else if (action === 'play') {
      const track = await musicOps.findById(data.trackId);
      if (!track || track.campaign_id !== campaignId) return;
      const pos = Math.max(0, parseFloat(data.positionSec) || 0);
      state = clearPlaylistFields({
        trackId: track.id,
        isPlaying: true,
        positionSec: pos,
        updatedAt: Date.now()
      });
    } else if (action === 'next') {
      const advanced = await advancePlaylistTrack(campaignId, state, 1);
      if (!advanced) {
        state = { ...clearPlaylistFields(state), isPlaying: false, positionSec: 0, updatedAt: Date.now() };
      } else {
        state = {
          ...state,
          trackId: advanced.trackId,
          isPlaying: true,
          positionSec: 0,
          updatedAt: Date.now(),
          shuffleOrder: advanced.shuffleOrder
        };
      }
    } else if (action === 'playlist-options') {
      if (!state.playlistId) return;
      if (data.shuffle !== undefined) {
        state.shuffle = !!data.shuffle;
        if (state.shuffle) {
          const { shuffleOrder } = await resolvePlaylistOrder(state.playlistId, true);
          state.shuffleOrder = shuffleOrder;
        } else {
          state.shuffleOrder = [];
        }
      }
      if (data.autoAdvance !== undefined) state.autoAdvance = !!data.autoAdvance;
      state.updatedAt = Date.now();
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

  // ===== Group rolls (DM prosi całą drużynę o rzut, każdy gracz dostaje prompt) =====
  socket.on('group-roll-start', async (data) => {
    if (socket.userRole !== 'dm' || !socket.campaignId) return;

    const allowedTypes = ['skill', 'ability', 'save', 'custom'];
    if (!allowedTypes.includes(data?.type)) {
      socket.emit('group-roll-error', { message: 'Nieprawidłowy typ rzutu' });
      return;
    }

    let participants;
    try {
      const characters = await characterOps.findByCampaign(socket.campaignId);
      const requestedIds = Array.isArray(data.participantCharIds) ? data.participantCharIds : null;
      participants = characters
        .filter((c) => c.user_id) // tylko postacie graczy
        .filter((c) => !requestedIds || requestedIds.includes(c.id))
        .map((c) => ({
          userId: c.user_id,
          characterId: c.id,
          characterName: c.name,
          status: 'pending',
          result: null
        }));
    } catch (e) {
      socket.emit('group-roll-error', { message: 'Błąd ładowania postaci' });
      return;
    }

    if (!participants.length) {
      socket.emit('group-roll-error', { message: 'Brak graczy do rzutu' });
      return;
    }

    const sessionId = uuidv4();
    const label = String(data.label || 'Rzut grupowy').slice(0, 80);
    const dc = (typeof data.dc === 'number' && data.dc > 0) ? Math.floor(data.dc) : null;

    const session = {
      id: sessionId,
      campaignId: socket.campaignId,
      dmUserId: socket.user.id,
      type: data.type,
      payload: data.payload || {},
      dc,
      label,
      advantage: !!data.advantage,
      disadvantage: !!data.disadvantage,
      isSecret: !!data.isSecret,
      participants,
      createdAt: Date.now()
    };
    groupRollSessions.set(sessionId, session);
    setTimeout(() => {
      const s = groupRollSessions.get(sessionId);
      if (s) finalizeGroupRoll(s); // timeout = auto-finalize
    }, GROUP_ROLL_TTL_MS);

    // Wyślij prompt każdemu uczestnikowi (po jego userId)
    const room = io.sockets.adapter.rooms.get(socket.campaignId);
    if (room) {
      for (const socketId of room) {
        const s = io.sockets.sockets.get(socketId);
        if (!s) continue;
        const part = participants.find((p) => p.userId === s.user.id);
        if (!part) continue;
        s.emit('group-roll-prompt', {
          sessionId,
          type: session.type,
          payload: session.payload,
          dc: session.dc,
          label: session.label,
          advantage: session.advantage,
          disadvantage: session.disadvantage,
          isSecret: session.isSecret,
          characterId: part.characterId,
          characterName: part.characterName
        });
      }
    }

    // Powiadom wszystkich (DM dostaje progress-modal, gracze widzą kto jeszcze rzuca)
    io.to(socket.campaignId).emit('group-roll-progress', {
      sessionId,
      label: session.label,
      dc: session.dc,
      type: session.type,
      payload: session.payload,
      participants: session.participants
    });
  });

  socket.on('group-roll-submit', (data) => {
    if (!socket.campaignId || !data?.sessionId) return;
    const session = groupRollSessions.get(data.sessionId);
    if (!session || session.campaignId !== socket.campaignId) return;

    const part = session.participants.find((p) => p.userId === socket.user.id && p.status === 'pending');
    if (!part) return;

    if (data.skipped) {
      part.status = 'skipped';
      part.result = null;
    } else {
      const total = parseInt(data.total, 10) || 0;
      part.status = 'rolled';
      part.result = {
        total,
        roll: parseInt(data.roll, 10) || total,
        expr: String(data.expr || ''),
        success: typeof session.dc === 'number' ? total >= session.dc : null
      };
    }

    io.to(socket.campaignId).emit('group-roll-progress', {
      sessionId: session.id,
      label: session.label,
      dc: session.dc,
      type: session.type,
      payload: session.payload,
      participants: session.participants
    });

    if (session.participants.every((p) => p.status !== 'pending')) {
      finalizeGroupRoll(session);
    }
  });

  socket.on('group-roll-finalize', (data) => {
    if (socket.userRole !== 'dm' || !data?.sessionId) return;
    const session = groupRollSessions.get(data.sessionId);
    if (!session || session.campaignId !== socket.campaignId) return;
    finalizeGroupRoll(session);
  });

  socket.on('group-roll-cancel', (data) => {
    if (socket.userRole !== 'dm' || !data?.sessionId) return;
    const session = groupRollSessions.get(data.sessionId);
    if (!session || session.campaignId !== socket.campaignId) return;
    groupRollSessions.delete(session.id);
    io.to(socket.campaignId).emit('group-roll-cancelled', { sessionId: session.id });
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

      try {
        const hazardHits = await combatOps.resolveHazardsForMove(
          socket.campaignId, data.id, prevX, prevY, data.x, data.y
        );
        if (hazardHits.length) {
          const payload = await buildMapPayload(socket.campaignId);
          io.to(socket.campaignId).emit('map-update', payload);
          for (const hit of hazardHits) {
            io.to(socket.campaignId).emit('map-hazard-tick', hit);
            io.to(socket.campaignId).emit('dice-log-entry', {
              type: 'hazard',
              text: `${hit.icon} ${hit.tokenName} traci ${hit.amount} obrażeń (${hit.label}, ${hit.damage} ${hit.damageType})`,
              at: Date.now()
            });
          }
        }
      } catch (hzErr) {
        console.error('hazard-on-move', hzErr);
      }

      await broadcastCombatUpdate(socket.campaignId);

      try {
        const aoo = await combatOps.detectOpportunityAttacks(
          socket.campaignId, data.id, prevX, prevY, data.x, data.y
        );
        if (aoo.length) {
          const dmSockets = [...io.sockets.adapter.rooms.get(socket.campaignId) || []]
            .map((id) => io.sockets.sockets.get(id))
            .filter((s) => s?.userRole === 'dm');
          for (const t of aoo) {
            for (const dm of dmSockets) {
              dm.emit('combat-aoo-trigger', t);
            }
          }
        }
      } catch (aooErr) {
        console.error('aoo-detect', aooErr);
      }
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
    try {
      await mapOps.updateSettings(socket.campaignId, data);
      io.to(socket.campaignId).emit('map-update', await buildMapPayload(socket.campaignId));
    } catch (err) {
      console.error('map-update-settings', err);
      socket.emit('map-settings-error', {
        message: 'Nie udało się zapisać ustawień mapy. Zrestartuj serwer (migracja bazy).'
      });
    }
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

  socket.on('combat-aoo-spend-reaction', async (data) => {
    if (!socket.campaignId || socket.userRole !== 'dm') return;
    try {
      const result = await combatOps.spendReaction(socket.campaignId, data.attackerTokenId);
      socket.emit('combat-aoo-reaction-result', { ...result, attackerTokenId: data.attackerTokenId });
      if (result.ok) {
        await broadcastCombatUpdate(socket.campaignId);
      }
    } catch (err) {
      console.error('combat-aoo-spend-reaction', err);
      socket.emit('combat-aoo-reaction-result', { ok: false });
    }
  });

  socket.on('combat-apply-damage', async (data) => {
    if (!socket.campaignId) return;
    try {
      const isDm = socket.userRole === 'dm';
      const targetTokenId = data?.targetTokenId;
      const amount = data?.amount;
      if (!targetTokenId) {
        socket.emit('combat-error', { message: 'Brak celu obrażeń' });
        return;
      }
      if (!isDm) {
        const attackerTokenId = data?.attackerTokenId;
        if (!attackerTokenId) {
          socket.emit('combat-error', { message: 'Brak tokena atakującego' });
          return;
        }
        const active = await combatOps.isActiveCombatToken(socket.campaignId, attackerTokenId);
        if (!active) {
          socket.emit('combat-error', { message: 'Brak uprawnień do zadania obrażeń' });
          return;
        }
      }
      const result = await combatOps.applyDamageToToken(
        targetTokenId,
        amount,
        socket.campaignId
      );
      if (!result) {
        socket.emit('combat-error', { message: 'Nie znaleziono tokena celu' });
        return;
      }
      const payload = await buildMapPayload(socket.campaignId);
      io.to(socket.campaignId).emit('map-update', payload);
      await broadcastCombatUpdate(socket.campaignId);
      io.to(socket.campaignId).emit('combat-damage-applied', result);
      if (result?.prop?.ok) {
        io.to(socket.campaignId).emit('map-prop-triggered', result.prop);
      }
      const damagedToken = await mapOps.getTokenById(targetTokenId);
      if (damagedToken?.entity_type === 'player' && damagedToken.entity_id) {
        io.to(socket.campaignId).emit('character-hp-update', {
          characterId: damagedToken.entity_id,
          currentHp: result.hpCurrent,
          maxHp: result.hpMax
        });
      }
    } catch (err) {
      console.error('combat-apply-damage', err);
      socket.emit('combat-error', { message: 'Błąd zadawania obrażeń' });
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
    if (!socket.campaignId) return;
    // DM may always resolve AoE; players may resolve only if the caster token belongs to
    // a character they own. This lets player wizards drop their own fireballs.
    if (socket.userRole !== 'dm') {
      try {
        const casterId = data?.casterTokenId;
        const caster = casterId ? await mapOps.getTokenById(casterId) : null;
        if (!caster || caster.entity_type !== 'player') return;
        const char = caster.entity_id ? await characterOps.findById(caster.entity_id) : null;
        if (!char || char.user_id !== socket.user.id) return;
      } catch (_e) {
        return;
      }
    }
    try {
      const result = await combatOps.resolveAoeSpell(
        socket.campaignId,
        socket.user.id,
        socket.user.display_name || socket.user.username,
        { ...data, isDm: socket.userRole === 'dm' }
      );
      if (!result.ok) {
        const reasonMsg = {
          spell_not_known: 'Postać nie zna tego czaru',
          no_slot: 'Brak slotu o tym poziomie',
          action_used: 'Akcja już została zużyta w tej turze',
          bonus_used: 'Akcja dodatkowa już zużyta',
          no_reaction: 'Reakcja już zużyta',
          no_turn: 'Token nie ma tury w walce',
          bad_payload: 'Nieprawidłowe dane czaru',
          no_caster: 'Nie znaleziono tokenu rzucającego'
        }[result.reason] || `Nie udało się rozstrzygnąć AoE (${result.reason || 'nieznany błąd'})`;
        socket.emit('combat-error', { message: reasonMsg });
        return;
      }
      const payload = await buildMapPayload(socket.campaignId);
      io.to(socket.campaignId).emit('map-update', payload);
      io.to(socket.campaignId).emit('combat-aoe-result', result);
      if (result.logEntry) {
        io.to(socket.campaignId).emit('dice-log-entry', result.logEntry);
      }
      // Powiadom o aktualizacji slotów postaci-rzucającego, by UI mogło odświeżyć panel
      if (result.casterCharacterId) {
        io.to(socket.campaignId).emit('character-slots-update', {
          characterId: result.casterCharacterId
        });
      }
      await broadcastCombatUpdate(socket.campaignId);
    } catch (err) {
      console.error('combat-aoe-resolve', err);
      socket.emit('combat-error', { message: err.message });
    }
  });

  socket.on('character-long-rest', async (data) => {
    if (!socket.campaignId) return;
    const charId = data?.characterId;
    if (!charId) return;
    try {
      const char = await characterOps.findById(charId);
      if (!char) return;
      const isOwner = char.user_id === socket.user.id;
      if (!isOwner && socket.userRole !== 'dm') return;
      const updated = await characterOps.longRest(charId);
      io.to(socket.campaignId).emit('character-slots-update', { characterId: charId });
      io.to(socket.campaignId).emit('character-rest', {
        characterId: charId,
        type: 'long',
        characterName: updated?.name || ''
      });
    } catch (err) {
      console.error('character-long-rest', err);
    }
  });

  socket.on('character-short-rest', async (data) => {
    if (!socket.campaignId) return;
    const charId = data?.characterId;
    if (!charId) return;
    try {
      const char = await characterOps.findById(charId);
      if (!char) return;
      const isOwner = char.user_id === socket.user.id;
      if (!isOwner && socket.userRole !== 'dm') return;
      const result = await characterOps.shortRest(charId, data.hitDiceSpent || 0);
      io.to(socket.campaignId).emit('character-slots-update', { characterId: charId });
      io.to(socket.campaignId).emit('character-rest', {
        characterId: charId,
        type: 'short',
        characterName: result?.character?.name || '',
        healed: result?.healed || 0,
        hitDiceSpent: result?.hitDiceSpent || 0
      });
    } catch (err) {
      console.error('character-short-rest', err);
    }
  });

  socket.on('character-set-slots', async (data) => {
    if (!socket.campaignId) return;
    const charId = data?.characterId;
    if (!charId) return;
    try {
      const char = await characterOps.findById(charId);
      if (!char) return;
      const isOwner = char.user_id === socket.user.id;
      if (!isOwner && socket.userRole !== 'dm') return;
      await characterOps.setSpellSlots(charId, data.slots || { used: {} });
      io.to(socket.campaignId).emit('character-slots-update', { characterId: charId });
    } catch (err) {
      console.error('character-set-slots', err);
    }
  });

  // ===== Inspiration tokens (5e) =====
  // MG przyznaje, gracz wydaje przed rzutem dla przewagi.
  async function broadcastInspirationUpdate(charId, deltaText, kind, actorName) {
    const updated = await characterOps.findById(charId);
    if (!updated) return;
    io.to(updated.campaign_id).emit('character-inspiration-update', {
      characterId: charId,
      inspiration: updated.inspiration || 0,
      deltaText: deltaText || '',
      kind: kind || 'info',
      actorName: actorName || ''
    });
    // Komunikat systemowy
    if (deltaText) {
      io.to(updated.campaign_id).emit('system-message', {
        content: deltaText,
        type: 'inspiration'
      });
    }
  }

  socket.on('inspiration-grant', async (data) => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    const charId = data?.characterId;
    if (!charId) return;
    try {
      const char = await characterOps.findById(charId);
      if (!char || char.campaign_id !== socket.campaignId) return;
      const delta = parseInt(data.amount, 10) || 1;
      await characterOps.addInspiration(charId, delta);
      const text = delta > 0
        ? `⭐ MG przyznał Inspirację: ${char.name} (+${delta})`
        : `⭐ MG odebrał Inspirację: ${char.name} (${delta})`;
      await broadcastInspirationUpdate(charId, text, delta > 0 ? 'success' : 'warning', socket.user?.display_name);
    } catch (err) { console.error('inspiration-grant', err); }
  });

  socket.on('inspiration-set', async (data) => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    const charId = data?.characterId;
    if (!charId) return;
    try {
      const char = await characterOps.findById(charId);
      if (!char || char.campaign_id !== socket.campaignId) return;
      const next = Math.max(0, parseInt(data.value, 10) || 0);
      await characterOps.setInspiration(charId, next);
      await broadcastInspirationUpdate(charId, `⭐ MG ustawił Inspirację: ${char.name} = ${next}`, 'info');
    } catch (err) { console.error('inspiration-set', err); }
  });

  socket.on('inspiration-grant-all', async (data) => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    const amount = Math.max(1, parseInt(data?.amount, 10) || 1);
    try {
      const chars = await characterOps.findByCampaign(socket.campaignId);
      const players = chars.filter((c) => c.user_id);
      for (const c of players) {
        await characterOps.addInspiration(c.id, amount);
      }
      io.to(socket.campaignId).emit('system-message', {
        content: `⭐ MG przyznał Inspirację wszystkim graczom (+${amount})`,
        type: 'inspiration'
      });
      for (const c of players) {
        await broadcastInspirationUpdate(c.id, '', 'success');
      }
    } catch (err) { console.error('inspiration-grant-all', err); }
  });

  socket.on('inspiration-spend', async (data) => {
    if (!socket.campaignId) return;
    const charId = data?.characterId;
    if (!charId) return;
    try {
      const char = await characterOps.findById(charId);
      if (!char || char.campaign_id !== socket.campaignId) return;
      // gracz może wydać tylko swoją inspirację, MG dowolną
      if (socket.userRole !== 'dm' && char.user_id !== socket.user.id) return;
      const cur = parseInt(char.inspiration, 10) || 0;
      if (cur <= 0) return;
      await characterOps.setInspiration(charId, cur - 1);
      await broadcastInspirationUpdate(charId, `⭐ ${char.name} wydał Inspirację (przewaga na rzut)`, 'info');
    } catch (err) { console.error('inspiration-spend', err); }
  });

  // Aktualizacja stanów na tokenie (zatruty, sparaliżowany, ...)
  socket.on('map-token-conditions-update', async (data) => {
    if (!socket.campaignId) return;
    const tokenId = data?.tokenId;
    if (!tokenId) return;
    try {
      const token = await mapOps.getTokenById(tokenId);
      if (!token || token.campaign_id !== socket.campaignId) return;
      // pozwalamy: MG zawsze, gracz tylko na swoim własnym tokenie (entity_type === 'player' i entity_id przypiętym do user.id)
      const isDm = socket.userRole === 'dm';
      let canEdit = isDm;
      if (!canEdit && token.entity_type === 'player' && token.entity_id) {
        try {
          const owned = await characterOps.findById(token.entity_id);
          if (owned && owned.user_id === socket.user.id) canEdit = true;
        } catch (_e) {}
      }
      if (!canEdit) return;
      await mapOps.setTokenConditions(tokenId, Array.isArray(data.conditions) ? data.conditions : []);
      io.to(socket.campaignId).emit('map-update', await buildMapPayload(socket.campaignId));
    } catch (err) {
      console.error('map-token-conditions-update', err);
    }
  });

  // Aktualizacja zasobów klasowych (Rage, Ki, Bardic Inspiration, ...)
  socket.on('character-set-resources', async (data) => {
    if (!socket.campaignId) return;
    const charId = data?.characterId;
    if (!charId) return;
    try {
      const char = await characterOps.findById(charId);
      if (!char) return;
      const isOwner = char.user_id === socket.user.id;
      if (!isOwner && socket.userRole !== 'dm') return;
      await characterOps.setClassResources(charId, Array.isArray(data.resources) ? data.resources : []);
      io.to(socket.campaignId).emit('character-resources-update', { characterId: charId });
    } catch (err) {
      console.error('character-set-resources', err);
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

  // ===== Soundboard =====
  socket.on('play-sfx', async (data) => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    try {
      const sound = await soundOps.findById(data?.soundId);
      if (!sound || sound.campaign_id !== socket.campaignId) return;
      const volume = (typeof data.volume === 'number') ? Math.min(1, Math.max(0, data.volume)) : sound.default_volume;
      io.to(socket.campaignId).emit('sfx-play', {
        campaignId: socket.campaignId,
        soundId: sound.id,
        name: sound.name,
        icon: sound.icon,
        url: sound.file_url,
        volume,
        is_loop: sound.is_loop,
        triggered_by: socket.user.display_name || socket.user.username
      });
    } catch (err) {
      socket.emit('error-message', { error: err.message });
    }
  });

  socket.on('ambient-set', async (data) => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    try {
      const sound = await soundOps.findById(data?.soundId);
      if (!sound || sound.campaign_id !== socket.campaignId || sound.category !== 'ambient') return;
      const state = getAmbientState(socket.campaignId);
      const playing = data.playing !== false;
      if (!playing) {
        delete state[sound.id];
      } else {
        const volume = (typeof data.volume === 'number') ? Math.min(1, Math.max(0, data.volume)) : sound.default_volume;
        state[sound.id] = {
          volume,
          url: sound.file_url,
          name: sound.name,
          icon: sound.icon,
          started_at: state[sound.id]?.started_at || Date.now()
        };
      }
      io.to(socket.campaignId).emit('ambient-update', { campaignId: socket.campaignId, layers: state });
    } catch (err) {
      socket.emit('error-message', { error: err.message });
    }
  });

  socket.on('ambient-stop-all', () => {
    if (!socket.campaignId) return;
    if (socket.userRole !== 'dm') return;
    ambientState.set(socket.campaignId, {});
    io.to(socket.campaignId).emit('ambient-update', { campaignId: socket.campaignId, layers: {} });
  });

  socket.on('ambient-request-state', () => {
    if (!socket.campaignId) return;
    socket.emit('ambient-update', { campaignId: socket.campaignId, layers: getAmbientState(socket.campaignId) });
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

// ===== Custom items (DM-defined catalog entries) =====
app.get('/api/campaigns/:id/custom-items', authMiddleware, async (req, res) => {
  if (!(await requireCampaignMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  res.json(await customItemOps.listByCampaign(req.params.id));
});

app.post('/api/campaigns/:id/custom-items', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  if (!req.body?.name || !String(req.body.name).trim()) return res.status(400).json({ error: 'Wymagana nazwa' });
  res.json(await customItemOps.create(req.params.id, req.body));
});

app.put('/api/custom-items/:id', authMiddleware, async (req, res) => {
  const it = await customItemOps.findById(req.params.id);
  if (!it) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(it.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  res.json(await customItemOps.update(req.params.id, req.body));
});

app.delete('/api/custom-items/:id', authMiddleware, async (req, res) => {
  const it = await customItemOps.findById(req.params.id);
  if (!it) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(it.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  await customItemOps.delete(req.params.id);
  res.json({ ok: true });
});

// ===== Bestiariusz: własne potwory =====
app.get('/api/campaigns/:id/bestiary', authMiddleware, async (req, res) => {
  if (!(await requireCampaignMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  res.json(await customMonsterOps.listByCampaign(req.params.id));
});

app.post('/api/campaigns/:id/bestiary', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  if (!req.body?.name || !String(req.body.name).trim()) return res.status(400).json({ error: 'Wymagana nazwa' });
  res.json(await customMonsterOps.create(req.params.id, req.body));
});

app.get('/api/bestiary/:id', authMiddleware, async (req, res) => {
  const m = await customMonsterOps.findById(req.params.id);
  if (!m) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await requireCampaignMember(m.campaign_id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  res.json(m);
});

app.put('/api/bestiary/:id', authMiddleware, async (req, res) => {
  const m = await customMonsterOps.findById(req.params.id);
  if (!m) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(m.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  res.json(await customMonsterOps.update(req.params.id, req.body));
});

app.delete('/api/bestiary/:id', authMiddleware, async (req, res) => {
  const m = await customMonsterOps.findById(req.params.id);
  if (!m) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(m.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  await customMonsterOps.delete(req.params.id);
  res.json({ ok: true });
});

// Spawn potwora z bestiariusza jako NPC w kampanii.
app.post('/api/bestiary/:id/spawn', authMiddleware, async (req, res) => {
  const m = await customMonsterOps.findById(req.params.id);
  if (!m) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(m.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  try {
    const lines = [];
    lines.push(`${m.size} ${m.monster_type}, ${m.alignment} · CR ${m.cr}`);
    lines.push(`AC ${m.ac} · HP ${m.hp_max}${m.hp_formula ? ` (${m.hp_formula})` : ''} · ${m.speed}`);
    const stats = m.stats || {};
    lines.push(`STR ${stats.str || 10}  DEX ${stats.dex || 10}  CON ${stats.con || 10}  INT ${stats.int || 10}  WIS ${stats.wis || 10}  CHA ${stats.cha || 10}`);
    if (m.saving_throws?.length) lines.push(`Rzuty obronne: ${m.saving_throws.join(', ')}`);
    if (m.skills?.length) lines.push(`Umiejętności: ${m.skills.join(', ')}`);
    if (m.damage_resistances) lines.push(`Odporności: ${m.damage_resistances}`);
    if (m.damage_immunities) lines.push(`Niewrażliwości: ${m.damage_immunities}`);
    if (m.condition_immunities) lines.push(`Niewrażliwości na stany: ${m.condition_immunities}`);
    if (m.senses) lines.push(`Zmysły: ${m.senses}`);
    if (m.languages) lines.push(`Języki: ${m.languages}`);
    if (m.attacks?.length) {
      lines.push('\nAtaki:');
      m.attacks.forEach((a) => {
        const bits = [`• ${a.name || 'Atak'}`];
        if (a.toHit) bits.push(`+${String(a.toHit).replace(/^\+/, '')} do trafienia`);
        if (a.range) bits.push(`zasięg ${a.range}`);
        if (a.damage) bits.push(`${a.damage}${a.damageType ? ` ${a.damageType}` : ''}`);
        if (a.special) bits.push(a.special);
        lines.push(bits.join(' · '));
      });
    }
    if (m.traits?.length) {
      lines.push('\nCechy:');
      m.traits.forEach((t) => lines.push(`• ${t.name}: ${t.desc || ''}`));
    }
    if (m.actions?.length) {
      lines.push('\nAkcje:');
      m.actions.forEach((t) => lines.push(`• ${t.name}: ${t.desc || ''}`));
    }
    if (m.legendary_actions?.length) {
      lines.push('\nAkcje legendarne (3/turę):');
      m.legendary_actions.forEach((t) => lines.push(`• ${t.name}${t.cost ? ` (${t.cost})` : ''}: ${t.desc || ''}`));
    }
    if (m.reactions?.length) {
      lines.push('\nReakcje:');
      m.reactions.forEach((t) => lines.push(`• ${t.name}: ${t.desc || ''}`));
    }
    if (m.notes) lines.push(`\n${m.notes}`);

    const npc = await npcOps.create(m.campaign_id, req.user.id, {
      name: m.name,
      race: m.size + ' ' + m.monster_type,
      description: m.notes ? m.notes.slice(0, 200) : '',
      max_hp: m.hp_max,
      current_hp: m.hp_max,
      armor_class: m.ac,
      notes: lines.join('\n'),
      stats: JSON.stringify({
        category: 'monster',
        cr: m.cr,
        size: m.size,
        stats: stats,
        sourceBestiaryId: m.id,
        attacks: m.attacks || []
      }),
      is_visible: !!req.body?.is_visible
    });
    res.json(npc);
  } catch (err) {
    console.error('bestiary-spawn', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Quest tracker =====
function _stripQuestForPlayers(q) {
  if (!q) return q;
  // Hide DM-only fields from non-DM responses.
  const { dm_notes: _omit, ...rest } = q;
  return rest;
}
async function _broadcastQuestList(campaignId) {
  const list = await questOps.listByCampaign(campaignId);
  io.to(campaignId).emit('quests-update', { campaignId, quests: list });
}

app.get('/api/campaigns/:id/quests', authMiddleware, async (req, res) => {
  if (!(await requireCampaignMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  const isDm = await campaignOps.isDm(req.params.id, req.user.id);
  let list = await questOps.listByCampaign(req.params.id);
  if (!isDm) list = list.filter((q) => q.visible_to_players).map(_stripQuestForPlayers);
  res.json(list);
});

app.post('/api/campaigns/:id/quests', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  if (!req.body?.title || !String(req.body.title).trim()) return res.status(400).json({ error: 'Wymagana nazwa' });
  const q = await questOps.create(req.params.id, req.body);
  await _broadcastQuestList(req.params.id);
  res.json(q);
});

app.get('/api/quests/:id', authMiddleware, async (req, res) => {
  const q = await questOps.findById(req.params.id);
  if (!q) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await requireCampaignMember(q.campaign_id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  const isDm = await campaignOps.isDm(q.campaign_id, req.user.id);
  if (!isDm) {
    if (!q.visible_to_players) return res.status(403).json({ error: 'Quest ukryty przez MG' });
    return res.json(_stripQuestForPlayers(q));
  }
  res.json(q);
});

app.put('/api/quests/:id', authMiddleware, async (req, res) => {
  const q = await questOps.findById(req.params.id);
  if (!q) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(q.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  const updated = await questOps.update(req.params.id, req.body);
  await _broadcastQuestList(q.campaign_id);
  res.json(updated);
});

app.delete('/api/quests/:id', authMiddleware, async (req, res) => {
  const q = await questOps.findById(req.params.id);
  if (!q) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(q.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  await questOps.delete(req.params.id);
  await _broadcastQuestList(q.campaign_id);
  res.json({ ok: true });
});

app.post('/api/quests/:id/objective/:idx', authMiddleware, async (req, res) => {
  const q = await questOps.findById(req.params.id);
  if (!q) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(q.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  const updated = await questOps.toggleObjective(req.params.id, parseInt(req.params.idx, 10));
  await _broadcastQuestList(q.campaign_id);
  res.json(updated);
});

// Mark complete + optionally award XP/gold to all party characters.
app.post('/api/quests/:id/complete', authMiddleware, async (req, res) => {
  const q = await questOps.findById(req.params.id);
  if (!q) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(q.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  const updated = await questOps.setStatus(req.params.id, 'completed');

  const awardXp = !!req.body?.awardXp && updated.xp_reward > 0;
  const awardGold = !!req.body?.awardGold && updated.gold_reward > 0;
  const awarded = { xp: 0, gold: 0, characters: [] };

  if (awardXp || awardGold) {
    const party = await characterOps.findByCampaign(q.campaign_id);
    const splitGold = awardGold && party.length > 0 ? Math.floor(updated.gold_reward / party.length) : 0;
    for (const ch of party) {
      const updates = {};
      if (awardXp) updates.experience_points = (parseInt(ch.experience_points, 10) || 0) + updated.xp_reward;
      if (splitGold > 0) updates.gold = (parseInt(ch.gold, 10) || 0) + splitGold;
      if (Object.keys(updates).length) {
        try {
          await characterOps.dmUpdate(ch.id, q.campaign_id, updates);
          awarded.characters.push({ id: ch.id, name: ch.name });
        } catch (e) { console.error('quest-award', e); }
      }
    }
    if (awardXp) awarded.xp = updated.xp_reward;
    if (splitGold > 0) awarded.gold = splitGold;

    io.to(q.campaign_id).emit('characters-bulk-update', { campaignId: q.campaign_id });
  }

  io.to(q.campaign_id).emit('quest-completed', {
    campaignId: q.campaign_id,
    quest: updated,
    awarded
  });
  await _broadcastQuestList(q.campaign_id);
  res.json({ quest: updated, awarded });
});

app.post('/api/quests/:id/status', authMiddleware, async (req, res) => {
  const q = await questOps.findById(req.params.id);
  if (!q) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(q.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  const updated = await questOps.setStatus(req.params.id, req.body?.status);
  await _broadcastQuestList(q.campaign_id);
  res.json(updated);
});

// ===== Player handouts =====
function _canSeeHandout(handout, userId) {
  if (!handout || !handout.is_revealed) return false;
  if (!handout.recipient_user_ids || handout.recipient_user_ids.length === 0) return true;
  return handout.recipient_user_ids.includes(String(userId));
}

app.get('/api/campaigns/:id/handouts', authMiddleware, async (req, res) => {
  if (!(await requireCampaignMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  const isDm = await campaignOps.isDm(req.params.id, req.user.id);
  if (isDm) return res.json(await handoutOps.listByCampaign(req.params.id));
  res.json(await handoutOps.listForUser(req.params.id, req.user.id));
});

app.post('/api/campaigns/:id/handouts', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  handoutUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Błąd uploadu' });
    if (!req.file) return res.status(400).json({ error: 'Brak pliku' });
    try {
      const fileUrl = `/handout-files/${req.file.filename}`;
      let recipients = [];
      if (req.body?.recipient_user_ids) {
        try {
          const parsed = JSON.parse(req.body.recipient_user_ids);
          if (Array.isArray(parsed)) recipients = parsed.map(String);
        } catch { recipients = []; }
      }
      const isRevealed = req.body?.is_revealed !== 'false' && req.body?.is_revealed !== false;
      const handout = await handoutOps.create(req.params.id, req.user.id, {
        title: req.body?.title || req.file.originalname || 'Handout',
        description: req.body?.description || '',
        file_url: fileUrl,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        recipient_user_ids: recipients,
        is_revealed: isRevealed
      });
      // Notify only intended recipients (or whole campaign if all-party).
      // DM is always notified. Players outside recipient list don't see the event.
      const campaignId = req.params.id;
      const payload = {
        campaignId,
        handoutId: handout.id,
        title: handout.title,
        recipient_user_ids: handout.recipient_user_ids,
        is_revealed: handout.is_revealed,
        from: req.user.display_name || req.user.username || 'MG'
      };
      const allowedIds = new Set((handout.recipient_user_ids || []).map(String));
      const allParty = allowedIds.size === 0;
      for (const [_sid, s] of io.of('/').sockets) {
        if (s.campaignId !== campaignId) continue;
        if (s.userRole === 'dm' || allParty || allowedIds.has(String(s.user.id))) {
          s.emit('handout-new', payload);
        }
      }
      res.json(handout);
    } catch (e) {
      tryDeleteHandoutFile(`/handout-files/${req.file.filename}`);
      res.status(500).json({ error: e.message });
    }
  });
});

// Auth helper that accepts ?token= query param (so <img>/<iframe> can embed).
function handoutAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader?.startsWith('Bearer ')) token = authHeader.substring(7);
  else if (req.query?.token) token = String(req.query.token);
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Nieprawidłowy token' });
  req.user = decoded;
  next();
}

// Protected handout file delivery: looks up handout by filename, checks ACL.
app.get('/handout-files/:filename', handoutAuth, async (req, res) => {
  const filename = path.basename(req.params.filename);
  const fileUrl = `/handout-files/${filename}`;
  const handout = await handoutOps.findByFileUrl(fileUrl);
  if (!handout) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await requireCampaignMember(handout.campaign_id, req.user.id))) {
    return res.status(403).json({ error: 'Brak dostępu' });
  }
  const isDm = await campaignOps.isDm(handout.campaign_id, req.user.id);
  if (!isDm && !_canSeeHandout(handout, req.user.id)) {
    return res.status(403).json({ error: 'Brak dostępu do tego handoutu' });
  }
  const filePath = path.normalize(path.join(handoutUploadsDir, filename));
  if (!filePath.startsWith(handoutUploadsDir)) return res.status(400).json({ error: 'Niedozwolona ścieżka' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Plik nie istnieje' });
  res.setHeader('Content-Type', handout.mime_type || 'application/octet-stream');
  res.sendFile(filePath);
});

app.get('/api/handouts/:id', authMiddleware, async (req, res) => {
  const h = await handoutOps.findById(req.params.id);
  if (!h) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await requireCampaignMember(h.campaign_id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  const isDm = await campaignOps.isDm(h.campaign_id, req.user.id);
  if (!isDm && !_canSeeHandout(h, req.user.id)) return res.status(403).json({ error: 'Brak dostępu do tego handoutu' });
  res.json(h);
});

app.put('/api/handouts/:id', authMiddleware, async (req, res) => {
  const h = await handoutOps.findById(req.params.id);
  if (!h) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(h.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  const updated = await handoutOps.update(req.params.id, req.body || {});
  io.to(h.campaign_id).emit('handout-updated', {
    campaignId: h.campaign_id,
    handoutId: updated.id,
    title: updated.title,
    recipient_user_ids: updated.recipient_user_ids,
    is_revealed: updated.is_revealed
  });
  res.json(updated);
});

app.delete('/api/handouts/:id', authMiddleware, async (req, res) => {
  const h = await handoutOps.findById(req.params.id);
  if (!h) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(h.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  await handoutOps.delete(req.params.id);
  tryDeleteHandoutFile(h.file_url);
  io.to(h.campaign_id).emit('handout-deleted', { campaignId: h.campaign_id, handoutId: req.params.id });
  res.json({ ok: true });
});

// ===== World state: kalendarz, pora dnia, pogoda =====
app.get('/api/campaigns/:id/world-state', authMiddleware, async (req, res) => {
  if (!(await requireCampaignMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  res.json(await worldStateOps.get(req.params.id));
});

app.put('/api/campaigns/:id/world-state', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  const updated = await worldStateOps.update(req.params.id, req.body || {});
  io.to(req.params.id).emit('world-state-update', { campaignId: req.params.id, state: updated });
  res.json(updated);
});

// ===== Soundboard / Ambient mixer =====
app.get('/api/campaigns/:id/sounds', authMiddleware, async (req, res) => {
  if (!(await requireCampaignMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  const category = req.query.category && ['sfx', 'ambient'].includes(req.query.category) ? req.query.category : null;
  res.json(await soundOps.listByCampaign(req.params.id, category));
});

app.post('/api/campaigns/:id/sounds', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  soundUpload.single('audio')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Błąd uploadu' });
    if (!req.file) return res.status(400).json({ error: 'Brak pliku' });
    try {
      const fileUrl = `/uploads/sounds/${req.file.filename}`;
      let tags = [];
      if (req.body?.tags) {
        try { const p = JSON.parse(req.body.tags); if (Array.isArray(p)) tags = p; } catch { tags = []; }
      }
      const sound = await soundOps.create(req.params.id, req.user.id, {
        name: req.body?.name || req.file.originalname?.replace(/\.[^.]+$/, '') || 'Dźwięk',
        category: req.body?.category || 'sfx',
        file_url: fileUrl,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        icon: req.body?.icon || '',
        tags,
        default_volume: req.body?.default_volume,
        is_loop: req.body?.is_loop === 'true' || req.body?.category === 'ambient'
      });
      io.to(req.params.id).emit('sound-library-update', { campaignId: req.params.id });
      res.json(sound);
    } catch (e) {
      tryDeleteSoundFile(`/uploads/sounds/${req.file.filename}`);
      res.status(500).json({ error: e.message });
    }
  });
});

app.post('/api/campaigns/:id/sounds/youtube', authMiddleware, musicYoutubeLimiter, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może dodawać dźwięki' });
  }

  const rawUrl = (req.body?.url || '').trim();
  const customName = (req.body?.name || '').trim().slice(0, 100);
  const category = ['sfx', 'ambient'].includes(req.body?.category) ? req.body.category : 'sfx';
  const icon = String(req.body?.icon || '').slice(0, 16);
  const vol = parseFloat(req.body?.default_volume);
  const defaultVolume = Math.min(1, Math.max(0, isNaN(vol) ? 0.7 : vol));
  const videoId = youtubeImport.parseYoutubeId(rawUrl);

  if (!videoId) {
    return res.status(400).json({ error: 'Nieprawidłowy link YouTube' });
  }

  const sourceUrl = youtubeImport.buildYoutubeUrl(videoId);

  try {
    const existing = await soundOps.findByYoutubeId(req.params.id, videoId);
    if (existing) {
      return res.json({ ...existing, duplicate: true });
    }

    await youtubeImport.assertYtdlpAvailable();

    let metaName = customName;
    if (!metaName) {
      try {
        const meta = await youtubeImport.fetchMetadata(sourceUrl);
        metaName = meta.title;
        if (meta.duration > youtubeImport.MAX_DURATION_SEC) {
          return res.status(400).json({
            error: `Film jest za długi (max ${Math.floor(youtubeImport.MAX_DURATION_SEC / 60)} min)`
          });
        }
      } catch (metaErr) {
        console.warn('YouTube metadata fetch failed (sound):', metaErr.message);
        metaName = `YouTube ${videoId}`;
      }
    }

    const filename = `sound-${req.params.id}-yt-${videoId}-${Date.now()}.mp3`;
    const destPath = path.join(soundUploadsDir, filename);
    const fileUrl = `/uploads/sounds/${filename}`;

    let downloaded;
    try {
      downloaded = await youtubeImport.downloadAudioToFile({ videoId, destPath });
    } catch (dlErr) {
      tryDeleteSoundFile(fileUrl);
      throw dlErr;
    }

    const sound = await soundOps.create(req.params.id, req.user.id, {
      name: metaName || `YouTube ${videoId}`,
      category,
      file_url: fileUrl,
      file_size: downloaded.fileSize,
      mime_type: downloaded.mimeType,
      icon,
      default_volume: defaultVolume,
      is_loop: category === 'ambient',
      source_type: 'youtube',
      youtube_id: videoId,
      source_url: sourceUrl
    });

    io.to(req.params.id).emit('sound-library-update', { campaignId: req.params.id });
    res.json(sound);
  } catch (err) {
    console.error('YouTube sound import error:', err);
    const msg = String(err?.message || err);
    if (/source_type|youtube_id|source_url/i.test(msg) && /column|does not exist/i.test(msg)) {
      return res.status(503).json({
        error: 'Brak migracji bazy dla YouTube w dźwiękach — zrestartuj serwer (npm start)'
      });
    }
    const code = err.code || '';
    if (code === 'YTDLP_DISABLED' || code === 'YTDLP_MISSING') {
      return res.status(503).json({
        error: err.message || 'Import YouTube niedostępny — zainstaluj yt-dlp i ffmpeg'
      });
    }
    if (code === 'YTDLP_TIMEOUT') {
      return res.status(504).json({ error: err.message || 'Przekroczono czas pobierania' });
    }
    if (code === 'YTDLP_FAILED') {
      return res.status(502).json({
        error: err.message || 'Nie udało się pobrać audio z YouTube'
      });
    }
    res.status(500).json({ error: err.message || 'Błąd importu YouTube' });
  }
});

app.put('/api/sounds/:id', authMiddleware, async (req, res) => {
  const s = await soundOps.findById(req.params.id);
  if (!s) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(s.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  const updated = await soundOps.update(req.params.id, req.body || {});
  io.to(s.campaign_id).emit('sound-library-update', { campaignId: s.campaign_id });
  res.json(updated);
});

app.delete('/api/sounds/:id', authMiddleware, async (req, res) => {
  const s = await soundOps.findById(req.params.id);
  if (!s) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(s.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  await soundOps.delete(req.params.id);
  tryDeleteSoundFile(s.file_url);
  // If the removed sound was active in ambient mixer, stop it.
  const state = getAmbientState(s.campaign_id);
  if (state[s.id]) {
    delete state[s.id];
    io.to(s.campaign_id).emit('ambient-update', { campaignId: s.campaign_id, layers: state });
  }
  io.to(s.campaign_id).emit('sound-library-update', { campaignId: s.campaign_id });
  res.json({ ok: true });
});

// Returns current ambient mixer state for a campaign.
app.get('/api/campaigns/:id/ambient', authMiddleware, async (req, res) => {
  if (!(await requireCampaignMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  res.json({ layers: getAmbientState(req.params.id) });
});

// ===== Export / Backup =====
function _downloadAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader?.startsWith('Bearer ')) token = authHeader.substring(7);
  else if (req.query?.token) token = String(req.query.token);
  if (!token) return res.status(401).json({ error: 'Brak tokenu' });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Nieprawidłowy token' });
  req.user = decoded;
  next();
}

// Resolve a URL stored in DB to a local filesystem path inside known upload directories.
function _resolveUploadPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/')) return null;
  if (url.startsWith('/uploads/')) {
    const candidate = path.normalize(path.join(__dirname, 'public', url));
    const publicUploads = path.join(__dirname, 'public', 'uploads');
    if (candidate.startsWith(publicUploads) && fs.existsSync(candidate)) return candidate;
    return null;
  }
  if (url.startsWith('/handout-files/')) {
    const filename = path.basename(url);
    const candidate = path.normalize(path.join(handoutUploadsDir, filename));
    if (candidate.startsWith(handoutUploadsDir) && fs.existsSync(candidate)) return candidate;
    return null;
  }
  return null;
}

// JSON-only snapshot.
app.get('/api/campaigns/:id/export.json', _downloadAuth, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  try {
    const snapshot = await collectCampaignSnapshot(req.params.id);
    const safeName = String(snapshot.campaign?.name || 'campaign').replace(/[^a-z0-9_\-]+/gi, '_').slice(0, 40) || 'campaign';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="roll1-${safeName}-${Date.now()}.json"`);
    res.json(snapshot);
  } catch (err) {
    console.error('export-json', err);
    res.status(500).json({ error: err.message });
  }
});

// Full ZIP backup (JSON + uploads).
app.get('/api/campaigns/:id/export.zip', _downloadAuth, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  try {
    const snapshot = await collectCampaignSnapshot(req.params.id);
    const safeName = String(snapshot.campaign?.name || 'campaign').replace(/[^a-z0-9_\-]+/gi, '_').slice(0, 40) || 'campaign';
    const filename = `roll1-${safeName}-${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('warning', (e) => console.warn('archive warn:', e?.message));
    archive.on('error', (e) => {
      console.error('archive error:', e);
      try { res.end(); } catch (_) { /* noop */ }
    });
    archive.pipe(res);

    // Snapshot JSON.
    archive.append(JSON.stringify(snapshot, null, 2), { name: 'campaign.json' });

    // Uploads — preserve original URL path inside the ZIP for clarity.
    const filesIncluded = [];
    const filesMissing = [];
    for (const url of snapshot.referenced_files) {
      const fsPath = _resolveUploadPath(url);
      if (!fsPath) { filesMissing.push(url); continue; }
      // Strip leading '/' so files end up under 'uploads/maps/...' or 'handout-files/...'
      const archivePath = url.replace(/^\//, '');
      try {
        archive.file(fsPath, { name: archivePath });
        filesIncluded.push(url);
      } catch (e) {
        console.warn('zip skip', url, e?.message);
        filesMissing.push(url);
      }
    }

    // README + manifest for restoration context.
    const readme =
`Roll 1 — backup kampanii
========================
Eksport wykonany: ${snapshot.meta.exported_at}
Kampania: ${snapshot.campaign?.name || 'N/A'} (id: ${snapshot.meta.campaign_id})
Schema version: ${snapshot.meta.schema_version}

Zawartość:
- campaign.json — pełny snapshot tabel SQL (postacie, NPC, mapa, czat, questy, handouty, world state, etc.)
- uploads/maps/      — tła map
- uploads/tokens/    — biblioteka obrazków tokenów
- uploads/characters/— awatary postaci
- uploads/music/     — muzyka kampanii
- handout-files/     — handouty (obrazy/PDF)

Pliki uwzględnione: ${filesIncluded.length}
Pliki brakujące:    ${filesMissing.length}${filesMissing.length ? '\n  ' + filesMissing.join('\n  ') : ''}

Import w aplikacji: Panel MG → Eksport / Backup → Import (JSON lub ZIP).
Przywraca dane do wybranej kampanii (zastępuje obecną zawartość).
`;
    archive.append(readme, { name: 'README.txt' });
    archive.append(JSON.stringify({
      exported_at: snapshot.meta.exported_at,
      files_included: filesIncluded,
      files_missing: filesMissing
    }, null, 2), { name: 'manifest.json' });

    await archive.finalize();
  } catch (err) {
    console.error('export-zip', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else { try { res.end(); } catch (_) { /* noop */ } }
  }
});

const importTempDir = path.join(__dirname, 'private_uploads', 'import-temp');
fs.mkdirSync(importTempDir, { recursive: true });

const backupImportUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, importTempDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${uuidv4()}${ext || '.bin'}`);
    }
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(json|zip)$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Dozwolone formaty: .json, .zip'), ok);
  }
});

// Przywrócenie backupu do bieżącej kampanii (zastępuje dane kampanii).
app.post('/api/campaigns/:id/import', authMiddleware, backupImportUpload.single('backup'), async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko MG może importować backup' });
  }
  let extractDir = null;
  const uploadPath = req.file?.path;
  try {
    let snapshot;
    let filesRoot = null;

    if (uploadPath) {
      const ext = path.extname(req.file.originalname || '').toLowerCase();
      if (ext === '.json') {
        snapshot = JSON.parse(fs.readFileSync(uploadPath, 'utf8'));
      } else if (ext === '.zip') {
        extractDir = fs.mkdtempSync(path.join(importTempDir, 'zip-'));
        const zip = new AdmZip(uploadPath);
        zip.extractAllTo(extractDir, true);
        const jsonPath = path.join(extractDir, 'campaign.json');
        if (!fs.existsSync(jsonPath)) {
          throw new Error('W archiwum ZIP brak pliku campaign.json');
        }
        snapshot = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        filesRoot = extractDir;
      } else {
        throw new Error('Nieobsługiwany format pliku');
      }
    } else {
      return res.status(400).json({ error: 'Wyślij plik .json lub .zip (pole „backup”)' });
    }

    const members = await campaignOps.getMembers(req.params.id);
    const memberUserIds = new Set(members.map((m) => m.user_id));

    const result = await restoreCampaignFromSnapshot(req.params.id, snapshot, {
      dmUserId: req.user.id,
      memberUserIds,
      filesRoot,
      projectRoot: __dirname
    });

    musicPlaybackByCampaign.delete(req.params.id);
    ambientState.set(req.params.id, {});
    io.to(req.params.id).emit('music-sync', await buildMusicPayload(req.params.id));
    io.to(req.params.id).emit('ambient-update', { campaignId: req.params.id, layers: {} });
    io.to(req.params.id).emit('campaign-restored', { campaignId: req.params.id });
    io.to(req.params.id).emit('world-state-update', {
      campaignId: req.params.id,
      state: await worldStateOps.get(req.params.id)
    });

    res.json({
      ok: true,
      message: 'Backup zaimportowany',
      ...result
    });
  } catch (err) {
    console.error('campaign-import', err);
    res.status(400).json({ error: err.message || 'Import nieudany' });
  } finally {
    if (uploadPath) {
      try { fs.unlinkSync(uploadPath); } catch (_) { /* noop */ }
    }
    if (extractDir) {
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) { /* noop */ }
    }
  }
});

// ===== Token image library (per campaign) =====
app.get('/api/campaigns/:id/token-images', authMiddleware, async (req, res) => {
  if (!(await requireCampaignMember(req.params.id, req.user.id))) return res.status(403).json({ error: 'Brak dostępu' });
  res.json(await tokenImageOps.listByCampaign(req.params.id));
});

app.post('/api/campaigns/:id/token-images', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  tokenLibraryUpload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Błąd uploadu' });
    if (!req.file) return res.status(400).json({ error: 'Nie przesłano pliku' });
    const imageUrl = `/uploads/tokens/${req.file.filename}`;
    try {
      const entry = await tokenImageOps.create(req.params.id, {
        name: req.body?.name || req.file.originalname || 'Token',
        image_url: imageUrl,
        category: req.body?.category || 'character',
        uploaded_by: req.user.id
      });
      res.json(entry);
    } catch (e) {
      tryDeleteTokenLibraryImage(imageUrl);
      res.status(500).json({ error: 'Nie udało się zapisać obrazu' });
    }
  });
});

app.put('/api/token-images/:id', authMiddleware, async (req, res) => {
  const it = await tokenImageOps.findById(req.params.id);
  if (!it) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(it.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  res.json(await tokenImageOps.update(req.params.id, req.body || {}));
});

app.delete('/api/token-images/:id', authMiddleware, async (req, res) => {
  const it = await tokenImageOps.findById(req.params.id);
  if (!it) return res.status(404).json({ error: 'Nie znaleziono' });
  if (!(await campaignOps.isDm(it.campaign_id, req.user.id))) return res.status(403).json({ error: 'Tylko MG' });
  const usage = await tokenImageOps.usageCount(it.campaign_id, it.image_url);
  await tokenImageOps.delete(req.params.id);
  // Usuń plik tylko jeśli nie jest używany przez żaden token
  if (usage === 0) tryDeleteTokenLibraryImage(it.image_url);
  res.json({ ok: true, deletedFile: usage === 0 });
});

// Zastosuj URL z biblioteki do tokenu (bez uploadu).
app.put('/api/campaigns/:id/map/tokens/:tokenId/image-url', authMiddleware, async (req, res) => {
  if (!(await campaignOps.isDm(req.params.id, req.user.id))) {
    return res.status(403).json({ error: 'Tylko Mistrz Gry może zmieniać tokeny' });
  }
  const url = String(req.body?.imageUrl || '').trim();
  // Pusta wartość = usuń grafikę
  if (url && !url.startsWith('/uploads/') && !url.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Nieprawidłowy URL grafiki' });
  }
  await mapOps.updateToken(req.params.tokenId, { image_url: url });
  const payload = await buildMapPayload(req.params.id);
  io.to(req.params.id).emit('map-update', payload);
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
  if (youtubeImport.YTDLP_ENABLED) {
    youtubeImport.assertYtdlpAvailable()
      .then(() => console.log(`YouTube import: yt-dlp OK (${youtubeImport.getYtdlpPath()})`))
      .catch((err) => console.warn(`YouTube import: ${err.message}`));
  }
  server.listen(PORT, () => {
    console.log(`\n⚔️  Dedeki D&D VTT działa na http://localhost:${PORT}\n`);
  });
}

startServer().catch(err => {
  console.error('Błąd uruchamiania serwera:', err);
  process.exit(1);
});
