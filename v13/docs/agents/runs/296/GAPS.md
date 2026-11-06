# Gaps — spec #296

Unmet criteria and open choices, filed under the ticket that owns each one. Each choice not covered by the spec or a D-id is also listed under "For the maintainer" in the integration PR body.

## T0 (#339)

- Choice: only the first registered drawer is asked. If its `active` returns false, nothing draws and a later drawer is not tried. This is the literal reading of "first registered drawer wins".
- Choice: with an active drawer, the stream output is re-checked against the allow-list (`inertProblem`, values included), as after `postRender`. On its own the sink checks only tags; the writer checks attribute names. The cost is one linear scan, and only when a drawer is active.
- Choice: `draw` returning `false` after writing keeps what it wrote, followed by the plain leaf. This allows an underlay (ER, D308).
- Choice: `active` or `draw` returning a non-boolean is `INTERNAL`, as is using the sink after `draw` returns.
- Size: core +546 B gz. The core closure is 89,604 of 90,112 B (508 B left); H2 and the other M4 sessions will press this budget.

## T1 (#340)

- D308(a) finding: no v13 ER edge or end marker is drawn under an entity, so v12's solid underlay is dropped. Over the 218 ER corpus files that render (446 edges, 1,157 marker pieces), no sampled point of an edge path, crow's foot, bar or circle lies even 0.01 px inside an entity's box. Grow the boxes by 0.5 px and 445 edges and 452 marker pieces touch them, so the check does see the geometry: lines and markers stop at the outline. Entities are drawn after the edges, but nothing overlaps. One thing still shows through a hachured entity: a subgraph's fill, as for a flowchart node on a subgraph.
- Choice: paint that an edge takes from its `edgePaths` group stays on the group. Flowchart, class and state edges get `stroke`, `stroke-width` and `fill: none` from it; ER edges carry their own stroke. T0's rule says to put all paint on the call, but here that would change the corpus bytes. H2's edge drawer must write one `<path>` that keeps inheriting this paint, as H1 already plans. Note that H1's `sketch` draws no outline set when `stroke` is absent, and an inherited edge arrives without one. H2 has to pass a placeholder stroke for `edge` and leave it off the written path.
- Choice: invisible shapes go through the hook too. That covers flowchart's `text` and brace hit boxes (`fill` and `stroke` `none`, role `node`) and state's concurrency region frame (role `group`, the only `group` state has). The drawer sees `none` paints.
- Choice, flowchart roles beyond the ticket's list: the collapsed card is a `node`, with its separator as a `divider` and its three dots as `mark`; `browser`'s dots are `mark`; `fr-circ`'s inner disc is a `part`; braces and icon frames are `node`. `fork`, `choice`, `f-circ` and `sm-circ` are `node` in flowchart: v12 drew them with node options, and only `stateStart` used `solidStateFill`.
- Choice, state: the start, the end's ring and dot, choice, fork and join are all `mark`. Composite `outer` and `inner` are `part`, and the dashed lines between regions are `divider`. ER subgraphs are `group` (the ticket doesn't list them).
- The identity spec's base writes each outline as a plain leaf in the same process, so it can't see a changed attribute. That was checked once by hand instead: the 1,201 corpus files of the four types (1,142 render), in six themes (default, neo, neo-dark, redux, dark, forest), are byte-identical before and after adoption (7,206 SHA-256 digests). Re-checked independently at merge: 1,201 files × 4 themes (default, neo, redux, dark), 4,568 renders plus 236 parse errors, identical SHA-256 between `feature/296_hand-drawn` before and after the merge.

## H1 (#341)

- **roughjs import (for the maintainer).** The spec says to import `RoughGenerator` from `roughjs/bin/generator`; that file cannot load in Node's ES module loader (`bin/fillers/filler.js` imports `./hachure-filler` with no extension), so `renderSync` in Node would fail. The adapter imports `roughjs/bundled/rough.esm.js` and calls `rough.generator()` (the same `RoughGenerator`; `rough.svg` is never called), typed by `src/roughjs.d.ts`. That bundle is the same code in Node and in bundlers; `roughjs`'s main entry is CJS in Node and ESM in bundlers. It carries the unused canvas and svg classes (the 8.9 KB of D306).
- v12's `handDrawnShapeStyles.spec.ts` at fa796a943 has no dash-array cases; H1's come from `getStrokeDashArray` itself, including its quirk that `5,3` (comma) gives `[0, 0]`. They only set roughjs's `strokeLineDash`, which changes no op; the sketched outline keeps the leaf's `stroke-dasharray`.
- A rounded rect's radius is `rx ?? ry`, clamped to half a side as SVG clamps it; v12 did not clamp.

## H2 (#342)

- **Unmet, for the maintainer: alt composite bodies.** The role table wants hachure for a `statediagram-cluster-alt` body. That class is on the composite's `<g>`; the `inner` leaf's attrs (all a drawer sees, T0) carry only `class: inner` and the alt fill, so the drawer cannot tell. Both composite parts are solid. Fixes: state adds a class to the alt `inner` leaf (changes plain output bytes), or core hands the drawer more context (core change, beyond T0). Not chosen here.
- Choice: composite parts use roughness 0.7. v12 drew the body (and a square title band) at roughjs's default roughness 1, which D304 rules out.
- Choice: `LOOK_REMOVED`'s plugin name is appended in `mermaid` (`toWarning`), not core: check-deps fails core for naming an optional package in any string (D153), as D173 put ELK's name in `mermaid`. Message: `… was removed in v13. For handDrawn, register @mermaid-js/plugin-hand-drawn.`, for every `look` value.
- Choice: a section's `look: handDrawn` turns `handDrawn` on for whatever diagram is drawn, not only that section's type (aliases are not per type). v12 read only the drawn type's section.
- Choice: text output warns `ASCII_DROPPED` (`handDrawn`) for every type with `handDrawn` on, sequence included, though its SVG is not sketched either.
- Choice: an outline with nothing to sketch (fill and stroke absent or `none`) is the plain leaf, so hit boxes keep their pointer target. A node's leaf attributes other than geometry and paint (`class`, `filter`, `opacity`, `transform`, `style`, data attributes) go on the `<g>`.
- Choice: an edge's placeholder stroke is `currentColor`; it only tells roughjs to draw an outline and is never written.
- Choice: a group is sketched as `rectangle`, as H1 maps a square rect; v12 drew clusters as a radius-0 rounded-rect path, whose ops differ. Options match v12; geometry calls are H1's.
- The fragment's aliases list core's 31 sections by name; `index.spec.ts` fails when core gains a section with `look` the list lacks.

## H3 (#343)

- Choice: the baselines are `e2e/diagrams/<type>/baseline/handdrawn/{default,redux,neo,neo-dark}.mmd`, not the spec's `<type>/handdrawn/`. The second level under a type is the tier (`baseline`, `pr-check`, `nightly-check`, `visual-check`; `MERMAID_E2E_FIXTURE_TIER` filters on it), and curated topic folders sit under `baseline/` (`baseline/themes/`), which the gallery and the page adapter's spec read. State's baselines are in `state-diagram-v2`, as its theme baselines are.
- Choice: the page adapter (`packages/dev/src/adapter.ts`: e2e page, gallery, dev server) registers the plugin, as it does math. So the 168 corpus files with `look: handDrawn` in the four types now render sketched in the snapshot run, where they drew plain with `LOOK_REMOVED`.
- Found and fixed (H1's `sketch.ts`): under tsx, which runs the dev server, `import rough from 'roughjs/bundled/rough.esm.js'` gave `{ default: rough }` (roughjs has no `type: module`), so the server would not start. The import now unwraps that default. Node's own loader, vitest and esbuild were not affected.
- Activates on install: checked for Node only. The SSR app (`e2e/platform/ssr`, npm, pnpm, bundled server) installs the packed plugin and sketches `look: handDrawn` with no registration code; with `discovery: false` it warns `LOOK_REMOVED`. The bundler plugin and CDN paths are generic for extensions (D167, D169) but no app exercises this plugin through them.
- Unsketched types: only sequence has a v13 package here. Gantt, pie, timeline, journey, quadrant and gitGraph are skipped in `unsketched.spec.ts` and join it when their ports land.
- PNGs are not committed (`e2e/__snapshots__/` is ignored). They were made in `mcr.microsoft.com/playwright:v1.62.1-noble` under `.tmp/t343-vis/`.
- For the maintainer (D306): the plugin is 11,151 B gz with roughjs, against v12's roughjs chunk of 9,549 B gz (`mermaid@12.2.0`, `chunk-F6PIGZHG.mjs`). Eager loading kept; revisit if wanted.
- Not measured: warm render time (not measured on a steady machine) and output bytes against `mermaid@12.2.0`, whose hand-drawn output needs a DOM (`rough.svg`).

## H4 (#344)

- Done on the mindmap branch (#294, `feature/344_mindmap-handdrawn`): 32 baselines under `e2e/diagrams/mindmap/baseline/handdrawn/<shape>/<family>.mmd`, one per node shape plus edges in the four families (choice and output sizes in `runs/294/GAPS.md`, #344).

## Final review

- roughjs import (supersedes H1's and H3's notes on it): `sketch.ts` imports `roughjs` itself. Node gets `bundled/rough.cjs.js` (`module.exports = rough`) on every version `engines` allows; `roughjs/bundled/rough.esm.js` loaded only with module-syntax detection (Node 20.19+/22.7+). Bundlers take the `module` field, the same code. Types come from roughjs's `bin/rough.d.ts`; TypeScript puts its `export default` under `.default` for a CommonJS entry, so the import is cast, not unwrapped (every loader hands over the object itself). `src/roughjs.d.ts` and its `packages/dev/tsconfig.json` include are gone. `e2e/platform/ssr.spec.ts` now renders the installed plugin under `NODE_OPTIONS=--no-experimental-detect-module` (it failed before: plain output with `LOOK_REMOVED`). The built entry loads with `node --no-experimental-detect-module`; the Node-vs-Chromium byte spec passes; `pnpm dev` boots.
- `LOOK_REMOVED` (supersedes H2's "for every `look` value"): the plugin hint is appended only while no registered config fragment declares a `handDrawn` key. The check is generic (`mermaid` reads `registry.fragments()`), so `mermaid` still never imports the plugin (D153).
- T0's re-check (supersedes T0's choice above): `inertProblem` runs after a stream render only when the drawer's sink wrote in that render (`ActiveOutline.wrote`). A drawer that only returns `false`, or a type that never calls `w.outline` (sequence), costs no scan and is never blamed for the diagram's own output. Core closure: 89,626 → 89,671 B gz (+45: +27 core, +18 `mermaid`'s hint check), of 90,112.
- MIGRATION.md: mindmap and gantt, pie, timeline, journey, quadrant and gitGraph are "once ported"; added the opt-out (only `handDrawn: false` turns it off; a spec in `index.spec.ts` pins it) and output size with how to raise `maxOutputLength` (`initialize({ limits })` or per-call `config.limits`; checked: a 40-node sketched flowchart fails at 100,000 and renders at 20,000,000).
- Output size measured here: 5.0–10.4× for small samples (style sheet dominates), 6.6× (20-class diagram) to 14.0× (40-node flowchart, 15-entity ER) for larger ones. MIGRATION.md says "roughly 5–25×", not the review's 10–25×: no sample here reached 10× for class diagrams. Corpus-wide ratios not measured.
