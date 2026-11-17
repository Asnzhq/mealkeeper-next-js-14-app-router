import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const out = "public/icons";
await mkdir(out, { recursive: true });
function crc32(data) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(data.length); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([size, name, data, checksum]); }
function image(size) {
  const red = [232, 93, 78], cream = [250, 247, 242], green = [127, 166, 91], dark = [80, 120, 58];
  const raw = Buffer.alloc((size * 3 + 1) * size); let offset = 0; const center = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) { raw[offset++] = 0; for (let x = 0; x < size; x += 1) { const dx = x - center, dy = y - center; let color = red;
    if (dx * dx + dy * dy < (size * .37) ** 2) color = cream;
    if ((dx / (size * .245)) ** 2 + ((dy + size * .01) / (size * .22)) ** 2 < 1) color = red;
    const leaf = ((dx - size * .005) / (size * .085)) ** 2 + ((dy + size * .205) / (size * .15)) ** 2 < 1 && dy < -size * .09;
    if (leaf) color = green;
    if (leaf && Math.abs((dy + size * .19) - 1.5 * (dx + size * .005)) < Math.max(1, size * .009)) color = dark;
    raw[offset++] = color[0]; raw[offset++] = color[1]; raw[offset++] = color[2];
  } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
for (const size of [192, 512]) await writeFile(`${out}/icon-${size}.png`, image(size));
