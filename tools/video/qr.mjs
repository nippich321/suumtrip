// Writes the site's demo PromptPay QR (placeholder id from js/config.js, 1,290 baht) as SVG for the video.
// Usage: node tools/video/qr.mjs tools/video/hf/assets/qr.svg <path to qrcode-generator@1.4.4 qrcode.js>
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { promptPayPayload } from '../../js/promptpay.js';

const require = createRequire(import.meta.url);
const qrcode = require(process.argv[3]);
const qr = qrcode(0, 'M');
qr.addData(promptPayPayload('0000000000', 1290));
qr.make();
writeFileSync(process.argv[2], qr.createSvgTag({ cellSize: 10, margin: 0, scalable: true }));
console.log('ok', qr.getModuleCount());
