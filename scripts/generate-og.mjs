// Generates the social preview images.
//
//   public/og-default.png            fallback, latin-only copy
//   public/og/articles/<id>.png      one per article
//   public/og/guides/<slug>.png      one per start-here guide
//
// The per-content images carry the Chinese title, so the host needs a CJK font.
// The font stack asks for the common system faces; if none is installed the
// title still draws, just with boxes — rerun `npm run og` on a machine that has
// a CJK font before deploying.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 96;
const MAX_TEXT_WIDTH = WIDTH - PAD * 2;

const INK = '#172e47';
const INK_SOFT = '#667b90';
const PAPER = '#f5f8fc';
const BRAND = '#176bd3';
const BRAND_SOFT = '#e4eefc';
const LINE = '#c2d2e3';

const SANS = "'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Source Han Sans SC','Hiragino Sans GB',sans-serif";
const MONO = "'DejaVu Sans Mono','Cascadia Mono',monospace";

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;

const SOURCES = [
  { kind: 'articles', dir: 'src/content/articles', eyebrow: (fm) => fm.category ?? 'article' },
  { kind: 'guides', dir: 'src/content/guides', eyebrow: () => 'start here' },
];

function frontmatter(source) {
  const block = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return {};
  const fields = {};
  for (const line of block[1].split(/\r?\n/)) {
    const field = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (!field) continue;
    const value = field[2].trim().replace(/^["']/, '').replace(/["']$/, '');
    if (value) fields[field[1]] = value;
  }
  return fields;
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function measure(text, size) {
  let width = 0;
  for (const char of text) {
    if (CJK.test(char)) width += size;
    else if (char === ' ') width += size * 0.3;
    else if (/[iIl1.,:;'|]/.test(char)) width += size * 0.3;
    else width += size * 0.56;
  }
  return width;
}

function wrap(text, size, maxWidth) {
  const lines = [];
  let current = '';
  for (const char of text) {
    const next = current + char;
    if (current && measure(next, size) > maxWidth) {
      lines.push(current);
      current = char.trimStart();
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fitTitle(title) {
  for (let size = 70; size >= 38; size -= 2) {
    const lines = wrap(title, size, MAX_TEXT_WIDTH);
    if (lines.length <= 3) return { size, lines };
  }
  return { size: 38, lines: wrap(title, 38, MAX_TEXT_WIDTH).slice(0, 3) };
}

function dots() {
  const marks = [];
  for (let row = 0; row < 12; row += 1) {
    for (let column = 0; column < 24; column += 1) {
      const x = 40 + column * 48;
      const y = 40 + row * 48;
      marks.push(`<circle cx="${x}" cy="${y}" r="1.2" fill="${LINE}" opacity="0.55" />`);
    }
  }
  return marks.join('');
}

function brandBar() {
  return `
  <rect x="0" y="0" width="${WIDTH}" height="8" fill="${BRAND}" />
  <rect x="${PAD}" y="74" width="52" height="52" rx="12" fill="${INK}" />
  <path d="M${PAD + 15} ${88}h22v4l-15 15h15v5h-22v-4l15-15h-15z" fill="#eaf2fb" />
  <text x="${PAD + 72}" y="110" font-family="${SANS}" font-size="22" font-weight="700" letter-spacing="4" fill="${INK}">ZENTY AI GUIDE</text>`;
}

function footer(meta) {
  return `
  <line x1="${PAD}" y1="${HEIGHT - 92}" x2="${WIDTH - PAD}" y2="${HEIGHT - 92}" stroke="${LINE}" stroke-width="1" />
  <text x="${PAD}" y="${HEIGHT - 54}" font-family="${MONO}" font-size="19" fill="${INK_SOFT}">aiguide.zenty.top</text>
  <text x="${WIDTH - PAD}" y="${HEIGHT - 54}" text-anchor="end" font-family="${MONO}" font-size="19" fill="${INK_SOFT}">${escapeXml(meta)}</text>`;
}

function contentSvg({ title, eyebrow, meta }) {
  const { size, lines } = fitTitle(title);
  const lineHeight = Math.round(size * 1.36);
  const blockHeight = lines.length * lineHeight;
  const firstBaseline = 236 + (232 - blockHeight) / 2 + size * 0.86;

  const titleLines = lines
    .map(
      (line, index) =>
        `<text x="${PAD}" y="${Math.round(firstBaseline + index * lineHeight)}" font-family="${SANS}" font-size="${size}" font-weight="700" fill="${INK}">${escapeXml(line)}</text>`,
    )
    .join('');

  const chipWidth = Math.round(measure(eyebrow.toUpperCase(), 17) + 44);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}" />
  ${dots()}
  ${brandBar()}
  <rect x="${PAD}" y="${170}" width="${chipWidth}" height="34" rx="6" fill="${BRAND_SOFT}" />
  <text x="${PAD + 22}" y="${193}" font-family="${MONO}" font-size="17" letter-spacing="1.5" fill="#0f4f9e">${escapeXml(eyebrow.toUpperCase())}</text>
  ${titleLines}
  ${footer(meta)}
</svg>`;
}

const defaultSvg = () => {
  const steps = ['01', '02', '03', '04']
    .map((label, index) => {
      const x = 96 + index * 258;
      return `
      <line x1="${x + 48}" y1="${HEIGHT - 114}" x2="${x + 210}" y2="${HEIGHT - 114}" stroke="${LINE}" stroke-width="2" stroke-dasharray="6 6" />
      <circle cx="${x}" cy="${HEIGHT - 114}" r="34" fill="#ffffff" stroke="${BRAND}" stroke-width="2" />
      <text x="${x}" y="${HEIGHT - 107}" text-anchor="middle" font-family="${MONO}" font-size="20" font-weight="700" fill="#0f4f9e">${label}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}" />
  ${dots()}
  ${brandBar()}
  <text x="${PAD}" y="262" font-family="DejaVu Sans, sans-serif" font-size="76" font-weight="700" fill="${INK}">AI coding &amp;</text>
  <text x="${PAD}" y="350" font-family="DejaVu Sans, sans-serif" font-size="76" font-weight="700" fill="${INK}">agent field guide</text>
  <text x="${PAD + 2}" y="412" font-family="DejaVu Sans, sans-serif" font-size="27" fill="${INK_SOFT}">A practical Chinese-language handbook for developers</text>
  <rect x="${PAD}" y="446" width="212" height="40" rx="6" fill="${BRAND_SOFT}" />
  <text x="${PAD + 16}" y="473" font-family="${MONO}" font-size="19" fill="#0f4f9e">codex · claude code</text>
  <rect x="${PAD + 226}" y="446" width="238" height="40" rx="6" fill="${BRAND_SOFT}" />
  <text x="${PAD + 242}" y="473" font-family="${MONO}" font-size="19" fill="#0f4f9e">mcp · skills · agent</text>
  ${steps}
  <text x="${WIDTH - 96}" y="${HEIGHT - 107}" text-anchor="end" font-family="${MONO}" font-size="20" fill="${INK_SOFT}">aiguide.zenty.top</text>
</svg>`;
};

async function render(svg, out) {
  await mkdir(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(out);
}

const summary = [];
const manifest = {};

await render(defaultSvg(), resolve(root, 'public/og-default.png'));
summary.push('og-default.png');

for (const source of SOURCES) {
  const dir = resolve(root, source.dir);
  const files = (await readdir(dir)).filter((file) => file.endsWith('.md')).sort();
  let index = 0;
  for (const file of files) {
    index += 1;
    const slug = file.replace(/\.md$/, '');
    const fields = frontmatter(await readFile(resolve(dir, file), 'utf8'));
    const title = fields.title ?? slug;
    const eyebrow = source.eyebrow(fields);
    const meta = `${source.kind === 'guides' ? 'guide' : 'article'} ${String(index).padStart(2, '0')}/${String(files.length).padStart(2, '0')}`;
    const out = resolve(root, `public/og/${source.kind}/${slug}.png`);
    await render(contentSvg({ title, eyebrow, meta }), out);
    summary.push(`og/${source.kind}/${slug}.png`);
    (manifest[source.kind] ??= []).push(slug);
  }
}

await writeFile(
  resolve(root, 'src/data/og-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);
console.log(`og images written: ${summary.length}`);
