// One build page: builds/<id>.json rendered with the shared tree map.
(() => {
  const { $, esc, arr, json } = window.FL;
  const id = new URLSearchParams(location.search).get('id') || '';
  const KIND = { notable: 'notable', keystone: 'keystone' };

  Promise.all([json(`builds/${encodeURIComponent(id)}.json`), json('data/tree.json'), json('data/classes.json')]).then(([B, T, CL]) => {
    document.title = `${B.name} build · FL Wiki`;
    $('name').textContent = `${B.name}`;
    $('meta').innerHTML = `<span class="tier ${esc(B.tier)}">${esc(B.tier)}</span><span class="chip">${esc(B.clsName)}</span><span class="chip">${esc(B.weapon || '')}</span>`;
    $('summary').textContent = `Reaches floor ${B.floor} of the Fallen Tower on average. ${Math.round(B.rupture * 100)}% of its damage comes from Rupture.`;
    $('snap').textContent = `Updated ${B.updated}. Simulated solo at level 60 with tier 5 gear and perfect skill checks.`;
    const ov = [[B.floor, 'average tower floor'], [Math.round(B.rupture * 100) + '%', 'damage from Rupture'], [B.maxHP || '—', 'max HP'],
      [B.origin, 'origin'], [B.race, 'race']];
    $('overview').innerHTML = ov.map(([v, l]) => `<div class="ov"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');

    /* tree map */
    const sup = CL.classes.flatMap((c) => c.supers).find((s) => s.id === B.super);
    const order = arr(B.order), ctree = arr(B.classTree);
    const map = FL.TreeMap($('map'), { T, label: 'Build path on the passive tree' });
    map.setSuper(sup || null);
    const N = map.N;
    const majors = order.map((nid, i) => ({ nid, step: i + 1 })).filter(({ nid }) => N[nid] && KIND[N[nid].k]);
    map.badges(majors.map(({ nid, step }) => ({ id: nid, num: step })), (s) => go(s));
    const step = $('step');
    step.max = order.length;
    function render(k) {
      const on = new Set(order.slice(0, k)); on.add(B.gate);
      map.mark({ on, con: new Set(ctree) });
      map.dimBadges(k);
      $('stepn').textContent = `${k} / ${order.length}`;
      document.querySelectorAll('.mile[data-s]').forEach((m) => m.classList.toggle('cur', +m.dataset.s === k));
    }
    function go(s) { step.value = s; render(s); }
    step.addEventListener('input', () => render(+step.value));
    map.fitTo([B.gate, ...order]);

    const stats = order.filter((n) => N[n] && N[n].k === 'stat').length;
    const cnodes = ctree.map((cid) => map.CN[cid]).filter(Boolean);
    $('miles').innerHTML = `<div class="mile stat"><span class="pt">+${stats * 2}</span><span><b>${stats} attribute nodes: ${esc(B.statNodes)}</b></span></div>` +
      majors.map(({ nid, step: s }) => { const n = N[nid];
        return `<button class="mile" data-s="${s}"><span class="pt">${s}</span><span><b>${esc(n.n)}</b>${n.k === 'keystone' ? '<span class="ks">keystone</span>' : ''}
          <span class="d">${esc(n.d)}</span>${n.c ? `<span class="c">Drawback: ${esc(n.c)}</span>` : ''}</span></button>`; }).join('') +
      (cnodes.length ? `<div class="mile stat"><span class="pt">${cnodes.length}</span><span><b>${esc(B.name)} tree</b></span></div>` +
        cnodes.map((n) => `<div class="mile"><span class="pt">·</span><span><b>${esc(n.n)}</b><span class="ks">${esc(n.branch)}</span><span class="d">${esc(n.d)}</span></span></div>`).join('') : '');
    document.querySelectorAll('.mile[data-s]').forEach((m) => m.addEventListener('click', () => go(+m.dataset.s)));
    render(order.length);

    /* character */
    const attrs = Object.entries(B.stats || {}).map(([k, v]) => `${v} ${k}`).join(', ');
    $('char').innerHTML = [
      ['Race', `${B.race} (${B.lineage} lineage)`],
      ['Origin', `${B.origin}${B.originBonus ? ': ' + B.originBonus : ''}`],
      ['Attribute points', attrs || '—'],
      ['Attribute nodes', `All ${stats} on ${B.statNodes}`],
      ['Gate', 'Start from the highlighted gate on the map'],
    ].map(([k, v]) => `<div class="panel cc"><span class="label">${esc(k)}</span><b>${esc(v)}</b></div>`).join('');

    /* gear */
    $('equip').innerHTML = arr(B.gear).map((g) => `<a class="panel slot" href="wiki.html#/item/${encodeURIComponent(g.id)}">
      <span class="sl">${esc(g.slot)}</span><div><div class="nm"><span class="r-${esc(g.rarity)}">${esc(g.name)}</span></div></div></a>`).join('');

    /* skills + gems */
    const gems = arr(B.gems);
    $('gemlist').innerHTML = arr(B.skills).map((s) => {
      const g = gems.find((x) => x.skill === s);
      return `<div class="gr"><span class="sk">${esc(s)}</span><div class="gemrow">${g ? g.gems.map((n) => `<span class="chip">${esc(n)}</span>`).join('') : '<span class="muted">No gems</span>'}</div></div>`;
    }).join('');
  }).catch((err) => {
    $('name').textContent = 'Build not found';
    $('summary').innerHTML = `${esc(err.message)}. <a href="classes.html">See all classes</a>.`;
  });
})();
