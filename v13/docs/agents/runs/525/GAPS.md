# Gaps and choices, spec #525

Unmet acceptance criteria and choices the spec and D-ids don't decide, under the ticket that owns each. Items that visibly change rendering for existing documents are marked **needs a D-id**.

## T0 #590

Unmet criteria: none. Choices the spec and D-ids leave open:

- **Rows line up on `anchorY`, not on node tops.** Pele top-aligns a row (every service has the same icon). `compass` lines each row up on its nodes' `anchorY` (the middle when absent), so `left`/`right` ends always meet in line. Identical to Pele when every node has the same `anchorY` (T3: `iconSize / 2`).
- **Ports sit on the box, not on the icon.** Pele puts `L`/`R` ends at `centre ± iconSize/2` and a `B` end 2 px below a labelled box. `compass` knows only the box, so `L`/`R` ends are on the box's side at `anchorY` and `B` on its bottom. Where a label is wider than the icon, T4 extends the line along the anchor line to the icon (v12's cytoscape endpoint is the icon edge too).
- **Junctions are plain nodes.** Pele's junction dot, centre ports and the wire through a group border are drawing; T3 gives junctions an `iconSize` box (spec), and T4 runs the line on to the centre as v12 does (`svgDraw.ts:73-86`). Facing metrics unchanged.
- **Engine lengths are fixed at v12's defaults.** The cell gap is `max(padding, 0.75 × iconSize)` = 60 and an empty group's cell 80 × 40, from `METRICS`. Node sizes and group padding come from the graph, so `architecture.iconSize`/`padding` still size services and groups, but a document that changes them keeps the 60 px gap (Pele scales it). If T3 wants it scaled, it needs a way in (a `LayoutGraph` field or `ctx.options`): **needs a D-id** if taken.
- **Edge ends on groups** (a flowchart edge to a subgraph; architecture rejects them, D504) place the group's block. The end meets the group's side in line with the other end where the side reaches it, else the side's middle, and a labelled edge widens the gap outside the group's border (review finding 5). **`border` on a node with no group** is ignored (D504).
- **Group order and parents.** Groups are reordered parents-first (Pele assumes it); a missing or non-group parent counts as none, and so does the parent of every group on a cycle of parents.
- **Labels.** The middle label is placed as Pele does, also when it is 0 × 0; when that spot lands on a third node (only seen on flowchart/class/state/ER), it takes the first clear spot along the route. End labels (D102, class multiplicities) go beside the first or last run, past the side and the edge's marker, on the first spot clear of nodes, labels, markers and other edges' runs; when none is, the first clear of all but the runs. D507's v12 label placement is T4's: it may re-place from the route. Nodes, labels, markers and runs are bucketed by a uniform grid (cell = gap + mean column width) so placement stays near linear (`compass-linear.spec.ts`).
- **Input checks** match `layered`'s (sizes, title, `minLen`, markers, `spacing`, `headRoom`) plus `anchorY` and `sides`; an unknown side is a `RangeError`. `grid` is not checked, since `compass` ignores it. **Follow-up:** one shared `checkGraph` for all engines (`layered`, `tree`, `compass`), not done here so this PR leaves `layered` and `tree` untouched.
- **Self-loop ends** part by 8 px but stay on their side (Pele could push them off a short side).
- **`validateLayout` reads `border`**: a `border` end on a node must lie on the border of the node's group (within the validator's slack); an end on a group is checked against that group, `border` or not.
- **Known quality limits on other graph types** (no validator checks them): all edges on one side of a node meet at one point (Pele), and a route between non-neighbours can pass over an intermediate node in the same row or column.
- **Registry:** the D502 exemption is `ANY_GRAPH_LAYOUTS` in `packages/mermaid/src/registry.ts`, one row per engine; swimlane's T0a adds `'swimlane', // D535`.

## T0b #591

Unmet criteria: none of the ticket's. **Size target not met:** gated core +947 B gz against the coordinator's +589 (review rework, findings 1–10).

Choices:
- **Redrawn from the ends, not patched.** Only an edge where a named side moves an end is redrawn; graphs without sides, and edges whose sides layered already took, are byte-identical.
- **Where ends go.** A moved end goes to the side's middle. Any named `left`/`right` end goes to `anchorY`, moved or not (finding 4).
- **Stubs.** The source stub is `corner` plus the start marker (no `headRoom`, finding 7). The target stub is `corner` plus `headRoom` plus the end marker.
- **Links.** Right angles go stub → label → stub. A cost (boxes crossed and doubling back 9 each, a turn 1, length a little) picks among two-corner paths on lines through either end, midway, or `corner` past an end box.
- **Growth.** The drawing grows, shifting everything, where a stub or lane reaches into the margin (finding 3: growth was chosen over clamping, since clamped stubs left markers no room).

Known limits:
- Ends on one side are not spread apart (`it.todo`).
- An unknown side is not refused (`it.todo`).
- A loop with both ends on one side keeps layered's loop (`it.todo`). A loop with two sides routes through layered's loop label.
- Routes may cross other nodes and edges; there is no global avoidance.
- Not applied on the grid.

Size options if +947 is too much:
- (1) Drop growth and keep stubs inside the margin: about −140, with stubs at the edge cut short.
- (2) A lazily registered post-pass, which needs a D-id.
- (3) Accept the size.

## T0c #592

## T1 #594

Unmet criteria: none. Choices the spec and D-ids leave open:

- **Quirks, as probed against 2.0.1 and kept** (P1; all gated in `architecture-cases.json`): `Backend` lexes `B` + `ackend` (also `Left`, `Title`); `row`, `in`, `group`, `service`… as ids are keyword tokens, `rows`/`inx`/`services` are ids (keywords yield only to a strictly longer ID); `title` has no boundary, so `service titlex` is `service`, ` title`, `x` (TITLE/ACC_* take their leading blanks: they precede WHITESPACE); `a:r -- l:b` lexes sides as ids; `architecture-beta service a` and `architecture-betax` (an ID) as v12; `<`/`>` are one token either side of `--`. Labels: a quoted form may hold `]`, `[` and line breaks (`["a]b"]`, `["a\nb"]`), `["a"b]` falls back to the run, a run stops at `[`/`]`/CR/LF (`[a [b] c]` is an error at the first `[`), `[]` and `( server )` are errors.
- **Harvest** header is `architecture(?:-beta)?` (v12's detector takes bare `architecture`, lexed as an ID; one harvested source is the bare describe title). Files beyond the ticket's three, per the spec's Testing Decisions: `architectureSeed.spec.ts`, `svgDraw.spec.ts`, `examples/architecture.ts`, `multi-diagram-id-uniqueness.spec.ts`. 47 sources.
- **Excluded** from the gate: `unclosed-directive*` (core's shared preprocess, as pie/radar/wardley). **Not reached**: `header-upper`, `header-mixed-case` (v12's detector is case sensitive) and six `commented()` copies whose cut falls in the header.
- **8 new fixtures** `e2e/diagrams/architecture/nightly-check/lexer-*.mmd` (arrowheads incl. `> -- <`, text icons, quoted/raw/CJK labels, keyword-prefixed and digit ids, header on a statement line, free blanks, labelled `{group}` edge, like-side and self edges); v12 parses all 8. **Conflict with T0**: `conformance/src/compass/architecture-corpus.spec.ts` (#590 branch) reads every `.mmd` under `e2e/diagrams/architecture` and asserts 20 files and 79/87 facing edges; when T0 and T1 meet on the integration branch, restrict it to the 20 v12 fixtures (or update its counts) and check its test-only builder reads `"text"` icons and `> -- <`.
- Package skeleton is private with no manifest; `theme-used-by.spec.ts` lists `architecture` in `NOT_DRAWN_YET` until T4 (#614) reads a theme variable.

## T2 #599

Unmet criteria: none. Choices the spec and D-ids leave open:

- **What the model keeps after a DB error** (v12 stopped at the first, so a rejected document has no v12 model to match): a second declaration of an id is dropped and the first kept; a service, junction or group whose parent is itself, unknown or not a group is kept **without a parent**; an edge or alignment that fails a check is dropped. An id whose declaration had a syntax error raises no "does not exist" / "parent does not exist" / align error where it is used, but the other edge end and the other align members are still checked (the edge or alignment is left out). A service kept without its failed parent raises no `{group}` warning either. So one planted error gives one diagnostic (recovery set).
- **One diagnostic per statement**, the first check that fails in v12's order (an edge with two unknown ends reports the left one, as v12). Placed on the id the check is about: the parent after `in`, the edge end, the align member; a duplicate on the declared id.
- **Codes**: `ARCHITECTURE_DUPLICATE_ID`, `_SELF_PARENT`, `_UNKNOWN_PARENT`, `_PARENT_NOT_GROUP`, `_UNKNOWN_ID`, `_GROUP_EDGE_END` (D504, Pele's message), `_GROUP_EDGE_SAME_GROUP`, `_ALIGN_MEMBER`, `_ALIGN_REPEAT`, `_ALIGN_SHORT` (DB API only; the grammar asks for two), warning `_GROUP_EDGE_UNGROUPED`. Syntax errors use the shared `UNEXPECTED`, `UNEXPECTED_CHARACTER`, `UNCLOSED_STRING`, `UNCLOSED_LABEL`, `UNCLOSED_ACC_DESCR`. v12's "The group [g]'s parent is not a group" is unreachable (v12 adds groups before any node); the message exists, no corpus case can throw it.
- **D504 `{group}` on an ungrouped end**: the model flag is `false` (T3 reads it as is), so the oracle sees a model divergence, listed in `divergences.json` (`edges-group-no-group` ×3 variants). One warning per parse at the first place, the others in `related`, with `astIds` (as wardley's D425 warnings).
- **D504 in the oracle**: `parity.spec.ts` `DIFFERENCES` has the four cases, each checked against 12.2.0. The duplicate pair's render throw is not observable through the oracle (parse and DB only): its entry checks that both accept with equal models and v13 ids `edge:a->b`, `edge:a->b@2`. Self and like-side: `nightly-check/lexer-like-side-and-self-edges.mmd` (the `edges-self` case declares no service, so both reject it).
- **Entities**: labels and text icons keep `&name;` for v12's `#name;` (radar, flowchart), not wardley's decoded display text (GAPS #493); the v12 snapshot decodes placeholders to `&name;`. T4 decodes when drawing.
- **Symbols** (D508): kind and `def` come from the declaration that **registered** the id in v12's order (groups first), so `service x` after `group x` is a `group` `ref`; a name nothing registered has no symbol. Rename refusal is T6's.
- **Grammar file**: YAML is listed before `--` and `-` (Chevrotain's longer alternative, as a first-match rule); the rest is Chevrotain's order. The grammar-lexer spec matches 2.0.1 on the gate corpus.
- **Only kept statements** get an AST id (and so a `@n`), symbol references, a statement span or set `title`/`accTitle`/`accDescr`; a statement with a syntax error leaves none. `align:n` comes from core's `AstIds.statement`; the named ids keep a local counter, since `AstIds` has no `<kind>:<name>@n` form.
- **Probe hooks** are in the parser now (as wardley's T2); T6 owns the probe spec. An accessibility value starts after its `:` (or a block's `{`).
- **Detection** cuts a directive out of the header as v12 did (`archi%%{init: {}}%%tecture-beta` is detected and parsed; the `architect` case is listed as not reached in T1's lexer gate).
- **Ported specs**: `architecture.spec.ts` skips the cytoscape, `randomize` and fcose-config describes and the `getDataStructures` proto test (D328; `__proto__` ids are in `parse.spec.ts`); `architectureSeed.spec.ts` is skipped whole (D328). `svgDraw.spec.ts` (element ids) is T4's.
- **Corpus**: 22 `db-*` cases added to `architecture-cases.json` (one per v12 DB check, plus `__proto__`), and `architecture-recovery.json` joins the gate corpus; T1's lexer gate still passes on both.

## T3 #607

Unmet criteria: none. Choices the spec and D-ids leave open, and the probes:

- **Box = icon + label.** A service's box is `max(iconSize, label width)` by `iconSize + label height`, the label wrapped at `iconSize × 1.5` and centred under the icon, `anchorY = iconSize / 2` (T0's "Using it"). v12's cytoscape node was the icon alone, its label hanging below; so `compass` keeps clear of labels where v12 could overlap them. Junctions are `iconSize` squares, `anchorY` the same.
- **Group title band** = group icon (`padding × 0.75`), then 4 px (v12's `+ 4`, `svgDraw.ts:263`, also with no icon) and the label, as high as the taller; icon alone is the icon square; neither, no `title`. Titles and edge labels are measured unwrapped: v12 wrapped them to the drawn group width / edge length, unknown before layout (D507: T4 places edge labels and may re-wrap).
- **Font.** Every label in the theme's `fontFamily` / `fontSize` at weight 400, markdown on (v12's `createText`), `ctx.inline` passed; `architecture.fontSize` not read (D507). Reading those two rows drops `theme.notDrawnYet` from `workspace.yaml` (the flag means "not reached layout"); `pnpm regen` lists architecture on both rows in `theme-variables.md`. T4 adds its table.
- **Config.** `architecture.iconSize` and `padding` are read with the config-length reader class, er, state and flowchart each copy (`layout/config-length.ts`: 0 up to 10,000, numeric strings too); anything else lays out with 80 / 40 and warns the new `ARCHITECTURE_CONFIG_IGNORED` once per key (pitfall 22). `iconSize: 0` is taken (degenerate, as in v12; the layout stays valid). The cap stops `1e9` hanging and `1e308` crashing `compass` (review). No core helper exists, so the copy is a fifth one; `conformance/src/architecture/config-length.spec.ts` keeps it equal to class's but for names. **Follow-up:** one core reader for all five. No schema defaults until T5's `configDefaults`, so the builder falls back to the table.
- **Graph.** `direction: 'TB'` (every edge names its sides), `spacing` all `padding` (compass reads none; other engines get something sane), `diagramPadding: padding` (v12's `setupGraphViewbox` margin). Layout ids: model ids for nodes and groups (one namespace), the edge's AST id (`edge:a->b`, `@2`) for edges.
- **Metrics table** (`layout/metrics.ts`): `ARCHITECTURE_METRICS` (v12's constants) and `architectureSizes(iconSize, padding)` (arrow, label width and position, `{group}` offsets 44 / 62, junction end, group icon, dash), all exported for T4. `conformance/src/architecture/layout-literals.spec.ts` allows only 0, 1, 2 and the invariants' 0.5 slack elsewhere in `layout/`.
- **Pair order against fcose** (real 12.2.0 in headless Chromium, icon centres, against `compass`'s icon centre lines): 327/411 pairs agree at 25 px tolerance, the two deep-nesting files differing (`should-render-a-deterministic-layout-for-a-complex-deeply-nested-diagram` 27/66, `should-render-with-randomize-true-without-errors` 21/66), as the research doc found. At 5 px a third differs: `should-render-an-architecture-diagram-with-groups-within-groups` (`db`/`gateway`: fcose puts `gateway` 21 px left of `db`, `compass` in one column), 326/411.
- **Q5 probed (12.2.0): confirmed.** `shiftPositionByArchitectureDirectionPair` (`architectureTypes.ts:141`) flips the vertical for an `L`/`R` → `T`/`B` bend. Alone the pair gets no constraint and fcose puts `b` anywhere (`a:R -- T:b`: up and to the left of `a`); next to a straight edge from the same side the wrong cell feeds a constraint: `a:R -- L:c` + `a:R -- T:b` puts `b` above `c` (should be below), `a:R -- B:b` puts it below, `a:L -- T:b` above. `T`/`B` → `L`/`R` bends are right. `compass` follows the sides as written: fixture `nightly-check/layout-bends-follow-written-sides.mmd`, checked in `architecture/layout.spec.ts`. Visible change from v12 on such documents; follows the spec ("`compass` follows the sides as written"), MIGRATION row is T5's.
- **Fixed cell gap, visible: needs a D-id.** With `iconSize` 200 every gap stays 60 px while v12's arrowhead is `iconSize / 6` = 33 px, so a `<-->` edge (two heads, 67 px) overdraws itself; at `iconSize` 40 the gaps look wide. Left as is (no core change in T3). Fix would be a way for the graph to set the gap (`compass` reading `spacing.node`, which T3 already sets to `padding`, or Pele's `max(padding, 0.75 × iconSize)` from a `LayoutGraph` field). **Proposal for T4 until then (not done):** architecture's own side only: when an edge has heads at both ends and its drawn run is shorter than the two heads (`2 × arrow`), shrink both heads to fit and warn once per render (e.g. `ARCHITECTURE_ARROW_SHRUNK`), so a large `iconSize` never draws overlapping heads; nothing changes at the default (60 px against 27 px).
- **Review (10 findings) closed:** caps above; title gap; `anchorY` in the sizes table; `architectureSizesOf` no longer exported (renderers read `prepared.sizes`, so one read and one warning per render); the conformance harness builds the theme as a render does (`resolveThemeName`, `auto`, `themeVariables`, config warnings); the literal guard reads template expressions, strings holding `//`, hex and subfolders; `portLines` indexes once per graph; the corpus specs share `layoutBytes` / `portLines` / `OPPOSITE_SIDE` and lay each fixture out once; plain loops build the views.
- **Corpus spec moved.** `compass/architecture-graph.ts` is gone; `compass/architecture-corpus.spec.ts` builds through `conformance/src/architecture/layout.ts` (preprocess, config, `parseArchitecture`, `prepareArchitecture`, table measurer). Same 8 misses; snapshot ids are now AST ids.

## T4 #614

Unmet criteria: none. Choices the spec and D-ids leave open:

- **Group border colour: `inline(calloutBorder, primaryBorderColor)`, not the spec's `primaryBorderColor`.** v12 copied `primaryBorderColor` in each theme's constructor, before the theme recomputed it. v13's `primaryBorderColor` is the recomputed one, so it matches v12's `archGroupBorderColor` in five themes only (default `#c9c9d9` against `#c7c7f1`, dark `#4c4d4d` against `#cccccc`, forest, neutral, redux and redux-color differ too). `calloutBorder` (D332, gitGraph's tags: the author's `primaryBorderColor`, else v12's constructor border) matches in all ten, `base` aside (D541). The spec's premise ("one light rule … reproduces v12 in ten themes") holds only with it. An author's `primaryBorderColor` now recolours borders where v12 ignored it (MIGRATION row). **Check with the spec owner:** it reads a gitGraph-named input. Edges: `lineColor` matches v12 in ten themes. Widths: family tokens `3` / `2` (px).
- **Edge ends.** Taken from `compass`'s route, then run on as v12 drew them: a junction end (not `{group}`) to the junction's centre, an `L`/`R` end on a service wider than its icon (a long label) to the icon. `{group}` ends stay where `compass` put them, on the group border (v12's `padding + 4` / `+18` offsets are not reapplied).
- **Line.** Every edge is its route's corners (`M … L …`): visually v12's straight line or single bend where `compass` gives at most one bend, its own route with square corners otherwise. No middle point on a straight edge (MIGRATION).
- **Labels** (D507). Axis from the two sides as v12: `X` wrapped to the line, flat, the first line's middle 1em (`fontSize`) under v12's midpoint (halfway between the engine's ends); `Y` the same turned −90° about the midpoint, wrapped to ⅔; a bend wrapped to half its width, turned `−fx·fy·45°`, its centre `corner + (fx, fy) · (w + h) / (2√2)` (v12's `getBoundingClientRect` arithmetic, worked out). **On routes with more than one bend** (no v12 equivalent): flat, unwrapped (as T3 measured it), centred on `compass`'s label point.
- **Service labels** sit where T3's layout put them (box top at the icon's bottom), not v12's 1em hang: the label is inside the box `compass` kept clear. A few px higher than v12 (MIGRATION).
- **Arrowheads** are v12's triangles with absolute `points` (no `transform`), tip 2 px into the node. **Shrinking: implemented** (small, no effect at default sizes): an edge with heads at both ends whose drawn run is shorter than `2 × arrow` gets both heads at `run / 2` and one `ARCHITECTURE_ARROW_SHRUNK` warning per render. The corpus spec checks no default-size render shrinks. The fixed 60 px gap itself still **needs a D-id** (GAPS T3).
- **Icons.** Built-ins are package constants (v12's elements, `style` → presentation attributes, the `id="b"`… `data-name` attributes dropped since they would repeat), scaled by `scale(iconSize / 80)`. A name with `:` is a pack name and goes through `ctx.icon` (services at `iconSize`, groups at `groupIcon`); any other non-built-in is the `?` square with no lookup (v12 looked it up only in its own pack). `ctx.icon` `null` → `?`, the extension warns; `undefined` while `iconPacks.state(pack) === 'pending'` → the square left empty (D299, as mindmap); otherwise `?` and one `ICON_NOT_RENDERED` naming each (through `ctx.inline.warn` when present, as mindmap). `icons(model)` lists pack names only, once each, groups first.
- **Text icons** (D506): label layout at `iconSize − 2`, `floor((iconSize − 2) / lineHeight)` lines, the last kept line cut to fit `…` (written here, not Pele's code: no credits needed); centred in the square both ways (v12 left-aligned the text). `markdown` off (v12 set it as HTML), entities decoded by label layout.
- **Entities.** Core's label layout decodes the `&name;` placeholders T2 left (`#amp;` → `&amp;` → `&`), so labels and text icons need nothing more; checked in the render spec.
- **Structure.** New class `architecture-group` on a per-group `g` (v12 had none: its rect and label `g` were siblings), the one element `data-ast` needs. Labels are `g.architecture-service-label[data-id] > text` (the `g` carries `rotate()` on turned edge labels). Icon placement folded into v12's own `wrapIcon` `g`. Junction: no inner `g`. `role="img"` as the other ports. Group border, edge and no-icon outline go through `w.outline` (`group`, `edge`, `node`): ready for hand-drawn, whose `e2e/diagrams/architecture/hand-drawn.txt` is T5's.
- **ViewBox.** The layout's box, grown to hold any edge label or arrowhead past it (v12 measured `getBBox()`); no corpus render grows it today (pinned by a unit test with a cropping engine).
- **`svgDraw.spec.ts`** (v12's ids) carried over by hand in `src/render/render.spec.ts` as `data-id` checks (it drew through jsdom and cytoscape, nothing to port as is).
- **Theme oracle spec** (`conformance/src/architecture/theme.spec.ts`, the `base` `DIFFERENCES` entry) left to T5 with the other oracle checks; probed by hand here (12.2.0 `getConfig().themeVariables` and computed styles in Chromium for default, neo, redux, neo-dark: edges `lineColor` at 3 px, borders dashed `8` at 2 px, text `textColor`).

## T5 #618

- `DiagramManifest` (`tools/gen-config/src/registry.ts:67-85`) has no `layout` field, against the spec's manifest bullet. Choice: the default goes in `plugin.layoutEngine: { default: 'compass' }` (D284), as mindmap does; the manifest gets no new field. No rendering effect.
- `useWidth`/`useMaxWidth` have no architecture rows of their own; add them as venn does (`config.schema.yaml`).
- No existing spec asserts `UNSUPPORTED_DIAGRAM` for architecture; add `packages/mermaid/src/architecture.spec.ts` as venn did.

## T6 #619

## Integration

Merge of `mermaid-v13` #637 (per-diagram files) and `fix/pre-manifest-diagrams` #638 into `feature/525_architecture`:

- Moved: `LANGIUM_LEXERS` and `HARVESTS` rows → `packages/conformance/src/architecture/tables.ts`; `PARITY_SUITES` entry → `src/architecture/suite.ts`; the 12 `divergences.json` entries → `divergences/architecture.json` (`parity.spec.ts` reads `DIVERGENCES_DIR`); `GRAMMARS` entry → `grammars:` and the theme spec's not-drawn-yet line → `theme: { notDrawnYet: true }` in `packages/diagram-architecture/workspace.yaml`. Dropped: the `harvest:architecture` script (run `harvest:v12 architecture`) and the eslint v12-specs line (a glob now).
- **#638 is not merged yet**; this branch carries it. Re-merge `mermaid-v13` once it lands.
- **Waiting on #638**: `tools/workspace/sync.spec.ts` ("take a new diagram package from its own folder alone") copied only `diagramPackages()` into its scratch root, so it dropped architecture, a real pre-manifest package, from conformance's devDependencies and failed. 8e7d0f7b6 copies the fix proposed on #638 (the one railroad carries in #633: copy `workspaceDiagrams()`). Drop that commit on re-merge once #638 lands with it.
- **Deferred to T5 #618**: `configDefaults: true`, `release:` and `languageBundle:` in `workspace.yaml` all need the manifest (and the `./language` facet); add them with it. Remove `theme.notDrawnYet` at T4 #614 once the renderer reads a theme variable.

- `tools/workspace/sync.spec.ts` one-line copy: on the re-merge after #640 (`fix/pre-manifest-language`) lands, take theirs, drop the copy, run `pnpm regen`. #640 also counts a pre-manifest `./language` export, which T6 (#619) needs if it lands before T5.
