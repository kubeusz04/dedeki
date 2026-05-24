#!/usr/bin/env bash
# Naprawa Helmet dla HTTP (bez SSL) — uruchom w ~/dedeki
set -euo pipefail
cd "${1:-$HOME/dedeki}"
FILE="server.js"
python3 <<'PY'
from pathlib import Path
p = Path("server.js")
text = p.read_text(encoding="utf-8")
start = text.find("// Middleware")
end = text.find("app.use(express.json", start)
if start < 0 or end < 0:
    raise SystemExit("Nie znaleziono bloku middleware w server.js")
block = """// Middleware
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
"""
p.write_text(text[:start] + block + text[end:], encoding="utf-8")
print("OK: server.js zaktualizowany")
PY
echo "Przebuduj kontener:"
echo "  sudo docker compose -f docker-compose.prod.yml up -d --build"