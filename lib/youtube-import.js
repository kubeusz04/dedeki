const { spawn, execFileSync, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const YTDLP_ENABLED = process.env.YTDLP_ENABLED !== 'false';
const MAX_DURATION_SEC = parseInt(process.env.YTDLP_MAX_DURATION_SEC, 10) || 900;
const TIMEOUT_MS = parseInt(process.env.YTDLP_TIMEOUT_MS, 10) || 180000;

const YTDLP_BASE_ARGS = ['--no-playlist', '--remote-components', 'ejs:github'];

let ytdlpChecked = null;
let resolvedYtdlpPath = null;

function getFreshPathEnv() {
  const env = { ...process.env };
  if (process.platform !== 'win32') return env;
  try {
    const fresh = execSync(
      'powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable(\'Path\',\'Machine\') + \';\' + [Environment]::GetEnvironmentVariable(\'Path\',\'User\')"',
      { encoding: 'utf8', windowsHide: true }
    ).trim();
    if (fresh) {
      env.Path = fresh;
      env.PATH = fresh;
    }
  } catch (_e) { /* keep process.env */ }
  return env;
}

function getYtdlpPath() {
  if (resolvedYtdlpPath) return resolvedYtdlpPath;
  if (process.env.YTDLP_PATH && process.env.YTDLP_PATH !== 'yt-dlp') {
    resolvedYtdlpPath = process.env.YTDLP_PATH;
    return resolvedYtdlpPath;
  }

  const candidates = [];
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('where.exe', ['yt-dlp'], {
        encoding: 'utf8',
        windowsHide: true,
        env: getFreshPathEnv()
      });
      out.split(/\r?\n/).filter(Boolean).forEach((line) => candidates.push(line.trim()));
    } catch (_e) { /* ignore */ }

    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    for (const ver of ['Python312', 'Python311', 'Python310', 'Python313']) {
      candidates.push(path.join(local, 'Programs', 'Python', ver, 'Scripts', 'yt-dlp.exe'));
    }
    candidates.push(path.join(local, 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe'));
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      resolvedYtdlpPath = candidate;
      return resolvedYtdlpPath;
    }
  }

  resolvedYtdlpPath = 'yt-dlp';
  return resolvedYtdlpPath;
}

function spawnYtdlp(args, timeoutMs = TIMEOUT_MS) {
  const bin = getYtdlpPath();
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: getFreshPathEnv(),
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      const err = new Error('Przekroczono czas pobierania (timeout)');
      err.code = 'YTDLP_TIMEOUT';
      reject(err);
    }, timeoutMs);
    proc.on('error', (spawnErr) => {
      clearTimeout(timer);
      const err = new Error(spawnErr.code === 'ENOENT'
        ? 'Brak yt-dlp na serwerze. Zainstaluj yt-dlp i ffmpeg, potem zrestartuj serwer.'
        : spawnErr.message);
      err.code = 'YTDLP_MISSING';
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const msg = (stderr || stdout).trim() || `yt-dlp zakończył się kodem ${code}`;
        const err = new Error(msg.length > 400 ? `${msg.slice(0, 400)}…` : msg);
        err.code = 'YTDLP_FAILED';
        reject(err);
      }
    });
  });
}

function parseYoutubeId(input) {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id && id.length === 11 ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') {
        const v = u.searchParams.get('v');
        return v && v.length === 11 ? v : null;
      }
      const embed = u.pathname.match(/^\/embed\/([\w-]{11})/);
      if (embed) return embed[1];
      const shorts = u.pathname.match(/^\/shorts\/([\w-]{11})/);
      if (shorts) return shorts[1];
    }
  } catch (_e) { /* ignore */ }
  return null;
}

function buildYoutubeUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function assertYtdlpAvailable() {
  if (!YTDLP_ENABLED) {
    const err = new Error('Import YouTube jest wyłączony (YTDLP_ENABLED=false)');
    err.code = 'YTDLP_DISABLED';
    return Promise.reject(err);
  }
  if (ytdlpChecked === true) return Promise.resolve();
  return spawnYtdlp(['--version'], 15000).then(() => {
    ytdlpChecked = true;
  }).catch((err) => {
    ytdlpChecked = false;
    if (!err.code) err.code = 'YTDLP_MISSING';
    throw err;
  });
}

async function fetchMetadata(url) {
  await assertYtdlpAvailable();
  const { stdout } = await spawnYtdlp([
    ...YTDLP_BASE_ARGS,
    '--print', '%(title)s',
    '--print', '%(duration)s',
    url
  ], 60000);
  const lines = stdout.trim().split('\n');
  const title = (lines[0] || 'Utwór YouTube').trim().slice(0, 120);
  const duration = parseInt(lines[1], 10) || 0;
  return { title, duration };
}

function cleanupPartialFiles(destBase) {
  for (const ext of ['.mp3', '.m4a', '.webm', '.opus', '.part', '.tmp']) {
    fs.unlink(`${destBase}${ext}`, () => {});
  }
}

async function downloadAudioToFile({ videoId, destPath, maxDurationSec = MAX_DURATION_SEC }) {
  await assertYtdlpAvailable();
  const url = buildYoutubeUrl(videoId);
  const destBase = path.join(
    path.dirname(destPath),
    path.basename(destPath, path.extname(destPath))
  );
  const outputTemplate = `${destBase}.%(ext)s`;

  cleanupPartialFiles(destBase);

  try {
    await spawnYtdlp([
      ...YTDLP_BASE_ARGS,
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '5',
      '-o', outputTemplate,
      '--match-filter', `duration <= ${maxDurationSec}`,
      url
    ]);

    const mp3Path = `${destBase}.mp3`;
    if (!fs.existsSync(mp3Path)) {
      const err = new Error('Nie utworzono pliku MP3 po pobraniu');
      err.code = 'YTDLP_FAILED';
      throw err;
    }

    const stat = fs.statSync(mp3Path);
    if (path.resolve(mp3Path) !== path.resolve(destPath)) {
      fs.renameSync(mp3Path, destPath);
    }
    return { filePath: destPath, fileSize: stat.size, mimeType: 'audio/mpeg' };
  } catch (err) {
    cleanupPartialFiles(destBase);
    throw err;
  }
}

module.exports = {
  parseYoutubeId,
  buildYoutubeUrl,
  assertYtdlpAvailable,
  fetchMetadata,
  downloadAudioToFile,
  getYtdlpPath,
  YTDLP_ENABLED,
  MAX_DURATION_SEC
};
