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

Unmet criteria: none. Size rework (coordinator brief): gated core +589 B gz, down from +2,704 in the first version. Choices and known limits:

- **Only moved ends are redrawn.** An end already on its named side keeps layered's route; a graph whose sides match layered's ports is byte-identical. A moved end goes to the side's middle, or `anchorY` down a `left`/`right` side (D501 said only `compass` reads it; the doc comment is updated). Its stub is `corner + headRoom + marker length`. Then right angles join the route's middle: along the stub first where the route lies ahead, else across to a lane one stub past the box. That is up to three turns, against the brief's two: the lane cut end-box crossings in the matrix from 164 to 4 of 384 for about 20 B. A 2-point route gives both ends stubs.
- **Dropped for size (limits):**
  - Ends on one side are not spread apart, so a moved end may meet another end at the side's middle (`it.todo`).
  - The drawing does not grow. New points are clamped to half the padding, so a stub at the drawing's edge can be shorter than its marker room.
  - In-line and doubled-back points are not removed; the extra points draw over the same line.
  - An unknown side is not a `RangeError` (`Side` is typed; `compass` still checks it) (`it.todo`).
  - No global avoidance: routes may cross other nodes and edges, and 4 matrix routes still cross an end box (counted in the spec).
- **No special cases.** Self-loops and group ends go through the same path; the self-loop label stays where layered put it. The grid (ASCII) ignores sides.

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

## T4 #614

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
