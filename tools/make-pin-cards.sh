#!/usr/bin/env bash
# Render a 1000x1500 Pinterest pin per idea page from tools/pin-card.html.
# Pinterest crops anything taller than 2:3, so 1000x1500 is the shape to hand it.
# Output goes to the marketing folder, not the site: these are pins, not pages.
set -euo pipefail
cd "$(dirname "$0")"
OUT=${OUT:-/home/me/boss/work/phuzzles-mkt/media}
CHROME=$(command -v google-chrome || command -v chromium)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
for k in "$@"; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=1000,1500 --virtual-time-budget=6000 \
    --screenshot="$TMP/$k.png" "file://$PWD/pin-card.html?k=$k" 2>/dev/null
  magick "$TMP/$k.png" -resize 1000x1500 -strip "$OUT/pin-$k-1000x1500.png"
  identify -format "%f %wx%h %b\n" "$OUT/pin-$k-1000x1500.png"
done
