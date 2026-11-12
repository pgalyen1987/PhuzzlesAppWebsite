#!/usr/bin/env bash
# Render one link-preview card per idea page from tools/og-card.html into img/og-<key>.jpg.
# 1200x630 is what Open Graph consumers crop to; we render at 2x and downscale so the type is clean.
set -euo pipefail
cd "$(dirname "$0")"
CHROME=$(command -v google-chrome || command -v chromium)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
for k in pregnancy birthday puppy trip christmas daily today solve plus press; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=1200,630 --virtual-time-budget=6000 \
    --screenshot="$TMP/$k.png" "file://$PWD/og-card.html?k=$k" 2>/dev/null
  magick "$TMP/$k.png" -resize 1200x630 -strip -interlace Plane -quality 86 "../img/og-$k.jpg"
  identify -format "img/%f %wx%h %b\n" "../img/og-$k.jpg"
done
