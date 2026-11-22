#!/usr/bin/env python3
"""Pull game data out of a dump made by fldump.py.

    python3 tools/extract.py items  dump.bin   -> data/items.json (definitions + market prices)
    python3 tools/extract.py find   dump.bin "Twin Cut"   -> print every table whose name/id matches
    python3 tools/extract.py keys   dump.bin   -> most common key sets (to discover new data tables)

Run the market dump with the market open; run skill/class dumps with those screens open.
"""
import collections
import json
import sys
from pathlib import Path

from dumplib import Dump, iter_tables, tstr, value, walk

OUT = Path(__file__).resolve().parent.parent / 'data'


def items(d):
    defs, market = {}, collections.defaultdict(dict)
    for t, k in iter_tables(d):
        ks = set(k)
        if {'name', 'rarity', 'kind', 'base'} <= ks:
            w = walk(d, t) or {}
            if w.get('name') and w['name'] not in defs:
                defs[w['name']] = w
        elif ks == {'id', 'o', 't', 'tier'}:
            o = walk(d, k['o'][0]) or {}
            tmpl = walk(d, k['t'][0]) or {}
            tier = value(d, *k['tier'])
            if o.get('n') and tmpl.get('name'):
                prev = market[tmpl['name']].get(tier)
                if not prev or o['n'] >= prev['n']:
                    market[tmpl['name']][tier] = {'low': o['low'], 'n': o['n']}
    out = []
    for name, w in defs.items():
        it = {k: w.get(k) for k in ('name', 'rarity', 'kind', 'icon', 'weapon', 'axis', 'drop', 'secret')}
        it['base'] = [list(p.values()) for p in (w.get('base') or {}).values() if isinstance(p, dict)]
        it['power'] = [list(p.values()) for p in (w.get('power') or {}).values() if isinstance(p, dict)]
        if name in market:
            it['market'] = {str(t): v for t, v in market[name].items()}
        out.append({k: v for k, v in it.items() if v not in (None, [], '')})
    (OUT / 'items.json').write_text(json.dumps(out, separators=(',', ':')))
    print(len(out), 'items,', sum('market' in i for i in out), 'with market prices')


def find(d, needle):
    seen = set()
    for t, k in iter_tables(d):
        for key in ('name', 'id'):
            if key in k and k[key][1] == 6 and needle.lower() in (tstr(d, k[key][0]) or '').lower():
                w = walk(d, t)
                s = json.dumps(w, default=str)
                if s not in seen:
                    seen.add(s)
                    print(hex(t), s[:3000], '\n')


def keys(d):
    c = collections.Counter(frozenset(k) for _, k in iter_tables(d))
    for ks, n in c.most_common(150):
        print(n, sorted(ks)[:20])


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    cmd, path = sys.argv[1], sys.argv[2]
    d = Dump(path)
    {'items': lambda: items(d), 'find': lambda: find(d, sys.argv[3]), 'keys': lambda: keys(d)}[cmd]()
