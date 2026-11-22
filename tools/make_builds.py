#!/usr/bin/env python3
"""Generate every build page's JSON and the tier list.

    python3 tools/make_builds.py

Edit the BUILDS / TIERS lists below, then rerun. For each build the passive path is planned
from every gate and the cheapest one is kept. Item and class-tree names are checked against
data/items.json and data/classes.json so typos fail loudly.
"""
import json
from pathlib import Path

from planner import plan, load_tree

ROOT = Path(__file__).resolve().parent.parent
GATES = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']
SNAPSHOT = '2026-11-22'
HEAL = [('heal you for 2%', 4), ('max hp', 2), ('healing received', 1)]

BUILDS = [
    dict(
        id='berserker', name='Bloodstorm Berserker', cls='warrior', super='berserker', weapon='Two swords',
        tier='S', summary='Frenzy Attacks hit every enemy twice, stack Bleed and lifesteal. Lunge pops Rupture on the whole group.',
        targets=['Open Wounds', 'Haemorrhage', 'Windborne', 'Rending', 'Blood Rite', 'Impaling Wound',
                 'Red Harvest', 'Second Breath', 'Sharp Focus', 'Keen Eye'],
        score=[('status power', 5), ('bleed', 4), ('rupture', 4), ('crit chance', 3)] + HEAL,
        avoid=['two-handed', 'fire', 'block', 'ward', 'skills'],
        stat=('Spirit', 'Spirit gives +1% status power per point, and status power makes Bleed and Rupture hit harder.'),
        classTree=[
            ('berserker:fury:1', 'Needed to reach Vampiric Frenzy.'),
            ('berserker:fury:2', '+15% lifesteal while Frenzied, on hits against every enemy.'),
            ('berserker:fury:3', 'Crit chance for Impaling Wound and Maul Band.'),
            ('berserker:fury:4', 'Once a fight you cannot go down while Frenzied.'),
            ('berserker:rampage:1', '10% more damage while dual-wielding.'),
            ('berserker:rampage:2', 'A kill gives you another action.'),
            ('berserker:rampage:3', 'More damage on enemies below 50% HP.'),
            ('berserker:pain:1', 'Max HP.')],
        gear=[
            ('Weapon', 'Packlord\'s Sword', '30% chance on hit to Bleed, +15% damage against Bleeding enemies.', 'Lupine Broadsword'),
            ('Off-hand', 'Bloodfever Blade', 'Lifesteal. Both swords\' powers count when dual-wielding.', 'Ravager\'s Sabre'),
            ('Amulet', 'Maul Band', 'Crits apply Vulnerable, which sets off Rupture.', 'Huntsman\'s Medallion'),
            ('Torso', 'Bloodfever Harness', 'Rupture hits 30% harder.', 'Wyrmtooth Coat'),
            ('Head', 'Bloodfever Helm', 'Lifesteal.', 'Wyrmtooth Helm'),
            ('Ring', 'Bloodstone Ring', 'Lifesteal.', 'Bloodiron Ring'),
            ('Ring', 'Bloodiron Ring', 'Bleed on hit and crit chance.', 'Giant\'s Tooth'),
            ('Feet', 'Astren Shoes', 'Status power.', 'Frostmere Boots')],
        chase=('The Fang', 'Mythic sword: 50% Bleed 2 on hit, +30% against Bleeding, Rupture +20%. Pair it with Gloomthorn.'),
        gems=[
            ('Lunge', ['Nova', 'Echo', 'Momentum'], 'Vulnerable on every enemy, so all of them Rupture. Echo repeats it next turn.'),
            ('Pommel Strike', ['Nova', 'Echo'], 'A second group-wide Vulnerable for when Lunge is on cooldown.')],
        rotation=[
            ('Blood Frenzy', 'Costs 15% HP, no Energy. For 3 turns your Attack hits every enemy, with +15% lifesteal.'),
            ('Attack', 'Windborne makes it hit twice. Every enemy gets Bleed, and you heal from every hit.'),
            ('Lunge', 'Nova puts Vulnerable on every enemy and they all Rupture. Echo does it again next turn.'),
            ('Repeat', 'Frenzy again when it runs out. Kills give extra actions through Onslaught.')]),
    dict(
        id='pyromancer', name='Everburn Pyromancer', cls='mage', super='pyromancer', weapon='Staff',
        tier='S', summary='Burn every enemy with Burn that never fades, then Detonate the whole group.',
        targets=['Kindling', 'Scorch', 'Stoked', 'Everlasting Flame', 'Spellweaver', 'Wildfire', 'Overflow',
                 'Spellfocus', 'Red Harvest', 'Second Breath'],
        score=[('burn', 4), ('fire', 4), ('status power', 4), ('energy', 3), ('skills', 2)] + HEAL,
        avoid=['crit', 'two-handed', 'block', 'chill', 'single-wield'],
        stat=('Magic', 'Magic adds 1% damage per point to Detonate and Firebolt, which cash in your Burn.'),
        classTree=[
            ('pyromancer:inferno:1', '+10% fire damage.'),
            ('pyromancer:inferno:2', 'Kindling: every Burn you apply gets 1 extra stack.'),
            ('pyromancer:inferno:3', 'Burn cap 15 instead of 10.'),
            ('pyromancer:inferno:4', 'When a burning enemy dies, its Burn goes to every other enemy.'),
            ('pyromancer:volatile:1', 'More damage against Burning enemies.'),
            ('pyromancer:volatile:2', 'Detonate is ready again whenever it kills.'),
            ('pyromancer:volatile:3', '+1 Energy at the start of each fight.')],
        gear=[
            ('Weapon', 'Pyre Queen\'s Staff', 'Every Burn you apply gets 2 extra stacks, plus status power.', 'Cinder Staff'),
            ('Head', 'Bloodfever Helm', 'Lifesteal.', 'Sentinel\'s Sallet'),
            ('Torso', 'Stargazer\'s Robe', 'Ward and status power.', 'Herald\'s Tabard'),
            ('Feet', 'Astren Shoes', 'Status power.', 'Frostmere Boots'),
            ('Ring', 'Bloodstone Ring', 'Lifesteal.', 'Viper Coil'),
            ('Ring', 'Viper Coil', 'Status power.', 'Dula\'s Ring'),
            ('Amulet', 'Briar Knot', 'Max HP and status power.', 'Hexstone Charm')],
        chase=('Nightglass Staff', 'Mythic staff: +2 max Energy, Energy on Focus and on kills, cheaper skills.'),
        gems=[
            ('Ignite', ['Echo', 'Momentum'], 'Burn on every enemy, and again for free next turn.'),
            ('Detonate', ['Nova', 'Overload', 'Echo'], 'Detonates every enemy\'s Burn at once. Overload spends spare Energy for more Power.')],
        rotation=[
            ('Ignite', 'Burn on every enemy. Everlasting Flame means it never wears off.'),
            ('Fire Wall', 'Every enemy gets Fire Wall for 3 turns.'),
            ('Ignite (Echo)', 'Echo casts it again for free. Kindling and the staff add stacks each time.'),
            ('Detonate', 'Nova hits every enemy and uses up all their Burn. Kills spread Burn and reset Detonate.')]),
    dict(
        id='marksman', name='Barrage Marksman', cls='archer', super='marksman', weapon='Bow and quiver',
        tier='S', summary='Volley hits every enemy every turn with no cooldown. Steady Aim makes Aimed Shot a sure crit.',
        targets=['Sharp Focus', 'Keen Eye', 'Glass Edge', 'Heartseeker', 'Hunter\'s Mark', 'Spellweaver', 'Overflow',
                 'Spellfocus', 'Red Harvest', 'Second Breath'],
        score=[('crit', 3), ('energy', 3), ('two-handed', 2), ('skills', 2), ('marked', 1)] + HEAL,
        avoid=['fire', 'block', 'ward', 'single-wield', 'dual-wield'],
        stat=('Agility', 'Agility adds 1% damage per point to Volley and Aimed Shot, and +0.05% crit chance.'),
        classTree=[
            ('marksman:drill:1', '+10% Volley damage.'),
            ('marksman:drill:2', 'Volley also Slows every enemy.'),
            ('marksman:drill:3', 'Crit damage.'),
            ('marksman:drill:4', 'Barrage: Volley has no cooldown.'),
            ('marksman:precision:1', 'Crit damage.'),
            ('marksman:precision:2', 'Your crits ignore Armor.'),
            ('marksman:precision:3', 'Crit chance.'),
            ('marksman:precision:4', 'After Steady Aim, Aimed Shot always crits and deals 30% more.')],
        gear=[
            ('Weapon', 'Sylvan King\'s Longbow', '32-48% crit chance and crit damage.', 'Hawkeye Longbow'),
            ('Off-hand', 'Tracker\'s Quiver', 'Crit chance. A quiver makes the bow count as Two-Handed.', 'Broadhead Quiver'),
            ('Head', 'Bloodfever Helm', 'Lifesteal.', 'Hawkeye Cowl'),
            ('Torso', 'Hawk Rider\'s Coat', 'Crit chance and more damage on low-HP enemies.', 'Huntmaster\'s Coat'),
            ('Feet', 'Huntmaster\'s Boots', 'Crit damage, and Keen on kills.', 'Gloaming Boots'),
            ('Ring', 'Bloodstone Ring', 'Lifesteal.', 'Thumbguard Ring'),
            ('Ring', 'Quickdraw Ring', 'Crit chance, and crits give Energy for more Volleys.', 'Gold Dust Ring'),
            ('Amulet', 'Hawk-Talon Pendant', 'Max HP and crit chance.', 'Huntsman\'s Medallion')],
        chase=('Antler Bow', 'Mythic bow: big crit chance and crit damage, crits Mark, Keen on kills.'),
        gems=[
            ('Volley', ['Overload', 'Momentum', 'Echo'], 'Spends spare Energy for more Power, kills give another action, and it fires again next turn.'),
            ('Aimed Shot', ['Charge', 'Overload'], '170% Power on the sure crit after Steady Aim.')],
        rotation=[
            ('Steady Aim', 'Keen for 2 turns and Steady. The next Aimed Shot always crits.'),
            ('Volley', 'Hits every enemy. Barrage means you can fire it every turn.'),
            ('Aimed Shot', 'Sure crit with 30% more damage. Save it for the enemy with the most HP.'),
            ('Focus', 'When Energy runs low. Overflow and Spellfocus keep you topped up.')]),
    dict(
        id='dragoon', name='Skewer Dragoon', cls='lancer', super='dragoon', weapon='Spear',
        tier='A', summary='Skewer spreads Bleed to every enemy, then Impale Sunders them all and they Rupture.',
        targets=['Open Wounds', 'Haemorrhage', 'Rending', 'Sunder Line', 'Blood Rite', 'Impaling Wound',
                 'Piercing Thrust', 'Red Harvest', 'Second Breath'],
        score=[('status power', 5), ('bleed', 4), ('rupture', 4), ('sunder', 3), ('two-handed', 2)] + HEAL,
        avoid=['fire', 'block', 'ward', 'single-wield', 'dual-wield'],
        stat=('Spirit', 'Spirit gives +1% status power per point, and status power makes Bleed and Rupture hit harder.'),
        classTree=[
            ('dragoon:spearhead:1', 'The enemy behind takes more damage.'),
            ('dragoon:spearhead:2', 'The enemy behind takes full damage.'),
            ('dragoon:spearhead:3', 'Every Bleed you apply gets 1 extra stack.'),
            ('dragoon:spearhead:4', 'Impale also hits the enemy behind.'),
            ('dragoon:hunt:1', 'More damage against beasts and bosses.'),
            ('dragoon:hunt:2', 'Skewer ignores half of Armor.'),
            ('dragoon:hunt:3', 'Crit chance.'),
            ('dragoon:hunt:4', 'Skewer also gives Vulnerable, so it pops its own Bleed.')],
        gear=[
            ('Weapon', 'Wyrm Knight\'s Lance', '35% chance on hit for Bleed 2, +25% against Bleeding enemies.', 'Wyrmtooth Lance'),
            ('Torso', 'Bloodfever Harness', 'Rupture hits 30% harder.', 'Wyrmtooth Coat'),
            ('Head', 'Bloodfever Helm', 'Lifesteal.', 'Wyrmtooth Helm'),
            ('Ring', 'Bloodstone Ring', 'Lifesteal.', 'Bloodiron Ring'),
            ('Ring', 'Red Widow\'s Band', 'Bleed cap +5 and status power.', 'Bloodiron Ring'),
            ('Amulet', 'Maul Band', 'Crits apply Vulnerable for extra Ruptures.', 'Briar Knot'),
            ('Feet', 'Astren Shoes', 'Status power.', 'Frostmere Boots')],
        chase=('Sunwing Spear', 'Mythic spear: every Bleed you apply also Sunders, so each one pops instantly. Rupture +20%.'),
        gems=[
            ('Skewer', ['Contagion', 'Echo'], 'Its 3 Bleed (and Dragonbane\'s Vulnerable) go on every enemy.'),
            ('Impale', ['Nova', 'Echo', 'Momentum'], 'Sunder on every enemy, so every enemy Ruptures.')],
        rotation=[
            ('Skewer', 'Bleed on every enemy through Contagion. Spearhead II and Open Wounds add stacks.'),
            ('Attack', 'The lance keeps adding Bleed while Echo recasts Skewer.'),
            ('Impale', 'Nova Sunders every enemy and they all Rupture. Echo does it again next turn.'),
            ('Leap', 'Extra Sunder on two enemies while Impale is on cooldown.')]),
    dict(
        id='bloodletter', name='Bloodletter Assassin', cls='rogue', super='assassin', weapon='Two daggers',
        tier='A', summary='Twin Cut spreads Bleed to every enemy, Mark for Death makes them all Rupture.',
        targets=['Open Wounds', 'Haemorrhage', 'Rending', 'Impaling Wound', 'Windborne', 'Unseen Blade',
                 'Fading Step', 'Blood Rite', 'Second Breath', 'Red Harvest'],
        score=[('status power', 5), ('bleed', 4), ('rupture', 4), ('hidden', 3), ('dodge', 2)] + HEAL,
        avoid=['two-handed', 'fire', 'block', 'ward', 'crit damage'],
        stat=('Spirit', 'Spirit gives +1% status power per point, and status power makes Bleed and Rupture hit harder.'),
        classTree=[
            ('assassin:contract:1', 'Needed to reach Death Sentence.'),
            ('assassin:contract:2', 'Mark for Death gives Vulnerable, which sets off Rupture.'),
            ('assassin:shadows:1', 'Needed to reach From the Shadows.'),
            ('assassin:shadows:2', '+40% damage while Hidden, and your hits cannot be dodged.'),
            ('assassin:shadows:3', 'Needed to reach Vanish.'),
            ('assassin:shadows:4', 'Every kill makes you Hidden again.'),
            ('assassin:venom:1', '+10% status power.')],
        gear=[
            ('Weapon', 'Red Widow\'s Fang', 'Every Bleed you apply gets 2 extra stacks.', 'Bloodletter Dagger'),
            ('Off-hand', 'Crimson Fang', '30% Bleed on hit, +15% against Bleeding enemies. Both daggers\' powers count.', 'Bloodletter Dagger'),
            ('Amulet', 'Maul Band', 'Crits apply Vulnerable, which sets off Rupture.', 'Huntsman\'s Medallion'),
            ('Torso', 'Bloodfever Harness', 'Rupture hits 30% harder.', 'Wyrmtooth Coat'),
            ('Head', 'Bloodfever Helm', 'Lifesteal.', 'Wyrm Knight\'s Helm'),
            ('Ring', 'Bloodstone Ring', 'Lifesteal.', 'Bloodiron Ring'),
            ('Ring', 'Red Widow\'s Band', 'Bleed cap +5 and status power.', 'Bloodiron Ring'),
            ('Feet', 'Nightwhisper Boots', 'Start every fight Hidden, so your first Attack crits.', 'Astren Shoes')],
        chase=('Serpent Coil', 'Mythic ring: lifesteal, and every Bleed you apply also gives Vulnerable, so it pops at once.'),
        gems=[
            ('Twin Cut', ['Nova', 'Contagion', 'Echo'], 'Bleed on every enemy, and it casts again free next turn.'),
            ('Deep Cut', ['Nova', 'Echo', 'Momentum'], 'Doubles every enemy\'s Bleed, twice.'),
            ('Mark for Death', ['Contagion', 'Echo'], 'Vulnerable on every enemy, so they all Rupture.'),
            ('Execute', ['Nova', 'Momentum', 'Overload'], 'Finishes the whole group. Kills give more actions.')],
        rotation=[
            ('Twin Cut', 'Bleed on every enemy. Echo casts it again next turn.'),
            ('Deep Cut', 'Doubles every enemy\'s Bleed.'),
            ('Mark for Death', 'Vulnerable on every enemy, so they all Rupture. You become Hidden.'),
            ('Attack or Execute', 'Crit from Hidden, or Execute the group below 60% HP.')]),
    dict(
        id='jester', name='Mocking Jester', cls='bard', super='jester', weapon='Lute',
        tier='B', summary='Mockery hits every enemy and Taunts them. Taunted enemies also get Vulnerable.',
        targets=['Night Song', 'Kindred Fire', 'Encore', 'Sharp Focus', 'Executioner', 'Hex',
                 'Spellfocus', 'Red Harvest', 'Second Breath'],
        score=[('shadow', 3), ('crit', 3), ('inspire', 2), ('energy', 2), ('status power', 2)] + HEAL,
        avoid=['fire', 'block', 'two-handed', 'single-wield', 'dual-wield'],
        stat=('Spirit', 'Spirit adds 1% damage per point to Mockery and Bag of Tricks, and more Energy.'),
        classTree=[
            ('jester:ridicule:1', 'Taunted and Mocked last longer.'),
            ('jester:ridicule:2', 'Taunted enemies also get Vulnerable for 2 turns.'),
            ('jester:ridicule:3', 'Max HP.'),
            ('jester:ridicule:4', 'Mockery hits every enemy.'),
            ('jester:mayhem:1', '+10% damage.'),
            ('jester:luck:1', 'Dodge chance.'),
            ('jester:luck:2', 'Bag of Tricks uses two effects.')],
        gear=[
            ('Weapon', 'War Drummer\'s Lute', '+8-12% damage and a 50% chance to Mark.', 'Clarion Lute'),
            ('Head', 'Bloodfever Helm', 'Lifesteal.', 'Sentinel\'s Sallet'),
            ('Torso', 'Stargazer\'s Robe', 'Ward and status power.', 'Herald\'s Tabard'),
            ('Feet', 'Huntmaster\'s Boots', 'Crit damage, and Keen on kills.', 'Gloaming Boots'),
            ('Ring', 'Bloodstone Ring', 'Lifesteal.', 'Thumbguard Ring'),
            ('Ring', 'Gold Dust Ring', 'Crit chance.', 'Ravenhead Ring'),
            ('Amulet', 'Hawk-Talon Pendant', 'Crit chance.', 'Briar Knot')],
        chase=('Spiral Lute', 'Mythic lute: Inspire also gives Haste and Regen.'),
        gems=[
            ('Mockery', ['Echo', 'Momentum'], 'Hits every enemy again next turn for free.'),
            ('Bag of Tricks', ['Echo'], 'Twice the random effects.')],
        rotation=[
            ('Rousing Chord', 'Inspire for you and allies. Kindred Fire adds Keen. Does not end your turn.'),
            ('Mockery', 'Hits every enemy, Taunts them, and Laughing Stock makes them Vulnerable.'),
            ('Bag of Tricks', 'Random bonus: Haste, Blind, heal, Daze or double damage.')]),
]

TIERS = [
    ('S', [('Berserker', 'Warrior', 'Attacks hit every enemy while Frenzied, with lifesteal. Best tower sustain and area damage.'),
           ('Pyromancer', 'Mage', 'Burn on every enemy every turn, then Detonate. Area damage with no crits needed.'),
           ('Marksman', 'Archer', 'Volley hits every enemy every turn with no cooldown.')]),
    ('A', [('Zealot', 'Priest ultra', 'Level 40+. Area Brand, extra actions and a self-healing ultra.'),
           ('Seraph', 'Priest ultra', 'Level 40+. Area damage plus full-party heals and revives.'),
           ('Dragoon', 'Lancer', 'Reliable Sunder triggers for Rupture on every enemy. No built-in lifesteal.'),
           ('Gunner', 'Archer', 'Scattershot Burns every enemy. Strong but costs HP.'),
           ('Assassin', 'Rogue', 'Best at stacking Bleed. Area damage needs gems, and lifesteal comes from gear.')]),
    ('B', [('Sellsword', 'Warrior', 'Best single-target Rupture: guaranteed crit every turn, about 1.7x damage. Weak in groups.'),
           ('Jester', 'Bard', 'Mockery hits every enemy and makes them Vulnerable. Low damage on its own.'),
           ('Ranger', 'Archer', 'Hawk adds Bleed and Vulnerable by itself. Small numbers.'),
           ('Gladiator', 'Lancer', 'Favor gives crits and damage. One target at a time.'),
           ('Skald', 'Bard', 'Strong party buffs (Keen, Haste). Little damage alone.'),
           ('Oracle', 'Priest ultra', 'Undoes damage and revives. Support first.')]),
    ('C', [('Druid', 'Mage', 'Single-target Poison and Regen.'),
           ('Priest', 'Mage', 'Healer. Take it only to reach the ultra classes at level 40.'),
           ('Outlaw', 'Rogue', 'Blind and buff stealing. Little damage.'),
           ('Duelist', 'Rogue', 'Strong one-on-one, poor against groups.'),
           ('Knight', 'Warrior', 'Protects allies.'),
           ('Herald', 'Bard', 'Gives allies extra actions.'),
           ('Sentinel', 'Lancer', 'Defensive support.')]),
]


def main():
    items = {i['name'] for i in json.loads((ROOT / 'data' / 'items.json').read_text())}
    classes = json.loads((ROOT / 'data' / 'classes.json').read_text())['classes']
    gems = {g['name'] for g in json.loads((ROOT / 'data' / 'gems.json').read_text())}
    nodes, _ = load_tree()
    index = []
    for b in BUILDS:
        cls = next(c for c in classes if c['id'] == b['cls'])
        sup = next(s for s in cls['supers'] if s['id'] == b['super'])
        node_ids = {n['id'] for br in sup['branches'] for n in br['nodes']}
        bad = [n for n, _ in b['classTree'] if n not in node_ids]
        bad += [g[1] for g in b['gear'] if g[1] not in items] + [g[3] for g in b['gear'] if g[3] and g[3] not in items]
        bad += [b['chase'][0]] if b['chase'][0] not in items else []
        bad += [x for _, gs, _ in b['gems'] for x in gs if x not in gems]
        if bad:
            raise SystemExit(f'{b["id"]}: unknown names {bad}')

        best = None
        for g in GATES:
            try:
                order, goals, cost = plan(g, b['targets'], 60, b['score'], b['avoid'], 3)
            except ValueError:
                continue
            if best is None or cost < best[3]:
                best = (g, order, goals, cost)
        g, order, goals, cost = best
        stats = sum(1 for i in order if nodes[i]['k'] == 'stat')
        out = {
            'id': b['id'], 'name': b['name'], 'class': f'{cls["name"]} → {sup["name"]}', 'cls': b['cls'], 'super': b['super'],
            'weapon': b['weapon'], 'tier': b['tier'], 'snapshot': SNAPSHOT, 'summary': b['summary'],
            'gate': g, 'order': order, 'goals': goals,
            'statPick': {'attr': b['stat'][0], 'why': f'Every round stat node gives +2 to an attribute you choose. {b["stat"][1]} This path has {stats} of them, so +{2 * stats} {b["stat"][0]}.'},
            'classTree': [{'node': n, 'why': w} for n, w in b['classTree']],
            'gear': [{'slot': s, 'item': i, 'why': w, 'alt': a} for s, i, w, a in b['gear']],
            'chase': {'item': b['chase'][0], 'why': b['chase'][1]},
            'gems': [{'skill': s, 'gems': gs, 'why': w} for s, gs, w in b['gems']],
            'rotation': [{'skill': s, 'text': t} for s, t in b['rotation']],
        }
        (ROOT / 'builds' / f'{b["id"]}.json').write_text(json.dumps(out, indent=1))
        index.append({k: out[k] for k in ('id', 'name', 'class', 'weapon', 'tier', 'summary')})
        print(f'{b["id"]:12} gate {g}  targets {cost} pts  stat nodes {stats}')
    order = {'S': 0, 'A': 1, 'B': 2, 'C': 3}
    index.sort(key=lambda x: order[x['tier']])
    (ROOT / 'builds' / 'index.json').write_text(json.dumps(index, indent=1))
    (ROOT / 'builds' / 'tiers.json').write_text(json.dumps(
        [{'tier': t, 'entries': [{'name': n, 'from': f, 'why': w} for n, f, w in e]} for t, e in TIERS], indent=1))


if __name__ == '__main__':
    main()
