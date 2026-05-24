#!/usr/bin/env bash
# Dedeki — szybka instalacja na Ubuntu (Oracle Cloud Free Tier / VPS)
# Uruchom: bash deploy/scripts/setup-oracle.sh
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/dedeki}"
COMPOSE_FILE="docker-compose.prod.yml"

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    printf '%s\n' 'docker compose'
  elif command -v docker-compose >/dev/null 2>&1; then
    printf '%s\n' 'docker-compose'
  else
    return 1
  fi
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi
  echo "==> Instalacja Docker..."
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl git
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
  echo "Docker zainstalowany. Jesli pierwsza instalacja — wyloguj sie i zaloguj ponownie (grupa docker)."
}

ensure_compose() {
  if compose_cmd >/dev/null; then
    return 0
  fi
  echo "==> Instalacja Docker Compose..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y docker-compose-v2 2>/dev/null \
      || sudo apt-get install -y docker-compose-plugin 2>/dev/null \
      || sudo apt-get install -y docker-compose 2>/dev/null \
      || true
  fi
  if ! compose_cmd >/dev/null; then
    echo "Blad: brak docker compose."
    echo "  sudo apt update && sudo apt install -y docker-compose-v2"
    exit 1
  fi
}

run_compose() {
  local cmd
  cmd="$(compose_cmd)"
  if [ "$cmd" = 'docker compose' ]; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

create_env_file() {
  local db_pass jwt origin
  db_pass="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
  jwt="$(openssl rand -base64 48 | tr -d '\n')"
  origin="${SOCKET_CORS_ORIGIN:-http://localhost:3000}"
  PUBLIC_IP="$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo '')"
  if [ -n "$PUBLIC_IP" ]; then
    origin="http://${PUBLIC_IP}:3000"
  fi
  cat > .env <<EOF
POSTGRES_DB=dedeki
POSTGRES_USER=dedeki
POSTGRES_PASSWORD=${db_pass}
PORT=3000
NODE_ENV=production
JWT_SECRET=${jwt}
SOCKET_CORS_ORIGIN=${origin}
APP_PORT=3000
EOF
  echo "Utworzono .env z losowymi haslami — zapisz kopie w bezpiecznym miejscu!"
}

ensure_env_file() {
  if [ -f .env ]; then
    return 0
  fi
  if [ -f .env.example ]; then
    echo "==> Tworzenie .env z .env.example"
    cp .env.example .env
    DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
    JWT="$(openssl rand -base64 48 | tr -d '\n')"
    sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$DB_PASS|" .env
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
    echo "Wygenerowano losowe hasla w .env."
  else
    echo "==> Brak .env.example — tworze .env automatycznie"
    create_env_file
  fi
}

echo "==> Dedeki: instalacja zaleznosci (Docker)"
ensure_docker
ensure_compose

if [ ! -d "$REPO_DIR" ]; then
  echo "==> Sklonuj repozytorium do $REPO_DIR i uruchom skrypt ponownie."
  exit 1
fi

cd "$REPO_DIR"

ensure_env_file

PUBLIC_IP="$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo '')"
if [ -n "$PUBLIC_IP" ] && grep -q 'localhost:3000' .env; then
  echo "==> Ustawiam SOCKET_CORS_ORIGIN=http://${PUBLIC_IP}:3000"
  sed -i "s|^SOCKET_CORS_ORIGIN=.*|SOCKET_CORS_ORIGIN=http://${PUBLIC_IP}:3000|" .env
fi

echo "==> Budowanie i uruchamianie kontenerow"
run_compose -f "$COMPOSE_FILE" up -d --build

echo ""
echo "==> Gotowe. Sprawdz health:"
sleep 3
curl -sf "http://127.0.0.1:${APP_PORT:-3000}/api/health" && echo "" || run_compose -f "$COMPOSE_FILE" logs app --tail 30

echo ""
echo "Aplikacja: http://${PUBLIC_IP:-TWOJE_IP}:3000"
echo "Logi: $(compose_cmd) -f $COMPOSE_FILE logs -f app"