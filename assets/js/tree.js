// Passive tree planner page: plan a path with the game's link rules, pick super-class nodes, search, share by URL.
(() => {
  const { $, esc, json } = window.FL;
  const CLASS_POINTS = 6;

  Promise.all([json('data/tree.json'), json('data/classes.json')]).then(([T, CL]) => {
    let gate = null, sup = null;
    const sel = new Set(), csel = new Set();
    const SUP = {};
    CL.classes.forEach((c) => c.supers.forEach((s) => (SUP[s.id] = { ...s, cls: c })));

    const map = FL.TreeMap($('map'), {
      T,
      label: 'Passive tree planner',
      state: (id, n) => n.cls
        ? (csel.has(id) ? 'Allocated' : canClass(id) ? 'Click to allocate' : csel.size >= CLASS_POINTS ? 'No class points left' : 'Take the node before it first')
        : n.k === 'start' ? (gate === id ? 'Your starting gate' : 'Click to start here')
          : sel.has(id) ? 'Allocated' : canAdd(id) ? 'Click to allocate' : gate ? 'Not connected yet' : 'Pick a gate first',
      onClick: (id, n) => (n.cls ? toggleClass(id) : toggle(id)),
    });
    const { N, adj, CN } = map;

    /* passive rules */
    const canAdd = (id) => gate && !sel.has(id) && N[id].k !== 'start' && [...adj[id]].some((x) => x === gate || sel.has(x));
    function connectedWithout(id) {
      const seen = new Set([gate]), st = [gate];
      while (st.length) for (const x of adj[st.pop()]) if (x !== id && sel.has(x) && !seen.has(x)) { seen.add(x); st.push(x); }
      return [...sel].every((x) => x === id || seen.has(x));
    }
    function toggle(id) {
      if (N[id].k === 'start') { gate = gate === id ? null : id; sel.clear(); }
      else if (sel.has(id)) { if (connectedWithout(id)) sel.delete(id); else map.flash(id); }
      else if (canAdd(id)) sel.add(id);
      else map.flash(id);
      update();
    }

    /* class tree rules: each branch in order, CLASS_POINTS total */
    const canClass = (id) => CN[id] && !csel.has(id) && csel.size < CLASS_POINTS && (CN[id].place === 0 || csel.has(CN[id].prev));
    function toggleClass(id) {
      if (csel.has(id)) { // remove it and the rest of its branch
        let x = id;
        while (x) { csel.delete(x); x = Object.keys(CN).find((k) => CN[k].prev === x && csel.has(k)); }
      } else if (canClass(id)) csel.add(id);
      else map.flash(id);
      update();
    }

    /* class / super selectors */
    const clsSel = $('cls'), supSel = $('sup');
    clsSel.innerHTML = '<option value="">No class</option>' + CL.classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    function fillSup() {
      const c = CL.classes.find((x) => x.id === clsSel.value);
      supSel.innerHTML = c ? c.supers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('') : '';
      supSel.disabled = !c;
    }
    function setSup(id) { sup = id || null; csel.clear(); map.setSuper(sup ? SUP[sup] : null); update(); }
    clsSel.addEventListener('change', () => { fillSup(); setSup(supSel.value); });
    supSel.addEventListener('change', () => setSup(supSel.value));

    /* render + sidebar */
    function update() {
      const on = new Set(sel); if (gate) on.add(gate);
      const can = new Set(Object.keys(N).filter(canAdd));
      const ccan = new Set(Object.keys(CN).filter(canClass));
      map.mark({ on, can, con: csel, ccan });
      $('pts').textContent = sel.size;
      $('cpts').textContent = csel.size;
      const major = [...sel].filter((id) => N[id].k === 'notable' || N[id].k === 'keystone');
      const stats = [...sel].filter((id) => N[id].k === 'stat').length;
      const cbig = [...csel].filter((id) => CN[id].k !== 'small');
      $('picked').innerHTML = (gate ? '' : '<p class="muted">Click a Gate on the map to start.</p>') +
        major.map((id) => { const n = N[id]; return `<button class="pk" data-id="${id}"><b>${esc(n.n)}</b>${n.k === 'keystone' ? '<span class="ks">keystone</span>' : ''}<span class="d">${esc(n.d)}</span>${n.c ? `<span class="c">Drawback: ${esc(n.c)}</span>` : ''}</button>`; }).join('') +
        cbig.map((id) => { const n = CN[id]; return `<button class="pk" data-id="${id}"><b>${esc(n.n)}</b><span class="ks">${esc(n.branch)}</span><span class="d">${esc(n.d)}</span></button>`; }).join('') +
        (stats ? `<p class="muted">${stats} attribute node${stats > 1 ? 's' : ''}: +${stats * 2} to attributes you pick.</p>` : '');
      $('picked').querySelectorAll('.pk').forEach((b) => (b.onclick = () => map.centre(b.dataset.id)));
      save();
    }
    function save() {
      const p = new URLSearchParams();
      if (gate) { p.set('g', gate); p.set('n', [...sel].join(',')); }
      if (sup) { p.set('s', sup); p.set('c', [...csel].join(',')); }
      const q = p.toString().replace(/%2C/g, ',');
      history.replaceState(null, '', q ? '#' + q : location.pathname + location.search);
    }
    function load() {
      const h = new URLSearchParams(location.hash.slice(1));
      const s = h.get('s');
      if (s && SUP[s]) {
        clsSel.value = SUP[s].cls.id; fillSup(); supSel.value = s; sup = s; map.setSuper(SUP[s]);
        const want = (h.get('c') || '').split(',').filter((id) => CN[id]);
        for (let added = true; added;) { added = false; for (const id of want) if (!csel.has(id) && canClass(id)) { csel.add(id); added = true; } }
      } else fillSup();
      const g = h.get('g');
      if (g && N[g] && N[g].k === 'start') {
        gate = g;
        const want = (h.get('n') || '').split(',').filter((id) => N[id]);
        for (let added = true; added;) { added = false; for (const id of want) if (!sel.has(id) && canAdd(id)) { sel.add(id); added = true; } }
      }
    }
    $('reset').onclick = () => { gate = null; sel.clear(); csel.clear(); update(); };
    $('q').addEventListener('input', () => {
      const k = map.search($('q').value);
      $('qn').textContent = $('q').value.trim().length > 1 ? `${k} match${k === 1 ? '' : 'es'}` : '';
    });

    load();
    update();
  });
})();
