#!/usr/bin/env python3
"""Stage-1 Bleed/Rupture fight simulator and build search, one result per class.

    python3 tools/sim.py            # search every class, write data/sim.json
    python3 tools/sim.py rogue      # one class

Measured from the training dummy (see README):
    LevelScale  = 1 + 0.08 * (level - 1)                    (5.72 at level 60)
    Bleed tick  = (1 + stacks) * U * LevelScale * (1 + status power)
    Rupture     = 1.25 * sum of all remaining ticks          = 1.25 * n(n+3)/2 * U * LS * (1+SP)
    U           = 3.70 per LevelScale, with Vulnerable on the target adding x1.25

Assumed (not measured yet): hits, skills and armor are ignored; "+% against Bleeding" and Rupture
bonuses from items/nodes multiply Rupture; each new Vulnerable or Sunder on a Bleeding enemy pops it;
on-hit item effects trigger on every hit of skills and Attacks. Survival is a rule, not simulated.
"""
import itertools
import json
import math
import multiprocessing as mp
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from planner import load_tree, bfs  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LEVEL = 60
LS = 1 + 0.08 * (LEVEL - 1)
U = 3.70
HP = 30000
BOSS_HP = 100000
HIT = 71 / 3.0 * LS          # Attack hit, scaled from the measured 71 at level 26 (LevelScale 3)
MAX_HP = 900                 # rough level-60 max HP (455 at level 26)
SUSTAIN_GOAL = 0.15          # healing per turn as a share of max HP that a tower build should reach
MAX_TURNS = 40
RUNS = 80
CLASS_POINTS = 8          # assumed class-tree points: two full branches

# ---------------------------------------------------------------- passive tree options
NOTABLES = ['Open Wounds', 'Haemorrhage', 'Rending', 'Impaling Wound', 'Sharp Focus', 'Keen Eye',
            'Unseen Blade', 'Hunter\'s Mark', 'Sunder Line', 'Keen Senses', 'Tailwind']
KEYSTONES = ['Windborne', 'Blood Rite', 'Glass Edge', 'Impaler']
SURVIVAL = ['Red Harvest', 'Second Breath']          # always taken

# ---------------------------------------------------------------- class kits (bleed-relevant)
# skill: (energy, cooldown, tags, effect)
SKILLS = {
    'twin_cut': (2, 0, {'hit', 'debuff'}, 'twin'),
    'deep_cut': (1, 0, {'hit', 'debuff'}, 'double'),
    'mark_for_death': (1, 2, {'debuff'}, 'mark'),
    'rob': (2, 2, {'hit'}, 'rob'),
    'lunge': (2, 0, {'hit', 'debuff'}, 'vuln2'),
    'pommel_strike': (1, 0, {'hit', 'debuff'}, 'pommel'),
    'blood_frenzy': (0, 3, set(), 'frenzy'),
    'stance_shift': (0, 1, set(), 'stance'),
    'impale': (2, 0, {'hit', 'debuff'}, 'sunder2'),
    'leap': (2, 2, {'hit', 'debuff'}, 'leap'),
    'skewer': (3, 3, {'hit', 'debuff'}, 'skewer'),
    'aimed_shot': (2, 0, {'hit'}, 'aimed'),
    'volley': (3, 2, {'hit'}, 'volley'),
    'steady_aim': (1, 3, set(), 'keen'),
    'call_hawk': (2, 4, set(), 'hawk'),
    'snare_trap': (2, 3, {'debuff'}, 'snare'),
    'mockery': (1, 2, {'hit', 'debuff'}, 'taunt'),
    'rousing_chord': (1, 0, set(), 'inspire'),
    'firebolt': (2, 0, {'hit', 'debuff'}, 'hit'),
}
BASE = {'rogue': ['twin_cut', 'deep_cut'], 'warrior': ['lunge', 'pommel_strike'], 'lancer': ['impale'],
        'archer': ['aimed_shot'], 'bard': ['rousing_chord'], 'mage': ['firebolt']}
SUPER = {'assassin': ['mark_for_death'], 'outlaw': ['rob'], 'duelist': [],
         'berserker': ['blood_frenzy'], 'sellsword': ['stance_shift'], 'knight': [],
         'dragoon': ['leap', 'skewer'], 'gladiator': [], 'sentinel': [],
         'marksman': ['volley', 'steady_aim'], 'ranger': ['call_hawk', 'snare_trap'], 'gunner': [],
         'jester': ['mockery'], 'skald': [], 'herald': [],
         'pyromancer': [], 'druid': [], 'priest': []}
WEAPON = {'rogue': 'daggers', 'warrior': 'sword', 'lancer': 'spear', 'archer': 'bow', 'bard': 'lute', 'mage': 'staff'}
DUAL = {'rogue', 'warrior'}

# class-tree effects we model, keyed by node id
NODE_FX = {
    'assassin:contract:2': {'death_sentence': 1}, 'assassin:contract:3': {'crit_inc': 0.10},
    'assassin:shadows:4': {'vanish': 1}, 'assassin:venom:1': {'sp': 0.10}, 'assassin:shadows:3': {'crit_dmg': 0},
    'berserker:fury:2': {'frenzy_ls': 1}, 'berserker:fury:3': {'crit_inc': 0.10},
    'berserker:rampage:1': {'versus': 0.10}, 'berserker:rampage:2': {'onslaught': 1},
    'sellsword:forms:1': {'versus': 0.10}, 'sellsword:forms:2': {'opening_crit': 1},
    'dragoon:spearhead:3': {'bleed_extra': 1}, 'dragoon:spearhead:4': {'deep_impale': 1},
    'dragoon:hunt:3': {'crit_inc': 0.10}, 'dragoon:hunt:4': {'dragonbane': 1},
    'gladiator:bloodsport:1': {'versus': 0.10}, 'gladiator:bloodsport:3': {'bleed_extra': 1},
    'gladiator:showman:3': {'crit_inc': 0.10},
    'ranger:falconry:2': {'talons': 1}, 'ranger:falconry:4': {'bond': 1}, 'ranger:falconry:3': {'crit_inc': 0.05},
    'ranger:traps:2': {'barbed': 1}, 'ranger:traps:3': {'sp': 0.10},
    'marksman:precision:3': {'crit_inc': 0.10}, 'marksman:drill:4': {'barrage': 1},
    'jester:ridicule:2': {'laughing_stock': 1}, 'jester:ridicule:4': {'center_stage': 1},
    'outlaw:dirty:3': {'crit_inc': 0.10},
    'skald:lore:1': {'sp': 0.10}, 'skald:lore:3': {'crit_inc': 0.10},
}
NOTABLE_FX = {
    'Open Wounds': {'bleed_extra': 1}, 'Haemorrhage': {'cap': 2, 'versus': 0.10},
    'Rending': {'rupture_more': 0.15}, 'Impaling Wound': {'impaling': 1},
    'Sharp Focus': {'crit_inc': 0.15}, 'Keen Eye': {'crit_inc': 0.20, 'mark_chance': 0.20},
    'Unseen Blade': {'unseen': 1}, 'Hunter\'s Mark': {'hunters_mark': 1}, 'Sunder Line': {},
    'Keen Senses': {'keen_start': 2}, 'Tailwind': {'haste_start': 1},
    'Windborne': {'windborne': 1}, 'Blood Rite': {'blood_rite': 1}, 'Glass Edge': {'crit_more': 1.5},
    'Impaler': {'impaler': 1}, 'Red Harvest': {}, 'Second Breath': {},
}
GEM_SETS = [(), ('Nova',), ('Contagion',), ('Echo',), ('Nova', 'Echo'), ('Contagion', 'Echo'),
            ('Nova', 'Contagion'), ('Nova', 'Contagion', 'Echo')]


# ---------------------------------------------------------------- data
def load():
    items = json.loads((ROOT / 'data' / 'items.json').read_text())
    classes = json.loads((ROOT / 'data' / 'classes.json').read_text())['classes']
    return items, classes


def item_fx(it):
    """Turn an item's powers and max-rolled base stats into simulator effects."""
    fx = {}
    add = lambda k, v: fx.__setitem__(k, fx.get(k, 0) + v)
    for b in it.get('base', []):
        if b[0] == 'StatusPower': add('sp', b[2])
        if b[0] == 'CritInc': add('crit_inc', b[2])
        if b[0] == 'Lifesteal': add('lifesteal', b[2])
    for p in it.get('power', []):
        k = p[0]
        if k == 'hit' and p[1] in ('Bleed', 'Sunder', 'Vulnerable', 'Marked'):
            fx.setdefault('on_hit', []).append((p[1], p[2], p[3]))
        elif k == 'amp' and p[1] == 'Bleed': add('bleed_extra', p[2])
        elif k == 'cap' and p[1] == 'Bleed': add('cap', p[2])
        elif k == 'versus' and p[1] in ('Bleed', 'Vulnerable', 'Sunder'): add('versus', p[2])
        elif k == 'react' and p[1] == 'Rupture': add('react', p[2])
        elif k == 'crit' and p[1] in ('Vulnerable', 'Sunder', 'Marked'): fx.setdefault('on_crit', []).append((p[1], p[2]))
        elif k == 'rider' and 'Bleed' in (p[1], p[2]): fx.setdefault('rider', []).append((p[1], p[2], p[3]))
        elif k == 'spread' and p[1] == 'Bleed': fx['spread_bleed'] = 1
        elif k in ('opening', 'takedown') and p[1] in ('Haste', 'Hidden', 'Keen'):
            add(f'{k}_{p[1].lower()}', p[2])
    return fx


def valid_gems(sk):
    tags = SKILLS[sk][2]
    ok = lambda gs: ('Nova' not in gs or 'hit' in tags) and ('Contagion' not in gs or 'debuff' in tags)
    return [g for g in GEM_SETS if ok(g)]


def merge(*fxs):
    out = {}
    for fx in fxs:
        for k, v in fx.items():
            if isinstance(v, list): out.setdefault(k, []).extend(v)
            elif k == 'crit_more': out[k] = out.get(k, 1) * v
            else: out[k] = out.get(k, 0) + v
    return out


# ---------------------------------------------------------------- fight
class Fight:
    def __init__(self, b, n_enemies, rng):
        self.b, self.r = b, rng
        self.fx = b['fx']
        f = self.fx
        self.cap = 10 + f.get('cap', 0)
        self.sp = 1 + f.get('sp', 0)
        self.unit = U * LS * self.sp
        self.rup_mult = 1.25 * (1 + f.get('rupture_more', 0)) * (1 + f.get('react', 0)) * (1 + f.get('versus', 0))
        if f.get('impaler'):
            self.rup_mult *= 1.3 if n_enemies == 1 else 0.6
        self.en = [dict(hp=(HP if n_enemies > 1 else BOSS_HP), bleed=0, vuln=0, sunder=0, marked=0, taunt=0) for _ in range(n_enemies)]
        self.heal = 0.0
        self.energy = 1 + b.get('start_energy', 0)
        self.max_energy = 6 + b.get('max_energy', 0)
        self.cd = {}
        self.hidden = f.get('opening_hidden', 0)
        self.haste = f.get('opening_haste', 0) + f.get('haste_start', 0)
        self.keen = f.get('keen_start', 0) + f.get('opening_keen', 0)
        self.frenzy = 0
        self.hawk = 0
        self.opening = 0
        self.echo = []
        self.dmg = 0
        self.pops = []
        self.aoe_now = False
        if f.get('hunters_mark'):
            self.en[0]['marked'] = 3

    alive = property(lambda s: [e for e in s.en if e['hp'] > 0])

    # --- status application
    def add_bleed(self, e, n, spread=False, from_rider=False):
        """Riders and spreads fire once: an effect caused by a rider never starts another one."""
        if e['hp'] <= 0 or n <= 0: return
        targets = self.alive if (not from_rider and not self.aoe_now and (spread or self.fx.get('spread_bleed'))) else [e]
        for t in targets:
            t['bleed'] = min(self.cap, t['bleed'] + n + self.fx.get('bleed_extra', 0))
            if from_rider: continue
            for a, bb, m in self.fx.get('rider', []):
                if a == 'Bleed' and bb in ('Vulnerable', 'Sunder'):
                    self.pop(t, vuln=(bb == 'Vulnerable'))

    def pop(self, e, vuln=True):
        if e['hp'] <= 0: return
        if vuln: e['vuln'] = max(e['vuln'], 1)
        n = e['bleed']
        if n <= 0: return
        d = self.rup_mult * n * (n + 3) / 2 * self.unit * (1.25 if e['vuln'] else 1)
        self.deal(e, d)
        if self.fx.get('blood_rite'): self.heal += 0.25 * d
        self.pops.append(n)
        e['bleed'] = 0

    def give_vuln(self, e, turns):
        if e['hp'] <= 0: return
        self.pop(e, vuln=True)
        e['vuln'] = max(e['vuln'], turns)
        for a, bb, m in self.fx.get('rider', []):
            if a == 'Vulnerable' and bb == 'Bleed':
                self.add_bleed(e, m, from_rider=True)

    def give_sunder(self, e, turns):
        if e['hp'] <= 0: return
        e['sunder'] = max(e['sunder'], turns)
        self.pop(e, vuln=False)

    def deal(self, e, d):
        e['hp'] -= d
        self.dmg += d
        if e['hp'] <= 0:
            self.killed = True
            self.heal += 0.08 * MAX_HP

    # --- hits
    def crit_chance(self, e):
        f = self.fx
        if self.hidden and f.get('unseen'): return 1.0
        if self.opening: return 1.0
        c = (0.05 + 0.0005 * self.b.get('agility', 60)) * (1 + f.get('crit_inc', 0)) * f.get('crit_more', 1)
        if self.keen: c *= 1.3
        if e['marked']: c *= 1.25
        return min(1.0, c)

    def hit(self, e, statuses=(), spread=False):
        if e['hp'] <= 0: return
        f, r = self.fx, self.r
        for kind, n, p in statuses:
            if r.random() < p:
                if kind == 'Bleed': self.add_bleed(e, n, spread)
        for kind, n, p in f.get('on_hit', []):
            if r.random() < p:
                if kind == 'Bleed': self.add_bleed(e, n)
                elif kind == 'Sunder': self.give_sunder(e, n)
                elif kind == 'Vulnerable': self.give_vuln(e, n)
                elif kind == 'Marked': e['marked'] = max(e['marked'], n)
        if f.get('mark_chance') and r.random() < f['mark_chance']:
            e['marked'] = max(e['marked'], 2)
        crit = r.random() < self.crit_chance(e)
        dmg = HIT * (1.72 if crit else 1) * (1.25 if e['vuln'] else 1)
        self.deal(e, dmg)
        self.heal += dmg * (f.get('lifesteal', 0) + (0.15 if self.frenzy and f.get('frenzy_ls') else 0))
        if crit:
            if f.get('impaling'): self.add_bleed(e, 1)
            for kind, n in f.get('on_crit', []):
                if kind == 'Vulnerable': self.give_vuln(e, n)
                elif kind == 'Sunder': self.give_sunder(e, n)
                elif kind == 'Marked': e['marked'] = max(e['marked'], n)
            self.opening = 0

    # --- actions
    def targets(self, aoe):
        al = self.alive
        if aoe: return al
        return [max(al, key=lambda e: (e['bleed'], -e['hp']))]

    def use(self, sk, free=False):
        b, f = self.b, self.fx
        cost, cool, tags, eff = SKILLS[sk]
        gems = b['gems'].get(sk, ())
        nova = 'Nova' in gems and 'hit' in tags
        cont = 'Contagion' in gems and 'debuff' in tags
        if not free:
            cost += 1 if nova else 0
            self.energy -= cost
            self.cd[sk] = cool + (1 if 'Echo' in gems else 0)
            if 'Echo' in gems: self.echo.append(sk)
        aoe = nova or (eff in ('volley',)) or (eff == 'taunt' and f.get('center_stage'))
        tg = self.targets(aoe)
        self.aoe_now = aoe and len(self.alive) > 1
        if eff == 'twin':
            for e in tg:
                for _ in range(2): self.hit(e, [('Bleed', 1, 0.5)], spread=cont)
        elif eff == 'double':
            for e in tg:
                self.hit(e)
                if e['bleed'] < 10: e['bleed'] = min(10, e['bleed'] * 2)
        elif eff == 'mark':
            for e in (self.alive if cont else tg):
                e['marked'] = 3
                if f.get('death_sentence'): self.give_vuln(e, 2)
            self.hidden = 1
        elif eff == 'rob':
            for e in tg:
                for _ in range(2): self.hit(e)
            self.haste = max(self.haste, 1)
        elif eff == 'vuln2':
            for e in tg:
                self.hit(e); self.give_vuln(e, 2)
        elif eff == 'pommel':
            for e in tg:
                self.hit(e)
                if e['vuln']: e['vuln'] = 0
                else: self.give_vuln(e, 1)
        elif eff == 'frenzy':
            self.frenzy = 3
        elif eff == 'stance':
            if f.get('opening_crit'): self.opening = 1
            self.energy = min(self.max_energy, self.energy + 1)
        elif eff == 'sunder2':
            extra = 1 if f.get('deep_impale') and not aoe else 0
            al = self.alive
            for e in tg + [x for x in al if x not in tg][:extra]:
                self.hit(e); self.give_sunder(e, 2)
        elif eff == 'leap':
            al = self.alive
            for e in (tg + [x for x in al if x not in tg][:1]):
                self.hit(e); self.give_sunder(e, 1)
        elif eff == 'skewer':
            for e in (self.alive if cont else tg):
                self.hit(e) if e in tg else None
                self.add_bleed(e, 3)
                if f.get('dragonbane'): self.give_vuln(e, 2)
        elif eff == 'aimed':
            for e in tg:
                saved = self.keen; self.keen = 1
                self.hit(e); self.keen = saved
        elif eff == 'volley':
            for e in tg: self.hit(e)
        elif eff == 'keen':
            self.keen = 2
        elif eff == 'hawk':
            self.hawk = 99
        elif eff == 'snare':
            for e in tg:
                if f.get('barbed'): self.add_bleed(e, 3, spread=cont)
        elif eff == 'taunt':
            for e in tg:
                self.hit(e); e['taunt'] = 1
                if f.get('laughing_stock'): self.give_vuln(e, 2)
        elif eff in ('inspire',):
            if f.get('kindred'): self.keen = 1
        elif eff == 'hit':
            for e in tg: self.hit(e)

    def attack(self):
        hits = 2 if (self.haste or self.fx.get('windborne')) else 1
        tg = self.alive if self.frenzy else self.targets(False)
        self.aoe_now = bool(self.frenzy) and len(tg) > 1
        for _ in range(hits):
            for e in tg: self.hit(e)
        self.hidden = 0

    def can(self, sk):
        cost = SKILLS[sk][0] + (1 if 'Nova' in self.b['gems'].get(sk, ()) and 'hit' in SKILLS[sk][2] else 0)
        return self.cd.get(sk, 0) <= 0 and self.energy >= cost

    # --- policy: setup buffs, pop when stacks are high, otherwise stack
    def act(self):
        sk = self.b['skills']
        al = self.alive
        avg = sum(e['bleed'] for e in al) / len(al)
        for s in ('blood_frenzy', 'call_hawk', 'steady_aim', 'stance_shift'):
            if s in sk and self.can(s) and not (s == 'blood_frenzy' and self.frenzy) and not (s == 'call_hawk' and self.hawk):
                self.use(s)
                if s != 'stance_shift': return
        triggers = [s for s in ('mark_for_death', 'lunge', 'impale', 'pommel_strike', 'leap', 'mockery') if s in sk]
        if avg >= max(3, self.cap - 3):
            for s in triggers:
                if self.can(s): self.use(s); return
        for s in ('skewer', 'snare_trap', 'twin_cut', 'deep_cut', 'volley', 'aimed_shot', 'rob', 'firebolt'):
            if s in sk and self.can(s):
                if s == 'deep_cut' and not any(0 < e['bleed'] < 10 for e in al): continue
                self.use(s); return
        if self.energy <= 1 and any(SKILLS[s][0] >= 2 for s in sk) and not self.fx.get('windborne') and not self.frenzy:
            self.energy = min(self.max_energy, self.energy + 2); return
        self.attack()

    def run(self):
        turns = 0
        while self.alive and turns < MAX_TURNS:
            turns += 1
            for s in self.echo:
                if self.alive: self.use(s, free=True)
            self.echo = []
            if not self.alive: break
            self.killed = False
            self.act()
            self.aoe_now = False
            if self.killed and self.fx.get('onslaught') and self.alive: self.act()
            if self.hawk:
                for _ in range(2 if self.fx.get('bond') else 1):
                    if not self.alive: break
                    e = self.targets(False)[0]
                    self.hit(e, [('Bleed', 1, 0.5)])
                    if self.fx.get('talons'): self.give_vuln(e, 1)
            # enemies act: Bleed ticks, then statuses wear off
            for e in self.alive:
                if e['bleed']:
                    tick = (1 + e['bleed']) * self.unit * (1.25 if e['vuln'] else 1)
                    self.deal(e, tick)
                    if self.fx.get('blood_rite'): self.heal += 0.25 * tick
                    e['bleed'] -= 1
                for k in ('vuln', 'sunder', 'marked', 'taunt'):
                    e[k] = max(0, e[k] - 1)
            self.energy = min(self.max_energy, self.energy + 1)
            for k in list(self.cd): self.cd[k] -= 1
            self.haste = max(0, self.haste - 1); self.keen = max(0, self.keen - 1)
            self.frenzy = max(0, self.frenzy - 1)
        self.turns = turns
        return turns


def score(b, n_enemies, runs=RUNS, seed=0):
    """Average turns to win, average Rupture size, and healing per turn as a share of max HP."""
    rng = random.Random(seed)
    tot, pops, heal = 0, [], 0.0
    for _ in range(runs):
        f = Fight(b, n_enemies, rng)
        t = f.run()
        tot += t
        pops += f.pops
        heal += f.heal / max(1, t) / MAX_HP
    return tot / runs, (sum(pops) / len(pops) if pops else 0), heal / runs


# ---------------------------------------------------------------- search space
class Space:
    def __init__(self, cid, items, classes):
        self.cid = cid
        cls = next(c for c in classes if c['id'] == cid)
        modelled = lambda sid: SUPER.get(sid) or any(k.startswith(sid + ':') for k in NODE_FX)
        self.supers = [s['id'] for s in cls['supers'] if modelled(s['id'])] or [s['id'] for s in cls['supers']]
        self.branches = {s['id']: [[n['id'] for n in br['nodes']] for br in s['branches']] for s in cls['supers']}
        w = WEAPON[cid]
        rel = lambda it: bool(item_fx(it))
        self.weapons = [it for it in items if it.get('weapon') == w and rel(it)] or [it for it in items if it.get('weapon') == w][:3]
        self.slots = {}
        for slot in ('head', 'torso', 'feet', 'amulet', 'ring', 'offhand'):
            cands = [it for it in items if it['kind'] == slot and rel(it)]
            if slot == 'offhand' and cid != 'archer': cands = []
            self.slots[slot] = cands
        self.nodes, adj = load_tree()
        self.adj = adj
        byname = {n['n']: i for i, n in self.nodes.items() if n.get('n') and n['k'] != 'start'}
        self.byname = byname
        self.gates = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']
        self.term_dist = {}
        for t in NOTABLES + KEYSTONES + SURVIVAL + self.gates:
            src = byname.get(t, t)
            self.term_dist[t] = bfs(adj, {src})
        self.cost_cache = {}

    def path_cost(self, names):
        """Cheapest gate + metric-closure MST over the chosen notables (fast Steiner estimate)."""
        key = frozenset(names)
        if key in self.cost_cache: return self.cost_cache[key]
        best = None
        for g in self.gates:
            pts = [g] + list(names)
            ids = {p: self.byname.get(p, p) for p in pts}
            inside, cost = {g}, 0
            left = set(names)
            while left:
                c, nxt = min((self.term_dist[a][0].get(ids[bb], 999), bb) for a in inside for bb in left)
                cost += c; inside.add(nxt); left.discard(nxt)
            if best is None or cost < best[0]: best = (cost, g)
        self.cost_cache[key] = best
        return best

    def random_build(self, rng):
        b = dict(super=rng.choice(self.supers), branches=tuple(sorted(rng.sample(range(3), 2))),
                 notables=frozenset(rng.sample(NOTABLES, rng.randint(2, 6)) + rng.sample(KEYSTONES, rng.randint(0, 2))),
                 stat=rng.choice(['Spirit', 'Agility']))
        b['weapon'] = rng.choice(self.weapons)['name']
        b['offweapon'] = rng.choice([w['name'] for w in self.weapons if w['name'] != b['weapon']] or [None]) if self.cid in DUAL else None
        for s in ('head', 'torso', 'feet', 'amulet', 'offhand'):
            b[s] = rng.choice(self.slots[s])['name'] if self.slots[s] else None
        rings = rng.sample(self.slots['ring'], 2)
        b['ring1'], b['ring2'] = rings[0]['name'], rings[1]['name']
        b['gems'] = {}
        return b

    def mutate(self, b, rng):
        b = dict(b); b['gems'] = dict(b['gems'])
        k = rng.choice(['super', 'branches', 'notable', 'notable', 'stat', 'weapon', 'gear', 'gear', 'gems', 'gems'])
        if k == 'super': b['super'] = rng.choice(self.supers); b['gems'] = {}
        elif k == 'branches': b['branches'] = tuple(sorted(rng.sample(range(3), 2)))
        elif k == 'notable':
            n = set(b['notables']); pick = rng.choice(NOTABLES + KEYSTONES)
            n.symmetric_difference_update({pick}); b['notables'] = frozenset(n)
        elif k == 'stat': b['stat'] = 'Agility' if b['stat'] == 'Spirit' else 'Spirit'
        elif k == 'weapon':
            if self.cid in DUAL and rng.random() < 0.5:
                b['offweapon'] = rng.choice([w['name'] for w in self.weapons if w['name'] != b['weapon']] or [None])
            else:
                b['weapon'] = rng.choice(self.weapons)['name']
                if b.get('offweapon') == b['weapon']: b['offweapon'] = None
        elif k == 'gear':
            s = rng.choice([x for x in ('head', 'torso', 'feet', 'amulet', 'ring1', 'ring2', 'offhand') if self.slots.get(x.rstrip('12'), [])])
            pool = self.slots[s.rstrip('12')]
            other = {'ring1': b['ring2'], 'ring2': b['ring1']}.get(s)
            b[s] = rng.choice([x for x in pool if x['name'] != other])['name']
        elif k == 'gems':
            sk = rng.choice(self.skills(b)) if self.skills(b) else None
            if sk: b['gems'][sk] = rng.choice(valid_gems(sk))
        return b

    def skills(self, b):
        return BASE[self.cid] + SUPER.get(b['super'], [])

    def realise(self, b, items_by_name):
        """Resolve a build description into simulator inputs, or None if illegal."""
        names = list(b['notables']) + SURVIVAL
        cost, gate = self.path_cost(names)
        if cost > 60: return None
        path_stats = max(0, int(cost * 0.45))             # about 45% of path nodes are stat nodes
        stat_nodes = path_stats + (60 - cost)
        nodes = [n for i in b['branches'] for n in self.branches[b['super']][i]]
        fx = merge(*[NOTABLE_FX[n] for n in names], *[NODE_FX.get(n, {}) for n in nodes],
                   *[item_fx(items_by_name[x]) for x in (b['weapon'], b.get('offweapon'), b['head'], b['torso'],
                                                          b['feet'], b['amulet'], b['ring1'], b['ring2'], b.get('offhand')) if x])
        if b['stat'] == 'Spirit': fx['sp'] = fx.get('sp', 0) + 0.02 * stat_nodes
        agility = 60 + (2 * stat_nodes if b['stat'] == 'Agility' else 0)
        spirit = 2 * stat_nodes if b['stat'] == 'Spirit' else 0
        lifesteal_ok = fx.get('blood_rite') or fx.get('lifesteal', 0) >= 0.08
        return dict(fx=fx, skills=self.skills(b), gems=b['gems'], agility=agility,
                    max_energy=spirit // 20, start_energy=0, gate=gate, cost=cost, survive=lifesteal_ok)


def evaluate(args):
    cid, b, n_enemies = args[:3]
    runs = args[3] if len(args) > 3 else RUNS
    sp = SPACES[cid]
    r = sp.realise(b, ITEMS_BY_NAME)
    if r is None: return 999, 0, 0, 999
    t, avg_pop, sus = score(r, n_enemies, runs)
    fitness = t + max(0.0, SUSTAIN_GOAL - sus) * 40     # every 1% of max HP/turn short costs 0.4 turns
    return fitness, avg_pop, sus, t


SPACES, ITEMS_BY_NAME = {}, {}


def init_worker():
    items, classes = load()
    ITEMS_BY_NAME.update({i['name']: i for i in items})
    for cid in WEAPON: SPACES[cid] = Space(cid, items, classes)


def search(cid, n_enemies, pool, rounds=30, pop_size=40, seeds=(1, 2)):
    sp = SPACES[cid]
    finalists = []
    for seed in seeds:
        rng = random.Random(seed * 100 + n_enemies)
        popu = [sp.random_build(rng) for _ in range(pop_size * 3)]
        best = []
        for r in range(rounds):
            scores = pool.map(evaluate, [(cid, b, n_enemies) for b in popu])
            ranked = sorted(zip(scores, range(len(popu))), key=lambda x: x[0][0])
            best = [(s, popu[i]) for s, i in ranked[:pop_size // 2]]
            popu = [b for _, b in best] + [sp.mutate(rng.choice(best)[1], rng) for _ in range(pop_size * 2)]
        print(f'  {cid} vs {n_enemies} seed {seed}: best {best[0][0][0]:.2f}', file=sys.stderr, flush=True)
        finalists += [b for _, b in best[:5]]
    final = pool.map(evaluate, [(cid, b, n_enemies, 300) for b in finalists])
    s, b = min(zip(final, finalists), key=lambda x: x[0][0])
    return s, b


def describe(cid, b, s):
    sp = SPACES[cid]
    r = sp.realise(b, ITEMS_BY_NAME)
    return dict(turns=round(s[3], 2), fitness=round(s[0], 2), sustain=round(s[2] * 100, 1), avg_pop_stacks=round(s[1], 1), super=b['super'],
                branches=[sp.branches[b['super']][i][0].split(':')[1] for i in b['branches']],
                notables=sorted(b['notables']), stat=b['stat'], gate=r['gate'], tree_cost=r['cost'],
                weapon=b['weapon'], offweapon=b.get('offweapon'), head=b['head'], torso=b['torso'], feet=b['feet'],
                amulet=b['amulet'], rings=[b['ring1'], b['ring2']], offhand=b.get('offhand'),
                gems={k: list(v) for k, v in b['gems'].items() if v}, lifesteal_ok=bool(r['survive']),
                status_power=round(r['fx'].get('sp', 0), 2), bleed_cap=10 + r['fx'].get('cap', 0))


def main():
    init_worker()
    which = sys.argv[1:] or list(WEAPON)
    out = {}
    with mp.Pool(16, initializer=init_worker) as pool:
        for cid in which:
            out[cid] = {}
            for label, n in (('room', 4), ('boss', 1)):
                sc, b = search(cid, n, pool)
                out[cid][label] = describe(cid, b, sc)
                print(cid, label, json.dumps(out[cid][label]), flush=True)
    p = ROOT / 'data' / 'sim.json'
    old = json.loads(p.read_text()) if p.exists() else {}
    old.update(out)
    p.write_text(json.dumps(old, indent=1))


if __name__ == '__main__':
    main()
