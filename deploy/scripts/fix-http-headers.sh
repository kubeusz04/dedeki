#!/usr/bin/env bash
# Naprawa Helmet dla HTTP (Oracle) — uruchom w ~/dedeki
set -euo pipefail
cd ~/dedeki

python3 << 'PY'
from pathlib import Path
p = Path("server.js")
text = p.read_text(encoding="utf-8")
start = text.find("// Middleware")
end = text.find("app.use(express.json")
if start == -1 or end == -1:
    raise SystemExit("Nie znaleziono bloku middleware w server.js")
new_block = """// Middleware
const isProduction = process.env.NODE_ENV === 'production';
const useHttps = process.env.USE_HTTPS === 'true';
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'"],
  scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  styleSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
  imgSrc: ["'self'", 'data:', 'blob:'],
  connectSrc: ["'self'", 'ws:', 'wss:']
};
if (useHttps) cspDirectives.upgradeInsecureRequests = [];

app.use(helmet({
  hsts: useHttps,
  crossOriginOpenerPolicy: useHttps,
  crossOriginEmbedderPolicy: useHttps,
  originAgentCluster: useHttps,
  crossOriginResourcePolicy: useHttps ? { policy: 'cross-origin' } : false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: cspDirectives
  }
}));
"""
p.write_text(text[:start] + new_block + text[end:], encoding="utf-8")
print("server.js patched OK")
PY

sudo docker compose -f docker-compose.prod.yml up -d --build
sleep 8
echo "--- Headers check (nie powinno byc upgrade-insecure-requests) ---"
curl -sI http://127.0.0.1:3000/ | grep -iE 'upgrade|strict-transport|content-security'