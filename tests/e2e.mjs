// Browser checks with playwright-core. No browser download: uses installed Chrome/Edge.
// Under WSL there is no Linux browser, so the script re-runs itself with Windows node.
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');
const distDir = join(root, 'dist');
const shotsDir = join(root, '.work/screenshots');

const toWindowsPath = (value) =>
  value.replace(/^\/mnt\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:\\`).replace(/\//g, '\\');

if (process.platform === 'linux' && existsSync('/mnt/c') && process.env.ZENTY_E2E_RELAY !== '1') {
  const windowsNode = ['/mnt/c/nvm4w/nodejs/node.exe', '/mnt/c/Program Files/nodejs/node.exe'].find(
    existsSync,
  );
  if (!windowsNode) {
    console.error('No Windows node found; cannot run a browser under WSL.');
    process.exit(1);
  }
  console.log(`relaying to Windows node: ${windowsNode}`);
  const result = spawnSync(windowsNode, [toWindowsPath(scriptPath)], {
    stdio: 'inherit',
    cwd: toWindowsPath(root),
    env: { ...process.env, ZENTY_E2E_RELAY: '1' },
  });
  process.exit(result.status ?? 1);
}

const { chromium } = await import('playwright-core');
const { startServer } = await import('./serve.mjs');

const PORT = Number(process.env.E2E_PORT ?? 4331);
const BASE = `http://127.0.0.1:${PORT}`;

const BROWSERS =
  process.platform === 'win32'
    ? [
        process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : [
        process.env.CHROME_PATH,
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      ];

const executablePath = BROWSERS.find((candidate) => candidate && existsSync(candidate));
if (!executablePath) {
  console.error('No Chrome/Edge binary found. Set CHROME_PATH to run browser tests.');
  process.exit(1);
}

mkdirSync(shotsDir, { recursive: true });

let failures = 0;
let checks = 0;
function check(condition, message, detail = '') {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${message}${detail ? `\n      ${detail}` : ''}`);
  }
}

const server = await startServer(distDir, PORT);
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });

const DELIBERATE_404 = `${BASE}/does-not-exist/`;
// Exact, deliberate artifacts of this suite; anything else counts as an error.
const tolerated = [
  {
    url: `${BASE}/search-index.json`,
    text: /^Failed to load resource: net::ERR_FAILED$/,
    reason: 'search failure test aborts the index request',
  },
];
const pageErrors = [];
context.on('page', (page) => {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    pageErrors.push({
      kind: 'console',
      text: msg.text(),
      url: msg.location()?.url ?? page.url(),
    });
  });
  page.on('pageerror', (error) =>
    pageErrors.push({ kind: 'pageerror', text: error.message, url: page.url() }),
  );
});

const page = await context.newPage();

// --- homepage + theme --------------------------------------------------------
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
check((await page.title()).includes('Zenty AI Guide'), 'home: title');
check((await page.locator('h1').count()) === 1, 'home: exactly one h1');
check((await page.locator('.path-list a').count()) >= 4, 'home: route list should contain lesson links');
await page.screenshot({ path: join(shotsDir, 'home-desktop.png'), fullPage: true });

const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
await page.click('[data-theme-toggle]');
const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
check(themeBefore !== themeAfter, 'theme: toggle should change data-theme');
check(
  (await page.evaluate(() => localStorage.getItem('zenty-theme'))) === themeAfter,
  'theme: preference not persisted',
);
await page.reload({ waitUntil: 'networkidle' });
check(
  (await page.evaluate(() => document.documentElement.dataset.theme)) === themeAfter,
  'theme: reload should keep the chosen theme',
);
await page.screenshot({ path: join(shotsDir, 'home-dark.png'), fullPage: false });
await page.click('[data-theme-toggle]');
await page.reload({ waitUntil: 'networkidle' });
check(
  (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light',
  'theme: switching back to light should persist',
);

// --- keyboard shortcut must not steal focus from the input -------------------
await page.goto(`${BASE}/search/`, { waitUntil: 'networkidle' });
await page.click('[data-search-input]');
await page.keyboard.type('a/b');
check(
  (await page.inputValue('[data-search-input]')) === 'a/b',
  'shortcut: "/" inside the search field must insert text, not move focus',
);
await page.keyboard.press('Escape');
await page.fill('[data-search-input]', '');
await page.click('h1');
await page.keyboard.press('/');
check(
  await page.evaluate(() => document.activeElement?.hasAttribute('data-search-input') ?? false),
  'shortcut: "/" should focus the search field',
);

// --- search: Chinese substring, English case-insensitivity, AND terms --------
const waitForIndex = () =>
  page.waitForFunction(
    () => !/正在载入/.test(document.querySelector('[data-search-status]')?.textContent ?? '正在载入'),
    { timeout: 10000 },
  );
// Debounced input means the DOM settles a moment after fill(); read after it.
const countResults = async () => {
  await page.waitForTimeout(300);
  return page.locator('[data-search-results] li').count();
};

await waitForIndex();
await page.fill('[data-search-input]', 'MCP');
const mcpUpper = await countResults();
await page.fill('[data-search-input]', 'mcp');
const mcpLower = await countResults();
check(mcpUpper > 0, 'search: "MCP" should match articles');
check(mcpUpper === mcpLower, 'search: English terms should be case-insensitive');

const firstTitle = await page.locator('[data-search-results] li a').first().textContent();
check(Boolean(firstTitle && firstTitle.trim().length > 3), 'search: results should render titles');

await page.fill('[data-search-input]', 'MCP 权限');
const andCount = await countResults();
check(andCount > 0 && andCount <= mcpUpper, 'search: AND terms should narrow results');
const snippetText = await page.locator('[data-search-results] li').first().innerText();
check(
  snippetText.includes('权限') || snippetText.includes('MCP'),
  'search: snippet should show a matched term',
);
await page.screenshot({ path: join(shotsDir, 'search-results.png'), fullPage: true });

await page.fill('[data-search-input]', '');
const mcpChip = page.locator('label.chip').filter({ has: page.locator('input[value="mcp"]') });
await mcpChip.click();
check(
  await page.evaluate(() => document.querySelector('input[value="mcp"]')?.checked ?? false),
  'search: clicking the chip should check the category',
);
const mcpOnly = await countResults();
check(
  mcpOnly > 0 && mcpOnly < mcpUpper,
  `search: category filter should narrow to MCP articles (${mcpOnly} of ${mcpUpper})`,
);
await mcpChip.click();

await page.fill('[data-search-input]', 'zzzz-no-match');
await page.waitForSelector('[data-search-empty]:not([hidden])', { timeout: 5000 }).catch(() => null);
check(await page.isVisible('[data-search-empty]'), 'search: empty state should appear for no matches');

await page.goto(`${BASE}/search/?q=%E6%9D%83%E9%99%90`, { waitUntil: 'networkidle' });
await waitForIndex();
const permCount = await countResults();
check(permCount > 0, 'search: query string should pre-fill and search');

await page.goto(`${BASE}/search/?q=Windows`, { waitUntil: 'networkidle' });
await waitForIndex();
const windowsCount = await countResults();
const windowsHrefs = await page
  .locator('[data-search-results] li a')
  .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
check(windowsCount > 0, 'search: "Windows" should match the setup article');
check(
  windowsHrefs.includes('/articles/codex-windows-setup/'),
  'search: "Windows" should surface codex-windows-setup',
);

await page.goto(`${BASE}/search/?q=${encodeURIComponent('幂等')}`, { waitUntil: 'networkidle' });
await waitForIndex();
const idempotencyCount = await countResults();
const idempotencyHrefs = await page
  .locator('[data-search-results] li a')
  .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
check(idempotencyCount > 0, 'search: 幂等 should match article text');
check(
  idempotencyHrefs.includes('/articles/automation-idempotency/'),
  'search: 幂等 should surface automation-idempotency',
);

await page.goto(`${BASE}/search/`, { waitUntil: 'networkidle' });
await waitForIndex();
await page.waitForTimeout(300);
check(await page.isVisible('[data-search-hint]'), 'search: hint should show with an empty query');

// --- search: index load failure, keyboard retry, recovery -------------------
await page.route('**/search-index.json', (route) => route.abort());
await page.goto(`${BASE}/search/`, { waitUntil: 'networkidle' });
check(await page.isVisible('[data-search-failure]'), 'search: failure panel should show when the index fails');
check(
  !(await page.isVisible('[data-search-hint]')),
  'search: hint should stay hidden while the index failed',
);
await page.evaluate(() => document.querySelector('[data-search-input]')?.focus());
let retryFocused = false;
for (let i = 0; i < 30 && !retryFocused; i += 1) {
  await page.keyboard.press('Tab');
  retryFocused = await page.evaluate(
    () => document.activeElement?.hasAttribute('data-search-retry') ?? false,
  );
}
check(retryFocused, 'search: retry button should be reachable with the keyboard');
await page.unroute('**/search-index.json');
await page.keyboard.press('Enter');
await page.waitForSelector('[data-search-results] li', { timeout: 10000 }).catch(() => null);
check(
  (await page.locator('[data-search-results] li').count()) > 0,
  'search: keyboard retry should recover once the index loads',
);
check(
  !(await page.isVisible('[data-search-failure]')),
  'search: failure panel should hide after a successful retry',
);

// --- article: TOC, copy, progress -------------------------------------------
await page.goto(`${BASE}/articles/codex-first-task/`, { waitUntil: 'networkidle' });
check((await page.locator('.toc-wrap a').count()) > 1, 'article: desktop TOC links missing');
const tocHref = await page.locator('.toc-wrap a').nth(1).getAttribute('href');
await page.click(`.toc-wrap a[href="${tocHref}"]`);
check(
  decodeURIComponent(await page.evaluate(() => location.hash)) === tocHref,
  'article: TOC link should update the hash',
);
check((await page.locator(tocHref).count()) === 1, 'article: TOC target heading should exist');

const copyButton = page.locator('.copy-btn').first();
check((await copyButton.count()) === 1, 'article: copy button missing');
await copyButton.click();
await page.waitForFunction(
  () => document.querySelector('.copy-btn')?.textContent?.includes('已复制'),
  null,
  { timeout: 3000 },
);
check(
  (await copyButton.textContent())?.includes('已复制'),
  'article: copy button should confirm success',
);
const clipboard = await page.evaluate(() => navigator.clipboard.readText());
check(clipboard.trim().length > 0, 'article: clipboard should contain code');

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(200);
const progressWidth = await page.evaluate(
  () => (document.querySelector('[data-progress-bar]')?.style.width ?? '0%'),
);
check(progressWidth !== '0%', 'article: reading progress should advance on scroll');
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: join(shotsDir, 'article-desktop.png'), fullPage: false });

// --- mobile: nav + overflow at 390 and 320 ----------------------------------
for (const width of [390, 320]) {
  await page.setViewportSize({ width, height: 780 });
  for (const path of ['/', '/paths/', '/categories/', '/categories/mcp/', '/articles/', '/articles/mcp-boundaries/', '/articles/codex-windows-setup/', '/articles/automation-idempotency/', '/search/', '/about/', '/changelog/', '/404.html']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(overflow <= 1, `mobile ${width}px ${path}: horizontal overflow ${overflow}px`);
  }

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const toggle = page.locator('[data-nav-toggle]');
  const box = await toggle.boundingBox();
  check(Boolean(box && box.height >= 44 && box.width >= 44), `mobile ${width}px: nav toggle below 44px`);
  check(!(await page.isVisible('[data-nav-panel]')), `mobile ${width}px: nav should start closed`);
  await toggle.click();
  check(await page.isVisible('[data-nav-panel]'), `mobile ${width}px: nav should open`);
  await page.screenshot({ path: join(shotsDir, `home-mobile-${width}-nav.png`), fullPage: false });
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('[data-nav-panel]')), `mobile ${width}px: Escape should close nav`);

  if (width === 390) {
    await page.goto(`${BASE}/articles/agent-tool-loop/`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: join(shotsDir, 'article-mobile-390.png'), fullPage: true });
  }
}

// --- regressions: nav focus containment, dual TOC highlight, copy toolbar ----
await page.setViewportSize({ width: 390, height: 780 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.locator('[data-nav-toggle]').click();
check(
  (await page.evaluate(() => document.querySelector('main')?.inert === true)),
  'a11y: page content should be inert while the mobile nav is open',
);
const panelStops = await page.evaluate(() => {
  const panel = document.querySelector('[data-nav-panel]');
  const toggle = document.querySelector('[data-nav-toggle]');
  return [toggle, ...(panel ? Array.from(panel.querySelectorAll('a[href], button')) : [])].filter(
    (element) => element && element.offsetParent !== null,
  ).length;
});
for (let step = 0; step <= panelStops; step += 1) await page.keyboard.press('Tab');
check(
  await page.evaluate(() => {
    const active = document.activeElement;
    const panel = document.querySelector('[data-nav-panel]');
    return Boolean(active && panel && panel.contains(active));
  }),
  'a11y: Tab must stay inside the open mobile nav',
);
await page.keyboard.press('Escape');
check(
  await page.evaluate(() => document.activeElement?.hasAttribute('data-nav-toggle') ?? false),
  'a11y: closing the nav should return focus to the toggle',
);
check(
  (await page.evaluate(() => document.querySelector('main')?.inert === false)),
  'a11y: page content should be interactive again after closing the nav',
);

// Focus must not be sent to a control the desktop layout has hidden.
await page.setViewportSize({ width: 390, height: 780 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.locator('[data-nav-toggle]').click();
await page.evaluate(() => document.querySelector('[data-nav-panel] a')?.focus());
await page.setViewportSize({ width: 1024, height: 900 });
await page.waitForTimeout(120);
const focusAfterBreakpoint = await page.evaluate(() => {
  const active = document.activeElement;
  const toggle = document.querySelector('[data-nav-toggle]');
  const panel = document.querySelector('[data-nav-panel]');
  return {
    visible: Boolean(active && active.offsetParent !== null),
    inPanel: Boolean(active && panel && panel.contains(active)),
    isToggle: active === toggle,
    panelHidden: Boolean(panel && panel.hidden),
    inert: document.querySelector('main')?.inert === true,
    label: (active?.textContent ?? '').trim().slice(0, 12),
  };
});
check(focusAfterBreakpoint.panelHidden, 'a11y: crossing to desktop should close the mobile nav');
check(!focusAfterBreakpoint.inert, 'a11y: crossing to desktop should release inert content');
check(
  focusAfterBreakpoint.visible && !focusAfterBreakpoint.inPanel && !focusAfterBreakpoint.isToggle,
  `a11y: focus after the 768px breakpoint should sit on a visible desktop control (${focusAfterBreakpoint.label})`,
);

// The footer is dark in both themes, so its focus ring needs its own colour.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const footerRing = await page.evaluate(() => {
  const footer = document.querySelector('.site-footer');
  const link = footer?.querySelector('a');
  if (!footer || !link) return null;
  link.focus();
  const style = getComputedStyle(link);
  const parse = (value) => value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(parse(style.outlineColor));
  const b = lum(parse(getComputedStyle(footer).backgroundColor));
  return {
    width: Number.parseFloat(style.outlineWidth),
    style: style.outlineStyle,
    ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100,
  };
});
check(
  Boolean(footerRing && footerRing.width >= 2 && footerRing.style !== 'none' && footerRing.ratio >= 3),
  `a11y: footer focus ring should contrast with the dark footer (${JSON.stringify(footerRing)})`,
);

// Touch rows inside the article keep a 44px minimum.
await page.setViewportSize({ width: 390, height: 780 });
await page.goto(`${BASE}/articles/codex-first-task/`, { waitUntil: 'networkidle' });
const mobileRows = await page.evaluate(() => {
  const heights = (selector) =>
    Array.from(document.querySelectorAll(selector)).map((el) => Math.round(el.getBoundingClientRect().height));
  return { toc: heights('.toc-mobile a'), copy: heights('.copy-btn') };
});
check(
  mobileRows.toc.length > 0 && mobileRows.toc.every((h) => h >= 44),
  `article 390px: toc rows under 44px (${mobileRows.toc.join(',')})`,
);
check(
  mobileRows.copy.length > 0 && mobileRows.copy.every((h) => h >= 44),
  `article 390px: copy button under 44px (${mobileRows.copy.join(',')})`,
);

await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${BASE}/articles/codex-first-task/`, { waitUntil: 'networkidle' });
const tocHeading = await page.locator('.toc-wrap a').nth(1).getAttribute('href');
await page.click(`.toc-wrap a[href="${tocHeading}"]`);
const highlightedCopies = await page.evaluate(
  (href) =>
    Array.from(document.querySelectorAll(`.toc a[href="${href}"]`)).filter(
      (link) => link.getAttribute('aria-current') === 'location',
    ).length,
  tocHeading,
);
check(
  highlightedCopies >= 2,
  `toc: desktop and mobile copies should highlight together (${highlightedCopies})`,
);

await page.setViewportSize({ width: 390, height: 780 });
await page.goto(`${BASE}/articles/mcp-first-server/`, { waitUntil: 'networkidle' });
const coveredBlocks = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.code-block')).filter((block) => {
    const button = block.querySelector('.copy-btn');
    const pre = block.querySelector('pre');
    if (!button || !pre) return false;
    return button.getBoundingClientRect().bottom > pre.getBoundingClientRect().top + 1;
  }).length,
);
check(coveredBlocks === 0, `article 390px: copy button covers the first code line (${coveredBlocks})`);

// --- 404 + reduced motion ----------------------------------------------------
await page.setViewportSize({ width: 1280, height: 900 });
const notFound = await page.goto(`${BASE}/does-not-exist/`);
check(notFound?.status() === 404, '404: unknown route should return 404 status');
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const reduced = await page.evaluate(() => {
  const link = document.querySelector('.path-list a');
  return link ? getComputedStyle(link).transitionDuration : 'none';
});
const reducedSeconds = Number.parseFloat(reduced);
check(
  reduced === 'none' || (Number.isFinite(reducedSeconds) && reducedSeconds <= 0.001),
  `motion: reduced-motion should disable transitions (${reduced})`,
);

// Only the deliberate navigation to an unknown route may fail. Anything else,
// including any other 404, is a real error.
const isDeliberateNotFound = (entry) =>
  entry.kind === 'console' &&
  entry.url === DELIBERATE_404 &&
  /^Failed to load resource: the server responded with a status of 404/.test(entry.text);
const isTolerated = (entry) =>
  entry.kind === 'console' &&
  tolerated.some((item) => item.url === entry.url && item.text.test(entry.text));
const realErrors = pageErrors.filter((entry) => !isDeliberateNotFound(entry) && !isTolerated(entry));
check(
  realErrors.length === 0,
  'browser: console/page errors',
  realErrors.map((entry) => `${entry.kind} ${entry.url}: ${entry.text}`).join('\n      '),
);
const ignoredCount = pageErrors.length - realErrors.length;
if (ignoredCount > 0) console.log(`ignored ${ignoredCount} deliberate error(s): deliberate 404 navigation + aborted index request`);

await browser.close();
server.close();

console.log(`\n${checks - failures}/${checks} browser checks passed`);
if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('e2e: OK');
