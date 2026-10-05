#!/usr/bin/env bash
# Renders mini/card.png (1200x800, the cast embed), mini/share.png (1200x630, the page's og:image) and
# mini/hero.png (1200x630, the manifest's hero and og image) from tools/miniapp-card.html with headless
# Chromium, then flattens them to RGB PNGs.
# Needs: chromium, python3 with Pillow. Run from anywhere.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
site="$(dirname "$here")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
shoot() {  # name width height query
  chromium --headless=new --no-sandbox --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=4000 --window-size="$2,$3" --screenshot="$tmp/$1.png" \
    "file://$here/miniapp-card.html?$4" >/dev/null 2>&1
  python3 - "$tmp/$1.png" "$site/mini/$1.png" "$2" "$3" <<'EOF'
import sys
from PIL import Image
src, dst, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert("RGB")
assert im.size == (w, h), im.size
im.save(dst, optimize=True)
print(dst, im.size)
EOF
}
shoot card 1200 800 card
shoot share 1200 630 share
shoot hero 1200 630 hero
