# Final review: spec #127 (state diagram port), seams between tickets

Branch `feature/127_state-diagram` at `3c644ad5f`, diff `git diff mermaid-js/mermaid-v13...HEAD`.
Read only. Items already in GAPS.md are left out.

Baseline: `vitest run packages/diagram-state packages/conformance/src/state packages/mermaid/src/state.spec.ts`
passes (22 files, 237 tests; lexer parity 647/654, 0 diffs). `pnpm check:config`, `pnpm check:grammar`
and `pnpm lint:knip` are clean. The generated registry, facets, detectors and format matrix match
their generators: I regenerated them in memory and compared (script `reg.mts`, below).
Isolation holds: every non-relative import in `packages/diagram-state/{src,scripts}` is a
`@mermaid-js/core[/…]` subpath, `node:*` (the port script) or `vitest` (specs).

Probe scripts are in the session scratchpad. Each was run with
`node_modules/.bin/tsx --conditions=mermaid-source <script>.mts` from the worktree root.

Severity counts: 1 high, 2 medium, 4 low.

---

## 1. High: a `postLayout` hook that returns a new `LayoutModel` crashes every state diagram with a composite

**Fixed in `83f98b6a4`:** `completeLayout` re-derives the views (warnings dropped) and the dividers from the hook's groups; `extensions.spec.ts` hooks a state diagram.

**Where:** `packages/diagram-state/src/render/render.ts:317` (`for (const d of layout.dividers)`), with
`render.ts:178` (`layout.state ?? prepareState(model, ctx)`) and `layout/layout.ts:21-26`.

**Defect:** The layout (#144) and the renderer (#146) disagree about what survives the pipeline's
`postLayout` hooks. Core types a graph hook's input and output as the shared `LayoutModel`
(`core/src/pipeline/extensions.ts:20-26`), and `extensions.ts` checks only `kind`, `diagram` and
`units`. `StateLayout` adds `dividers` (required) and `state` (optional). The renderer falls back
when `state` is missing, but it reads `dividers` with no check. The fallback also runs
`prepareState` a second time, so every style warning is reported twice.

**Failure:** Run
```js
m.registerExternalDiagrams([{ id: 'shift', postLayout(l) {
  const { nodes, edges, groups, width, height } = l.layout;
  return { ...l, layout: { nodes, edges, groups, width: width + 100, height } }; } }]);
m.render('x', 'stateDiagram-v2\n state X {\n a --> b\n }\n');
```
It throws `MermaidError: layout.dividers is not iterable`. The same hook works on a flowchart
(`p8.mts`: `flowchart TD ok 268`, `stateDiagram-v2 THROWS`). If the hook keeps `dividers: []` and
drops `state`, `style A fill:#f00,behavior:url(x.htc)` warns `STYLE_PROPERTY_DROPPED` twice instead
of once (`p10.mts`).

**Fix:** In `renderState`, treat a missing `dividers` as "compute them". Factor `stretchRegions`
out of `layoutState` so the renderer can run it on the hook's groups when `layout.dividers` is
absent, or at minimum use `layout.dividers ?? []`. When the fallback re-prepares, pass a
`warn` that drops the warnings, because `prepareState` already reported them once in `layout`. Add a
state case to `packages/mermaid/src/extensions.spec.ts`, which today hooks only flowchart.

## 2. Medium: `isValidId` refuses valid ids that contain `$`

**Fixed in `0513942b3`:** `line.replace('@', () => name)`; `$` ids now read back (refused only for `class`/`style`, as `café`), cases in `language.spec.ts`.

**Where:** `packages/diagram-state/src/language.ts:34`: `line.replace('@', name)`.

**Defect:** With a string as the replacement, `String.prototype.replace` expands `$$`, `$&`,
``$` `` and `$'`, so the probe document does not hold `name` as written. Flowchart's `readsBack`
(`diagram-flowchart/src/language.ts:75`) builds its text with a template literal, so this is drift
between the two copies.

**Failure:** `stateDiagram-v2\n  x$$y --> B` parses with no diagnostics, and hover shows state
`x$$y`. But renaming `A` to `x$$y` in `stateDiagram-v2\n  A --> B` returns
`{"refused":"'x$$y' is not a state id."}`, and `a$'` is refused the same way (`p3.mts`). The
refusal is false: the rename would produce a valid diagram.

**Fix:** Write `line.replace('@', () => name)`, or slice around `indexOf('@')`. Add a `$$` case
to the `rename/` goldens or to `language.spec.ts`.

## 3. Medium: the `./testing` subpath is published scaffolding, and its pipeline is not the real one

**Fixed in `cb765a0f3`:** `./testing` export removed; the helper is `src/testing.fixtures.ts` (unbuilt, with `state.configDefaults`); the conformance render spec runs on `createMermaid()` with a recording extension; `STATE_LAYOUT_DEFAULTS` gone (the layout reads `stateConfigDefaults`).

**Where:** `packages/diagram-state/package.json:27-31` (export `./testing`, shipped in `dist`),
`src/testing.ts:2-4` and `:50-57`, `src/layout/metrics.ts:49-52`.

**Defect:** `testing.ts` says it exists "until T5 (#148) registers the state plugin and the public
`render()` reaches it". #148 did both, but the seam stayed and is published. Flowchart has no
`./testing` export. The seam calls `resolveConfig(…, {}, …)`, with **no plugin defaults**, while
the real pipeline passes `state.configDefaults` (`mermaid/src/config-snapshot.ts:244`). So
`config.state` is empty in every conformance render
(`conformance/src/state/render.spec.ts:8`, its header comment is stale too), and the builder
depends on `STATE_LAYOUT_DEFAULTS` (`metrics.ts:49`), a hand copy of
`generated/config-defaults.ts`'s `wrappingWidth` and `minNodeWidth`. Today the two paths give the
same bytes on my probes (`p1.mts`: `same svg true` for 7 cases). Nothing keeps it that way: if
`gen:config` changes a default, or a key is read without a `??` fallback, the conformance suite
keeps passing on a config the product never builds.

**Fix:** Pass `{ state: state.configDefaults }` as `pluginDefaults` in `renderForTest`, or build the
seam on `createMermaid()` and keep only the tree access. Then remove `STATE_LAYOUT_DEFAULTS`,
or derive it from `stateConfigDefaults`. Either move the helper to a non-exported spec helper or
keep it and document it as public in the README. Update the two stale comments.

## 4. Low: the build ships the test-only v12 spec adapter

**Fixed in `0513942b3`:** `src/v12-specs/**` excluded from `tsconfig.build.json`.

**Where:** `packages/diagram-state/tsconfig.build.json:10`.

**Defect:** Flowchart's build config excludes `src/v12-specs/**`
(`diagram-flowchart/tsconfig.build.json`); state's does not. `src/v12-specs/adapter.ts` is not a
`*.spec.ts`, so `tsc -p tsconfig.build.json` emits it.

**Failure:** `tsc -p packages/diagram-state/tsconfig.build.json --listFilesOnly` lists
`src/v12-specs/adapter.ts`, so `dist/v12-specs/adapter.js` goes into the published tarball
(`files: ["dist", …]`). That is unused weight from a module the file's own header calls "Test-only".

**Fix:** Add `"src/v12-specs/**"` to `exclude`, as flowchart does.

## 5. Low: a reopened composite that mixes plain children and regions gets zero padding

**Fixed in `e7ce54666`:** such a composite keeps its side and bottom padding; test in `layout.spec.ts`.

**Where:** `packages/diagram-state/src/layout/prepare.ts:484` (`groupPadding`), against
`parser/model.ts` `node()`/`group()`.

**Defect:** The builder assumes that a composite with regions holds only regions, so it gives the
composite zero side and bottom padding for the region frames to tile. The model breaks that
assumption: `group()` runs only on the first opening, so a later opening's regions join a
composite whose first opening put states directly inside it.

**Failure:** In
`stateDiagram-v2\n state X {\n a\n }\n state X {\n b\n --\n c\n }\n`, `a` has parent `X` while `b`
and `c` sit in `X:region1` and `X:region2`. `a` is laid out at x 8–144 with `X` at 8–596, flush
on the composite's border. It sits outside every region and no divider separates it (`p7.mts`).

**Fix:** In `groupPadding`, give the composite normal padding when any non-region node or group
has it as a direct parent. Alternatively, put such children in an implicit first region (v12
draws them mixed too, so record the choice in GAPS/MIGRATION).

## 6. Low: statements and options that do nothing get no warning, and completion offers them

**Fixed in `7d321e926`:** `IGNORED_IN_COMPOSITE` (`classDef`/`class`/`style`, and `click`, which lexes as state names there), `LINK_NOT_DRAWN`, `SCALE_IGNORED`; accept/reject unchanged; completion drops them in composites; MIGRATION.md lists them. `A:::cls` no-ops left open in GAPS.md.

**Where:** `render/render.ts:205-207` (links looked up for node views only),
`parser/model.ts:234,336` (`extract` reads top-level statements only),
`facet/completions.ts:168` (every `KEYWORDS` entry the probe expects).

**Defect:** Pitfall 22 says to warn whenever an option cannot be honoured. These are all accepted
with no diagnostic:
- `click X …` on a composite or on a state that is never drawn (MIGRATION documents the
  composite case, but the author is not told);
- `classDef`, `class`, `style` and `click` written inside a composite, which v12 and v13 both
  ignore;
- `scale … width`.

Completion then offers `classDef`, `class`, `style`, `click`, `accTitle` and `scale` inside a
composite body.

**Failure:** `stateDiagram-v2\n classDef c fill:#f00\n state X {\n a:::c\n class a c\n }` and
`click C "https://x" "t"` (C undrawn) give `diagnostics() == []` (`p4.mts`, `p9.mts`). Completion
on a blank line inside `state X { … }` lists `classDef`, `class`, `style`, `click` and `accTitle`
(`p9.mts`, `compsInComposite`).

**Fix:** Have the builder warn `IGNORED_IN_COMPOSITE` for those statements inside a composite and
`LINK_NOT_DRAWN` for a click whose target is not a drawn node. Leave them out of `byKind` when
the probe is inside a composite, or keep them and rely on the new warning. This is a behaviour
change against v12, so it goes to the maintainer.

## 7. Low: hover on a region's `[*]` names the composite, not the region's own start state

**Fixed in `d6d8039c8`:** hover resolves the enclosing region (`X`, region k); golden `hover/region-start`.

**Where:** `facet/hover.ts:107`, with `parser/names.ts` `keyOf` (the scope is the composite) and
`parser/model.ts` `translate` (the scope is the region).

**Defect:** The AST id of `[*]` is scoped to the composite (`n:X/[*]start`, `n:X/[*]start@2`).
The model scopes it to the region (`X:region1_start`, `X:region2_start`): two distinct states.
`pseudoHover` reads the AST id, and its regex has no `$`, so it ignores the `@2`.

**Failure:** In `state X {\n [*] --> a\n --\n [*] --> b\n }`, hovering the second `[*]` says "the
start state of composite state `X`" (`p3.mts`, `hoverRegionStart`). It is region 2's own start.
The first `[*]` gets the same text, so the two read as one state.

**Fix:** Resolve the hover through the model. Map the `[*]`'s AST id to the `StateNode` whose
`ast` equals it, then name its `parent`, which `placeOf` already renders as "`X`, region 2".
