const QR = require('qrcode');
const path = require('path');
const channels = ['instagram','tiktok','reddit','x','flyer','sticker','campus','coffeeshop'];
const out = path.join(__dirname, '..', 'qr', 'utm');
const opt = { errorCorrectionLevel: 'H', margin: 2, width: 1024, color: { dark: '#000000', light: '#ffffff' } };
(async () => {
  for (const c of channels) {
    const url = `https://phuzzles.app/?utm_source=${c}`;
    await QR.toFile(path.join(out, `phuzzles-qr-${c}.png`), url, { ...opt, type: 'png' });
  }
  console.log('generated', channels.length, 'tracking QRs ->', out);
})().catch(e => { console.error(e); process.exit(1); });
