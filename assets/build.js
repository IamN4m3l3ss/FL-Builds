// Renders one build page from builds/<id>.json plus the shared tree, item, class and gem data.
(function () {
  const id = new URLSearchParams(location.search).get('id') || 'bloodletter';
  const $ = (s) => document.getElementById(s);
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const gold = (n) => Math.round(n).toLocaleString('en-US') + 'g';
  const pct = (v) => (v > 0 ? '+' : '') + Math.round(v * 1000) / 10 + '%';
  const BASE = { CritInc: 'crit chance', CritDamage: 'crit damage', StatusPower: 'status power', HPPct: 'max HP', Lifesteal: 'lifesteal',
    Dodge: 'dodge', EnergyChance: 'Energy chance', HealIn: 'healing received', FireOut: 'fire damage', Block: 'block', Out: 'damage' };
  function power(p) {
    const [k, a, b, c] = p;
    switch (k) {
      case 'hit': return `${Math.round(c * 100)}% on hit: ${a} ${b}`;
      case 'amp': return `${a} +${b} stack${b > 1 ? 's' : ''}`;
      case 'versus': return `${pct(b)} vs ${a}`;
      case 'crit': return `Crits: ${a} ${b}`;
      case 'rider': return `${a} also gives ${b} ${c}`;
      case 'react': return `${a} ${pct(b)}`;
      case 'cap': return `${a} cap +${b}`;
      case 'spread': return `${a} spreads`;
      case 'opening': return `Fight start: ${a} ${b}`;
      case 'takedown': return `On kill: ${a} ${b}`;
      case 'execute': return `${pct(a)} vs low HP`;
      case 'spot': return `Start: enemy gets ${a} ${b}`;
      default: return [k, a, b].filter((x) => x != null).join(' ');
    }
  }
  const baseLine = (b) => b[0] === 'Damage' ? `${b[1]}–${b[2]} damage` : b[0] === 'HP' ? `+${b[2]} HP` : b[0] === 'Armor' ? `+${b[2]} Armor`
    : b[0] === 'Ward' ? `+${b[2]} Ward` : BASE[b[0]] ? `${pct(b[2])} ${BASE[b[0]]}` : b.join(' ');

  Promise.all([
    fetch(`builds/${encodeURIComponent(id)}.json`).then((r) => { if (!r.ok) throw new Error('No build called ' + id); return r.json(); }),
    fetch('data/tree.json').then((r) => r.json()),
    fetch('data/items.json').then((r) => r.json()),
    fetch('data/classes.json').then((r) => r.json()).catch(() => null),
    fetch('data/gems.json').then((r) => r.json()).catch(() => []),
  ]).then(([B, T, ITEMS, CLASSES, GEMS]) => {
    document.title = B.name + ' · FL Builds';
    $('name').textContent = B.name;
    $('summary').textContent = B.summary;
    $('meta').innerHTML = `<span class="tier ${B.tier}">${B.tier}</span>` + [B.class, B.weapon].map((x) => `<span class="chip">${x}</span>`).join('');
    $('snap').textContent = 'Data from ' + B.snapshot + '.';

    const N = {}; T.nodes.forEach((n) => (N[n.id] = n));
    const ORDER = B.order, total = ORDER.length;
    const stepOf = {}; ORDER.forEach((nid, i) => (stepOf[nid] = i + 1));
    const majors = ORDER.filter((nid) => N[nid].k === 'notable' || N[nid].k === 'keystone');

    /* overview */
    const S = B.sim;
    const ov = [
      [S ? S.room.toFixed(1) : '—', 'turns per tower room'],
      [S ? S.boss.toFixed(1) : '—', 'turns per 100k boss'],
      [S && S.sustain != null ? (S.sustain >= 100 ? '100%+' : S.sustain.toFixed(0) + '%') : '—', 'healing per turn (max HP)'],
      [S ? S.cap : '—', 'Bleed cap'],
      [majors.length, 'notables and keystones'],
    ];
    $('overview').innerHTML = ov.map(([v, l]) => `<div class="ov"><b>${v}</b><span>${l}</span></div>`).join('');

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
    const FS = 72, boxes = [], marks = [];
    const clash = (b) => boxes.some((p) => !(b.x + b.w < p.x || p.x + p.w < b.x || b.y + b.h < p.y || p.y + p.h < b.y));
    const labels = [...majors.map((nid) => ({ nid, txt: N[nid].n, num: stepOf[nid] })), { nid: B.gate, txt: 'Start' }];
    labels.forEach((o) => { const n = N[o.nid]; boxes.push({ x: n.x - 55, y: n.y - 55, w: 110, h: 110 }); });
    labels.forEach((o) => {
      const n = N[o.nid], w = o.txt.length * FS * 0.52, h = FS * 1.1, off = 70;
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
    const statRow = B.statPick ? `<div class="mile stat"><span class="pt">+2</span><span><b>Round stat nodes: pick ${B.statPick.attr}</b><span class="d">${B.statPick.why}</span></span></div>` : '';
    $('miles').innerHTML = statRow + majors.map((nid) => {
      const n = N[nid], s = stepOf[nid]; last = s;
      return `<button class="mile" data-s="${s}"><span class="pt">${s}</span><span><b>${n.n}</b>${n.k === 'keystone' ? '<span class="ks">keystone</span>' : ''}
        <span class="d">${n.d}</span>${n.c ? `<span class="c">Drawback: ${n.c}</span>` : ''}</span></button>`;
    }).join('') + (last < total ? `<div class="mile fill"><span class="pt">${last + 1}+</span><span>The last ${total - last} points go on the nodes next to the path shown on the map, mostly more stat nodes.</span></div>` : '');
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

    /* class tree */
    const cls = CLASSES && CLASSES.classes.find((c) => c.id === B.cls);
    const sup = cls && cls.supers.find((s) => s.id === B.super);
    if (sup && B.classTree) {
      const pick = {}; B.classTree.forEach((p, i) => (pick[p.node] = i + 1));
      $('ctree-title').textContent = sup.name + ' tree';
      $('ctree').innerHTML = sup.branches.map((br) => {
        const used = br.nodes.some((n) => pick[n.id]);
        return `<div class="panel br${used ? '' : ' skip'}"><h3>${br.name}</h3>${br.nodes.map((n) => {
          const p = pick[n.id];
          return `<div class="cn${p ? ' on' : ''}"><span class="cnum">${p || ''}</span><span><b>${n.name}</b>${n.type === 'capstone' ? ' <span class="ks">capstone</span>' : ''}
            <span class="d">${n.text || ''}</span></span></div>`;
        }).join('')}</div>`;
      }).join('');
    } else { $('class').hidden = true; }

    /* gear */
    const I = {}; ITEMS.forEach((it) => { if (!I[it.name] || it.market) I[it.name] = it; });
    const cheapest = (it) => {
      if (!it || !it.market) return null; let best = null;
      for (const [t, v] of Object.entries(it.market)) if (!best || v.low < best.low) best = { low: v.low, tier: Math.round(+t) };
      return best;
    };
    $('equip').innerHTML = B.gear.map((g) => {
      const it = I[g.item] || { name: g.item, rarity: 'common' }, c = cheapest(it);
      const fx = [...(it.power || []).map(power), ...(it.base || []).filter((b) => b[0] !== 'Damage').map(baseLine)];
      return `<div class="panel slot"><span class="sl">${g.slot}</span><div>
        <div class="nm"><span class="r-${it.rarity}">${it.name}</span><span class="pr">${c ? `${gold(c.low)} <small>T${c.tier}</small>` : '<small>not listed</small>'}</span></div>
        ${g.why ? `<div class="muted">${g.why}</div>` : ''}
        <div class="fx">${fx.map((f) => `<span>${f}</span>`).join('')}</div>
        ${g.alt ? `<div class="alt">Cheaper: ${g.alt}</div>` : ''}</div></div>`;
    }).join('');

    /* gems */
    if (B.gems && B.gems.length) {
      const G = {}; GEMS.forEach((g) => (G[g.name] = g));
      const tip = (g) => g ? [g.text, ...g.lines, ...g.costs.map((c) => 'Cost: ' + c)].filter(Boolean).join('<br>') : '';
      $('gemlist').innerHTML = B.gems.map((s) => `<div class="gr"><span class="sk">${s.skill}</span>
        <div class="gemrow">${s.gems.map((n) => `<details class="gem"><summary>${n}</summary><span>${tip(G[n])}</span></details>`).join('')}</div>
        ${s.why ? `<span></span><span class="muted">${s.why}</span>` : ''}</div>`).join('');
    } else { $('gems').hidden = true; }

    /* rotation */
    $('rot').innerHTML = B.rotation.map((r) => `<li class="panel"><b>${r.skill}</b><span>${r.text}</span></li>`).join('');

    /* simulation */
    if (S) {
      $('simnote').textContent = 'Level 60, max gear, averaged over 300 simulated fights. Tower room: 4 enemies with 30k HP. Boss: one enemy with 100k HP. Healing assumes Blood Rite also heals from Rupture, which the game text implies but has not been tested.';
      const bossDiff = [
        S.boss_super && S.boss_super !== B.super ? `Super class: ${S.boss_super}` : '',
        S.boss_add && S.boss_add.length ? `Add ${S.boss_add.join(', ')}` : '',
        S.boss_drop && S.boss_drop.length ? `Drop ${S.boss_drop.join(', ')}` : '',
        S.boss_gear && S.boss_gear.length ? `Swap in ${S.boss_gear.join(', ')}` : '',
      ].filter(Boolean);
      $('simgrid').innerHTML =
        `<div class="panel simcard"><span class="label">Tower room</span><span class="big">${S.room.toFixed(1)} <small>turns</small></span>
          <span class="muted">Ruptures pop at ${S.roomPop} stacks on average. Healing ${S.sustain >= 100 ? 'over 100%' : S.sustain.toFixed(0) + '%'} of max HP per turn.</span></div>
         <div class="panel simcard"><span class="label">Boss (100k HP)</span><span class="big">${S.boss.toFixed(1)} <small>turns</small></span>
          <span class="muted">${bossDiff.length ? 'Best boss setup changes: ' + bossDiff.join('. ') + '.' : 'Same setup works best.'}</span></div>`;
    } else {
      $('simlink').hidden = true; $('sim').hidden = true;
    }
  }).catch((err) => {
    $('name').textContent = 'Build not found';
    $('summary').textContent = err.message + '. Go back to all builds and pick one from the list.';
  });
})();
