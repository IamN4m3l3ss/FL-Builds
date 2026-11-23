// Wiki landing: live counts on the tiles and a top-classes preview.
(() => {
  const { $, esc, arr, json, SITE } = window.FL;
  $('site-title').textContent = SITE.name;

  json('data/wiki.json').then((W) => {
    const items = Object.values(W.items);
    const n = {
      items: items.length,
      weapons: items.filter((i) => i.kind === 'weapon').length,
      jewellery: items.filter((i) => i.kind === 'amulet' || i.kind === 'ring').length,
      enemies: Object.values(W.enemies).filter((e) => !e.dummy).length,
      terms: arr(W.glossary).length,
      materials: Object.keys(W.materials || {}).length,
      pets: Object.keys(W.pets || {}).length,
      races: arr(W.races).length + arr(W.origins).length,
      classes: 24,
    };
    document.querySelectorAll('[data-count]').forEach((el) => (el.textContent = `${n[el.dataset.count]} entries`));
  }).catch(() => {});

  json('builds/index.json').then((list) => {
    const top = arr(list).slice(0, 4);
    $('topcls').innerHTML = top.map((b) => `<a class="panel tc" href="build.html?id=${encodeURIComponent(b.id)}"><span class="tier ${esc(b.tier)}">${esc(b.tier)}</span>
        <span><b>${esc(b.name)}</b><small>${esc(b.clsName)} · floor ${b.floor}</small></span></a>`
    ).join('') || '<p class="muted">Builds are being recalculated.</p>';
  }).catch(() => ($('topcls').innerHTML = '<p class="muted">Builds are being recalculated.</p>'));
})();
