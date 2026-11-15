import type { APIRoute } from 'astro';
import { getAllArticles, markdownToText, articleHref } from '../lib/articles';
import { categoryName } from '../data/categories';
import type { SearchDoc } from '../lib/search';

export const GET: APIRoute = async () => {
  const articles = await getAllArticles();

  const docs: SearchDoc[] = articles.map((article) => ({
    id: article.id,
    title: article.data.title,
    description: article.data.description,
    category: article.data.category,
    categoryName: categoryName(article.data.category),
    difficulty: article.data.difficulty,
    tags: article.data.tags,
    url: articleHref(article.id),
    text: markdownToText(article.body ?? ''),
  }));

  return new Response(JSON.stringify(docs), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
