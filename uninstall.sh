#!/bin/bash
set -euo pipefail
INSTALL_ROOT="${CODEX_USAGE_HOME:-$HOME/.local/share/codex-usage-mac}"
BIN_DIR="${CODEX_USAGE_BIN:-$HOME/.local/bin}"
rm -f "$BIN_DIR/codex-usage"
rm -rf "$INSTALL_ROOT"
printf "Removed codex-usage.\n"
printf "History was kept at: $HOME/Library/Application Support/codex-usage/history.jsonl\n"
