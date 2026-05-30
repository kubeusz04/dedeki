#!/usr/bin/env bash
# Aktualizacja aplikacji na serwerze (po git pull)
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ ! -f .env ]]; then
  echo "Brak pliku .env — skopiuj .env.production.example i uzupełnij."
  exit 1
fi

git pull --ff-only

docker compose -f docker-compose.prod.yml up -d --build

echo "Healthcheck:"
sleep 5
curl -fsS "http://127.0.0.1:${APP_PORT:-3000}/api/health" && echo
