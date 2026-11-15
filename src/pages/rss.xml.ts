import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getAllArticles, articleHref, updatedAt } from '../lib/articles';
import { SITE } from '../consts';

export const GET: APIRoute = async (context) => {
  const articles = await getAllArticles();
  const items = [...articles].sort(
    (a, b) => updatedAt(b).getTime() - updatedAt(a).getTime(),
  );

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items: items.map((article) => ({
      title: article.data.title,
      description: article.data.description,
      pubDate: updatedAt(article),
      link: articleHref(article.id),
      categories: [article.data.category, ...article.data.tags],
    })),
    customData: '<language>zh-cn</language>',
  });
};
