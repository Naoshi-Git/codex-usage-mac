#!/bin/bash
set -euo pipefail

APP_NAME="codex-usage"
INSTALL_ROOT="${CODEX_USAGE_HOME:-$HOME/.local/share/codex-usage}"
LEGACY_ROOT="$HOME/.local/share/codex-usage-mac"
BIN_DIR="${CODEX_USAGE_BIN:-$HOME/.local/bin}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf "%s\n" "$*"; }
fail() { printf "Error: %s\n" "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || fail "This installer is for macOS. Use install.ps1 on Windows."
[[ -n "$INSTALL_ROOT" && "$INSTALL_ROOT" != "/" ]] || fail "Unsafe install path."
[[ -n "$BIN_DIR" && "$BIN_DIR" != "/" ]] || fail "Unsafe bin path."

if ! command -v node >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Node.js 22+ is required and was not found.

Recommended:
  brew install node

If Homebrew is not installed, install a current LTS release from https://nodejs.org/ and rerun:
  bash install.sh
EOF
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ "$NODE_MAJOR" -ge 22 ]] || fail "Node.js 22+ is required (found $(node --version)). Run: brew upgrade node"

say "Installing Codex Usage"
say "  source:  $SCRIPT_DIR"
say "  app:     $INSTALL_ROOT"
say "  command: $BIN_DIR/$APP_NAME"

rm -rf "$INSTALL_ROOT"
mkdir -p "$INSTALL_ROOT" "$BIN_DIR"
cp -R "$SCRIPT_DIR/bin" "$SCRIPT_DIR/src" "$SCRIPT_DIR/package.json" "$INSTALL_ROOT/"
chmod +x "$INSTALL_ROOT/bin/codex-usage.mjs"

if ! node "$INSTALL_ROOT/bin/codex-usage.mjs" --self-test >/dev/null; then
  rm -rf "$INSTALL_ROOT"
  fail "Installed files failed the offline self-test."
fi

ln -sfn "$INSTALL_ROOT/bin/codex-usage.mjs" "$BIN_DIR/$APP_NAME"

if [[ "$LEGACY_ROOT" != "$INSTALL_ROOT" && -d "$LEGACY_ROOT" ]]; then
  rm -rf "$LEGACY_ROOT"
  say "Migrated from the previous Mac install location."
fi

PATH_NOTE=0
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) PATH_NOTE=1 ;;
esac

say ""
say "✓ codex-usage installed and self-test passed"
say ""
say "Codex runtime discovery:"
node "$INSTALL_ROOT/bin/codex-usage.mjs" doctor || true

if [[ "$PATH_NOTE" -eq 1 ]]; then
  cat <<EOF

$BIN_DIR is not currently in PATH.
Add this line to ~/.zshrc:
  export PATH="\$HOME/.local/bin:\$PATH"

Then reload:
  source ~/.zshrc
EOF
fi

cat <<'EOF'

Next:
  codex-usage
  codex-usage live --mascot
  codex-usage history

Future updates:
  codex-usage update
EOF
