import { makeSnippet, matchesQuery, normalize, type SearchDoc } from '../lib/search';

const INDEX_URL = '/search-index.json';

interface Elements {
  form: HTMLFormElement;
  input: HTMLInputElement;
  results: HTMLOListElement;
  status: HTMLElement;
  hint: HTMLElement;
  empty: HTMLElement;
  failure: HTMLElement;
  retry: HTMLButtonElement;
  filters: HTMLInputElement[];
}

function getElements(): Elements | null {
  const form = document.querySelector<HTMLFormElement>('[data-search-form]');
  const input = document.querySelector<HTMLInputElement>('[data-search-input]');
  const results = document.querySelector<HTMLOListElement>('[data-search-results]');
  const status = document.querySelector<HTMLElement>('[data-search-status]');
  const hint = document.querySelector<HTMLElement>('[data-search-hint]');
  const empty = document.querySelector<HTMLElement>('[data-search-empty]');
  const failure = document.querySelector<HTMLElement>('[data-search-failure]');
  const retry = document.querySelector<HTMLButtonElement>('[data-search-retry]');
  const filters = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="category"]'),
  );

  if (!form || !input || !results || !status || !hint || !empty || !failure || !retry) {
    return null;
  }
  return { form, input, results, status, hint, empty, failure, retry, filters };
}

export function initSearch(): void {
  const ui = getElements();
  if (!ui) return;

  let docs: SearchDoc[] | null = null;
  let loadError = false;
  let request: Promise<void> | null = null;

  const selectedCategories = (): Set<string> =>
    new Set(ui.filters.filter((f) => f.checked).map((f) => f.value));

  const readUrl = (): void => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q') ?? '';
    if (query) ui.input.value = query;
    const categories = params.getAll('category').flatMap((value) => value.split(','));
    ui.filters.forEach((filter) => {
      filter.checked = categories.includes(filter.value);
    });
  };

  const writeUrl = (): void => {
    const params = new URLSearchParams();
    if (ui.input.value.trim()) params.set('q', ui.input.value.trim());
    const categories = Array.from(selectedCategories());
    if (categories.length) params.set('category', categories.join(','));
    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  };

  const setVisible = (element: HTMLElement, visible: boolean): void => {
    element.hidden = !visible;
  };

  const renderResult = (doc: SearchDoc, query: string): HTMLLIElement => {
    const item = document.createElement('li');
    item.className = 'result-item';

    const meta = document.createElement('p');
    meta.className = 'result-meta';

    const category = document.createElement('span');
    category.className = 'cat';
    category.textContent = doc.categoryName;
    meta.append(category, document.createTextNode(` · ${doc.difficulty}`));

    const title = document.createElement('a');
    title.className = 'result-title';
    title.href = doc.url;
    title.textContent = doc.title;

    const copy = document.createElement('p');
    copy.className = 'result-copy';
    copy.textContent = makeSnippet(doc, query);

    item.append(meta, title, copy);
    return item;
  };

  const render = (): void => {
    const query = ui.input.value.trim();
    const categories = selectedCategories();
    const hasQuery = normalize(query).length > 0;

    // Failure visibility is driven by state, not by the fetch catch: render() runs
    // after the catch and would otherwise hide the retry panel again.
    setVisible(ui.failure, !docs && loadError);
    ui.results.replaceChildren();

    if (!docs) {
      setVisible(ui.hint, false);
      setVisible(ui.empty, false);
      ui.status.textContent = loadError ? '搜索索引载入失败。' : '正在载入搜索索引…';
      ui.results.setAttribute('aria-busy', String(!loadError));
      return;
    }

    ui.results.removeAttribute('aria-busy');
    setVisible(ui.hint, !hasQuery && categories.size === 0);

    const found = docs.filter(
      (doc) =>
        (categories.size === 0 || categories.has(doc.category)) && matchesQuery(doc, query),
    );

    ui.results.append(...found.map((doc) => renderResult(doc, query)));

    setVisible(ui.empty, found.length === 0);
    if (found.length === 0) {
      ui.status.textContent = hasQuery || categories.size > 0 ? `没有匹配「${query || '所选主题'}」的教程。` : '索引中还没有教程。';
    } else {
      ui.status.textContent = hasQuery
        ? `找到 ${found.length} 篇匹配「${query}」的教程。`
        : `共 ${found.length} 篇教程。`;
    }

    writeUrl();
  };

  const load = (): void => {
    if (request) return;
    loadError = false;
    ui.status.textContent = '正在载入搜索索引…';
    ui.results.setAttribute('aria-busy', 'true');
    setVisible(ui.hint, false);
    setVisible(ui.empty, false);
    setVisible(ui.failure, false);

    request = fetch(INDEX_URL, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error('Unexpected index format');
        docs = data as SearchDoc[];
      })
      .catch(() => {
        loadError = true;
        docs = null;
      })
      .finally(() => {
        request = null;
        render();
      });
  };

  readUrl();

  let timer = 0;
  const schedule = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(render, 120);
  };

  ui.input.addEventListener('input', schedule);
  ui.form.addEventListener('submit', (event) => {
    event.preventDefault();
    render();
  });
  ui.filters.forEach((filter) => filter.addEventListener('change', render));
  ui.retry.addEventListener('click', load);

  load();

  if (new URLSearchParams(window.location.search).get('focus') === '1') {
    ui.input.focus();
  }
}
