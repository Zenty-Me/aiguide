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
    /**
     * Render the "账号与额度" note after the body. Turn it on only for articles
     * whose steps genuinely assume a working account or paid credential.
     */
    setupNote: z.boolean().default(false),
  }),
});

/**
 * Guides under /start/: the prerequisite layer the tutorials assume.
 * src/content/guides/<slug>.md, URLs /start/<slug>/.
 */
const guides = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    /** Short label shown above the title, e.g. 账务边界. */
    kicker: z.string().min(1),
    order: z.number().int(),
    updatedAt: z.coerce.date(),
    faq: z.array(z.object({ q: z.string().min(1), a: z.string().min(1) })).default([]),
  }),
});

export const collections = { articles, guides };
