// Shared tree map component: passive tree + super-class tree (centre circle, in-game layout), tooltips, pan/zoom.
// Usage: const map = FL.TreeMap(containerEl, { T, onClick(id, info), state(id, info) })
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KIND = { small: 'Passive', stat: 'Attribute', notable: 'Notable', keystone: 'Keystone', start: 'Gate', capstone: 'Capstone', root: 'Super class' };
  const R = { small: 15, stat: 12, notable: 30, keystone: 42, start: 34 };
  // in-game super tree layout (TreeWindow): root, then 4 positions per branch, node sizes
  const SUPER_ROOT = [0, -262];
  const SUPER_POS = [
    [[-118, -178], [-226, -98], [-258, 36], [-188, 172]],
    [[8, -150], [44, -42], [16, 72], [36, 214]],
    [[152, -162], [238, -56], [240, 58], [200, 168]],
  ];
  const SUPER_R = { small: 22, notable: 34, capstone: 45, root: 34 };

  function TreeMap(box, opts) {
    const T = opts.T;
    const N = {}, adj = {}, CN = {};
    T.nodes.forEach((n) => { N[n.id] = n; adj[n.id] = new Set(); });
    T.edges.forEach(([a, b]) => { adj[a].add(b); adj[b].add(a); });
    const themeCol = (t) => { const c = T.themes && T.themes[t] && T.themes[t].colour; return c ? `rgb(${c.join(',')})` : null; };

    box.classList.add('map', 'tmap');
    box.innerHTML = `<svg role="img" aria-label="${esc(opts.label || 'Passive tree')}"></svg>
      <div class="ctrl"><button data-z="in" aria-label="Zoom in">+</button><button data-z="out" aria-label="Zoom out">−</button><button data-z="fit">Fit</button></div>
      <div class="tip" hidden></div>`;
    const svg = box.querySelector('svg'), tip = box.querySelector('.tip');
    const gE = mk('g', {}), gN = mk('g', {}), gL = mk('g', {}), gC = mk('g', { class: 'ctree-map' }), gB = mk('g', {});
    svg.append(gE, gN, gL, gC, gB);

    /* passive tree */
    const edges = T.edges.map(([a, b, arc]) => {
      const A = N[a], B = N[b];
      let d = `M${A.x} ${A.y} L${B.x} ${B.y}`;
      if (arc) {
        const [cx, cy, r] = arc;
        let da = Math.atan2(B.y - cy, B.x - cx) - Math.atan2(A.y - cy, A.x - cx);
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da <= -Math.PI) da += 2 * Math.PI;
        d = `M${A.x} ${A.y} A${r} ${r} 0 0 ${da > 0 ? 1 : 0} ${B.x} ${B.y}`;
      }
      const p = mk('path', { d, class: 'e' });
      gE.appendChild(p);
      return { p, a, b };
    });
    const dots = {};
    T.nodes.forEach((n) => {
      const c = mk('circle', { cx: n.x, cy: n.y, r: R[n.k] || 12, class: 'n k-' + n.k, tabindex: n.k === 'small' || n.k === 'stat' ? -1 : 0 });
      const col = themeCol(n.t);
      if (col && n.k !== 'start') c.style.setProperty('--tc', col);
      c.dataset.id = n.id;
      gN.appendChild(c);
      dots[n.id] = c;
      if (n.k === 'keystone') {
        const t = mk('text', { x: n.x, y: n.y - (R[n.k] + 22), class: 'lbl tl', 'font-size': 44, 'stroke-width': 12, 'text-anchor': 'middle' });
        t.textContent = n.n;
        gL.appendChild(t);
      }
    });

    /* super-class tree in the centre circle */
    const cdots = {}, clines = [];
    function setSuper(S) {
      gC.textContent = '';
      for (const k in cdots) delete cdots[k];
      for (const k in CN) delete CN[k];
      clines.length = 0;
      if (!S) return;
      S.branches.forEach((b, i) => {
        let prev = SUPER_ROOT;
        b.nodes.forEach((n, j) => {
          const pos = SUPER_POS[i] && SUPER_POS[i][j];
          if (!pos) return;
          const ln = mk('line', { x1: prev[0], y1: prev[1], x2: pos[0], y2: pos[1], class: 'e ce' });
          ln.dataset.to = n.id;
          gC.appendChild(ln); clines.push(ln);
          prev = pos;
          CN[n.id] = { n: n.name, k: n.type, d: n.text, c: '', branch: `${S.name} · ${b.name}`, place: j,
            prev: j ? b.nodes[j - 1].id : null, x: pos[0], y: pos[1] };
        });
      });
      const root = mk('circle', { cx: SUPER_ROOT[0], cy: SUPER_ROOT[1], r: SUPER_R.root, class: 'n cn k-root on' });
      gC.appendChild(root);
      const t = mk('text', { x: 0, y: SUPER_ROOT[1] - SUPER_R.root - 16, class: 'lbl tl', 'font-size': 32, 'stroke-width': 10, 'text-anchor': 'middle' });
      t.textContent = S.name;
      gC.appendChild(t);
      for (const [id, cn] of Object.entries(CN)) {
        const c = mk('circle', { cx: cn.x, cy: cn.y, r: SUPER_R[cn.k] || 22, class: 'n cn k-' + cn.k, tabindex: 0 });
        c.dataset.id = id;
        gC.appendChild(c);
        cdots[id] = c;
      }
    }

    /* view box */
    const xs = T.nodes.map((n) => n.x), ys = T.nodes.map((n) => n.y);
    const FIT = (() => {
      const x0 = Math.min(...xs) - 120, x1 = Math.max(...xs) + 120, y0 = Math.min(...ys) - 120, y1 = Math.max(...ys) + 120;
      const s = Math.max(x1 - x0, y1 - y0);
      return { x: (x0 + x1) / 2 - s / 2, y: (y0 + y1) / 2 - s / 2, w: s, h: s };
    })();
    let vb = { ...FIT };
    const setVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    setVB();
    const fitTo = (ids, pad = 260) => {
      const pts = ids.map((id) => N[id] || CN[id]).filter(Boolean);
      if (!pts.length) { vb = { ...FIT }; setVB(); return; }
      const x0 = Math.min(...pts.map((p) => p.x)) - pad, x1 = Math.max(...pts.map((p) => p.x)) + pad;
      const y0 = Math.min(...pts.map((p) => p.y)) - pad, y1 = Math.max(...pts.map((p) => p.y)) + pad;
      const s = Math.max(x1 - x0, y1 - y0, 900);
      vb = { x: (x0 + x1) / 2 - s / 2, y: (y0 + y1) / 2 - s / 2, w: s, h: s }; setVB();
    };

    /* tooltip */
    let pinned = null;
    const info = (id) => (CN[id] ? { ...CN[id], cls: true } : N[id] ? { ...N[id], cls: false } : null);
    function showTip(id, ev) {
      const n = info(id);
      if (!n) return;
      const theme = n.cls ? n.branch : (T.themes && T.themes[n.t] ? T.themes[n.t].name : '');
      const state = opts.state ? opts.state(id, n) : '';
      tip.innerHTML = `<div class="th"><b>${esc(n.n || KIND[n.k])}</b><span class="kb k-${n.k}">${KIND[n.k] || ''}</span></div>` +
        (theme ? `<div class="tt">${esc(theme)}</div>` : '') + (n.d ? `<p>${esc(n.d)}</p>` : '') +
        (n.c ? `<p class="c">Drawback: ${esc(n.c)}</p>` : '') + (state ? `<div class="ts">${esc(state)}</div>` : '');
      tip.hidden = false;
      const r = box.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      let x, y;
      if (ev && ev.clientX != null && ev.pointerType !== 'touch') { x = ev.clientX - r.left + 16; y = ev.clientY - r.top + 16; }
      else { const el = dots[id] || cdots[id]; const cr = el.getBoundingClientRect(); x = cr.left - r.left + cr.width / 2 - w / 2; y = cr.bottom - r.top + 10; }
      x = Math.max(8, Math.min(x, r.width - w - 8));
      if (y + h > r.height - 8) y = Math.max(8, y - h - 40);
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }
    const hideTip = () => { if (!pinned) tip.hidden = true; };
    const touchy = (e) => e.pointerType === 'touch' || matchMedia('(hover: none)').matches;
    svg.addEventListener('pointerover', (e) => { const id = e.target.dataset && e.target.dataset.id; if (id && !pinned) showTip(id, e); });
    svg.addEventListener('pointermove', (e) => { const id = e.target.dataset && e.target.dataset.id; if (id && !pinned && e.pointerType === 'mouse') showTip(id, e); });
    svg.addEventListener('pointerout', (e) => { if (e.target.dataset && e.target.dataset.id) hideTip(); });
    svg.addEventListener('focusin', (e) => e.target.dataset && e.target.dataset.id && showTip(e.target.dataset.id));
    svg.addEventListener('focusout', hideTip);
    svg.addEventListener('click', (e) => {
      const id = e.target.dataset && e.target.dataset.id;
      if (!id) { pinned = null; tip.hidden = true; return; }
      if (touchy(e) && pinned !== id) { pinned = id; showTip(id); return; }
      pinned = null;
      if (opts.onClick) opts.onClick(id, info(id));
      showTip(id, e);
    });
    svg.addEventListener('keydown', (e) => {
      const id = e.target.dataset && e.target.dataset.id;
      if (id && (e.key === 'Enter' || e.key === ' ') && opts.onClick) { e.preventDefault(); opts.onClick(id, info(id)); showTip(id); }
    });

    /* pan / zoom */
    let drag = null;
    const toSvg = (e) => { const r = svg.getBoundingClientRect(); return { x: vb.x + (e.clientX - r.left) / r.width * vb.w, y: vb.y + (e.clientY - r.top) / r.height * vb.h }; };
    svg.addEventListener('pointerdown', (e) => {
      if (e.target.dataset && e.target.dataset.id) return;
      drag = { sx: e.clientX, sy: e.clientY, x: vb.x, y: vb.y }; svg.classList.add('drag'); svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = svg.getBoundingClientRect();
      vb.x = drag.x - (e.clientX - drag.sx) / r.width * vb.w; vb.y = drag.y - (e.clientY - drag.sy) / r.height * vb.h; setVB();
    });
    const end = () => { drag = null; svg.classList.remove('drag'); };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    const zoom = (f, c) => {
      c = c || { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
      const nw = Math.min(FIT.w * 1.2, Math.max(400, vb.w * f)), k = nw / vb.w;
      vb = { x: c.x - (c.x - vb.x) * k, y: c.y - (c.y - vb.y) * k, w: nw, h: nw }; setVB(); tip.hidden = true; pinned = null;
    };
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, toSvg(e)); }, { passive: false });
    box.querySelector('.ctrl').addEventListener('click', (e) => {
      const z = e.target.dataset.z;
      if (z === 'in') zoom(1 / 1.4); else if (z === 'out') zoom(1.4); else if (z === 'fit') { vb = { ...FIT }; setVB(); }
    });

    /* api */
    return {
      N, adj, CN, svg,
      setSuper,
      info,
      showTip,
      // mark({ on, can, con, ccan }): Sets of passive ids / class ids to highlight
      mark({ on = new Set(), can = new Set(), con = new Set(), ccan = new Set() } = {}) {
        for (const id in dots) { dots[id].classList.toggle('on', on.has(id)); dots[id].classList.toggle('can', can.has(id)); }
        edges.forEach((e) => e.p.classList.toggle('on', on.has(e.a) && on.has(e.b)));
        for (const id in cdots) { cdots[id].classList.toggle('on', con.has(id)); cdots[id].classList.toggle('can', ccan.has(id)); }
        clines.forEach((l) => l.classList.toggle('on', con.has(l.dataset.to)));
      },
      search(q) {
        q = (q || '').trim().toLowerCase();
        let k = 0;
        for (const id in dots) {
          const n = N[id], hit = q.length > 1 && ((n.n || '') + ' ' + (n.d || '') + ' ' + (n.c || '')).toLowerCase().includes(q);
          dots[id].classList.toggle('hit', hit); if (hit) k++;
        }
        svg.classList.toggle('searching', q.length > 1);
        return k;
      },
      flash(id) { const c = dots[id] || cdots[id]; if (!c) return; c.classList.remove('no'); void c.getBBox(); c.classList.add('no'); },
      centre(id) { const n = N[id] || CN[id]; if (!n) return; vb = { x: n.x - 600, y: n.y - 600, w: 1200, h: 1200 }; setVB(); showTip(id); },
      fitTo,
      fit() { vb = { ...FIT }; setVB(); },
      // numbered badges on nodes: [{ id, num }]; onClick(num)
      badges(list, onClick) {
        gB.textContent = '';
        list.forEach(({ id, num }) => {
          const n = N[id] || CN[id]; if (!n) return;
          const b = mk('g', { class: 'badge' });
          b.append(mk('circle', { cx: n.x, cy: n.y, r: 40 }));
          const tx = mk('text', { x: n.x, y: n.y, 'font-size': 40 }); tx.textContent = num; b.append(tx);
          b.dataset.num = num;
          if (onClick) b.addEventListener('click', (e) => { e.stopPropagation(); onClick(num); });
          gB.appendChild(b);
        });
      },
      dimBadges(upTo) { gB.querySelectorAll('.badge').forEach((b) => b.classList.toggle('off', +b.dataset.num > upTo)); },
    };
  }
  window.FL = window.FL || {};
  window.FL.TreeMap = TreeMap;
})();
