// Static-output smoke tests: routes, links, fragments, metadata, feeds, search index.
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const SITE = 'https://aiguide.zenty.top';

const ARTICLE_IDS = (await readdir(join(root, 'src/content/articles')))
  .filter((file) => file.endsWith('.md'))
  .map((file) => file.slice(0, -3))
  .sort();

let failures = 0;
let checks = 0;

function check(condition, message, detail = '') {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${message}${detail ? `\n      ${detail}` : ''}`);
  }
}

check(ARTICLE_IDS.length >= 36, `expected at least 36 source articles, found ${ARTICLE_IDS.length}`);

// Read dates from source frontmatter so sitemap/lastmod checks do not trust build output.
const sourceDates = new Map();
for (const id of ARTICLE_IDS) {
  const source = await readFile(join(root, 'src/content/articles', `${id}.md`), 'utf8');
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const date = (
    frontmatter.match(/^updatedAt:\s*"?([^"\n]+)"?\s*$/m)?.[1] ??
    frontmatter.match(/^publishedAt:\s*"?([^"\n]+)"?\s*$/m)?.[1] ??
    ''
  ).trim();
  check(/^\d{4}-\d{2}-\d{2}$/.test(date), `source ${id}.md: missing usable frontmatter date`);
  sourceDates.set(id, date);
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function decode(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function meta(html, attr, name) {
  const pattern = new RegExp(`<meta[^>]*${attr}="${name}"[^>]*content="([^"]*)"`, 'i');
  return decode(html.match(pattern)?.[1] ?? '');
}

function ids(html) {
  const found = new Set();
  for (const match of html.matchAll(/\sid="([^"]+)"/g)) found.add(decode(match[1]));
  for (const match of html.matchAll(/<a[^>]*\sname="([^"]+)"/g)) found.add(decode(match[1]));
  return found;
}

const files = await walk(dist);
const htmlFiles = files.filter((file) => file.endsWith('.html'));
const htmlByPath = new Map();
for (const file of htmlFiles) {
  htmlByPath.set(file.slice(dist.length).replace(/\\/g, '/'), await readFile(file, 'utf8'));
}

function routeFor(urlPath) {
  const clean = urlPath.split('#')[0].split('?')[0];
  if (clean.endsWith('/')) return `${clean}index.html`;
  if (/\.[a-z0-9]+$/i.test(clean)) return clean;
  return `${clean}/index.html`;
}

function localTarget(href, fromRoute) {
  if (!href) return null;
  if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return null;
  if (href.startsWith('#')) return { route: fromRoute, hash: href.slice(1) };
  let url;
  try {
    url = new URL(href, SITE + fromRoute.replace(/index\.html$/, ''));
  } catch {
    return { invalid: href };
  }
  if (url.origin !== SITE) return null;
  return { route: routeFor(url.pathname), hash: url.hash.slice(1) };
}

// --- expected routes ---------------------------------------------------------
const expectedRoutes = [
  '/index.html',
  '/404.html',
  '/about/index.html',
  '/changelog/index.html',
  '/paths/index.html',
  '/categories/index.html',
  '/articles/index.html',
  '/search/index.html',
  '/rss.xml',
  '/robots.txt',
  '/search-index.json',
  '/sitemap-index.xml',
  '/favicon.svg',
  '/og-default.png',
  '/CNAME',
  '/.nojekyll',
  '/categories/codex/index.html',
  '/categories/claude-code/index.html',
  '/categories/agent/index.html',
  '/categories/mcp/index.html',
  '/categories/skills/index.html',
  '/categories/automation/index.html',
  ...ARTICLE_IDS.map((id) => `/articles/${id}/index.html`),
];
for (const route of expectedRoutes) {
  check(existsSync(join(dist, route)), `missing build output ${route}`);
}

// --- article content contract ------------------------------------------------
for (const id of ARTICLE_IDS) {
  const route = `/articles/${id}/index.html`;
  const html = htmlByPath.get(route);
  if (!html) continue;
  check(/<h1[^>]*>/.test(html), `${route}: missing h1`);
  check((html.match(/<h1[^>]*>/g) ?? []).length === 1, `${route}: expected exactly one h1`);
  check(/application\/ld\+json/.test(html), `${route}: missing JSON-LD`);
  check(/property="og:image" content="https:\/\/aiguide\.zenty\.top\/og-default\.png"/.test(html), `${route}: og:image not absolute`);
}

// --- per-page metadata, links, fragments ------------------------------------
const indexableTitles = new Map();
const indexableDescriptions = new Map();
const addUnique = (map, value, route) => {
  map.set(value, [...(map.get(value) ?? []), route]);
};

for (const [route, html] of htmlByPath) {
  const is404 = route === '/404.html';
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
  const description = meta(html, 'name', 'description');
  const canonical = decode(html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? '');
  const noindex = /name="robots" content="noindex/.test(html);

  check(title.length > 0, `${route}: empty title`);
  check(description.length >= 20, `${route}: description too short (${description.length})`);

  if (noindex) {
    check(canonical === '' || canonical.startsWith(SITE), `${route}: canonical not absolute (${canonical})`);
  } else {
    check(canonical.startsWith(SITE), `${route}: canonical not absolute (${canonical})`);
    const expectedCanonical = SITE + route.replace(/index\.html$/, '');
    check(canonical === expectedCanonical, `${route}: canonical mismatch`, `got ${canonical}, want ${expectedCanonical}`);
  }

  check(/property="og:title"/.test(html), `${route}: missing og:title`);
  check(/name="twitter:card"/.test(html), `${route}: missing twitter card`);
  check(/rel="alternate" type="application\/rss\+xml"/.test(html), `${route}: missing RSS alternate`);

  if (is404 || route === '/search/index.html') {
    check(noindex, `${route}: must be noindex`);
    check(/name="robots" content="noindex, follow"/.test(html), `${route}: noindex should keep follow`);
  } else {
    check(/name="robots" content="index, follow/.test(html), `${route}: robots should allow indexing`);
    addUnique(indexableTitles, title, route);
    addUnique(indexableDescriptions, description, route);
  }

  const pageIds = ids(html);
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]*)"/g)) {
    const href = decode(match[1]);
    const target = localTarget(href, route);
    if (!target || target.invalid) {
      check(!target?.invalid, `${route}: malformed link ${href}`);
      continue;
    }
    const targetHtml = htmlByPath.get(target.route);
    check(Boolean(targetHtml || existsSync(join(dist, target.route))), `${route}: broken link ${href}`);
    if (target.hash && targetHtml) {
      const targetIds = target.route === route ? pageIds : ids(targetHtml);
      check(
        targetIds.has(decodeURIComponent(target.hash)),
        `${route}: missing fragment #${target.hash} in ${target.route}`,
      );
    }
  }

  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const parsed = JSON.parse(match[1]);
      check(parsed && typeof parsed === 'object', `${route}: empty JSON-LD`);
    } catch (error) {
      check(false, `${route}: invalid JSON-LD`, String(error));
    }
  }

  check(!/astro-island/.test(html), `${route}: unexpected hydrated island`);
  check(!/localhost:\d+/.test(html), `${route}: leaked localhost URL`);
}

// --- SEO titles and descriptions --------------------------------------------
for (const [title, routes] of indexableTitles) {
  check(routes.length === 1, `duplicate indexable title "${title}"`, routes.join(', '));
}
for (const [description, routes] of indexableDescriptions) {
  check(routes.length === 1, `duplicate indexable description`, `${routes.join(', ')}: ${description.slice(0, 60)}…`);
}

// --- search index ------------------------------------------------------------
const searchIndex = JSON.parse(await readFile(join(dist, 'search-index.json'), 'utf8'));
check(Array.isArray(searchIndex), 'search-index.json is not an array');
check(searchIndex.length === ARTICLE_IDS.length, `search index has ${searchIndex.length} docs, expected ${ARTICLE_IDS.length}`);
const indexedIds = new Set(searchIndex.map((doc) => doc.id));
for (const id of ARTICLE_IDS) check(indexedIds.has(id), `search index missing ${id}`);
check(indexedIds.size === ARTICLE_IDS.length, `search index has ${indexedIds.size} unique ids, expected ${ARTICLE_IDS.length}`);
check(
  [...indexedIds].every((id) => ARTICLE_IDS.includes(id)),
  'search index contains ids that are not source articles',
  [...indexedIds].filter((id) => !ARTICLE_IDS.includes(id)).join(', '),
);
// Fenced code is indexed on purpose (users search for commands), so runs like `###`
// inside a shell `echo "### …"` are content, not residue. Assert Markdown syntax
// that cannot survive as code text instead of banning `#`, `*` and backtick runs.
const markdownResidue = [
  ['code fence', /```/],
  ['link or image syntax', /!?\[[^\]\n]{1,120}\]\([^)\n]{1,200}\)/],
  ['leading heading marker', /^\s{0,3}#{1,6}\s/],
  ['bold markers', /\*\*[^*\n]{1,80}\*\*/],
];
for (const doc of searchIndex) {
  check(typeof doc.text === 'string' && doc.text.length > 400, `search doc ${doc.id}: body text too short`);
  check(doc.url === `/articles/${doc.id}/`, `search doc ${doc.id}: bad url ${doc.url}`);
  for (const [label, pattern] of markdownResidue) {
    check(!pattern.test(doc.text), `search doc ${doc.id}: ${label} left in text`);
  }
}
const reviewDoc = searchIndex.find((doc) => doc.id === 'claude-code-review');
check(Boolean(reviewDoc), 'search index missing claude-code-review');
check(Boolean(reviewDoc?.text.includes('git diff HEAD')), 'claude-code-review: fenced code content dropped from index');
check(
  Boolean(reviewDoc?.text.includes('### 已跟踪改动')),
  'claude-code-review: "#" inside a shell string must not be stripped as a heading',
);

// --- sitemap -----------------------------------------------------------------
const sitemapIndex = await readFile(join(dist, 'sitemap-index.xml'), 'utf8');
check(/https:\/\/aiguide\.zenty\.top\/sitemap-0\.xml/.test(sitemapIndex), 'sitemap-index missing sitemap-0.xml');
const sitemap = await readFile(join(dist, 'sitemap-0.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const sitemapableRoutes = expectedRoutes.filter(
  (route) => route.endsWith('index.html') && route !== '/404.html' && route !== '/search/index.html',
);
check(
  sitemapUrls.length === sitemapableRoutes.length,
  `sitemap has ${sitemapUrls.length} urls, expected ${sitemapableRoutes.length}`,
);
for (const url of sitemapUrls) {
  check(url.startsWith(`${SITE}/`), `sitemap non-absolute url ${url}`);
  check(url.endsWith('/'), `sitemap url without trailing slash ${url}`);
}
check(!sitemapUrls.some((url) => url.includes('/search/')), 'sitemap must not include /search/');
check(!sitemapUrls.some((url) => url.includes('/404')), 'sitemap must not include 404');
for (const id of ARTICLE_IDS) {
  const loc = `${SITE}/articles/${id}/`;
  check(sitemapUrls.filter((url) => url === loc).length === 1, `sitemap should list ${loc} exactly once`);
}

// --- rss ---------------------------------------------------------------------
const rss = await readFile(join(dist, 'rss.xml'), 'utf8');
const rssLinks = [...rss.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1]);
const rssItems = [...rss.matchAll(/<item>[\s\S]*?<\/item>/g)];
check(rssItems.length === ARTICLE_IDS.length, `rss has ${rssItems.length} items, expected ${ARTICLE_IDS.length}`);
for (const item of rssItems) {
  const link = item[0].match(/<link>([^<]+)<\/link>/)?.[1] ?? '';
  check(link.startsWith(`${SITE}/articles/`), `rss item link not absolute: ${link}`);
  check(link.endsWith('/'), `rss item link missing trailing slash: ${link}`);
}
check(rssLinks.includes(`${SITE}/`), 'rss channel link missing');
check(/<language>zh-cn<\/language>/.test(rss), 'rss language missing');
const rssIds = rssItems.map((item) =>
  (item[0].match(/<link>([^<]+)<\/link>/)?.[1] ?? '')
    .replace(`${SITE}/articles/`, '')
    .replace(/\/$/, ''),
);
check(new Set(rssIds).size === ARTICLE_IDS.length, `rss covers ${new Set(rssIds).size} unique articles, expected ${ARTICLE_IDS.length}`);
for (const id of ARTICLE_IDS) check(rssIds.includes(id), `rss missing ${id}`);

// --- robots ------------------------------------------------------------------
const robots = await readFile(join(dist, 'robots.txt'), 'utf8');
check(robots.includes(`Sitemap: ${SITE}/sitemap-index.xml`), 'robots.txt sitemap line wrong');
check(!/Disallow: \/search\//.test(robots), 'robots.txt must not disallow /search/ (noindex must be reachable)');
check(!/^Disallow:/m.test(robots), 'robots.txt should not disallow crawling');

// --- sitemap lastmod and author identity -------------------------------------
const sitemapLastmod = new Map();
for (const block of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
  const loc = block[1].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '';
  const lastmod = block[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? '';
  sitemapLastmod.set(loc, lastmod);
}
for (const [loc, lastmod] of sitemapLastmod) {
  if (!/\/articles\/[^/]+\/$/.test(loc)) {
    check(lastmod === '', `sitemap non-article page should omit lastmod: ${loc}`);
  }
}

const AUTHOR_ID = `${SITE}/about/#author`;
const jsonLdOf = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
    JSON.parse(match[1]),
  );

for (const id of ARTICLE_IDS) {
  const route = `/articles/${id}/index.html`;
  const html = htmlByPath.get(route) ?? '';
  const article = jsonLdOf(html).find((block) => block['@type'] === 'Article');
  const dateModified = article?.['dateModified'];
  check(Boolean(dateModified), `${route}: Article missing dateModified`);
  check(/^\d{4}-\d{2}-\d{2}T/.test(dateModified ?? ''), `${route}: dateModified is not ISO (${dateModified})`);
  check(
    dateModified?.startsWith(sourceDates.get(id) ?? '~'),
    `${route}: dateModified does not match source frontmatter date`,
    `article ${dateModified}, source ${sourceDates.get(id)}`,
  );
  const loc = `${SITE}/articles/${id}/`;
  check(
    sitemapLastmod.get(loc) === dateModified,
    `${route}: sitemap lastmod must match Article dateModified`,
    `sitemap ${sitemapLastmod.get(loc)}, article ${dateModified}`,
  );
  check(!('wordCount' in (article ?? {})), `${route}: Article should not claim wordCount`);
  check(article?.author?.['@id'] === AUTHOR_ID, `${route}: author @id should be ${AUTHOR_ID}`);
  check(article?.author?.url === AUTHOR_ID, `${route}: author url should be ${AUTHOR_ID}`);
  check(/href="\/about\/#author"/.test(html), `${route}: missing visible author link`);
}

const aboutHtml = htmlByPath.get('/about/index.html') ?? '';
const aboutPage = jsonLdOf(aboutHtml).find((block) => block['@type'] === 'AboutPage');
check(aboutPage?.mainEntity?.['@id'] === AUTHOR_ID, 'about: mainEntity should reference /about/#author');
check(aboutPage?.mainEntity?.url === AUTHOR_ID, 'about: mainEntity url should be /about/#author');
check(ids(aboutHtml).has('author'), 'about: missing #author section');

// --- article chrome ----------------------------------------------------------
const firstArticle = htmlByPath.get('/articles/codex-first-task/index.html') ?? '';
check(/aria-label="本页目录"/.test(firstArticle), 'article: missing TOC');
check(/data-progress-bar/.test(firstArticle), 'article: missing reading progress bar');
check(/rel="next"/.test(firstArticle), 'article: missing next link');
check(/相关教程/.test(firstArticle), 'article: missing related section');
check(/class="rail/.test(firstArticle), 'article: missing route rail');

const home = htmlByPath.get('/index.html') ?? '';
check(/class="path-list"/.test(home), 'home: missing route list');

const pathsHtml = htmlByPath.get('/paths/index.html') ?? '';
for (const id of ARTICLE_IDS) {
  const href = `href="/articles/${id}/"`;
  const count = pathsHtml.split(href).length - 1;
  check(count === 1, `paths page should link ${id} exactly once (found ${count})`);
}
check(
  [...pathsHtml.matchAll(/href="\/articles\/[^"]+\/"/g)].length === ARTICLE_IDS.length,
  'paths page should contain exactly one link per source article',
);

const routeAnchors = [...pathsHtml.matchAll(/id="(route-\d+)"/g)].map((match) => match[1]);
check(routeAnchors.length === 6, `paths page should expose six route anchors, found ${routeAnchors.length}`);
check(new Set(routeAnchors).size === routeAnchors.length, 'paths page route anchors must be unique');
for (const anchor of routeAnchors) {
  check(home.includes(`href="/paths/#${anchor}"`), `home: missing link to ${anchor}`);
}
const homeArticleLinks = [...home.matchAll(/href="\/articles\/[^"]+\/"/g)].length;
check(homeArticleLinks < ARTICLE_IDS.length, `home should preview routes, not list all ${ARTICLE_IDS.length} articles`);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('smoke: OK');
