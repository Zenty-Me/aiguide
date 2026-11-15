import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import githubLight from '@shikijs/themes/github-light';
import githubDarkDimmed from '@shikijs/themes/github-dark-dimmed';
import { SITE } from './src/consts';

const withCommentColour = (theme, name, foreground) => ({
  ...theme,
  name,
  tokenColors: theme.tokenColors.map((entry) => {
    const scopes = Array.isArray(entry.scope) ? entry.scope : [entry.scope];
    const isComment = scopes.some((scope) =>
      ['comment', 'punctuation.definition.comment', 'string.comment'].includes(scope),
    );
    return isComment ? { ...entry, settings: { ...entry.settings, foreground } } : entry;
  }),
});

const zentyLight = withCommentColour(githubLight, 'zenty-light', '#5f594d');
const zentyDark = withCommentColour(githubDarkDimmed, 'zenty-dark', '#9aa79a');

let outDir = 'dist';
const captureOutDir = {
  name: 'capture-out-dir',
  hooks: {
    'astro:config:done': ({ config }) => {
      outDir = fileURLToPath(config.outDir);
    },
  },
};

/** Article dates live in the built JSON-LD, so the sitemap reuses them instead of parsing Markdown twice. */
async function articleLastmod(url) {
  const id = url.match(/\/articles\/([^/]+)\/$/)?.[1];
  if (!id) return undefined;
  try {
    const html = await readFile(join(outDir, 'articles', id, 'index.html'), 'utf8');
    return html.match(/"dateModified":"([^"]+)"/)?.[1];
  } catch {
    return undefined;
  }
}

export default defineConfig({
  site: SITE.url,
  trailingSlash: 'always',
  compressHTML: true,
  integrations: [
    captureOutDir,
    sitemap({
      filter: (page) => !page.endsWith('/404/') && !page.endsWith('/search/'),
      serialize: async (item) => {
        const lastmod = await articleLastmod(item.url);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      themes: { light: zentyLight, dark: zentyDark },
      wrap: true,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
