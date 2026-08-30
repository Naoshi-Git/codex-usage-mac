#!/bin/bash
set -euo pipefail

REPO="Naoshi-Git/codex-usage-mac"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/codex-usage-bootstrap.XXXXXX")"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

[[ "$(uname -s)" == "Darwin" ]] || { echo "Error: macOS only." >&2; exit 1; }

ARCHIVE="$TMP_DIR/source.tar.gz"
echo "Downloading Codex Usage for Mac..."
curl -fL --retry 2 --connect-timeout 10 \
  "https://github.com/$REPO/archive/refs/heads/main.tar.gz" \
  -o "$ARCHIVE"

/usr/bin/tar -xzf "$ARCHIVE" -C "$TMP_DIR"
SOURCE_DIR="$(find "$TMP_DIR" -maxdepth 1 -type d -name 'codex-usage-mac-*' | head -n 1)"
[[ -n "$SOURCE_DIR" && -f "$SOURCE_DIR/install.sh" ]] || { echo "Error: invalid source archive." >&2; exit 1; }

/bin/bash "$SOURCE_DIR/install.sh"
