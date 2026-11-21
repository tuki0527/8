import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = clamp01(((px - x1) * dx + (py - y1) * dy) / l2);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function renderIcon(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = maskable ? 0.72 : 0.88;
  const offset = (1 - scale) * 0.5;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      const v = (py + 0.5) / size;

      // Deep ocean gradient background
      const grad = (u * 0.4 + v * 0.6);
      let r = mix(11, 20, grad);
      let g = mix(19, 34, grad);
      let b = mix(32, 56, grad);

      // Normalized logo coordinate inside safe area
      const x = (u - offset) / scale;
      const y = (v - offset) / scale;

      if (x >= -0.2 && x <= 1.2 && y >= -0.2 && y <= 1.2) {
        // Subtle ocean horizon ripple at bottom
        const rippleY = 0.81 + Math.sin(x * Math.PI * 3) * 0.015;
        if (x > 0.24 && x < 0.76) {
          const dRip = Math.abs(y - rippleY);
          const aRip = clamp01((0.018 - dRip) / 0.012) * 0.65;
          r = mix(r, 95, aRip);
          g = mix(g, 152, aRip);
          b = mix(b, 194, aRip);
        }

        // Crescent moon
        const dOuter = Math.hypot(x - 0.48, y - 0.47);
        const dCut = Math.hypot(x - 0.57, y - 0.43);
        const outerCov = clamp01((0.20 - dOuter) / 0.018);
        const innerCut = clamp01((0.165 - dCut) / 0.018);
        const moonCov = clamp01(outerCov - innerCut);
        if (moonCov > 0) {
          const mr = mix(246, 165, clamp01(y));
          const mg = mix(226, 205, clamp01(y));
          const mb = mix(178, 232, clamp01(y));
          r = mix(r, mr, moonCov);
          g = mix(g, mg, moonCov);
          b = mix(b, mb, moonCov);
        }

        // Left & right stylized code braces
        const stroke = 0.032;
        const leftSegments = [
          [0.29, 0.28, 0.22, 0.34],
          [0.22, 0.34, 0.22, 0.44],
          [0.22, 0.44, 0.17, 0.48],
          [0.17, 0.48, 0.22, 0.52],
          [0.22, 0.52, 0.22, 0.62],
          [0.22, 0.62, 0.29, 0.68],
        ];
        const rightSegments = [
          [0.71, 0.28, 0.78, 0.34],
          [0.78, 0.34, 0.78, 0.44],
          [0.78, 0.44, 0.83, 0.48],
          [0.83, 0.48, 0.78, 0.52],
          [0.78, 0.52, 0.78, 0.62],
          [0.78, 0.62, 0.71, 0.68],
        ];
        let minBrace = 1;
        for (const [x1, y1, x2, y2] of [...leftSegments, ...rightSegments]) {
          minBrace = Math.min(minBrace, distToSegment(x, y, x1, y1, x2, y2));
        }
        const braceCov = clamp01((stroke * 0.5 - minBrace) / 0.014);
        if (braceCov > 0) {
          r = mix(r, 120, braceCov);
          g = mix(g, 183, braceCov);
          b = mix(b, 216, braceCov);
        }
      }

      const idx = (py * size + px) * 4;
      buf[idx] = Math.round(r);
      buf[idx + 1] = Math.round(g);
      buf[idx + 2] = Math.round(b);
      buf[idx + 3] = 255;
    }
  }
  return encodePng(size, size, buf);
}

const outDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), renderIcon(192, false));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), renderIcon(512, false));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), renderIcon(512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), renderIcon(180, false));
console.log('Generated PNG icons in public/');
