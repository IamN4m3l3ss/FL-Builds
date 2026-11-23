// Interactive passive tree: hover/tap tooltips, path planning with the game's link rules, search, shareable hash.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KIND = { small: 'Passive', stat: 'Attribute', notable: 'Notable', keystone: 'Keystone', start: 'Gate' };
  const R = { small: 15, stat: 12, notable: 30, keystone: 42, start: 34 };

  Promise.all([fetch('data/tree.json').then((r) => r.json()), fetch('data/classes.json').then((r) => r.json())]).then(([T, CL]) => {
    const N = {}, adj = {};
    T.nodes.forEach((n) => { N[n.id] = n; adj[n.id] = new Set(); });
    T.edges.forEach(([a, b]) => { adj[a].add(b); adj[b].add(a); });
    const themeCol = (t) => { const c = T.themes[t] && T.themes[t].colour; return c ? `rgb(${c.join(',')})` : null; };

    /* ---------- map ---------- */
    const svg = $('svg');
    const xs = T.nodes.map((n) => n.x), ys = T.nodes.map((n) => n.y);
    const FIT = (() => {
      const x0 = Math.min(...xs) - 120, x1 = Math.max(...xs) + 120, y0 = Math.min(...ys) - 120, y1 = Math.max(...ys) + 120;
      const s = Math.max(x1 - x0, y1 - y0);
      return { x: (x0 + x1) / 2 - s / 2, y: (y0 + y1) / 2 - s / 2, w: s, h: s };
    })();
    let vb = { ...FIT };
    const setVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const gE = mk('g', {}), gN = mk('g', {}), gL = mk('g', {});
    svg.append(gE, gN, gL);

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
      if (n.k === 'keystone' || n.k === 'start') {
        const t = mk('text', { x: n.x, y: n.y - (R[n.k] + 22), class: 'lbl tl', 'font-size': 44, 'stroke-width': 12, 'text-anchor': 'middle' });
        t.textContent = n.k === 'start' ? 'Gate' : n.n;
        gL.appendChild(t);
      }
    });
    setVB();

    /* ---------- tooltip ---------- */
    const tip = $('tip'), map = svg.parentElement;
    let pinned = null;
    const CN = {}; // class-tree nodes by id
    function showTip(id, ev) {
      const cn = CN[id];
      const n = cn || N[id];
      const theme = cn ? cn.branch : (T.themes[n.t] ? T.themes[n.t].name : '');
      const state = cn ? (csel.has(id) ? 'Allocated' : canClass(id) ? 'Click to allocate' : csel.size >= 6 ? 'No class points left' : 'Take the node before it first')
        : sel.has(id) ? 'Allocated' : canAdd(id) ? 'Click to allocate' : gate ? 'Not connected yet' : 'Pick a gate first';
      tip.innerHTML = `<div class="th"><b>${esc(n.n || KIND[n.k])}</b><span class="kb k-${n.k}">${KIND[n.k]}</span></div>` +
        (theme ? `<div class="tt">${esc(theme)}</div>` : '') +
        (n.d ? `<p>${esc(n.d)}</p>` : '') + (n.c ? `<p class="c">Drawback: ${esc(n.c)}</p>` : '') +
        `<div class="ts">${state}</div>`;
      tip.hidden = false;
      const r = map.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      let x, y;
      if (ev && ev.clientX != null && ev.pointerType !== 'touch') { x = ev.clientX - r.left + 16; y = ev.clientY - r.top + 16; }
      else { const cr = (dots[id] || cdots[id]).getBoundingClientRect(); x = cr.left - r.left + cr.width / 2 - w / 2; y = cr.bottom - r.top + 10; }
      x = Math.max(8, Math.min(x, r.width - w - 8)); if (y + h > r.height - 8) y = Math.max(8, y - h - 40);
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }
    const hideTip = () => { if (!pinned) tip.hidden = true; };
    gN.addEventListener('pointerover', (e) => { const id = e.target.dataset.id; if (id && !pinned) showTip(id, e); });
    gN.addEventListener('pointermove', (e) => { const id = e.target.dataset.id; if (id && !pinned && e.pointerType === 'mouse') showTip(id, e); });
    gN.addEventListener('pointerout', hideTip);
    gN.addEventListener('focusin', (e) => e.target.dataset.id && showTip(e.target.dataset.id));
    gN.addEventListener('focusout', hideTip);

    /* ---------- class tree in the centre circle ---------- */
    const gC = mk('g', { class: 'ctree-map' });
    svg.appendChild(gC);
    const cdots = {};
    const csel = new Set();
    let sup = null;
    const SUP = {};
    CL.classes.forEach((c) => c.supers.forEach((s) => (SUP[s.id] = { ...s, cls: c })));
    const canClass = (id) => {
      const cn = CN[id];
      return cn && !csel.has(id) && csel.size < 6 && (cn.place === 0 || csel.has(cn.prev));
    };
    function drawClass() {
      gC.textContent = ''; for (const k in cdots) delete cdots[k];
      if (!sup) return;
      const S = SUP[sup];
      gC.appendChild(mk('circle', { cx: 0, cy: 0, r: 405, class: 'cring' }));
      S.branches.forEach((b, i) => {
        const a = (-90 + i * 120) * Math.PI / 180;
        let px = 0, py = 0;
        b.nodes.forEach((n, j) => {
          const r = 110 + j * 82, x = Math.cos(a) * r, y = Math.sin(a) * r;
          const ln = mk('line', { x1: px, y1: py, x2: x, y2: y, class: 'e ce' }); ln.dataset.to = n.id; gC.appendChild(ln);
          CN[n.id] = { n: n.name, k: n.type, d: n.text, c: '', branch: S.name + ': ' + b.name, place: j, prev: j ? b.nodes[j - 1].id : null };
          px = x; py = y;
        });
        b.nodes.forEach((n, j) => {
          const r = 110 + j * 82, x = Math.cos(a) * r, y = Math.sin(a) * r;
          const c = mk('circle', { cx: x, cy: y, r: { small: 20, notable: 30, capstone: 38 }[n.type] || 20, class: 'n cn k-' + n.type, tabindex: 0 });
          c.dataset.id = n.id; gC.appendChild(c); cdots[n.id] = c;
        });
        const lx = Math.cos(a) * 395, ly = Math.sin(a) * 395;
        const t = mk('text', { x: lx, y: ly + (Math.sin(a) > 0.5 ? 34 : -10), class: 'lbl tl', 'font-size': 34, 'stroke-width': 10, 'text-anchor': 'middle' });
        t.textContent = b.name; gC.appendChild(t);
      });
      gC.appendChild(mk('circle', { cx: 0, cy: 0, r: 62, class: 'n k-start chub' }));
      const t = mk('text', { x: 0, y: 12, class: 'lbl tl', 'font-size': 34, 'stroke-width': 10, 'text-anchor': 'middle' });
      t.textContent = S.name; gC.appendChild(t);
    }
    function toggleClass(id) {
      const cn = CN[id];
      if (csel.has(id)) { // remove this node and every later node in its branch
        let x = id; while (x) { csel.delete(x); x = Object.keys(CN).find((k) => CN[k].prev === x && csel.has(k)); }
      } else if (canClass(id)) csel.add(id);
      else flash(id);
      render(); save();
    }
    gC.addEventListener('pointerover', (e) => { const id = e.target.dataset.id; if (id && !pinned) showTip(id, e); });
    gC.addEventListener('pointerout', hideTip);
    gC.addEventListener('click', (e) => {
      const id = e.target.dataset.id; if (!id) return;
      if (e.pointerType === 'touch' || matchMedia('(hover: none)').matches) { if (pinned !== id) { pinned = id; showTip(id); return; } }
      toggleClass(id); pinned = null; showTip(id, e);
    });
    gC.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.id) { e.preventDefault(); toggleClass(e.target.dataset.id); } });
    const clsSel = $('cls'), supSel = $('sup');
    clsSel.innerHTML = '<option value="">None</option>' + CL.classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    function fillSup() {
      const c = CL.classes.find((x) => x.id === clsSel.value);
      supSel.innerHTML = c ? c.supers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('') : '';
      supSel.disabled = !c;
    }
    function setSup(id) { sup = id || null; csel.clear(); drawClass(); render(); save(); }
    clsSel.addEventListener('change', () => { fillSup(); setSup(supSel.value); });
    supSel.addEventListener('change', () => setSup(supSel.value));

    /* ---------- planning ---------- */
    let gate = null;
    const sel = new Set();
    const canAdd = (id) => gate && !sel.has(id) && N[id].k !== 'start' && [...adj[id]].some((x) => x === gate || sel.has(x));
    function connectedWithout(id) {
      const seen = new Set([gate]), st = [gate];
      while (st.length) for (const x of adj[st.pop()]) if (x !== id && sel.has(x) && !seen.has(x)) { seen.add(x); st.push(x); }
      return [...sel].every((x) => x === id || seen.has(x));
    }
    function toggle(id) {
      const n = N[id];
      if (n.k === 'start') { gate = gate === id ? null : id; sel.clear(); }
      else if (sel.has(id)) { if (connectedWithout(id)) sel.delete(id); else flash(id); }
      else if (canAdd(id)) sel.add(id);
      else flash(id);
      render(); save();
    }
    function flash(id) { const c = dots[id] || cdots[id]; c.classList.remove('no'); void c.getBBox(); c.classList.add('no'); }
    gN.addEventListener('click', (e) => {
      const id = e.target.dataset.id; if (!id) return;
      if (e.pointerType === 'touch' || matchMedia('(hover: none)').matches) {
        if (pinned !== id) { pinned = id; showTip(id); return; }
      }
      toggle(id); pinned = null; showTip(id, e);
    });
    gN.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.id) { e.preventDefault(); toggle(e.target.dataset.id); } });
    svg.addEventListener('click', (e) => { if (!e.target.dataset.id) { pinned = null; tip.hidden = true; } });

    function render() {
      for (const id in dots) {
        dots[id].classList.toggle('on', sel.has(id) || id === gate);
        dots[id].classList.toggle('can', !!canAdd(id));
      }
      const on = (x) => sel.has(x) || x === gate;
      edges.forEach((e) => e.p.classList.toggle('on', on(e.a) && on(e.b)));
      $('pts').textContent = sel.size;
      for (const id in cdots) { cdots[id].classList.toggle('on', csel.has(id)); cdots[id].classList.toggle('can', canClass(id)); }
      gC.querySelectorAll('.ce').forEach((l) => l.classList.toggle('on', csel.has(l.dataset.to)));
      $('cpts').textContent = csel.size;
      const cpicked = [...csel].map((id) => CN[id]).filter((n) => n.k !== 'small');
      const major = [...sel].filter((id) => N[id].k === 'notable' || N[id].k === 'keystone');
      const stats = [...sel].filter((id) => N[id].k === 'stat').length;
      $('picked').innerHTML = (gate ? '' : '<p class="muted">Click a Gate on the map to start.</p>') +
        major.map((id) => { const n = N[id]; return `<button class="pk" data-id="${id}"><b>${esc(n.n)}</b>${n.k === 'keystone' ? '<span class="ks">keystone</span>' : ''}<span class="d">${esc(n.d)}</span>${n.c ? `<span class="c">Drawback: ${esc(n.c)}</span>` : ''}</button>`; }).join('') +
        cpicked.map((n) => `<div class="pk"><b>${esc(n.n)}</b><span class="ks">${esc(n.branch)}</span><span class="d">${esc(n.d)}</span></div>`).join('') +
        (stats ? `<p class="muted">${stats} attribute node${stats > 1 ? 's' : ''}: +${stats * 2} to attributes you pick.</p>` : '');
      document.querySelectorAll('.pk').forEach((b) => b.addEventListener('click', () => centre(b.dataset.id)));
    }
    function save() {
      const p = new URLSearchParams();
      if (gate) { p.set('g', gate); p.set('n', [...sel].join(',')); }
      if (sup) { p.set('s', sup); p.set('c', [...csel].join(',')); }
      const q = p.toString().replace(/%2C/g, ',');
      history.replaceState(null, '', q ? '#' + q : location.pathname);
    }
    function load() {
      const h = new URLSearchParams(location.hash.slice(1));
      const s = h.get('s');
      if (s && SUP[s]) {
        clsSel.value = SUP[s].cls.id; fillSup(); supSel.value = s; sup = s; drawClass();
        const want = (h.get('c') || '').split(',').filter((id) => CN[id]);
        let added = true;
        while (added) { added = false; for (const id of want) if (!csel.has(id) && canClass(id)) { csel.add(id); added = true; } }
      } else fillSup();
      const g = h.get('g'); if (!g || !N[g] || N[g].k !== 'start') return;
      gate = g;
      const want = (h.get('n') || '').split(',').filter((id) => N[id]);
      let added = true;
      while (added) { added = false; for (const id of want) if (!sel.has(id) && canAdd(id)) { sel.add(id); added = true; } }
    }
    $('reset').onclick = () => { gate = null; sel.clear(); csel.clear(); render(); save(); };

    /* ---------- search ---------- */
    $('q').addEventListener('input', () => {
      const q = $('q').value.trim().toLowerCase();
      let k = 0;
      for (const id in dots) {
        const n = N[id], hit = q.length > 1 && (n.n + ' ' + n.d + ' ' + n.c).toLowerCase().includes(q);
        dots[id].classList.toggle('hit', hit); if (hit) k++;
      }
      svg.classList.toggle('searching', q.length > 1);
      $('qn').textContent = q.length > 1 ? `${k} match${k === 1 ? '' : 'es'}` : '';
    });

    /* ---------- pan / zoom ---------- */
    let drag = null;
    const toSvg = (e) => { const r = svg.getBoundingClientRect(); return { x: vb.x + (e.clientX - r.left) / r.width * vb.w, y: vb.y + (e.clientY - r.top) / r.height * vb.h }; };
    svg.addEventListener('pointerdown', (e) => {
      if (e.target.dataset.id) return;
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
      const nw = Math.min(FIT.w * 1.2, Math.max(400, vb.w * f)), k = nw / vb.w;
      vb = { x: c.x - (c.x - vb.x) * k, y: c.y - (c.y - vb.y) * k, w: nw, h: nw }; setVB(); tip.hidden = true; pinned = null;
    };
    const centre = (id) => { const n = N[id]; vb = { x: n.x - 600, y: n.y - 600, w: 1200, h: 1200 }; setVB(); showTip(id); };
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, toSvg(e)); }, { passive: false });
    $('zin').onclick = () => zoom(1 / 1.4); $('zout').onclick = () => zoom(1.4); $('zfit').onclick = () => { vb = { ...FIT }; setVB(); };

    load(); render();
  });
})();
