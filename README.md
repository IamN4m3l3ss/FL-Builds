# FL-Builds

Fallen Lineage builds: passive tree paths, gear and rotations, built from the game's own data.

Site: https://iamn4m3l3ss.github.io/FL-Builds/

## Layout

| Path | What it is |
|---|---|
| `index.html` | List of builds (reads `builds/index.json`) |
| `build.html?id=<id>` | One build page (reads `builds/<id>.json`) |
| `data/tree.json` | Full passive tree: 587 nodes with positions and text, 752 links |
| `data/items.json` | Item stats and market prices (lowest price and listing count per tier) |
| `builds/<id>.json` | A build: gate, point order, gear picks, rotation |
| `tools/` | Planner and dump parser |

## Add a build

1. Copy `builds/bloodletter.json` to `builds/<new-id>.json` and edit the name, class, gear and rotation.
2. Plan the tree path. Targets are notable or keystone names, in the order you want them:

   ```
   python3 tools/planner.py <new-id> --gate g6 --targets "Open Wounds,Haemorrhage,Rending"
   ```

   Add `--dry-run` to see the result without saving. Gates are `g1` to `g6`. Leftover points go to the best nearby
   nodes, scored by `--score` keywords.
3. Add the build to `builds/index.json`.

## Refresh item data

`python3 tools/extract.py items <dump.bin>` rewrites `data/items.json` from a memory dump taken with the market open.
`tools/extract.py find <dump.bin> "<name>"` prints any game table with that name, which is how new data such as
class skills gets located.
