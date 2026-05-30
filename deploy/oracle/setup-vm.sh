#!/usr/bin/env bash
# Pierwsza konfiguracja VM Oracle Cloud (Ubuntu 22.04/24.04)
set -euo pipefail

echo "==> Aktualizacja systemu"
sudo apt-get update -y
sudo apt-get upgrade -y

echo "==> Instalacja Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
fi

if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get install -y docker-compose-plugin
fi

echo "==> Firewall (UFW) — porty 22, 80, 443, 3000"
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw --force enable

echo ""
echo "Gotowe. Wyloguj się i zaloguj ponownie (grupa docker), potem:"
echo "  git clone https://github.com/TWOJ_USER/dedeki.git"
echo "  cd dedeki && cp .env.production.example .env && nano .env"
echo "  docker compose -f docker-compose.prod.yml up -d --build"
echo ""
echo "W Oracle Cloud Console otwórz też Security List dla VM: TCP 3000 (lub 80/443 z Caddy)."
