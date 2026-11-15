import { getCollection, type CollectionEntry } from 'astro:content';
import { CATEGORIES, categoryName } from '../data/categories';
import { PATHS } from '../data/paths';

export type Article = CollectionEntry<'articles'>;

export async function getAllArticles(): Promise<Article[]> {
  const articles = await getCollection('articles');
  return articles.sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
}

export function articleHref(id: string): string {
  return `/articles/${id}/`;
}

/** ISO date in UTC, stable for mono labels and <time datetime>. */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function updatedAt(article: Article): Date {
  return article.data.updatedAt ?? article.data.publishedAt;
}

export function byUpdatedDesc(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => updatedAt(b).getTime() - updatedAt(a).getTime());
}

export function readingMinutes(body: string): number {
  const cjk = (body.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (body.match(/[A-Za-z0-9_.-]+/g) ?? []).length;
  return Math.max(1, Math.round(cjk / 380 + latin / 200));
}

export interface CategoryGroup {
  slug: string;
  name: string;
  latin: string;
  blurb: string;
  description: string;
  articles: Article[];
}

export function categoryGroups(articles: Article[]): CategoryGroup[] {
  return CATEGORIES.map((category) => ({
    ...category,
    articles: articles.filter((a) => a.data.category === category.slug),
  }));
}

export interface ResolvedStep {
  id: string;
  label: string;
  href: string | null;
  title: string | null;
  category: string | null;
  difficulty: string | null;
}

export interface ResolvedPath {
  code: string;
  title: string;
  summary: string;
  steps: ResolvedStep[];
}

/** Route steps resolve to real links; a step without an article stays visible but unlinked. */
export function resolvePaths(articles: Article[]): ResolvedPath[] {
  const byId = new Map(articles.map((a) => [a.id, a]));
  return PATHS.map((path) => ({
    code: path.code,
    title: path.title,
    summary: path.summary,
    steps: path.steps.map((step) => {
      const article = byId.get(step.id);
      return {
        id: step.id,
        label: step.label,
        href: article ? articleHref(article.id) : null,
        title: article?.data.title ?? null,
        category: article ? categoryName(article.data.category) : null,
        difficulty: article?.data.difficulty ?? null,
      };
    }),
  }));
}

export function relatedArticles(current: Article, articles: Article[], limit = 3): Article[] {
  const tags = new Set(current.data.tags);
  const score = (a: Article) => {
    let value = a.data.category === current.data.category ? 2 : 0;
    for (const tag of a.data.tags) if (tags.has(tag)) value += 1;
    return value;
  };
  return articles
    .filter((a) => a.id !== current.id)
    .map((a) => ({ a, s: score(a) }))
    .sort((x, y) => y.s - x.s || x.a.data.order - y.a.data.order)
    .slice(0, limit)
    .map((x) => x.a);
}

/** Same-category neighbours, following the collection's order sort. */
export function prevNext(articles: Article[], id: string): { prev?: Article; next?: Article } {
  const current = articles.find((a) => a.id === id);
  if (!current) return {};
  const siblings = articles.filter((a) => a.data.category === current.data.category);
  const index = siblings.findIndex((a) => a.id === id);
  return { prev: siblings[index - 1], next: siblings[index + 1] };
}

/** Flatten Markdown to searchable plain text (code kept, syntax removed). */
export function markdownToText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n?/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function categoryLabel(slug: string): string {
  return categoryName(slug);
}
