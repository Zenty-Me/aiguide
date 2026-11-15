/** Shared between the build-time index endpoint and the browser search script. */

export interface SearchDoc {
  id: string;
  title: string;
  description: string;
  category: string;
  categoryName: string;
  difficulty: string;
  tags: string[];
  url: string;
  text: string;
}

export function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

/** Whitespace-separated terms; every term must match (AND). */
export function queryTerms(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean).slice(0, 8);
}

function haystack(doc: SearchDoc): string {
  return normalize([doc.title, doc.description, doc.tags.join(' '), doc.text].join(' '));
}

export function matchesQuery(doc: SearchDoc, query: string): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const hay = haystack(doc);
  return terms.every((term) => hay.includes(term));
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length).trimEnd()}…` : value;
}

/** Plain-text excerpt around the first matching term. */
export function makeSnippet(doc: SearchDoc, query: string, length = 130): string {
  const source = doc.text.replace(/\s+/g, ' ').trim();
  const terms = queryTerms(query);
  if (terms.length === 0) return truncate(source, length);

  let at = -1;
  for (const term of terms) {
    const index = source.toLowerCase().indexOf(term);
    if (index !== -1 && (at === -1 || index < at)) at = index;
  }
  if (at === -1) return truncate(source, length);

  const start = Math.max(0, at - 34);
  const end = Math.min(source.length, start + length);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < source.length ? '…' : '';
  return `${prefix}${source.slice(start, end).trim()}${suffix}`;
}
