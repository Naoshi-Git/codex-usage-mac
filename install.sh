#!/bin/bash
set -euo pipefail

APP_NAME="codex-usage"
INSTALL_ROOT="${CODEX_USAGE_HOME:-$HOME/.local/share/codex-usage-mac}"
BIN_DIR="${CODEX_USAGE_BIN:-$HOME/.local/bin}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf "%s\n" "$*"; }
fail() { printf "Error: %s\n" "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || fail "This installer is macOS-only."
[[ -n "$INSTALL_ROOT" && "$INSTALL_ROOT" != "/" ]] || fail "Unsafe install path."
[[ -n "$BIN_DIR" && "$BIN_DIR" != "/" ]] || fail "Unsafe bin path."

if ! command -v node >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Node.js 18+ is required and was not found.

Recommended:
  brew install node

If Homebrew is not installed, install Node.js from https://nodejs.org/ and rerun:
  ./install.sh
EOF
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ "$NODE_MAJOR" -ge 18 ]] || fail "Node.js 18+ is required (found $(node --version)). Run: brew upgrade node"

say "Installing Codex Usage for Mac"
say "  source:  $SCRIPT_DIR"
say "  app:     $INSTALL_ROOT"
say "  command: $BIN_DIR/$APP_NAME"

rm -rf "$INSTALL_ROOT"
mkdir -p "$INSTALL_ROOT" "$BIN_DIR"
cp -R "$SCRIPT_DIR/bin" "$SCRIPT_DIR/src" "$SCRIPT_DIR/package.json" "$INSTALL_ROOT/"
chmod +x "$INSTALL_ROOT/bin/codex-usage.mjs"
ln -sfn "$INSTALL_ROOT/bin/codex-usage.mjs" "$BIN_DIR/$APP_NAME"

PATH_NOTE=0
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) PATH_NOTE=1 ;;
esac

say ""
say "✓ codex-usage installed"

if ! command -v codex >/dev/null 2>&1; then
  cat <<'EOF'

Codex CLI is not installed yet.

Official standalone installer:
  curl -fsSL https://chatgpt.com/codex/install.sh | sh

Alternatives:
  brew install --cask codex
  npm install -g @openai/codex

After installation, run:
  codex

Choose “Sign in with ChatGPT”, then:
  codex-usage doctor
EOF
else
  say ""
  say "✓ Codex CLI found: $(command -v codex)"
fi

if [[ "$PATH_NOTE" -eq 1 ]]; then
  cat <<EOF

$BIN_DIR is not currently in PATH.
Add this line to ~/.zshrc:
  export PATH="\$HOME/.local/bin:\$PATH"

Then reload:
  source ~/.zshrc
EOF
else
  say ""
  say "Next:"
  say "  codex-usage doctor"
  say "  codex-usage"
fi
