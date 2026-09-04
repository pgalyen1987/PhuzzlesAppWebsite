#!/usr/bin/env node
// Generate scannable QR codes for phuzzles.app distribution.
//   node tools/generate-qr.js            -> defaults to https://phuzzles.app
//   node tools/generate-qr.js <url>      -> any URL (e.g. a UTM-tagged link)
const QR = require('qrcode');
const path = require('path');
const url = process.argv[2] || 'https://phuzzles.app';
const outDir = path.join(__dirname, '..', 'qr');

// H = 30% error correction: survives print smudging and lets you drop a logo in the center later.
const base = { errorCorrectionLevel: 'H', margin: 2 };

async function main() {
  // 1) High-contrast black — the reliable one for flyers/stickers/print. 1024px.
  await QR.toFile(path.join(outDir, 'phuzzles-qr.png'), url,
    { ...base, type: 'png', width: 1024, color: { dark: '#000000', light: '#ffffff' } });

  // 2) On-brand orange (#ff6b35) on white — for digital/marketing. Still high-contrast enough to scan.
  await QR.toFile(path.join(outDir, 'phuzzles-qr-brand.png'), url,
    { ...base, type: 'png', width: 1024, color: { dark: '#ff6b35', light: '#ffffff' } });

  // 3) SVG — infinite scaling for posters/large print.
  await QR.toFile(path.join(outDir, 'phuzzles-qr.svg'), url,
    { ...base, type: 'svg', color: { dark: '#000000', light: '#ffffff' } });

  console.log('QR codes for', url, '->', outDir);
}
main().catch(e => { console.error(e); process.exit(1); });
