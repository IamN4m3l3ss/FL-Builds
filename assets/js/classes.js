// Best classes: tier list + tower ranking from builds/index.json and builds/tiers.json.
(() => {
  const { $, esc, arr, json } = window.FL;
  Promise.all([json('builds/index.json'), json('builds/tiers.json')]).then(([list, tiers]) => {
    list = arr(list);
    const byId = {}; list.forEach((b) => (byId[b.id] = b));
    $('tierlist').innerHTML = arr(tiers).map((row) => `<div class="trow"><span class="tl ${esc(row.tier)}">${esc(row.tier)}</span><div class="ents">${
      arr(row.entries).map((id) => byId[id]).filter(Boolean).map((b) => `<a class="ent" href="build.html?id=${encodeURIComponent(b.id)}">
        <b>${esc(b.name)}</b><span class="f">${esc(b.clsName)}</span><p>Floor ${b.floor} · ${Math.round(b.rupture * 100)}% Rupture</p></a>`).join('')
    }</div></div>`).join('') || '<div class="empty">Builds are being recalculated.</div>';
    if (list.length < 18) $('tierlist').insertAdjacentHTML('beforebegin', `<p class="note">${list.length} of 18 super classes ranked so far. The rest are still being simulated.</p>`);
    const top = Math.max(1, ...list.map((b) => b.floor));
    $('rows').innerHTML = list.map((b) => `<tr><td><a href="build.html?id=${encodeURIComponent(b.id)}">${esc(b.name)}</a><br><span class="muted">${esc(b.clsName)}</span></td>
      <td class="n">${b.floor}</td><td style="width:34%"><div class="bar"><i style="width:${(b.floor / top * 100).toFixed(0)}%"></i></div></td>
      <td class="n">${Math.round(b.rupture * 100)}%</td><td class="muted">${esc(b.race)} · ${esc(b.origin)}</td></tr>`).join('');
  }).catch(() => ($('tierlist').innerHTML = '<div class="empty">Builds are being recalculated.</div>'));
})();
