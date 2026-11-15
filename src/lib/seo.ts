import { SITE } from '../consts';

export interface Crumb {
  label: string;
  href?: string;
}

export function absolute(path: string): string {
  return new URL(path, SITE.url).href;
}

export const AUTHOR_PATH = '/about/#author';
export const AUTHOR_ID = absolute(AUTHOR_PATH);

/** One author identity reused by Article, AboutPage and the visible byline. */
export const authorJsonLd = {
  '@type': 'Person',
  '@id': AUTHOR_ID,
  name: SITE.author,
  url: AUTHOR_ID,
};

export function breadcrumbJsonLd(items: Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: absolute(item.href) } : {}),
    })),
  };
}

export function collectionJsonLd(input: {
  name: string;
  description: string;
  path: string;
  parts?: { name: string; path: string }[];
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    description: input.description,
    inLanguage: SITE.locale,
    url: absolute(input.path),
    isPartOf: { '@type': 'WebSite', name: SITE.name, url: SITE.url },
    ...(input.parts && input.parts.length > 0
      ? {
          hasPart: input.parts.map((part) => ({
            '@type': 'Article',
            name: part.name,
            url: absolute(part.path),
          })),
        }
      : {}),
  };
}
