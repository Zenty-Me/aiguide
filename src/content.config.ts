import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { CATEGORY_SLUGS } from './data/categories';

/**
 * Content contract shared with the content author:
 * src/content/articles/<id>.md, frontmatter below, URLs /articles/<id>/.
 */
const articles = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.enum(CATEGORY_SLUGS),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    difficulty: z.enum(['入门', '进阶']),
    order: z.number().int(),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
  }),
});

export const collections = { articles };
