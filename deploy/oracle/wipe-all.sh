#!/usr/bin/env bash
# Usuwa Dedeki z serwera: kontenery, obrazy, wolumeny (BAZA + UPLOADY), folder aplikacji.
# Użycie: ./deploy/oracle/wipe-all.sh [katalog_instalacji]
# Domyślnie: ~/dedeki
set -euo pipefail

INSTALL_DIR="${1:-$HOME/dedeki}"
COMPOSE_FILE="docker-compose.prod.yml"

echo "=============================================="
echo "  WYCZYŚĆ ORACLE — Dedeki (DESTRUKTYWNE)"
echo "  Katalog: $INSTALL_DIR"
echo "=============================================="
echo ""
echo "To skasuje:"
echo "  - kontenery dedeki-app, dedeki-db, dedeki-caddy"
echo "  - wolumeny Docker (PostgreSQL, uploady map/muzyki/handoutów)"
echo "  - folder $INSTALL_DIR"
echo ""
read -r -p "Wpisz TAK aby kontynuować: " confirm
if [[ "$confirm" != "TAK" ]]; then
  echo "Anulowano."
  exit 1
fi

# Kopia .env na wypadek ponownej instalacji z tymi samymi sekretami
if [[ -f "$INSTALL_DIR/.env" ]]; then
  BACKUP="/tmp/dedeki.env.backup.$(date +%Y%m%d-%H%M%S)"
  cp "$INSTALL_DIR/.env" "$BACKUP"
  echo "Zapisano kopię .env: $BACKUP"
fi

if [[ -d "$INSTALL_DIR" ]]; then
  cd "$INSTALL_DIR"
  docker compose -f "$COMPOSE_FILE" --profile https down -v --remove-orphans 2>/dev/null || true
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
fi

docker rm -f dedeki-app dedeki-db dedeki-caddy 2>/dev/null || true

# Wolumeny (nazwy z compose + ewentualny prefix projektu)
for vol in \
  dedeki_postgres_data dedeki_uploads_public dedeki_uploads_private \
  caddy_data caddy_config \
  dedeki-github_dedeki_postgres_data dedeki-github_dedeki_uploads_public \
  dedeki-github_dedeki_uploads_private dedeki_dedeki_postgres_data; do
  docker volume rm "$vol" 2>/dev/null || true
done

docker volume ls -q | grep -i dedeki | while read -r v; do
  docker volume rm "$v" 2>/dev/null || true
done

docker image rm dedeki-app dedeki-github-app 2>/dev/null || true
docker image ls -q --filter "reference=*dedeki*" | while read -r img; do
  docker image rm "$img" 2>/dev/null || true
done

cd /
rm -rf "$INSTALL_DIR"

echo ""
echo "Gotowe. Dedeki usunięte z serwera."
echo "Następny krok: ./deploy/oracle/fresh-from-github.sh https://github.com/TWOJ_USER/dedeki.git"
