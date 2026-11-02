#!/bin/sh
# Renders assets/icon.svg to public/icon/<size>.png with a headless Chromium.
# Usage: CHROMIUM=/path/to/chromium npm run icons
set -e
CHROMIUM="${CHROMIUM:-/Applications/Helium.app/Contents/MacOS/Helium}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
mkdir -p "$ROOT/public/icon"
for size in 16 32 48 128; do
  printf '<html><body style="margin:0"><img src="file://%s/assets/icon.svg" width="%s" height="%s" style="display:block"></body></html>' \
    "$ROOT" "$size" "$size" > "$TMP/$size.html"
  "$CHROMIUM" --headless --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --force-device-scale-factor=1 --window-size="$size,$size" \
    --screenshot="$ROOT/public/icon/$size.png" "file://$TMP/$size.html" >/dev/null 2>&1
done
rm -rf "$TMP"
ls -l "$ROOT/public/icon"
