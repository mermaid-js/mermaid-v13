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

## T0c #592

## T1 #594

Unmet criteria: none. Choices the spec and D-ids leave open:

- **Quirks, as probed against 2.0.1 and kept** (P1; all gated in `architecture-cases.json`): `Backend` lexes `B` + `ackend` (also `Left`, `Title`); `row`, `in`, `group`, `service`… as ids are keyword tokens, `rows`/`inx`/`services` are ids (keywords yield only to a strictly longer ID); `title` has no boundary, so `service titlex` is `service`, ` title`, `x` (TITLE/ACC_* take their leading blanks: they precede WHITESPACE); `a:r -- l:b` lexes sides as ids; `architecture-beta service a` and `architecture-betax` (an ID) as v12; `<`/`>` are one token either side of `--`. Labels: a quoted form may hold `]`, `[` and line breaks (`["a]b"]`, `["a\nb"]`), `["a"b]` falls back to the run, a run stops at `[`/`]`/CR/LF (`[a [b] c]` is an error at the first `[`), `[]` and `( server )` are errors.
- **Harvest** header is `architecture(?:-beta)?` (v12's detector takes bare `architecture`, lexed as an ID; one harvested source is the bare describe title). Files beyond the ticket's three, per the spec's Testing Decisions: `architectureSeed.spec.ts`, `svgDraw.spec.ts`, `examples/architecture.ts`, `multi-diagram-id-uniqueness.spec.ts`. 47 sources.
- **Excluded** from the gate: `unclosed-directive*` (core's shared preprocess, as pie/radar/wardley). **Not reached**: `header-upper`, `header-mixed-case` (v12's detector is case sensitive) and six `commented()` copies whose cut falls in the header.
- **8 new fixtures** `e2e/diagrams/architecture/nightly-check/lexer-*.mmd` (arrowheads incl. `> -- <`, text icons, quoted/raw/CJK labels, keyword-prefixed and digit ids, header on a statement line, free blanks, labelled `{group}` edge, like-side and self edges); v12 parses all 8. **Conflict with T0**: `conformance/src/compass/architecture-corpus.spec.ts` (#590 branch) reads every `.mmd` under `e2e/diagrams/architecture` and asserts 20 files and 79/87 facing edges; when T0 and T1 meet on the integration branch, restrict it to the 20 v12 fixtures (or update its counts) and check its test-only builder reads `"text"` icons and `> -- <`.
- Package skeleton is private with no manifest; `theme-used-by.spec.ts` lists `architecture` in `NOT_DRAWN_YET` until T4 (#614) reads a theme variable.

## T2 #599

## T3 #607

## T4 #614

## T5 #618

- `DiagramManifest` (`tools/gen-config/src/registry.ts:67-85`) has no `layout` field, against the spec's manifest bullet. Choice: the default goes in `plugin.layoutEngine: { default: 'compass' }` (D284), as mindmap does; the manifest gets no new field. No rendering effect.
- `useWidth`/`useMaxWidth` have no architecture rows of their own; add them as venn does (`config.schema.yaml`).
- No existing spec asserts `UNSUPPORTED_DIAGRAM` for architecture; add `packages/mermaid/src/architecture.spec.ts` as venn did.

## T6 #619
