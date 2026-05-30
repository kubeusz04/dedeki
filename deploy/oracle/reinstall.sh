#!/usr/bin/env bash
# Pełny reinstall: kasuj wszystko → clone z GitHub → start
# Użycie:
#   ./deploy/oracle/reinstall.sh https://github.com/TWOJ_USER/dedeki.git
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_URL="${1:?Podaj URL GitHub, np. https://github.com/user/dedeki.git}"
INSTALL_DIR="${2:-$HOME/dedeki}"

# Skrypty do /tmp — wipe kasuje folder aplikacji wraz z deploy/
TMP_DEPLOY="$(mktemp -d /tmp/dedeki-deploy.XXXXXX)"
cp "$SCRIPT_DIR/wipe-all.sh" "$SCRIPT_DIR/fresh-from-github.sh" "$TMP_DEPLOY/"
chmod +x "$TMP_DEPLOY"/*.sh

"$TMP_DEPLOY/wipe-all.sh" "$INSTALL_DIR"
"$TMP_DEPLOY/fresh-from-github.sh" "$REPO_URL" "$INSTALL_DIR"

rm -rf "$TMP_DEPLOY"
