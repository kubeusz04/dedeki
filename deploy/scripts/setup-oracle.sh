#!/usr/bin/env bash
# Dedeki — szybka instalacja na Ubuntu (Oracle Cloud Free Tier / VPS)
# Uruchom na serwerze: bash deploy/scripts/setup-oracle.sh
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/dedeki}"
COMPOSE_FILE="docker-compose.prod.yml"

echo "==> Dedeki: instalacja zależności (Docker)"
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl git
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
  echo "Docker zainstalowany. Jeśli to pierwsza instalacja, wyloguj się i zaloguj ponownie (grupa docker)."
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Brak docker compose — plugin powinien być z get.docker.com"
  exit 1
fi

if [ ! -d "$REPO_DIR" ]; then
  echo "==> Sklonuj repozytorium do $REPO_DIR i uruchom skrypt ponownie."
  echo "    git clone https://github.com/TWOJ_USER/dedeki.git $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"

if [ ! -f .env ]; then
  echo "==> Tworzenie .env z .env.example"
  cp .env.example .env
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
  JWT="$(openssl rand -base64 48 | tr -d '\n')"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$DB_PASS|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
  echo "Wygenerowano losowe hasła w .env — zapisz kopię pliku .env w bezpiecznym miejscu!"
fi

PUBLIC_IP="$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo '')"
if [ -n "$PUBLIC_IP" ] && grep -q 'localhost:3000' .env; then
  echo "==> Ustawiam SOCKET_CORS_ORIGIN=http://${PUBLIC_IP}:3000"
  sed -i "s|^SOCKET_CORS_ORIGIN=.*|SOCKET_CORS_ORIGIN=http://${PUBLIC_IP}:3000|" .env
fi

echo "==> Budowanie i uruchamianie kontenerów"
docker compose -f "$COMPOSE_FILE" up -d --build

echo ""
echo "==> Gotowe. Sprawdź health:"
sleep 3
curl -sf "http://127.0.0.1:${APP_PORT:-3000}/api/health" && echo "" || docker compose -f "$COMPOSE_FILE" logs app --tail 30

echo ""
echo "Aplikacja: http://${PUBLIC_IP:-TWOJE_IP}:3000"
echo "Logi: docker compose -f $COMPOSE_FILE logs -f app"
echo "Pełna instrukcja: DEPLOY_ORACLE.md"

