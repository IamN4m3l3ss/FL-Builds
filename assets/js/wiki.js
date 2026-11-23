// Wiki. Each section registers: title, categories, list row, detail view, search text.
// Routes: #/<section>[/<category>]  and  #/<kind>/<id>  (e.g. #/item/serpent_coil, #/pet/scarab)
(() => {
  const { $, esc, arr, json } = window.FL;
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const pct = (p) => (p >= 0.1 ? (p * 100).toFixed(0) + '%' : p >= 0.01 ? (p * 100).toFixed(1) + '%' : p > 0 ? '1 in ' + Math.round(1 / p).toLocaleString() : '—');
  const clean = (s) => String(s ?? '').replace(/\[(\w+)\|([^\]]+)\]/g, '$2').replace(/\{[^}]*\}/g, 'X');
  const SRC = { fight: 'Fight', elite: 'Elite', boss: 'Boss', miniboss: 'Miniboss', treasure: 'Treasure', mimic: 'Mimic',
    fallen: 'An Old Name', secret: 'Secret', tower_chest: 'Tower chest' };
  const SLOT = { head: 'Head', torso: 'Torso', feet: 'Feet', amulet: 'Amulet', ring: 'Ring', offhand: 'Offhand' };
  const WEAP = { daggers: 'Daggers', sword: 'Swords', greatsword: 'Greatswords', spear: 'Spears', bow: 'Bows', staff: 'Staves', lute: 'Lutes', quiver: 'Quivers' };
  const RAR_COL = { epic: '#9b6bd6', legendary: '#d9a52b', mythic: '#d9504f', divine: '#f0d27a', common: '#9a9aa6', uncommon: '#4f9a4f', rare: '#4f86d9' };

  Promise.all([json('data/wiki.json'), json('data/classes.json').catch(() => ({ classes: [] }))]).then(([W, CL]) => {
    const R = W.rarity || {};
    const ro = (r) => (R[r] ? R[r].order : 0);
    const rcol = (r) => (R[r] && R[r].colour ? `rgb(${R[r].colour.join(',')})` : RAR_COL[String(r).toLowerCase()] || 'var(--faint)');
    const rname = (r) => (R[r] ? R[r].name : cap(String(r || '').replace(/_/g, ' ')));
    const dropTable = (drops, head) => {
      const d = Object.entries(drops || {}).filter(([, v]) => (typeof v === 'number' ? v : v.chance) > 0)
        .map(([s, v]) => [s, typeof v === 'number' ? v : v.chance, v.mythicOnly]).sort((a, b) => b[1] - a[1]);
      return d.length ? `<table class="dt"><thead><tr><th>Source</th><th>${head}</th></tr></thead><tbody>${d.map(([s, c, m]) =>
        `<tr><td>${SRC[s] || esc(s)}${m ? ' <span class="kb">mythic drops</span>' : ''}</td><td class="n">${pct(c)}</td></tr>`).join('')}</tbody></table>` : '';
    };
    const head = (name, pill, col, sub) => `<header class="dh" style="--rc:${col}"><span class="pill">${esc(pill)}</span><h2>${esc(name)}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</header>`;
    const ul = (lines, cls = 'pw') => (lines && lines.length ? `<ul class="${cls}">${lines.map((l) => `<li>${esc(clean(l))}</li>`).join('')}</ul>` : '');

    /* ---------- data ---------- */
    const items = Object.entries(W.items).map(([id, it]) => ({ id, ...it, base: arr(it.base), powers: arr(it.powers) }));
    const catOf = (it) => (it.kind === 'weapon' ? 'weapon:' + it.weapon : it.kind);
    const slotLabel = (it) => (it.kind === 'weapon' ? WEAP[it.weapon] || cap(it.weapon) : SLOT[it.kind] || cap(it.kind));
    const mats = Object.entries(W.materials || {}).map(([id, m]) => ({ id, ...m, lines: arr(m.lines) }));
    const MATK = { divine: 'Divine summons', egg: 'Pet eggs', gem: 'Skill gems', orb: 'Orbs', stock: 'Crafting', special: 'Special' };
    const pets = Object.entries(W.pets || {}).map(([id, p]) => ({ id, ...p, passive: arr(p.passive), active: arr(p.active) }));
    const enemies = Object.entries(W.enemies).map(([id, e]) => ({ id, ...e, skills: arr(e.skills), where: arr(e.where) })).filter((e) => !e.dummy || e.where.length);
    const families = [...new Set(enemies.map((e) => e.family))].sort();
    const races = arr(W.races).map((r) => ({ ...r, kind: 'race', lineages: arr(r.lineages), stats: arr(r.stats) }));
    const origins = arr(W.origins).map((o) => ({ ...o, kind: 'origin', stats: arr(o.stats) }));
    const people = [...races, ...origins];
    const classes = [];
    arr(CL.classes).forEach((c) => {
      classes.push({ id: c.id, name: c.name, cls: c, kind: 'class' });
      arr(c.supers).forEach((s) => classes.push({ id: s.id, name: s.name, cls: c, sup: s, kind: 'super' }));
    });
    const group = (k) => (/lineage$/i.test(k) ? 'Lineages' : /Super$/.test(k) ? 'Super classes' : /rank$/i.test(k) ? 'Ranks' : /Ultra/.test(k) ? 'Ultras' : k);
    const terms = arr(W.glossary).map((t, i) => ({ id: String(i), ...t, g: group(t.kind) }));
    const skillText = {};
    terms.filter((t) => t.kind === 'Skill').forEach((t) => (skillText[t.name.toLowerCase()] = t.text));

    /* ---------- sections ---------- */
    const SECTIONS = [
      {
        key: 'items', kind: 'item', title: 'Items', all: 'All items', data: items,
        cats: () => [['Weapons', Object.keys(WEAP).map((w) => ['weapon:' + w, WEAP[w]])], ['Armor', [['head', 'Head'], ['torso', 'Torso'], ['feet', 'Feet']]],
          ['Jewellery', [['amulet', 'Amulets'], ['ring', 'Rings']]], ['Other', [['offhand', 'Offhands']]]],
        inCat: (x, c) => catOf(x) === c,
        text: (x) => x.name + ' ' + x.powers.join(' ') + ' ' + x.base.map((b) => b.stat).join(' '),
        sort: (a, b) => ro(b.rarity) - ro(a.rarity) || a.name.localeCompare(b.name),
        rarityFilter: true,
        row: (x) => ({ col: rcol(x.rarity), name: x.name, sub: `${slotLabel(x)} · level ${x.level || 1} · ${rname(x.rarity)}`,
          right: x.base[0] ? `${x.base[0].stat} ${x.base[0].min === x.base[0].max ? x.base[0].min : x.base[0].min + '–' + x.base[0].max}` : '',
          tag: x.powers.length ? `${x.powers.length} power${x.powers.length > 1 ? 's' : ''}` : '' }),
        detail: (x) => {
          const up = (W.upgrade || {})[x.kind === 'weapon' ? 'weapon' : x.kind];
          const stats = x.base.map((b) => `<tr><td>${esc(b.stat)}</td><td class="n">${b.min === b.max ? b.min : b.min + '–' + b.max}</td><td class="n">${b.max5}</td></tr>`).join('');
          const drops = dropTable(x.drops, 'Per item dropped');
          return head(x.name, rname(x.rarity), rcol(x.rarity), `${esc(slotLabel(x))} · requires level ${x.level || 1}${x.tier ? ' · tier ' + x.tier : ''}`) +
            (stats ? `<h3>Stats</h3><table class="dt"><thead><tr><th>Stat</th><th>Roll</th><th>Tier ${W.maxTier}</th></tr></thead><tbody>${stats}</tbody></table>
              <p class="note">Each tier adds ${Math.round(W.tierScale * 100)}% to the first stat. ${up ? `Upgrades add ${esc(up[0])} +${up[1]} per level, up to +${W.maxUpgrade}.` : ''}</p>` : '') +
            (x.powers.length ? `<h3>Powers</h3>${ul(x.powers)}` : '') +
            `<h3>Where it drops</h3>${drops ? drops + '<p class="note">A fight drops 0.6 items on average, an elite 1.2, a boss 1.8 (at least one epic).</p>' : '<p class="muted">Not a random drop.</p>'}`;
        },
      },
      {
        key: 'materials', kind: 'material', title: 'Materials', all: 'All materials', data: mats,
        cats: () => [['Type', Object.entries(MATK).filter(([k]) => mats.some((m) => m.kind === k))]],
        inCat: (x, c) => x.kind === c,
        text: (x) => x.name + ' ' + x.lines.join(' '),
        sort: (a, b) => Object.keys(MATK).indexOf(a.kind) - Object.keys(MATK).indexOf(b.kind) || a.name.localeCompare(b.name),
        row: (x) => ({ col: rcol(x.rarity || 'common'), name: x.name, sub: `${MATK[x.kind] || cap(x.kind)}${x.rarity ? ' · ' + rname(x.rarity) : ''}`,
          right: Object.keys(x.drops || {}).length ? 'drops' : '', tag: '' }),
        detail: (x) => {
          let extra = '';
          if (x.kind === 'egg') {
            const e = (W.eggs || {})[x.id];
            if (e) extra = `<h3>Hatches into</h3><table class="dt"><thead><tr><th>Pet</th><th>Chance</th></tr></thead><tbody>${arr(e.pets).map((pid) => {
              const p = W.pets[pid]; return `<tr><td><a href="#/pet/${pid}">${esc(p.name)}</a> <span class="kb">${esc(p.rarity)}</span></td><td class="n">${pct(p.hatch)}</td></tr>`; }).join('')}</tbody></table>
              <p class="note">Found in ${arr(e.lands).map(esc).join(', ')}. Tower eggs are either kind, 50/50.</p>`;
          }
          if (x.kind === 'divine') {
            const pid = x.id.split('_')[0]; if (W.pets && W.pets[pid]) extra = `<p>Summons <a href="#/pet/${pid}">${esc(W.pets[pid].name)}</a>.</p>`;
          }
          const drops = dropTable(x.drops, 'Per encounter');
          return head(x.name, MATK[x.kind] || cap(x.kind), rcol(x.rarity || 'common'), x.rarity ? esc(rname(x.rarity)) : '') + ul(x.lines) + extra +
            (drops ? `<h3>Where it drops</h3>${drops}${x.note ? `<p class="note">${esc(x.note)}</p>` : ''}` : '');
        },
      },
      {
        key: 'pets', kind: 'pet', title: 'Pets', all: 'All pets', data: pets,
        cats: () => [['Egg', [...Object.entries(W.eggs || {}).map(([k, e]) => [k, e.name]), ['divine', 'Divine']]]],
        inCat: (x, c) => (c === 'divine' ? !x.egg : x.egg === c),
        text: (x) => x.name + ' ' + x.passive.join(' ') + ' ' + x.active.join(' '),
        sort: (a, b) => (W.petInfo.odds[a.rarity] ?? 0) < (W.petInfo.odds[b.rarity] ?? 0) ? 1 : -1,
        row: (x) => ({ col: RAR_COL[x.rarity] || 'var(--faint)', name: x.name, sub: `${cap(x.rarity)} · ${x.eggName || 'Divine summon'}`,
          right: x.hatch ? `hatch ${pct(x.hatch)}` : 'summoned', tag: '' }),
        detail: (x) => head(x.name, cap(x.rarity), RAR_COL[x.rarity] || 'var(--faint)', x.eggName ? `From the <a href="#/material/${x.egg}">${esc(x.eggName)}</a>` : 'Summoned with a divine material') +
          `<h3>Passive</h3>${ul(x.passive)}<h3>In combat</h3>${ul(x.active)}` +
          `<div class="sg">${[[x.hatch ? pct(x.hatch) : '—', 'hatch chance'], [pct(W.petInfo.shiny), 'shiny chance'],
            ['+' + Math.round(((W.petInfo.expeditionBonus || {})[x.rarity] || 0) * 100) + '%', 'expedition bonus']].map(([v, l]) => `<div><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div>`,
      },
      {
        key: 'enemies', kind: 'enemy', title: 'Enemies', all: 'All enemies', data: enemies,
        cats: () => [['', [['bosses', 'Bosses']]], ['Family', families.map((f) => [f, cap(f)])]],
        inCat: (x, c) => (c === 'bosses' ? x.boss : x.family === c),
        text: (x) => x.name + ' ' + x.family + ' ' + x.where.join(' '),
        sort: (a, b) => (b.boss - a.boss) || a.name.localeCompare(b.name),
        row: (x) => ({ col: x.boss ? 'var(--blood)' : 'var(--line)', name: x.name, sub: `${cap(x.family)}${x.boss ? ' · boss' : ''} · ${x.where[0] || 'Special encounter'}`,
          right: `HP ${x.hp}`, tag: x.skills.length ? x.skills.length + ' skills' : '' }),
        detail: (x) => head(x.name, x.boss ? 'Boss' : cap(x.family), x.boss ? 'var(--blood)' : 'var(--frame)', esc(cap(x.family))) +
          `<div class="sg">${[['Base HP', x.hp], ['Armor', x.armor || 0], ['Ward', x.ward || 0], ['Dodge', Math.round((x.dodge || 0) * 100) + '%'], ['Crit', Math.round((x.crit || 0) * 100) + '%'], ['Level', x.level]]
            .map(([k, v]) => `<div><b class="num">${v}</b><span>${k}</span></div>`).join('')}</div>` +
          `<h3>Skills</h3>${x.skills.length ? `<ul class="sk">${x.skills.map((s) => { const nm = s.replace(/_/g, ' '); const tx = skillText[nm];
            return `<li><b>${esc(cap(nm))}</b>${tx ? `<span>${esc(clean(tx))}</span>` : ''}</li>`; }).join('')}</ul>` : '<p class="muted">Basic attack only.</p>'}` +
          `<h3>Found in</h3>${x.where.length ? ul(x.where, 'pw plain') : '<p class="muted">Special encounter.</p>'}` +
          '<p class="note">Base values before level and difficulty scaling. In the tower, HP grows 12% and damage 7% per floor.</p>',
      },
      {
        key: 'races', kind: 'race', title: 'Races & origins', all: 'All races & origins', data: people,
        cats: () => [['', [['race', 'Races'], ['origin', 'Origins']]]],
        inCat: (x, c) => x.kind === c,
        text: (x) => x.name + ' ' + (x.bonus || '') + ' ' + arr(x.lineages).map((l) => l.name + ' ' + (l.ability ? l.ability.text : '')).join(' '),
        sort: (a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'race' ? -1 : 1),
        row: (x) => ({ col: 'var(--frame)', name: x.name, sub: x.kind === 'race' ? `Race · ${x.lineages.length} lineages` : `Origin · ${x.bonus || ''}`, right: x.stats.join(', '), tag: '' }),
        detail: (x) => x.kind === 'origin'
          ? head(x.name, 'Origin', 'var(--frame)', '') + `<p>${esc(x.bonus)}</p><h3>Stats</h3>${ul(x.stats, 'pw plain')}`
          : head(x.name, 'Race', 'var(--frame)', x.stats.length ? esc(x.stats.join(', ')) : '') + (x.text ? `<p>${esc(clean(x.text))}</p>` : '') +
            `<h3>Lineages</h3><ul class="sk">${x.lineages.map((l) => `<li><b>${esc(l.name)} <span class="kb">${esc(l.rarity)} · ${l.odds}%</span></b>
              <span>${esc(arr(l.stats).join(', '))}</span>${l.ability ? `<span><i>${esc(l.ability.name)}:</i> ${esc(clean(l.ability.text))}</span>` : ''}</li>`).join('')}</ul>
            <p class="note">Percent is the chance to roll that lineage.</p>`,
      },
      {
        key: 'classes', kind: 'class', title: 'Classes', all: 'All classes', data: classes,
        cats: () => [['Class', arr(CL.classes).map((c) => [c.id, c.name])]],
        inCat: (x, c) => x.cls.id === c,
        text: (x) => x.name + ' ' + (x.sup ? arr(x.sup.skills).concat(arr(x.sup.branches).flatMap((b) => arr(b.nodes))).map((n) => n.name + ' ' + n.text).join(' ') : arr(x.cls.skills).map((s) => s.name + ' ' + s.text).join(' ')),
        sort: () => 0,
        row: (x) => ({ col: x.sup ? 'var(--gold)' : 'var(--frame)', name: x.name, sub: x.sup ? `${x.cls.name} super class${x.sup.side ? ' · ' + x.sup.side : ''}` : `Class · ${x.cls.weapon || ''}`,
          right: x.sup ? `${arr(x.sup.skills).length} skills` : `${arr(x.cls.skills).length} skills`, tag: '' }),
        detail: (x) => {
          const skills = x.sup ? arr(x.sup.skills) : arr(x.cls.skills);
          const sk = `<h3>Skills</h3><ul class="sk">${skills.map((s) => `<li><b>${esc(s.name)}${s.level ? ` <span class="kb">level ${s.level}</span>` : ''}</b><span>${esc(clean(s.text))}</span></li>`).join('')}</ul>`;
          if (!x.sup) return head(x.name, 'Class', 'var(--frame)', esc(x.cls.weapon || '')) + sk +
            `<h3>Super classes</h3><ul class="pw plain">${arr(x.cls.supers).map((s) => `<li><a href="#/class/${s.id}">${esc(s.name)}</a></li>`).join('')}</ul>`;
          return head(x.name, `${x.cls.name} super class`, 'var(--gold)', x.sup.side ? esc(x.sup.side) : '') + sk +
            arr(x.sup.branches).map((b) => `<h3>${esc(b.name)} branch</h3><ul class="sk">${arr(b.nodes).map((n) => `<li><b>${esc(n.name)} <span class="kb">${esc(n.type)}</span></b><span>${esc(clean(n.text))}</span></li>`).join('')}</ul>`).join('') +
            `<p class="note"><a href="tree.html#s=${x.id}">Open this tree on the planner</a></p>`;
        },
      },
      {
        key: 'glossary', kind: 'term', title: 'Glossary', all: 'All terms', data: terms, flat: true,
        cats: () => [['', [...new Set(terms.map((t) => t.g))].sort().map((k) => [k, k])]],
        inCat: (x, c) => x.g === c,
        text: (x) => x.name + ' ' + x.text,
        sort: (a, b) => a.name.localeCompare(b.name),
        term: (x) => `<div class="term" role="listitem"><div><b>${esc(x.name)}</b><span class="kb">${esc(x.kind)}</span></div><p>${esc(clean(x.text))}</p></div>`,
      },
    ];
    const BYKEY = {}, BYKIND = {};
    SECTIONS.forEach((s) => { BYKEY[s.key] = s; BYKIND[s.kind] = s; });
    BYKIND.origin = BYKEY.races;

    /* ---------- state + routing ---------- */
    const S = { sec: BYKEY.items, cat: 'all', id: null, q: '', rar: null };
    function parse() {
      const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
      const [a, b] = parts;
      S.id = null;
      if (BYKIND[a] && b && !BYKEY[a]) { S.sec = BYKIND[a]; S.id = b; if (S.cat !== 'all' && !findIn(S.sec, b, S.cat)) S.cat = 'all'; }
      else { S.sec = BYKEY[a] || BYKEY.items; S.cat = b || 'all'; }
      render();
    }
    const findIn = (sec, id, cat) => sec.data.find((x) => x.id === id && (cat === 'all' || sec.inCat(x, cat)));

    /* ---------- sidebar ---------- */
    function sidebar() {
      $('cats').innerHTML = SECTIONS.map((sec) => {
        const open = sec === S.sec;
        let h = `<div class="grp"><a class="gh${open ? ' open' : ''}" href="#/${sec.key}">${esc(sec.title)}</a>`;
        if (open) {
          h += link(`#/${sec.key}`, sec.all, sec.data.length, S.cat === 'all');
          sec.cats().forEach(([label, list]) => {
            const items = list.filter(([c]) => sec.data.some((x) => sec.inCat(x, c)));
            if (!items.length) return;
            if (label) h += `<div class="sub">${esc(label)}</div>`;
            h += items.map(([c, name]) => link(`#/${sec.key}/${encodeURIComponent(c)}`, name, sec.data.filter((x) => sec.inCat(x, c)).length, S.cat === c)).join('');
          });
        }
        return h + '</div>';
      }).join('');
    }
    const link = (href, label, n, on) => `<a href="${href}"${on ? ' aria-current="true"' : ''}><span>${esc(label)}</span>${n != null ? `<em>${n}</em>` : ''}</a>`;

    /* ---------- toolbar (rarity filter) ---------- */
    function tools() {
      if (!S.sec.rarityFilter) { $('tools').innerHTML = ''; return; }
      const rars = [...new Set(S.sec.data.map((i) => i.rarity))].sort((a, b) => ro(a) - ro(b));
      $('tools').innerHTML = `<div class="seg" role="group" aria-label="Rarity">${['', ...rars].map((r) =>
        `<button data-r="${r}" aria-pressed="${(S.rar || '') === r}" style="${r ? `--rc:${rcol(r)}` : ''}">${r ? esc(rname(r)) : 'All'}</button>`).join('')}</div>`;
      $('tools').querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { S.rar = b.dataset.r || null; tools(); list(); }));
    }

    /* ---------- list ---------- */
    function list() {
      const sec = S.sec;
      const L = sec.data.filter((x) => (S.cat === 'all' || sec.inCat(x, S.cat)) && (!S.rar || !sec.rarityFilter || x.rarity === S.rar)
        && (!S.q || sec.text(x).toLowerCase().includes(S.q))).sort(sec.sort);
      $('list').innerHTML = L.map((x) => {
        if (sec.term) return sec.term(x);
        const r = sec.row(x);
        const kind = x.kind === 'origin' ? 'origin' : sec.kind;
        return `<a class="row${S.id === x.id ? ' sel' : ''}" role="listitem" href="#/${kind}/${encodeURIComponent(x.id)}" style="--rc:${r.col}">
          <span class="rb"></span><span class="rn"><b>${esc(r.name)}</b><small>${esc(r.sub)}</small></span><span class="rs">${esc(r.right)}</span><span class="rp">${esc(r.tag)}</span></a>`;
      }).join('') || '<div class="empty">Nothing matches. Try another search or category.</div>';
      $('count').textContent = `${L.length} ${L.length === 1 ? 'entry' : 'entries'}`;
    }

    /* ---------- detail ---------- */
    function detail() {
      const d = $('detail');
      const x = S.id && S.sec.data.find((y) => y.id === S.id);
      document.body.classList.toggle('has-detail', !!x);
      if (!x) { d.hidden = true; d.innerHTML = ''; document.title = 'FL Wiki'; return; }
      d.hidden = false;
      d.innerHTML = `<a class="close" href="#/${S.sec.key}${S.cat !== 'all' ? '/' + encodeURIComponent(S.cat) : ''}" aria-label="Close">✕</a>` + S.sec.detail(x);
      document.title = `${x.name} · FL Wiki`;
    }

    function render() {
      const sec = S.sec;
      let title = sec.title;
      if (S.cat !== 'all') sec.cats().forEach(([, l]) => l.forEach(([c, n]) => { if (c === S.cat) title = n; }));
      $('title').textContent = title;
      sidebar(); tools(); list(); detail();
    }

    const q0 = new URLSearchParams(location.search).get('q');
    if (q0) { $('q').value = q0; S.q = q0.trim().toLowerCase(); }
    $('q').addEventListener('input', () => { S.q = $('q').value.trim().toLowerCase(); list(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.id) $('detail').querySelector('.close')?.click(); });
    window.addEventListener('hashchange', parse);
    parse();
  }).catch((err) => { $('list').innerHTML = `<div class="empty">Could not load the wiki (${esc(err.message)}).</div>`; });
})();
