// Renders assets/brand/logo-mark.svg into the extension's PNG icons.
// No canvas, no SVG parser: the mark is four primitives on a 32-unit grid, so
// it is cheaper to evaluate them per pixel than to pull in a rasterizer.
// Run after changing the mark: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [10, 10, 10]; // #0a0a0a
const FG = [74, 222, 128]; // #4ade80
const GRID = 32;
const SAMPLES = 4; // per axis — 16 coverage samples per pixel

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** Point in an axis-aligned rounded rectangle. */
const inRoundRect = (x, y, rx, ry, w, h, r) => {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

/** Point in the triangle (10,21) (14.5,21) (10,25.5) — the bubble's tail. */
const inTail = (x, y) =>
  x >= 10 && y >= 21 && (x - 10) / 4.5 + (y - 21) / 4.5 <= 1;

/** RGBA of one point of the mark, matching assets/brand/logo-mark.svg. */
function sample(x, y) {
  if (!inRoundRect(x, y, 0, 0, GRID, GRID, 7)) return null; // outside the tile
  const bubble = inRoundRect(x, y, 6, 7, 20, 14, 4) || inTail(x, y);
  if (!bubble) return BG;
  // Caption bars are knocked out of the bubble, the second one half-strength.
  if (inRoundRect(x, y, 10, 11.2, 12, 2.6, 1.3)) return BG;
  if (inRoundRect(x, y, 10, 15.4, 7, 2.6, 1.3)) {
    return FG.map((c, i) => Math.round(c + (BG[i] - c) * 0.55));
  }
  return FG;
}

function png(size) {
  const step = GRID / size / SAMPLES;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte + RGBA
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const c = sample(
            (px * SAMPLES * step) + (sx + 0.5) * step,
            (py * SAMPLES * step) + (sy + 0.5) * step,
          );
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; hits++;
        }
      }
      const o = 1 + px * 4;
      const total = SAMPLES * SAMPLES;
      // Colour is the mean of the covered samples; coverage is the alpha, which
      // is what antialiases the rounded corners against whatever sits behind.
      row[o] = hits ? Math.round(r / hits) : 0;
      row[o + 1] = hits ? Math.round(g / hits) : 0;
      row[o + 2] = hits ? Math.round(b / hits) : 0;
      row[o + 3] = Math.round((hits / total) * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolor + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../apps/extension/public/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
// 32 and 96 are Firefox's steps: 32 for the toolbar button and the add-ons
// list, 96 for those at 2x. Chromium ignores the extra sizes.
for (const size of [16, 32, 48, 96, 128]) {
  writeFileSync(new URL(`icon${size}.png`, dir), png(size));
}
console.log('icons written');
