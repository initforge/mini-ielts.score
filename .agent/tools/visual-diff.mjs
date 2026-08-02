#!/usr/bin/env node
/**
 * visual-diff.mjs — pure-Node PNG visual diff tool (no dependencies).
 *
 * Usage:
 *   node .agent/tools/visual-diff.mjs <reference.png> <actual.png> --outdir <dir>
 *
 * Writes into <dir>:
 *   overlay.png   — reference at 50% alpha over actual (per-channel 0.5 blend)
 *   diff.png      — per-pixel difference map (grayscale magnitude, 0=identical)
 *   metric.json   — { rmse, diffPixelsPct, dims } + input paths
 *
 * Exit 0 on success, 2 on CLI usage error, 1 on decode/IO error.
 *
 * Supported input: 8-bit RGB (color type 2) / RGBA (color type 6), non-interlaced.
 * Pure node:zlib inflate/deflate + PNG filter reconstruction. No npm deps.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// ---- PNG decode -----------------------------------------------------------

function decodePNG(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error(`Not a PNG: ${file}`);
  }
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    off += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!width || !height) throw new Error(`Invalid PNG (no IHDR): ${file}`);
  if (bitDepth !== 8) throw new Error(`Only 8-bit PNG supported: ${file} (depth=${bitDepth})`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`Only RGB/RGBA PNG supported: ${file} (colorType=${colorType})`);
  if (interlace !== 0) throw new Error(`Interlaced PNG not supported: ${file}`);

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) {
    throw new Error(`IDAT size mismatch: ${file} (expected ${(stride + 1) * height}, got ${raw.length})`);
  }

  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let val;
      switch (filter) {
        case 0: val = line[x]; break;
        case 1: val = line[x] + a; break;
        case 2: val = line[x] + b; break;
        case 3: val = line[x] + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          val = line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Unknown filter ${filter} in ${file}`);
      }
      cur[x] = val & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * channels];
      out[o + 1] = cur[x * channels + 1];
      out[o + 2] = cur[x * channels + 2];
      out[o + 3] = channels === 4 ? cur[x * channels + 3] : 255;
    }
    cur.copy(prev);
  }
  return { width, height, data: out };
}

// ---- PNG encode (RGBA, filter 0) ------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type 6 = RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // non-interlaced
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter 0 (none)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- compare ---------------------------------------------------------------

function compare(ref, act) {
  const W = Math.max(ref.width, act.width);
  const H = Math.max(ref.height, act.height);
  const n = W * H;
  const dimsEqual = ref.width === act.width && ref.height === act.height;

  const diffRgba = Buffer.alloc(n * 4);
  const overlayRgba = Buffer.alloc(n * 4);

  let diffCount = 0;
  let sumSq = 0;
  let comparedSamples = 0; // overlap pixels x 3 channels

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inRef = x < ref.width && y < ref.height;
      const inAct = x < act.width && y < act.height;
      const ri = inRef ? (y * ref.width + x) * 4 : -1;
      const ai = inAct ? (y * act.width + x) * 4 : -1;
      const o = (y * W + x) * 4;

      let maxd = 0;
      for (let c = 0; c < 3; c++) {
        const rv = inRef ? ref.data[ri + c] : 0;
        const av = inAct ? act.data[ai + c] : 0;
        const d = inRef && inAct ? Math.abs(rv - av) : 255;
        if (d > maxd) maxd = d;
        if (inRef && inAct) { sumSq += d * d; comparedSamples++; }
      }
      if (maxd > 0) diffCount++;

      diffRgba[o] = maxd; diffRgba[o + 1] = maxd; diffRgba[o + 2] = maxd; diffRgba[o + 3] = 255;

      if (inRef && inAct) {
        overlayRgba[o] = Math.round(0.5 * ref.data[ri] + 0.5 * act.data[ai]);
        overlayRgba[o + 1] = Math.round(0.5 * ref.data[ri + 1] + 0.5 * act.data[ai + 1]);
        overlayRgba[o + 2] = Math.round(0.5 * ref.data[ri + 2] + 0.5 * act.data[ai + 2]);
        overlayRgba[o + 3] = 255;
      } else {
        const src = inRef ? ref.data : act.data;
        const si = inRef ? ri : ai;
        overlayRgba[o] = src[si]; overlayRgba[o + 1] = src[si + 1];
        overlayRgba[o + 2] = src[si + 2]; overlayRgba[o + 3] = 255;
      }
    }
  }

  const rmse = comparedSamples > 0 ? Math.sqrt(sumSq / comparedSamples) : 0;
  const diffPixelsPct = n > 0 ? (diffCount / n) * 100 : 0;
  return {
    rmse,
    diffPixelsPct,
    dims: {
      equal: dimsEqual,
      reference: `${ref.width}x${ref.height}`,
      actual: `${act.width}x${act.height}`,
    },
    diffRgba, overlayRgba, width: W, height: H,
  };
}

// ---- CLI -------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = args.indexOf('--outdir');
if (flag !== 2 || args.length !== 4) {
  process.stderr.write('Usage: node .agent/tools/visual-diff.mjs <reference.png> <actual.png> --outdir <dir>\n');
  process.exit(2);
}
const [refPath, actPath] = args;
const outdir = args[3];

let ref, act;
try {
  ref = decodePNG(refPath);
  act = decodePNG(actPath);
} catch (err) {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
}

try {
  fs.mkdirSync(outdir, { recursive: true });
} catch (err) {
  process.stderr.write(`ERROR: cannot create outdir: ${err.message}\n`);
  process.exit(1);
}

const res = compare(ref, act);

const overlayFile = path.join(outdir, 'overlay.png');
const diffFile = path.join(outdir, 'diff.png');
const metricFile = path.join(outdir, 'metric.json');
fs.writeFileSync(overlayFile, encodePNG(res.width, res.height, res.overlayRgba));
fs.writeFileSync(diffFile, encodePNG(res.width, res.height, res.diffRgba));

const metric = {
  reference: refPath,
  actual: actPath,
  rmse: Number(res.rmse.toFixed(6)),
  diffPixelsPct: Number(res.diffPixelsPct.toFixed(4)),
  dims: res.dims,
  outputs: { overlay: overlayFile, diff: diffFile, metric: metricFile },
};
fs.writeFileSync(metricFile, JSON.stringify(metric, null, 2) + '\n');

process.stdout.write(JSON.stringify(metric, null, 2) + '\n');
process.exit(0);
