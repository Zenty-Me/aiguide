// Generates public/og-default.png (1200×630). Latin-only copy on purpose:
// the build host has no CJK font, and missing glyphs render as boxes.
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/og-default.png');

const dots = Array.from({ length: 24 * 12 }, (_, index) => {
  const x = 40 + (index % 24) * 48;
  const y = 40 + Math.floor(index / 24) * 48;
  return `<circle cx="${x}" cy="${y}" r="1.2" fill="#c2d2e3" opacity="0.55" />`;
}).join('');

const steps = ['01', '02', '03', '04']
  .map((label, index) => {
    const x = 96 + index * 258;
    return `
      <line x1="${x + 48}" y1="516" x2="${x + 210}" y2="516" stroke="#c2d2e3" stroke-width="2" stroke-dasharray="6 6" />
      <circle cx="${x}" cy="516" r="34" fill="#ffffff" stroke="#176bd3" stroke-width="2" />
      <text x="${x}" y="523" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="20" font-weight="700" fill="#0f4f9e">${label}</text>`;
  })
  .join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f5f8fc" />
  ${dots}
  <rect x="0" y="0" width="1200" height="8" fill="#176bd3" />
  <rect x="96" y="86" width="58" height="58" rx="13" fill="#172e47" />
  <path d="M113 102h24v4l-17 17h17v5h-24v-4l17-17h-17z" fill="#eaf2fb" />
  <text x="174" y="126" font-family="DejaVu Sans, sans-serif" font-size="26" font-weight="700" letter-spacing="4" fill="#172e47">ZENTY AI GUIDE</text>
  <text x="96" y="262" font-family="DejaVu Sans, sans-serif" font-size="76" font-weight="700" fill="#172e47">AI coding &amp;</text>
  <text x="96" y="350" font-family="DejaVu Sans, sans-serif" font-size="76" font-weight="700" fill="#172e47">agent field guide</text>
  <text x="98" y="412" font-family="DejaVu Sans, sans-serif" font-size="27" fill="#667b90">A practical Chinese-language handbook for developers</text>
  <rect x="96" y="446" width="212" height="40" rx="6" fill="#e4eefc" />
  <text x="112" y="473" font-family="DejaVu Sans Mono, monospace" font-size="19" fill="#0f4f9e">codex · claude code</text>
  <rect x="322" y="446" width="238" height="40" rx="6" fill="#e4eefc" />
  <text x="338" y="473" font-family="DejaVu Sans Mono, monospace" font-size="19" fill="#0f4f9e">mcp · skills · agent</text>
  ${steps}
  <text x="1104" y="523" font-family="DejaVu Sans Mono, monospace" font-size="20" fill="#667b90">aiguide.zenty.top</text>
</svg>`;

await mkdir(dirname(out), { recursive: true });
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
const meta = await sharp(out).metadata();
console.log(`og image written: ${out} (${meta.width}x${meta.height})`);
