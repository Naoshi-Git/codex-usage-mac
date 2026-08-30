#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$ROOT/build"
APP="$BUILD_DIR/Codex Usage.app"
ARCH="$(uname -m)"

case "$ARCH" in
  arm64|x86_64) ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

rm -rf "$BUILD_DIR"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O -parse-as-library \
  -target "${ARCH}-apple-macos13.0" \
  -framework AppKit \
  -framework Combine \
  -framework SwiftUI \
  "$ROOT/Sources/main.swift" \
  -o "$APP/Contents/MacOS/CodexUsage"

cp "$ROOT/Resources/Info.plist" "$APP/Contents/Info.plist"
codesign --force --deep --sign - "$APP" >/dev/null

echo "Built: $APP"
