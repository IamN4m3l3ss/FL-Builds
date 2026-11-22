// Renders one build page from builds/<id>.json plus the shared tree and item data.
(function () {
  const id = new URLSearchParams(location.search).get('id') || 'bloodletter';
  const $ = (s) => document.getElementById(s);
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const gold = (n) => Math.round(n).toLocaleString('en-US') + 'g';

  Promise.all([
    fetch(`builds/${encodeURIComponent(id)}.json`).then((r) => { if (!r.ok) throw new Error('No build called ' + id); return r.json(); }),
    fetch('data/tree.json').then((r) => r.json()),
    fetch('data/items.json').then((r) => r.json()),
    fetch('data/classes.json').then((r) => r.json()).catch(() => null),
    fetch('data/gems.json').then((r) => r.json()).catch(() => []),
  ]).then(([B, T, ITEMS, CLASSES, GEMS]) => {
    document.title = B.name + ' · Fallen Lineage';
    $('name').textContent = B.name;
    $('summary').textContent = B.summary;
    $('meta').innerHTML = (B.tier ? `<span class="pill tier t-${B.tier}">${B.tier} tier</span>` : '') +
      [B.class, B.weapon].map((x) => `<span class="pill">${x}</span>`).join('');
    $('snap').textContent = 'Data from ' + B.snapshot;

    const N = {}; T.nodes.forEach((n) => (N[n.id] = n));
    const ORDER = B.order, total = ORDER.length;
    const stepOf = {}; ORDER.forEach((nid, i) => (stepOf[nid] = i + 1));
    const majors = ORDER.filter((nid) => N[nid].k === 'notable' || N[nid].k === 'keystone');

    /* map */
    const svg = $('svg');
    const ids = [B.gate, ...ORDER];
    const xs = ids.map((i) => N[i].x), ys = ids.map((i) => N[i].y);
    const FIT = (() => {
      const x0 = Math.min(...xs) - 650, x1 = Math.max(...xs) + 650, y0 = Math.min(...ys) - 160, y1 = Math.max(...ys) + 160;
      const s = Math.max(x1 - x0, y1 - y0);
      return { x: (x0 + x1) / 2 - s / 2, y: (y0 + y1) / 2 - s / 2, w: s, h: s };
    })();
    let vb = { ...FIT };
    const setVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const gE = mk('g', {}), gN = mk('g', {}), gL = mk('g', {}), gB = mk('g', {});
    svg.append(gE, gN, gL, gB);
    const edges = T.edges.map(([a, b]) => {
      const l = mk('line', { x1: N[a].x, y1: N[a].y, x2: N[b].x, y2: N[b].y, class: 'e' });
      gE.appendChild(l); return { l, a, b };
    });
    const R = { small: 15, stat: 12, notable: 30, keystone: 42, start: 34 };
    const dots = {};
    T.nodes.forEach((n) => {
      const c = mk('circle', { cx: n.x, cy: n.y, r: R[n.k] || 12, class: 'n k-' + n.k });
      const t = mk('title', {}); t.textContent = (n.n ? n.n + ': ' : '') + (n.d || 'Attribute point'); c.appendChild(t);
      c.addEventListener('click', () => stepOf[n.id] && go(stepOf[n.id]));
      gN.appendChild(c); dots[n.id] = c;
    });
    // labels: try 8 spots around each node, take the first that does not overlap
    const FS = 72, boxes = [], marks = [];
    const clash = (b) => boxes.some((p) => !(b.x + b.w < p.x || p.x + p.w < b.x || b.y + b.h < p.y || p.y + p.h < b.y));
    const labels = [...majors.map((nid) => ({ nid, txt: N[nid].n, num: stepOf[nid] })), { nid: B.gate, txt: 'Start' }];
    labels.forEach((o) => { const n = N[o.nid]; boxes.push({ x: n.x - 55, y: n.y - 55, w: 110, h: 110 }); });
    labels.forEach((o) => {
      const n = N[o.nid], w = o.txt.length * FS * 0.56, h = FS * 1.1, off = 70;
      const spots = [[n.x + off, n.y - h / 2], [n.x - off - w, n.y - h / 2], [n.x - w / 2, n.y - off - h], [n.x - w / 2, n.y + off],
        [n.x + off, n.y - h - 20], [n.x + off, n.y + 20], [n.x - off - w, n.y - h - 20], [n.x - off - w, n.y + 20]];
      const [x, y] = spots.find(([x, y]) => !clash({ x, y, w, h })) || spots[0];
      boxes.push({ x, y, w, h });
      const t = mk('text', { x, y: y + h * 0.78, class: 'lbl', 'font-size': FS, 'stroke-width': 16 });
      t.textContent = o.txt; gL.appendChild(t); marks.push({ el: t, nid: o.nid });
      if (o.num) {
        const b = mk('g', { class: 'badge' });
        b.append(mk('circle', { cx: n.x, cy: n.y, r: 52 }));
        const tx = mk('text', { x: n.x, y: n.y, 'font-size': 50 }); tx.textContent = o.num; b.append(tx);
        b.addEventListener('click', () => go(o.num));
        gB.appendChild(b); marks.push({ el: b, nid: o.nid });
      }
    });
    setVB();

    /* milestones */
    let last = 0;
    const statRow = B.statPick ? `<div class="mile fill stat"><span class="pt">+2</span><span><b>Round stat nodes: pick ${B.statPick.attr}</b><span class="d">${B.statPick.why}</span></span></div>` : '';
    $('miles').innerHTML = statRow + majors.map((nid) => {
      const n = N[nid], s = stepOf[nid]; last = s;
      return `<button class="mile" data-s="${s}"><span class="pt">${s}</span><span><b>${n.n}</b>${n.k === 'keystone' ? '<span class="ks">keystone</span>' : ''}
        <span class="d">${n.d}</span>${n.c ? `<span class="c">Drawback: ${n.c}</span>` : ''}</span></button>`;
    }).join('') + (last < total ? `<div class="mile fill"><span class="pt">${last + 1}+</span><span>Spend the last ${total - last} points on the nodes next to the path shown on the map, mostly more stat nodes.</span></div>` : '');
    document.querySelectorAll('.mile[data-s]').forEach((m) => m.addEventListener('click', () => go(+m.dataset.s)));

    const step = $('step'); step.max = total;
    function render(k) {
      const on = new Set(ORDER.slice(0, k)); on.add(B.gate);
      for (const nid in dots) dots[nid].classList.toggle('on', on.has(nid));
      edges.forEach((e) => e.l.classList.toggle('on', on.has(e.a) && on.has(e.b)));
      marks.forEach((m) => m.el.classList.toggle('off', !on.has(m.nid)));
      $('stepn').textContent = `${k} / ${total}`;
      document.querySelectorAll('.mile[data-s]').forEach((m) => m.classList.toggle('cur', +m.dataset.s === k));
    }
    function go(s) { step.value = s; render(s); }
    step.addEventListener('input', () => render(+step.value));
    render(total);

    // pan and zoom
    let drag = null;
    const toSvg = (e) => { const r = svg.getBoundingClientRect(); return { x: vb.x + (e.clientX - r.left) / r.width * vb.w, y: vb.y + (e.clientY - r.top) / r.height * vb.h }; };
    svg.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.badge') || e.target.classList.contains('n')) return;
      drag = { sx: e.clientX, sy: e.clientY, x: vb.x, y: vb.y }; svg.classList.add('drag'); svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return; const r = svg.getBoundingClientRect();
      vb.x = drag.x - (e.clientX - drag.sx) / r.width * vb.w; vb.y = drag.y - (e.clientY - drag.sy) / r.height * vb.h; setVB();
    });
    const end = () => { drag = null; svg.classList.remove('drag'); };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    const zoom = (f, c) => {
      c = c || { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
      const nw = Math.min(5000, Math.max(500, vb.w * f)), k = nw / vb.w;
      vb = { x: c.x - (c.x - vb.x) * k, y: c.y - (c.y - vb.y) * k, w: nw, h: nw }; setVB();
    };
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, toSvg(e)); }, { passive: false });
    $('zin').onclick = () => zoom(1 / 1.4); $('zout').onclick = () => zoom(1.4); $('zfit').onclick = () => { vb = { ...FIT }; setVB(); };

    /* gear */
    const I = {}; ITEMS.forEach((it) => { if (!I[it.name] || it.market) I[it.name] = it; });
    const cheapest = (it) => {
      if (!it || !it.market) return null; let best = null;
      for (const [t, v] of Object.entries(it.market)) if (!best || v.low < best.low) best = { low: v.low, tier: Math.round(+t) };
      return best;
    };
    $('gear').innerHTML = B.gear.map((g) => {
      const it = I[g.item] || { name: g.item, rarity: 'common' }, c = cheapest(it), a = cheapest(I[g.alt]);
      return `<div class="gr"><span class="slot">${g.slot}</span><span class="name r-${it.rarity}">${it.name}</span>
        <span class="price">${c ? `<span class="num">${gold(c.low)}</span> <span class="muted">T${c.tier}</span>` : '<span class="muted">not listed</span>'}</span>
        <span class="why">${g.why}</span>
        ${g.alt ? `<span class="alt">Cheaper: ${g.alt}${a ? ' · ' + gold(a.low) : ''}</span>` : ''}</div>`;
    }).join('');

    if (B.chase && I[B.chase.item]) {
      const it = I[B.chase.item], c = cheapest(it);
      $('gear').insertAdjacentHTML('beforeend', `<div class="gr"><span class="slot">Goal</span><span class="name r-${it.rarity}">${it.name}</span>
        <span class="price"><span class="muted">${c ? gold(c.low) : 'not listed'}</span></span><span class="why">${B.chase.why}</span></div>`);
    }

    /* class tree (super class branches) */
    const cls = CLASSES && CLASSES.classes.find((c) => c.id === B.cls);
    const sup = cls && cls.supers.find((s) => s.id === B.super);
    if (sup && B.classTree) {
      const pick = {}; B.classTree.forEach((p, i) => (pick[p.node] = { n: i + 1, why: p.why }));
      $('ctree-title').textContent = sup.name + ' tree';
      $('ctree').innerHTML = sup.branches.map((br) => `<div class="card br"><h3>${br.name}</h3>${br.nodes.map((n) => {
        const p = pick[n.id];
        return `<div class="cn${p ? ' on' : ''}"><span class="cnum">${p ? p.n : ''}</span><span><b>${n.name}</b>${n.type === 'capstone' ? ' <span class="ks">capstone</span>' : ''}
          <span class="d">${n.text}</span>${p ? `<span class="w">${p.why}</span>` : ''}</span></div>`;
      }).join('')}</div>`).join('');
      $('ctree-sec').hidden = false;
    }

    /* skill gems */
    if (B.gems && B.gems.length) {
      const G = {}; GEMS.forEach((g) => (G[g.name] = g));
      const tip = (g) => g ? [g.text, ...g.lines, ...g.costs.map((c) => 'Cost: ' + c)].filter(Boolean).join('<br>') : '';
      $('gems').innerHTML = B.gems.map((s) => `<div class="gr"><span class="slot">Skill</span><span class="name">${s.skill}</span><span></span>
        <span class="why"><span class="gemrow">${s.gems.map((n) => `<details class="gem"><summary>${n}</summary><span>${tip(G[n])}</span></details>`).join('')}</span>${s.why}</span></div>`).join('');
      $('gems-sec').hidden = false;
    }

    /* rotation */
    $('rot').innerHTML = B.rotation.map((r) => `<li class="card"><b>${r.skill}</b><span>${r.text}</span></li>`).join('');
  }).catch((err) => {
    $('name').textContent = 'Build not found';
    $('summary').textContent = err.message + '. Go back to all builds and pick one from the list.';
  });
})();
