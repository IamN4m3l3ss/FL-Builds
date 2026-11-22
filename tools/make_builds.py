#!/usr/bin/env python3
"""Generate every build page's JSON, the class index and the tier list.

    python3 tools/sim.py            # 1. search (writes data/sim.json)
    python3 tools/make_builds.py    # 2. turn the winners into build pages

Bleed classes (simulated) get their build from data/sim.json: the best tower-room build is the
page, the best boss build is shown alongside. Classes the simulator cannot score yet keep the
hand-made builds in HAND below.
"""
import json
from pathlib import Path

from planner import plan, load_tree
from sim import BASE, SUPER

ROOT = Path(__file__).resolve().parent.parent
GATES = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']
SNAPSHOT = '2026-11-22'
HEAL = [('heal you for 2%', 4), ('max hp', 2), ('healing received', 1)]
BLEED_SCORE = [('status power', 5), ('bleed', 4), ('rupture', 4), ('crit chance', 3)] + HEAL
PRIORITY = ['Open Wounds', 'Haemorrhage', 'Rending', 'Impaling Wound', 'Windborne', 'Unseen Blade', 'Blood Rite',
            'Glass Edge', 'Impaler', 'Sharp Focus', 'Keen Eye', 'Hunter\'s Mark', 'Keen Senses', 'Tailwind',
            'Sunder Line', 'Red Harvest', 'Second Breath']
NAMES = {'rogue': 'Bloodletter', 'warrior': 'Bloodstorm', 'lancer': 'Skewer', 'archer': 'Barbed'}

TIERS = [
    ('S', [('Ranger', 'Archer', 'Proven to floor 35. The hawk keeps hitting, stacking Bleed and healing you through lifesteal.'),
           ('Dragoon', 'Lancer', 'Fastest simulated tower room: Sunder pops Rupture on every enemy, Spearhead stacks extra Bleed.'),
           ('Berserker', 'Warrior', 'Attacks hit every enemy while Frenzied, with lifesteal. Best tower sustain.'),
           ('Sellsword', 'Warrior', 'Fastest simulated boss kill: a sure crit every turn sets off Rupture.'),
           ('Pyromancer', 'Mage', 'Burn on every enemy every turn, then Detonate. Not simulated yet.')]),
    ('A', [('Assassin', 'Rogue', 'Best at stacking Bleed. Hidden plus Unseen Blade gives sure crits.'),
           ('Marksman', 'Archer', 'Volley hits every enemy every turn. Not simulated for hit damage yet.'),
           ('Zealot', 'Priest ultra', 'Level 40+. Area Brand, extra actions and a self-healing ultra.'),
           ('Seraph', 'Priest ultra', 'Level 40+. Area damage plus full-party heals and revives.')]),
    ('B', [('Gladiator', 'Lancer', 'Bloodsport adds Bleed, Favor adds crits. One target at a time.'),
           ('Outlaw', 'Rogue', 'Rob gives Haste. Works with Bleed but lacks a Rupture trigger.'),
           ('Gunner', 'Archer', 'Scattershot Burns every enemy. Costs HP.'),
           ('Jester', 'Bard', 'Mockery hits every enemy and makes them Vulnerable. Low damage alone.'),
           ('Skald', 'Bard', 'Strong party buffs (Keen, Haste). Little damage alone.'),
           ('Oracle', 'Priest ultra', 'Undoes damage and revives. Support first.')]),
    ('C', [('Duelist', 'Rogue', 'Strong one-on-one, poor against groups.'),
           ('Druid', 'Mage', 'Single-target Poison and Regen.'),
           ('Priest', 'Mage', 'Healer. Take it to reach the ultra classes at level 40.'),
           ('Knight', 'Warrior', 'Protects allies.'),
           ('Herald', 'Bard', 'Gives allies extra actions.'),
           ('Sentinel', 'Lancer', 'Defensive support.')]),
]
TIER_OF = {n: t for t, es in TIERS for n, _, _ in es}

SETUP = {'blood_frenzy': 'For 3 turns your Attack hits every enemy, with +15% lifesteal.',
         'call_hawk': 'The hawk hits after each of your turns and can Bleed.',
         'steady_aim': 'Keen for 2 turns.', 'stance_shift': 'Opening: your next hit is a sure crit.'}
STACK = {'twin_cut': 'Two hits that can Bleed {t}.', 'deep_cut': 'Doubles the Bleed on {t}, up to 10.',
         'skewer': 'Puts 3 Bleed on {t}.', 'snare_trap': 'Barbed puts 3 Bleed on {t}.',
         'aimed_shot': 'A likely crit that adds Bleed through Impaling Wound.', 'rob': 'Two hits and Haste.',
         'volley': 'Hits every enemy.'}
POP = {'mark_for_death': 'Death Sentence puts Vulnerable on {t}, so it Ruptures. You become Hidden.',
       'lunge': 'Vulnerable on {t}, so it Ruptures.', 'pommel_strike': 'Vulnerable on {t}, so it Ruptures.',
       'impale': 'Sunder on {t}, so it Ruptures.', 'leap': 'Sunder on two enemies, so they Rupture.',
       'mockery': 'Taunt plus Laughing Stock: Vulnerable, so it Ruptures.'}
HIT_SKILLS = {'twin_cut', 'deep_cut', 'lunge', 'pommel_strike', 'impale', 'leap', 'skewer', 'aimed_shot', 'volley', 'mockery', 'rob', 'firebolt'}
DEBUFF_SKILLS = {'twin_cut', 'deep_cut', 'mark_for_death', 'lunge', 'pommel_strike', 'impale', 'leap', 'skewer', 'snare_trap', 'mockery', 'firebolt'}

HAND = [
    dict(id='pyromancer', name='Everburn Pyromancer', cls='mage', super='pyromancer', weapon='Staff',
         summary='Burn every enemy with Burn that never fades, then Detonate the whole group.',
         targets=['Kindling', 'Scorch', 'Stoked', 'Everlasting Flame', 'Spellweaver', 'Wildfire', 'Overflow', 'Spellfocus', 'Red Harvest', 'Second Breath'],
         score=[('burn', 4), ('fire', 4), ('status power', 4), ('energy', 3), ('skills', 2)] + HEAL,
         avoid=['crit', 'two-handed', 'block', 'chill', 'single-wield'], stat='Magic',
         classTree=['pyromancer:inferno:1', 'pyromancer:inferno:2', 'pyromancer:inferno:3', 'pyromancer:inferno:4',
                    'pyromancer:volatile:1', 'pyromancer:volatile:2', 'pyromancer:volatile:3'],
         gear=[('Weapon', 'Pyre Queen\'s Staff'), ('Head', 'Bloodfever Helm'), ('Torso', 'Stargazer\'s Robe'), ('Feet', 'Astren Shoes'),
               ('Ring', 'Bloodstone Ring'), ('Ring', 'Viper Coil'), ('Amulet', 'Briar Knot')],
         gems=[('Ignite', ['Echo', 'Momentum']), ('Detonate', ['Nova', 'Overload', 'Echo'])],
         rotation=[('Ignite', 'Burn on every enemy. Everlasting Flame means it never wears off.'),
                   ('Fire Wall', 'Every enemy gets Fire Wall for 3 turns.'),
                   ('Ignite again', 'Echo casts it free. Kindling and the staff add stacks.'),
                   ('Detonate', 'Nova uses up every enemy\'s Burn at once.')]),
    dict(id='jester', name='Mocking Jester', cls='bard', super='jester', weapon='Lute',
         summary='Mockery hits every enemy and Taunts them. Taunted enemies also get Vulnerable.',
         targets=['Night Song', 'Kindred Fire', 'Encore', 'Sharp Focus', 'Executioner', 'Hex', 'Spellfocus', 'Red Harvest', 'Second Breath'],
         score=[('shadow', 3), ('crit', 3), ('inspire', 2), ('energy', 2), ('status power', 2)] + HEAL,
         avoid=['fire', 'block', 'two-handed', 'single-wield', 'dual-wield'], stat='Spirit',
         classTree=['jester:ridicule:1', 'jester:ridicule:2', 'jester:ridicule:3', 'jester:ridicule:4',
                    'jester:mayhem:1', 'jester:luck:1', 'jester:luck:2'],
         gear=[('Weapon', 'War Drummer\'s Lute'), ('Head', 'Bloodfever Helm'), ('Torso', 'Stargazer\'s Robe'), ('Feet', 'Huntmaster\'s Boots'),
               ('Ring', 'Bloodstone Ring'), ('Ring', 'Gold Dust Ring'), ('Amulet', 'Hawk-Talon Pendant')],
         gems=[('Mockery', ['Echo', 'Momentum']), ('Bag of Tricks', ['Echo'])],
         rotation=[('Rousing Chord', 'Inspire for you and allies. Kindred Fire adds Keen.'),
                   ('Mockery', 'Hits every enemy, Taunts them, and they get Vulnerable.'),
                   ('Bag of Tricks', 'Random bonus: Haste, Blind, heal, Daze or double damage.')]),
]


def best_path(targets, score, avoid):
    best = None
    for g in GATES:
        try:
            order, goals, cost = plan(g, targets, 60, score, avoid, 3)
        except ValueError:
            continue
        if best is None or cost < best[3]:
            best = (g, order, goals, cost)
    return best


def class_tree(sup, node_ids):
    texts = {n['id']: n for br in sup['branches'] for n in br['nodes']}
    return [{'node': i, 'why': texts[i]['text']} for i in node_ids if i in texts]


def from_sim(cid, cls, sim, skill_names):
    room, boss = sim['room'], sim['boss']
    sup = next(s for s in cls['supers'] if s['id'] == room['super'])
    targets = [n for n in PRIORITY if n in room['notables']] + ['Red Harvest', 'Second Breath']
    g, order, goals, cost = best_path(targets, BLEED_SCORE, ['two-handed', 'fire', 'block', 'ward'])
    nodes = [f'{sup["id"]}:{br}:{i}' for br in room['branches'] for i in range(1, 5)]
    gear = [('Weapon', room['weapon'])]
    if room.get('offweapon'): gear.append(('Off-hand', room['offweapon']))
    if room.get('offhand'): gear.append(('Quiver', room['offhand']))
    gear += [('Head', room['head']), ('Torso', room['torso']), ('Feet', room['feet']), ('Amulet', room['amulet']),
             ('Ring', room['rings'][0]), ('Ring', room['rings'][1])]
    gems = {k: v for k, v in room['gems'].items()}
    kit = BASE[cid] + SUPER.get(sup['id'], [])           # only this class's own skills
    every = lambda s: 'every enemy' if ('Nova' in gems.get(s, []) and s in HIT_SKILLS) or ('Contagion' in gems.get(s, []) and s in DEBUFF_SKILLS) else 'the target'
    rotation = []
    for s in kit:
        if s in SETUP: rotation.append((skill_names[s], SETUP[s]))
    attack = 'Hits twice (Windborne).' if 'Windborne' in room['notables'] else 'Free. Adds Bleed from your weapon.'
    if 'blood_frenzy' in kit: attack = 'Hits every enemy while Frenzied' + (', twice with Windborne.' if 'Windborne' in room['notables'] else '.')
    for s in kit:
        if s in STACK: rotation.append((skill_names[s], STACK[s].format(t=every(s))))
    rotation.append(('Attack', attack))
    for s in kit:
        if s in POP: rotation.append((skill_names[s] + ' to pop', POP[s].format(t=every(s)) + f' Use it once enemies are near {int(room["bleed_cap"]) - 3}+ stacks.'))
    if any('Serpent Coil' == x for _, x in gear):
        rotation.append(('Serpent Coil', 'Every new Bleed also gives Vulnerable, so Bleed pops the moment it lands.'))
    diff = lambda a, b: sorted(set(a) - set(b))
    boss_gear = [boss['weapon'], boss.get('offweapon'), boss['head'], boss['torso'], boss['feet'], boss['amulet']] + boss['rings']
    room_gear = [x for _, x in gear]
    return {
        'id': cid if cid != 'rogue' else 'bloodletter', 'name': f'{NAMES[cid]} {sup["name"]}', 'cls': cid, 'super': sup['id'],
        'class': f'{cls["name"]} → {sup["name"]}', 'weapon': 'Two ' + cls['weapon'].lower() if room.get('offweapon') else cls['weapon'],
        'tier': TIER_OF.get(sup['name'], 'B'), 'snapshot': SNAPSHOT, 'simulated': True,
        'summary': f'Simulated best Bleed build for {cls["name"]}: clears a 4-enemy tower room in {room["turns"]:.1f} turns while healing {"over 100" if room.get("sustain", 0) >= 100 else format(room.get("sustain", 0), ".0f")}% of max HP per turn.',
        'gate': g, 'order': order, 'goals': goals,
        'statPick': {'attr': room['stat'], 'why': 'Every round stat node gives +2 to an attribute you choose. Spirit is +1% status power per point, which scales every Bleed tick and Rupture.'},
        'classTree': class_tree(sup, nodes),
        'gear': [{'slot': s, 'item': i} for s, i in gear if i],
        'gems': [{'skill': skill_names.get(k, k), 'gems': v} for k, v in gems.items() if v],
        'rotation': [{'skill': a, 'text': b} for a, b in rotation],
        'sim': {'room': room['turns'], 'boss': boss['turns'], 'roomPop': room['avg_pop_stacks'], 'bossPop': boss['avg_pop_stacks'],
                'sustain': min(room.get('sustain', 0), 100), 'bossSustain': min(boss.get('sustain', 0), 100),
                'cap': room['bleed_cap'], 'sp': room['status_power'],
                'boss_super': boss['super'], 'boss_add': diff(boss['notables'], room['notables']),
                'boss_drop': diff(room['notables'], boss['notables']),
                'boss_gear': [x for x in boss_gear if x and x not in room_gear]},
    }


def from_hand(h, cls):
    sup = next(s for s in cls['supers'] if s['id'] == h['super'])
    g, order, goals, cost = best_path(h['targets'], h['score'], h['avoid'])
    return {
        'id': h['id'], 'name': h['name'], 'cls': h['cls'], 'super': h['super'], 'class': f'{cls["name"]} → {sup["name"]}',
        'weapon': h['weapon'], 'tier': TIER_OF.get(sup['name'], 'B'), 'snapshot': SNAPSHOT, 'simulated': False, 'summary': h['summary'],
        'gate': g, 'order': order, 'goals': goals,
        'statPick': {'attr': h['stat'], 'why': f'Every round stat node gives +2 to an attribute you choose. {h["stat"]} scales this build\'s main damage.'},
        'classTree': class_tree(sup, h['classTree']),
        'gear': [{'slot': s, 'item': i} for s, i in h['gear']],
        'gems': [{'skill': s, 'gems': gs} for s, gs in h['gems']],
        'rotation': [{'skill': a, 'text': b} for a, b in h['rotation']],
    }


def main():
    classes = json.loads((ROOT / 'data' / 'classes.json').read_text())['classes']
    sim = json.loads((ROOT / 'data' / 'sim.json').read_text())
    skill_names = {}
    for c in classes:
        for s in c['skills']: skill_names[s['id']] = s['name']
        for sp in c['supers']:
            for s in sp['skills']: skill_names[s['id']] = s['name']
    nodes, _ = load_tree()
    builds = []
    for c in classes:
        if c['id'] in NAMES and c['id'] in sim and sim[c['id']]['room']['turns'] < 40:
            builds.append(from_sim(c['id'], c, sim[c['id']], skill_names))
    for h in HAND:
        builds.append(from_hand(h, next(c for c in classes if c['id'] == h['cls'])))
    index = []
    for b in builds:
        stats = sum(1 for i in b['order'] if nodes[i]['k'] == 'stat')
        b['statPick']['why'] += f' This path has {stats} of them, so +{2 * stats} {b["statPick"]["attr"]}.'
        (ROOT / 'builds' / f'{b["id"]}.json').write_text(json.dumps(b, indent=1))
        entry = {k: b[k] for k in ('id', 'name', 'class', 'weapon', 'tier', 'summary', 'simulated')}
        if b.get('sim'): entry['sim'] = {k: b['sim'][k] for k in ('room', 'boss', 'sustain')}
        index.append(entry)
        print(f'{b["id"]:12} {b["class"]:22} gate {b["gate"]} {"sim" if b["simulated"] else "hand"}')
    index.sort(key=lambda x: ({'S': 0, 'A': 1, 'B': 2, 'C': 3}[x['tier']], x.get('sim', {}).get('room', 99)))
    (ROOT / 'builds' / 'index.json').write_text(json.dumps(index, indent=1))
    (ROOT / 'builds' / 'tiers.json').write_text(json.dumps(
        [{'tier': t, 'entries': [{'name': n, 'from': f, 'why': w} for n, f, w in e]} for t, e in TIERS], indent=1))


if __name__ == '__main__':
    main()
