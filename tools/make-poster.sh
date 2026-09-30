#!/usr/bin/env bash
# Render tools/poster.html to a print-ready PDF (repo root) and a PNG preview, then prove the QR scans.
set -euo pipefail
cd "$(dirname "$0")"
# variant: html file | utm_source | qr file | output pdf
# variant: html | utm_source | qr file | output pdf | the address the QR carries
# The QR never points at a puzzle directly: a puzzle link dies in 30 days and a printed poster does
# not. /p/poster forwards to whichever puzzle is current, and /get sends each phone to its store.
VARIANTS=("poster.html|poster|poster-qr.svg|../Phuzzles_Poster.pdf|https://phuzzles.app/get"
          "poster-mystery.html|poster-mystery|poster-mystery-qr.svg|../Phuzzles_Poster_Mystery.pdf|https://phuzzles.app/p/poster")
CHROME=$(command -v google-chrome || command -v chromium)
for v in "${VARIANTS[@]}"; do
  IFS='|' read -r HTML SRC QRF PDF TARGET <<<"$v"
  URL="$TARGET?utm_source=$SRC"
  PREVIEW="${HTML%.html}-preview"
  node -e '
const QR=require("qrcode");
QR.toString(process.argv[1],{type:"svg",errorCorrectionLevel:"Q",margin:0,color:{dark:"#1A1A2E",light:"#0000"}})
  .then(s=>require("fs").writeFileSync(process.argv[2],s));' "$URL" "$QRF"
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=8000 \
    --print-to-pdf="$PDF" "file://$PWD/$HTML" 2>/dev/null
  pdftoppm -png -r 150 -singlefile "$PDF" "$PREVIEW"
  node -e '
const {PNG}=require("pngjs"),jsQR=require("jsqr"),fs=require("fs");
const png=PNG.sync.read(fs.readFileSync(process.argv[2]+".png"));
const r=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);
if(!r||r.data!==process.argv[1]){console.error("QR check FAILED:",r&&r.data);process.exit(1)}
console.log("QR scans ->",r.data);' "$URL" "$PREVIEW"
  pdfinfo "$PDF" | grep -E "^Pages|^Page size" | tr '\n' ' '; echo "-> $PDF"
done
