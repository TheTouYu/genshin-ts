# GIL Asset Commands Reference (gsts assets:*)

The `assets:*` commands wrap GIL write rules reverse-engineered from **real editor
save outputs** into a CLI, so code can create/modify level assets directly instead
of doing them by hand in the editor.

Important boundaries (shared by all `assets:*` commands):

- They modify `.gil` asset structures directly. They are **not** GIA NodeGraph
  injection, not runtime `createPrefab`, and do not imply that arbitrary editor
  assets can be generated in code.
- Preview-only by default: `--write` = back up to `.gsts/backups/` then write the
  real map; `--output <file>` = write a candidate file (never overwrites);
  `--gil <file.gil>` = process an offline GIL; `--map-id <id>` = locate the map
  via project config (mutually exclusive with `--gil`).
- Editor memory ignores disk writes: after a writeback you must **reload the map**
  before saving, or the editor save will overwrite your changes.
- Definition/instance/entity IDs come from one shared counter; duplicate IDs make
  the editor report a corrupted save.
- Editor-maintained fields such as root 46 are not simulated; every writeback
  rebuilds the file header instead of hand-patching bytes.

Evidence tiers: every command is backed by **real adjacent editor snapshots**
(byte-level diffs before/after editor saves), **automatic regression tests**, and
**bounded writeback**; rules marked "user editor/game verified" were additionally
confirmed by a human in the editor or game. The full authoritative knowledge lives
in the genshin-ts repository under `docs/game-engine-knowledge/` (not shipped in
the npm package; view online):
<https://github.com/josStorer/genshin-ts/tree/main/docs/game-engine-knowledge>

## assets:node-graphs — create an empty NodeGraph container

Creates an empty NodeGraph (root 10 double-wrapped record + root 6 folder entry)
in the target map as a placeholder for the injector. The graph ID is auto-assigned
as the map's current max graph ID + 1 (real editor evidence: 10+ maps sampled,
holes are never reused after deletion).

```bash
npm run assets:node-graphs -- create --name my-graph --map-id <id>   # preview
npm run assets:node-graphs -- create --name my-graph --map-id <id> --write
```

## assets:node-graphs read — inspect node graphs precisely

Reads the current wire state of any node graph / node / pin / connection /
composite definition, for human-machine collaboration (show current state before
proposing a patch):

```bash
npm run assets:node-graphs -- read --gil <file.gil>                       # all graphs + composite defs
npm run assets:node-graphs -- read --gil <file.gil> --graph <id|name>     # graph nodes/pins/connections
npm run assets:node-graphs -- read --gil <file.gil> --graph <id|name> --node 24
npm run assets:node-graphs -- read --gil <file.gil> --composite <id|name> # composite interface (pinIndex/type)
npm run assets:node-graphs -- read --gil <file.gil> --graph 样本-01 --json # machine-readable
```

## assets:node-graphs patch — precise node-graph edits (read-modify-write)

Applies record-level local replacements (only the target NodeGraph / CompositeDef
record bytes change; everything else in the file stays untouched). Preview by
default; `--write` backs up then writes the real map. Operations (applied in
order):

```bash
# node position
npm run assets:node-graphs -- patch --gil <file.gil> --graph <id|name> node 24 pos 1200 1500 --write

# InParam literal value (types: int flt str bool vec gid pfb cfg)
npm run assets:node-graphs -- patch --gil <file.gil> --graph <id|name> node 4 param 0 pfb:1234
npm run assets:node-graphs -- patch --gil <file.gil> --graph <id|name> node 7 param 1 str:hello

# data connection: InParam[shell] ← source node OutParam[src-shell]
npm run assets:node-graphs -- patch --gil <file.gil> --graph <id|name> node 24 link 1 12
npm run assets:node-graphs -- patch --gil <file.gil> --graph <id|name> node 24 unlink 1

# control-flow connection: OutFlow[shell] → target InFlow[dst-shell]
npm run assets:node-graphs -- patch --gil <file.gil> --graph <id|name> node 11 flow 1 24
npm run assets:node-graphs -- patch --gil <file.gil> --graph <id|name> node 11 flow-rm 1

# composite definition (global, no --graph needed)
npm run assets:node-graphs -- patch --gil <file.gil> composite 1610612744 rename 我的复合
npm run assets:node-graphs -- patch --gil <file.gil> composite 1610612744 param input 1 rename 目标实体

# composite interface: add/remove/swap an input
# add-input: promote an impl-graph InParam to a composite input (def flow + compositePin + instance pin; instance renumbered unless already at min free)
npm run assets:node-graphs -- patch --gil <file.gil> --graph <id|name> composite 1610612744 add-input 2 控制表达式 int 3 0
# del-input: remove a composite input (def flow + compositePin + instance pin; instance renumbered)
npm run assets:node-graphs -- patch --gil <file.gil> --graph <id|name> composite 1610612744 del-input 2
# swap-input: swap two composite inputs (def flows + compositePins + instance pins; instance renumbered)
npm run assets:node-graphs -- patch --gil <file.gil> --graph <id|name> composite 1610612744 swap-input 0 1

# wrap selected nodes into a new composite (needs --graph):
#   anchor node stays in place as the instance (its position becomes the selection center),
#   other selected nodes move into the new impl graph (positions relative to the center),
#   control-flow OutFlows auto-lift to composite outflows (named by original shell number),
#   data inputs stay inside the impl graph (not auto-registered as composite inputs yet),
#   node id = smallest free 0x6000000N; pinIndex = global max+1 (editor uses a recycle pool)
npm run assets:node-graphs -- patch --gil <file.gil> --graph <id|name> composite create 我的复合 1 1 11
```

Multiple ops can be chained in one command. Newly created pins follow the closed
editor rules (sorted pin arrays, default-index omission, explicit non-default
ShellIndex, connects on the target side for data / source side for control flow).
Unclosed editor rules (Variant auto-instantiation, entity literal values, anchor
selection when wrapping composites, auto-registering wired data inputs as
composite inputs, composite instances inside a selection) fail closed with an
error instead of guessing. del/swap-input renumber the instance to the min free
index excluding its current slot; the editor additionally skips cross-round
tombstones, so after manual deletions in the editor the tool may pick a lower
index than the editor would.

## assets:entities — create/export/patch scene entities and decorations

- `export`: dump root 5 scene entities as JSON (inventory/backup).
- `import`: rebuild entity records from a component definition (`--entities <file>`);
  component and decoration slots are inherited byte-for-byte, transform is
  independent scene placement — the same behavior as creating an entity in the editor.
- `patch <entity-id>`: record-level local replacement (only the target record's
  bytes change):
  - `--color <#RRGGBB>`: custom color for entity/aux (f3 and f5 written together —
    the editor-save normalization rule; writing only f3 drifts on the next editor save);
  - `--position/--rotation/--scale`: transform (sparse encoding, dense three-axis scale);
  - `--attach-aux <aux-id>` / `--detach-aux <aux-id>`: decoration attachment,
    **bidirectional refs in one write** (entity f5{t=40}.f50.f501 list + aux
    f4{t=40}.f50.f502 owner);
  - `--aux <aux-id>`: switch the color/transform target to a decoration.

```bash
npm run assets:entities -- export --gil <file.gil> --format json
npm run assets:entities -- import --entities entities.json --map-id <id>        # preview
npm run assets:entities -- patch 1077936180 --color #FF0000 --map-id <id> --write
npm run assets:entities -- patch 1077936180 --attach-aux 123 --map-id <id> --write
```

Evidence: create-entity-v5~v14 real snapshots byte-identical, v21 color patch
byte-identical to the editor save, user game verification (red cube / lifted cube).

## assets:mounts — NodeGraph mounting (type 3 slot)

Mounts an active NodeGraph on a component definition or scene entity (wire
equivalent of the editor's "mount NodeGraph" property):

- `attach <target-id> --graph <gid>` / `detach <target-id> --graph <gid>`;
- `--def` = component definition (double-writes root 4 + all referencing root 8
  instances); `--entity` = scene entity (root 5 only, default); idempotent; the
  graph must exist in root 10 (existence check).
- `list` (no target-id) = **full survey**: every NodeGraph (GID+name), every
  definition, every scene entity with its mounted graphs, and graphs mounted
  nowhere — run this first to see the map's current state; `list --graph <gid>` =
  reverse lookup of which targets mount that graph; `list <target-id>` = single target.

```bash
npm run assets:mounts -- list --map-id <id>                    # full survey
npm run assets:mounts -- attach 1077936180 --graph 1073741828 --entity --map-id <id>
npm run assets:mounts -- attach 1077936183 --graph 1073741829 --def --map-id <id> --write
```

Wire shape (real snapshots): in the slot list's `{1:3}` slot, each f13.f1 entry is
`{1:{1:1, 2:graphGID, 501:20000}}` (two f1 wrappers); multiple graphs append in
mount order; removing the last graph leaves the empty slot `08036a00`; graph GIDs
use full values (e.g. 1073741828), not short IDs.
Evidence: mount-case1/2/3/4 real adjacent snapshots byte-identical + user game verification.

## assets:signals — signal registration and inspection

- `inspect`: read the map's signal registry (root 10 signal index).
- `register`: register a new signal (name + parameter list + auto-assigned
  send/monitor/server node IDs); `--param <name:type>` repeatable (≤9);
  `--template-gil/--template-signal` clone parameter layouts from an existing signal.
- `repair`: fix malformed legacy registrations; `update`: update a signal's
  parameter entries in place.

```bash
npm run assets:signals -- inspect --gil <file.gil>
npm run assets:signals -- register --name my-signal --param hp:int --param pos:vec3 --map-id <id>
npm run assets:signals -- register --name my-signal --map-id <id> --write
```

Evidence: real adjacent snapshots + user editor/game verification (fixed-value
sends, listener skeleton, parameter consumption, cross-map import/injection all verified).

## assets:static-assemblies / assets:custom-variables

- `assets:static-assemblies`: builds static custom prefabs from an existing
  template closure in the target map (see the `assets.staticAssemblies` config
  section in the README).
- `assets:custom-variables`: previews/writes level variables from config
  (see the README).

Usage and boundaries for both are documented in the README `## Scripts` section.
