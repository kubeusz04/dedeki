#!/usr/bin/env bash
# Świeża instalacja: clone z GitHub + .env + docker compose up
# Użycie:
#   ./deploy/oracle/fresh-from-github.sh https://github.com/TWOJ_USER/dedeki.git
#   ./deploy/oracle/fresh-from-github.sh https://github.com/TWOJ_USER/dedeki.git ~/dedeki
set -euo pipefail

REPO_URL="${1:?Podaj URL repozytorium GitHub, np. https://github.com/user/dedeki.git}"
INSTALL_DIR="${2:-$HOME/dedeki}"
COMPOSE_FILE="docker-compose.prod.yml"
HTTPS="${USE_HTTPS:-0}"

if [[ -d "$INSTALL_DIR" ]]; then
  echo "Folder $INSTALL_DIR już istnieje."
  echo "Najpierw uruchom: ./deploy/oracle/wipe-all.sh $INSTALL_DIR"
  exit 1
fi

echo "==> Klonowanie $REPO_URL"
git clone "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"
chmod +x deploy/oracle/*.sh

# Przywróć .env z backupu jeśli jest
LATEST_ENV_BACKUP="$(ls -t /tmp/dedeki.env.backup.* 2>/dev/null | head -1 || true)"
if [[ -n "$LATEST_ENV_BACKUP" ]] && [[ ! -f .env ]]; then
  read -r -p "Przywrócić .env z $LATEST_ENV_BACKUP? [t/N] " restore
  if [[ "$restore" =~ ^[tTyY]$ ]]; then
    cp "$LATEST_ENV_BACKUP" .env
    echo "Przywrócono .env"
  fi
fi

if [[ ! -f .env ]]; then
  cp .env.production.example .env
  echo ""
  echo "Utworzono .env z szablonu. UZUPEŁNIJ przed startem:"
  echo "  nano $INSTALL_DIR/.env"
  echo ""
  echo "Wymagane: POSTGRES_PASSWORD, DATABASE_URL (to samo hasło), JWT_SECRET, SOCKET_CORS_ORIGIN"
  read -r -p "Naciśnij Enter gdy .env będzie gotowy..."
fi

if ! grep -q '^POSTGRES_PASSWORD=.\+' .env || grep -q 'zmien-na-bardzo-dlugie-haslo' .env; then
  echo "BŁĄD: Ustaw POSTGRES_PASSWORD w .env (nie domyślne hasło)."
  exit 1
fi

if grep -q 'wygeneruj-minimum-32-losowe-znaki' .env; then
  echo "BŁĄD: Ustaw JWT_SECRET w .env."
  exit 1
fi

echo "==> Budowanie i uruchamianie Docker"
if [[ "$HTTPS" == "1" ]]; then
  docker compose -f "$COMPOSE_FILE" --profile https up -d --build
else
  docker compose -f "$COMPOSE_FILE" up -d --build
fi

echo "==> Oczekiwanie na healthcheck..."
sleep 8
curl -fsS "http://127.0.0.1:${APP_PORT:-3000}/api/health" && echo

echo ""
echo "=============================================="
echo "  Dedeki działa — świeża instalacja z GitHub"
echo "  Katalog: $INSTALL_DIR"
echo "  URL: http://$(curl -s ifconfig.me 2>/dev/null || echo TWOJ_IP):${APP_PORT:-3000}"
echo "=============================================="
