// Wiki: items with drop chances, enemies, glossary. Data: data/wiki.json (exported from the game modules).
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : '';
  const SRC = { fight: 'Fight', elite: 'Elite', boss: 'Boss', miniboss: 'Miniboss', treasure: 'Treasure', mimic: 'Mimic',
    fallen: 'An Old Name', secret: 'Secret', tower_chest: 'Tower chest' };
  const oneIn = (p) => p >= 0.1 ? (p * 100).toFixed(0) + '%' : p >= 0.01 ? (p * 100).toFixed(1) + '%' : '1 in ' + Math.round(1 / p).toLocaleString();

  /* tabs */
  document.querySelectorAll('.wtabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.wtabs button').forEach((x) => x.setAttribute('aria-selected', x === b));
    ['items', 'enemies', 'terms'].forEach((t) => ($('tab-' + t).hidden = t !== b.dataset.tab));
    history.replaceState(null, '', '#' + b.dataset.tab);
  }));
  const start = location.hash.slice(1);
  if (['enemies', 'terms'].includes(start)) document.querySelector(`.wtabs [data-tab="${start}"]`).click();

  fetch('data/wiki.json').then((r) => r.json()).then((W) => {
    const R = W.rarity;
    const ro = (r) => (R[r] ? R[r].order : 0);
    const col = (r) => (R[r] && R[r].colour ? `rgb(${R[r].colour.join(',')})` : 'var(--muted)');

    /* ---------- items ---------- */
    const items = Object.entries(W.items).map(([id, it]) => ({ id, ...it }));
    const slotOf = (it) => it.kind === 'weapon' ? 'weapon:' + it.weapon : it.kind;
    const SLOTN = { head: 'Head', torso: 'Torso', feet: 'Feet', amulet: 'Amulet', ring: 'Ring', offhand: 'Offhand' };
    const slots = [...new Set(items.map(slotOf))].sort();
    $('islot').innerHTML = '<option value="">All slots</option>' + slots.map((s) =>
      `<option value="${s}">${s.startsWith('weapon:') ? 'Weapon: ' + cap(s.slice(7)) : SLOTN[s] || cap(s)}</option>`).join('');
    const rars = [...new Set(items.map((i) => i.rarity))].sort((a, b) => ro(a) - ro(b));
    $('irar').innerHTML = '<option value="">All rarities</option>' + rars.map((r) => `<option value="${r}">${esc(R[r] ? R[r].name : r)}</option>`).join('');
    $('dropnote').textContent = 'Drop chance is per item dropped from that source (a fight drops 0.6 items on average, an elite 1.2, a boss 1.8 with at least one epic). '
      + `Item tier raises the first stat by ${W.tierScale * 100}% per tier, up to tier ${W.maxTier}. Mythics only come from mythic-eligible drops.`;

    function card(it) {
      const stats = it.base.map((b) => `<li><span>${esc(b.stat)}</span><b>${b.min === b.max ? b.min : b.min + '–' + b.max}</b>${b.max5 !== b.max ? `<em>tier 5: ${b.max5}</em>` : ''}</li>`).join('');
      const pw = it.powers.map((p) => `<li class="pw">${esc(p)}</li>`).join('');
      const dr = Object.entries(it.drops || {}).sort((a, b) => b[1].chance - a[1].chance)
        .map(([s, d]) => `<span class="dchip" title="${d.mythicOnly ? 'Only from mythic-eligible drops' : ''}">${SRC[s] || s} <b>${oneIn(d.chance)}</b></span>`).join('');
      return `<article class="panel icard" style="--rc:${col(it.rarity)}">
        <header><h3>${esc(it.name)}</h3><span class="rar">${esc(R[it.rarity] ? R[it.rarity].name : it.rarity)}</span></header>
        <div class="meta">${it.kind === 'weapon' ? cap(it.weapon) : SLOTN[it.kind] || cap(it.kind)} · level ${it.level || 1}${it.tier ? ' · tier ' + it.tier : ''}</div>
        <ul class="st">${stats}${pw}</ul>
        ${dr ? `<div class="drops">${dr}</div>` : '<div class="drops muted">Not a random drop</div>'}
      </article>`;
    }
    function renderItems() {
      const q = $('iq').value.trim().toLowerCase(), sl = $('islot').value, ra = $('irar').value, so = $('isort').value;
      let list = items.filter((it) => (!sl || slotOf(it) === sl) && (!ra || it.rarity === ra)
        && (!q || (it.name + ' ' + it.powers.join(' ') + ' ' + it.base.map((b) => b.stat).join(' ')).toLowerCase().includes(q)));
      list.sort(so === 'name' ? (a, b) => a.name.localeCompare(b.name) : so === 'level' ? (a, b) => (a.level - b.level) || a.name.localeCompare(b.name)
        : (a, b) => (ro(b.rarity) - ro(a.rarity)) || a.name.localeCompare(b.name));
      $('items').innerHTML = list.map(card).join('');
      $('icount').textContent = `${list.length} items`;
    }
    ['iq', 'islot', 'irar', 'isort'].forEach((id) => $(id).addEventListener('input', renderItems));
    renderItems();

    /* ---------- enemies ---------- */
    const enemies = Object.entries(W.enemies).map(([id, e]) => ({ id, ...e })).filter((e) => !e.dummy || e.where.length)
      .sort((a, b) => (a.boss - b.boss) || a.name.localeCompare(b.name));
    const human = (s) => s.replace(/_/g, ' ');
    function renderEnemies() {
      const q = $('eq').value.trim().toLowerCase();
      const list = enemies.filter((e) => !q || (e.name + ' ' + e.family + ' ' + e.where.join(' ')).toLowerCase().includes(q));
      $('enemies').innerHTML = list.map((e) => `<tr><td><b>${esc(e.name)}</b>${e.boss ? ' <span class="ks">boss</span>' : ''}</td><td>${esc(cap(e.family))}</td>
        <td class="n">${e.hp}</td><td class="n">${e.armor || 0}</td><td class="n">${e.ward || 0}</td>
        <td>${e.skills.map((s) => esc(human(s))).join(', ') || '<span class="muted">Attack only</span>'}</td>
        <td>${e.where.map(esc).join('<br>') || '<span class="muted">Special</span>'}</td></tr>`).join('');
      $('ecount').textContent = `${list.length} enemies`;
    }
    $('eq').addEventListener('input', renderEnemies);
    renderEnemies();

    /* ---------- glossary ---------- */
    const kinds = [...new Set(W.glossary.map((t) => t.kind))].sort();
    $('tk').innerHTML = '<option value="">All kinds</option>' + kinds.map((k) => `<option>${esc(k)}</option>`).join('');
    const clean = (s) => String(s).replace(/\[(\w+)\|([^\]]+)\]/g, '$2').replace(/\{[^}]*\}/g, 'X');
    function renderTerms() {
      const q = $('tq').value.trim().toLowerCase(), k = $('tk').value;
      const list = W.glossary.filter((t) => (!k || t.kind === k) && (!q || (t.name + ' ' + t.text).toLowerCase().includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name));
      $('terms').innerHTML = list.map((t) => `<div class="panel term"><h3>${esc(t.name)}</h3><span class="kb">${esc(t.kind)}</span><p>${esc(clean(t.text))}</p></div>`).join('');
      $('tcount').textContent = `${list.length} terms`;
    }
    ['tq', 'tk'].forEach((id) => $(id).addEventListener('input', renderTerms));
    renderTerms();
  });
})();
