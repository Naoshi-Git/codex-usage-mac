#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/build/Codex Usage.app"
DEST="$HOME/Applications/Codex Usage.app"

if [[ ! -d "$APP" ]]; then
  "$ROOT/build.sh"
fi

mkdir -p "$HOME/Applications"
rm -rf "$DEST"
cp -R "$APP" "$DEST"
open "$DEST"
echo "Installed: $DEST"
