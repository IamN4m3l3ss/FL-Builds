#!/usr/bin/env python3
"""Plan a passive-tree path for a build and write it into builds/<id>.json.

Usage:
    python3 tools/planner.py <build_id> --gate g6 --targets "Open Wounds,Haemorrhage,..." [--points 60]
        [--score "bleed=4,rupture=4,crit=3"] [--avoid "two-handed,fire,block,ward"]

- Targets are notable/keystone names, in the order you want to unlock them.
- Keystones that are not targets are never walked through (they carry drawbacks).
- Leftover points go to the best-scoring nodes next to the path (by text keywords).
The build JSON must already exist (copy an existing one); only gate/order/goals are replaced.
"""
import argparse
import collections
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_tree():
    t = json.loads((ROOT / 'data' / 'tree.json').read_text())
    nodes = {n['id']: n for n in t['nodes']}
    adj = collections.defaultdict(set)
    for a, b, *_ in t['edges']:
        adj[a].add(b)
        adj[b].add(a)
    return nodes, adj


def bfs(adj, src, allowed=None):
    dist = {s: 0 for s in src}
    prev = {}
    dq = collections.deque(src)
    while dq:
        x = dq.popleft()
        for y in adj[x]:
            if y not in dist and (allowed is None or y in allowed):
                dist[y] = dist[x] + 1
                prev[y] = x
                dq.append(y)
    return dist, prev


def grow(adj, owned, order):
    """Repeatedly attach the nearest remaining target by a shortest path."""
    tree = set(owned)
    added = []
    left = list(order)
    while left:
        dist, prev = bfs(adj, tree)
        t = min(left, key=lambda t: (dist.get(t, 1e9), left.index(t)))
        if t not in dist:
            raise SystemExit(f'{t} cannot be reached from the gate')
        path = []
        x = t
        while x not in tree:
            path.append(x)
            x = prev[x]
        for p in reversed(path):
            tree.add(p)
            added.append(p)
        left.remove(t)
    return added


def prune(adj, owned, added, terms):
    """Drop non-target leaves left over from merged paths."""
    s = set(added)
    changed = True
    while changed:
        changed = False
        for n in list(s):
            if n in terms:
                continue
            if len([m for m in adj[n] if m in s or m in owned]) <= 1:
                s.discard(n)
                changed = True
    return [n for n in added if n in s]


def steiner(adj, owned, terms, tries=800, seed=1):
    rnd = random.Random(seed)
    best = None
    for i in range(tries):
        order = terms[:] if i == 0 else rnd.sample(terms, len(terms))
        a = prune(adj, set(owned), grow(adj, set(owned), order), set(terms))
        if best is None or len(a) < len(best):
            best = a
    return set(best)


def plan(gate, names, points=60, weights=(), avoid=(), stat_weight=1.5):
    """Return (order, goals, target_cost) for a build from one gate."""
    nodes, adj = load_tree()
    byname = {n['n']: i for i, n in nodes.items() if n.get('n') and n['k'] != 'start'}
    missing = [n for n in names if n not in byname]
    if missing:
        raise SystemExit(f'Unknown node names: {missing}')
    terms = [byname[n] for n in names]

    # never path through keystones you did not ask for
    for k, n in nodes.items():
        if n['k'] == 'keystone' and k not in terms:
            for m in list(adj[k]):
                adj[m].discard(k)
            adj[k] = set()

    chosen = steiner(adj, {gate}, terms)
    if len(chosen) > points:
        raise ValueError(f'targets need {len(chosen)} points from {gate}')

    # allocation order: reach targets in the given priority, inside the chosen set
    order, goals, tree = [], [], {gate}
    for nm, t in zip(names, terms):
        if t in tree:
            continue
        dist, prev = bfs(adj, tree, allowed=chosen)
        path = []
        x = t
        while x not in tree:
            path.append(x)
            x = prev[x]
        for p in reversed(path):
            tree.add(p)
            order.append(p)
            goals.append(nm)

    def score(n):
        v = nodes[n]
        t = (v.get('d') or '').lower()
        s = sum(w for k, w in weights if k in t)
        if any(x in t for x in avoid):
            s -= 3
        if v['k'] == 'stat':
            s += stat_weight
        if v['k'] == 'keystone':
            s = -99
        return s

    while len(order) < points:
        frontier = {y for x in tree for y in adj[x] if y not in tree}
        y = max(frontier, key=lambda n: (score(n), -len(n)))
        tree.add(y)
        order.append(y)
        goals.append('filler')
    return order, goals, len(chosen)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('build')
    ap.add_argument('--gate', required=True)
    ap.add_argument('--targets', required=True)
    ap.add_argument('--points', type=int, default=60)
    ap.add_argument('--score', default='bleed=4,rupture=4,crit=3,vulnerable=2,max hp=2,heal you for 2%=2,marked=1,sunder=1,dodge=1')
    ap.add_argument('--avoid', default='two-handed,fire,block,ward')
    ap.add_argument('--stat-weight', type=float, default=1.5,
                    help='score of a stat node (+2 to an attribute of your choice)')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    names = [s.strip() for s in a.targets.split(',') if s.strip()]
    weights = [(k.strip(), float(v)) for k, v in (kv.split('=') for kv in a.score.split(','))]
    avoid = [s.strip() for s in a.avoid.split(',') if s.strip()]
    try:
        order, goals, cost = plan(a.gate, names, a.points, weights, avoid, a.stat_weight)
    except ValueError as e:
        raise SystemExit(str(e))
    nodes, _ = load_tree()
    for i, n in enumerate(order, 1):
        v = nodes[n]
        if v['k'] in ('notable', 'keystone'):
            print(f'{i:3} {v["n"]}')
    print(f'targets cost {cost} points, {a.points - cost} filler')

    if not a.dry_run:
        p = ROOT / 'builds' / f'{a.build}.json'
        b = json.loads(p.read_text())
        b.update(gate=a.gate, order=order, goals=goals)
        p.write_text(json.dumps(b, indent=1))
        print('wrote', p)


if __name__ == '__main__':
    main()
