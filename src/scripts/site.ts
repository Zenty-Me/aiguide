const THEME_KEY = 'zenty-theme';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

function initTheme(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const apply = (theme: 'light' | 'dark', persist: boolean): void => {
    root.dataset.theme = theme;
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        /* storage blocked: keep the in-page theme only */
      }
    }
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#14130f' : '#faf9f6';
    if (button) {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
    }
  };

  apply(root.dataset.theme === 'dark' ? 'dark' : 'light', false);

  button?.addEventListener('click', () => {
    apply(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
  });

  media.addEventListener('change', (event) => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      /* ignore */
    }
    if (stored !== 'light' && stored !== 'dark') {
      apply(event.matches ? 'dark' : 'light', false);
    }
  });
}

function initMobileNav(): void {
  const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const panel = document.querySelector<HTMLElement>('[data-nav-panel]');
  if (!toggle || !panel) return;

  // While the panel covers the page, the content underneath must leave the tab order.
  const behind = ['main', 'footer']
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .filter((element): element is HTMLElement => element !== null);

  const focusables = (): HTMLElement[] =>
    [toggle, ...Array.from(panel.querySelectorAll<HTMLElement>('a[href], button'))].filter(
      (element) => element.offsetParent !== null,
    );

  // The toggle is display:none on desktop, so focus has to land on something the bar still shows.
  const focusLanding = (): HTMLElement => {
    if (toggle.offsetParent !== null) return toggle;
    const bar = document.querySelector<HTMLElement>('.header-bar');
    const visible = bar
      ? Array.from(bar.querySelectorAll<HTMLElement>('a[href], button')).find(
          (element) => element.offsetParent !== null,
        )
      : undefined;
    return visible ?? toggle;
  };

  const setOpen = (open: boolean, restoreFocus = false): void => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    behind.forEach((element) => {
      element.inert = open;
    });
    if (!open && restoreFocus) focusLanding().focus();
  };

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  panel.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (panel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false, true);
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !items.includes(active as HTMLElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (panel.hidden) return;
    const target = event.target as Node;
    if (!panel.contains(target) && !toggle.contains(target)) setOpen(false, true);
  });
  window.matchMedia('(min-width: 768px)').addEventListener('change', (event) => {
    if (!event.matches || panel.hidden) return;
    // Focus may sit inside a panel that is about to disappear; hand it back to the toggle.
    setOpen(false, panel.contains(document.activeElement));
  });
}

function initSearchShortcut(): void {
  document.addEventListener('keydown', (event) => {
    const withModifier = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
    const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (!withModifier && !slash) return;
    // Never steal keys from a field the reader is already typing in.
    if (isEditable(event.target) || isEditable(document.activeElement)) return;

    const input = document.querySelector<HTMLInputElement>('[data-search-input]');
    if (input) {
      event.preventDefault();
      input.focus();
      input.select();
      return;
    }
    event.preventDefault();
    window.location.href = '/search/?focus=1';
  });
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the selection-based fallback */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function initCodeCopy(): void {
  const status = document.getElementById('copy-status');

  document.querySelectorAll<HTMLPreElement>('.prose pre').forEach((pre) => {
    if (pre.parentElement?.classList.contains('code-block')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.replaceWith(wrapper);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-btn';
    button.textContent = '复制';
    button.setAttribute('aria-label', '复制代码块');
    // Toolbar goes before the code so the button cannot sit on the first line.
    wrapper.append(button, pre);

    button.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.innerText ?? pre.innerText;
      const ok = await writeClipboard(code);
      button.dataset.state = ok ? 'copied' : 'error';
      button.textContent = ok ? '已复制' : '复制失败';
      if (status) {
        status.textContent = ok ? '代码已复制到剪贴板' : '复制失败，请手动选择代码复制';
      }
      window.setTimeout(() => {
        button.dataset.state = '';
        button.textContent = '复制';
      }, 2200);
    });
  });
}

function initToc(): void {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.toc a[href^="#"]'));
  if (links.length === 0) return;

  // The desktop and mobile tables of contents are two copies of the same links,
  // so every link pointing at a heading has to be updated together.
  const byHeading = new Map<HTMLElement, HTMLAnchorElement[]>();
  links.forEach((link) => {
    const id = link.getAttribute('href')?.slice(1) ?? '';
    const element = document.getElementById(decodeURIComponent(id));
    if (!element) return;
    byHeading.set(element, [...(byHeading.get(element) ?? []), link]);
  });

  if (byHeading.size === 0) return;

  const setCurrent = (group: HTMLAnchorElement[]): void => {
    links.forEach((item) => item.removeAttribute('aria-current'));
    group.forEach((item) => item.setAttribute('aria-current', 'location'));
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      const group = byHeading.get(visible.target as HTMLElement);
      if (group) setCurrent(group);
    },
    { rootMargin: '-88px 0px -65% 0px', threshold: 0 },
  );

  byHeading.forEach((_group, element) => observer.observe(element));

  links.forEach((link) => {
    link.addEventListener('click', () => {
      const id = link.getAttribute('href')?.slice(1) ?? '';
      const element = document.getElementById(decodeURIComponent(id));
      const group = element ? byHeading.get(element) : undefined;
      if (group) setCurrent(group);
    });
  });
}

function initReadingProgress(): void {
  const bar = document.querySelector<HTMLElement>('[data-progress-bar]');
  if (!bar) return;

  let queued = false;
  const update = (): void => {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.width = `${(ratio * 100).toFixed(2)}%`;
  };

  const schedule = (): void => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(update);
  };

  update();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
}

export function initSite(): void {
  initTheme();
  initMobileNav();
  initSearchShortcut();
  initCodeCopy();
  initToc();
  initReadingProgress();
}
