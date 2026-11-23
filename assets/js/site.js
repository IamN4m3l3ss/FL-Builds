// Shared site shell: header + navigation, theme toggle, footer, and small helpers (window.FL).
(() => {
  // Site name lives here only: rename the site by changing this one line.
  const SITE = { name: 'FL Wiki', game: 'Fallen Lineage', repo: 'https://github.com/IamN4m3l3ss/FL-Builds' };
  const NAV = [
    ['wiki.html#/items', 'Items', 'wiki-items'],
    ['wiki.html#/pets', 'Pets', 'wiki-pets'],
    ['wiki.html#/enemies', 'Enemies', 'wiki-enemies'],
    ['wiki.html#/classes', 'Classes', 'wiki-classes'],
    ['tree.html', 'Passive tree', 'tree'],
    ['classes.html', 'Best classes', 'classes'],
  ];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const arr = (x) => (Array.isArray(x) ? x : []);
  const cache = {};
  const json = (url) => (cache[url] = cache[url] || fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  function theme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  theme(store.get('fl-theme'));

  function current() {
    const page = document.body.dataset.page || '';
    if (page === 'wiki') {
      const k = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'items';
      const one = { item: 'items', material: 'items', materials: 'items', pet: 'pets', enemy: 'enemies', class: 'classes' };
      return 'wiki-' + (one[k] || k);
    }
    return page === 'build' ? 'classes' : page;
  }
  function markNav() {
    const cur = current();
    document.querySelectorAll('.site-nav a').forEach((a) => {
      if (a.dataset.key === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function mount() {
    const head = $('site-head');
    if (head) {
      head.className = 'site-head';
      head.innerHTML = `<div class="in"><a class="brand" href="./"><i aria-hidden="true"></i>${SITE.name}</a>
        <nav class="site-nav" aria-label="Site">${NAV.map(([h, t, k]) => `<a href="${h}" data-key="${k}">${t}</a>`).join('')}</nav>
        <button class="theme-btn" id="theme-btn" aria-label="Switch colour theme" title="Switch colour theme"></button></div>`;
      const btn = $('theme-btn');
      const label = () => { const t = document.documentElement.dataset.theme; btn.textContent = t === 'dark' ? '☾' : t === 'light' ? '☀' : '◐'; };
      btn.addEventListener('click', () => {
        const order = [null, 'light', 'dark'], t = document.documentElement.dataset.theme || null;
        const next = order[(order.indexOf(t) + 1) % order.length];
        theme(next); store.set('fl-theme', next || ''); label();
      });
      label();
      markNav();
      window.addEventListener('hashchange', markNav);
    }
    const foot = $('site-foot');
    if (foot) {
      foot.className = 'site-foot';
      foot.innerHTML = `<span>Fan-made guide. Not affiliated with the game's developers.</span>
        <span>Numbers checked against in-game tests · <a href="${SITE.repo}">GitHub</a></span>`;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  window.FL = { SITE, $, esc, arr, json, store };
})();
