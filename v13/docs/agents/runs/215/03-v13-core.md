# 03 — v13 seams this spec touches

Paths are under `packages/` in this worktree.

## Label layout (`core/src/text/`) — T0

- `label.ts:12` `Run extends LabelSpan { style, width }` — **the only run kind is text**; "kinds" are `StyleBits` (`measurer.ts:17-24`: Bold, Italic, Mono, Sub, Sup, Underline). A box run is a new union member.
- `label.ts:21` `MeasuredLabel` (lines, indents, widths, width, `left?`); `:34` `LabelOptions` (markdown, style) — no provider/registry parameter today.
- `label.ts:72` `layoutLabel(raw, font, maxWidth, measurer, options)`; `:80` reads `ascent`/`lineHeight` once; `:90` **`height = lines.length * lineHeight`** — fixed line height, so a box taller than a line needs per-line heights (and `LabelBox.height`/`baseline` per line).
- Fast path `:100-103` (skipped when `RE_SLOW` `:48` matches; `$` is not in it — a `$$` label takes the fast path today).
- Line split: `plainLines :143` (breaks `RE_PLAIN_BREAK :49`), `markdownLines :151`; `inline :204` turns a line into `Piece`s (`:41`); `tidy :279`.
- Line breaking: `wrap :304` (greedy, word pieces from `RE_PIECE :63`, CJK/kinsoku); `split :380` breaks an over-long word by character — a box piece must never reach it; `finish :406` merges same-style pieces and measures; `run :433` builds the `Run`.
- Callers (each diagram builds its label closure): `diagram-flowchart/src/render/prepare.ts:164`, `diagram-class/src/layout/prepare.ts:227,229`, `diagram-class/src/layout/box.ts:100`, `diagram-er/src/layout/prepare.ts:226`, `diagram-state/src/layout/prepare.ts:151`, `diagram-sequence/src/layout/env.ts:190`. All already go through core → M3 reach is "thread the provider", not "port a renderer".
- Measurer: `measurer.ts:33-39` (`width`, `metrics`, `id`); `VerticalMetrics :27` = ascent, descent, lineHeight only. **No x-height / ex size anywhere**: `metrics.ts:6` `FACES` stores ascent, descent, line gap + advance widths. ex→px for MathJax needs a new metric (or a fixed em ratio). Implementations: `core/src/text/table.ts:98` (`metrics :123`), `mermaid/src/measurer.ts:81` canvas (`metrics :124` delegates to the table `:131`), `selectMeasurer :158`, `core/src/ascii/measurer.ts:54` cells.

## `SvgWriter.label()` (`core/src/svg/writer.ts`)

- `LabelSpan :14`, `LabelBox :29` (lineHeight, height, baseline, left/width/indents).
- `SvgWriter.label :55`; both backings call `writeLabel :100` (Stream `:213`, Tree `:263`).
- `writeLabel` emits **one `<text>`** with `<tspan x y>` per line (`:118-148`); single-run fast form `:110-116`. A box cannot live inside `<text>`: the writer must close/split the `<text>` and emit a `<g transform>` at the run's x on the line baseline.
- `SvgNode` (`core/src/svg/tree.ts:12`) is a **branded number index into a writer's tree**, and the stream writer has no tree. A box run carrying `node: SvgNode` from label layout (before any writer exists) does not fit; likely needs a writer callback `(w: SvgWriter) => void` or a detached fragment. Flag to T0.

## R-SEC-2 allow-list and R-ARCH-6 determinism tests

- Allow-list tables: `core/src/svg/allowlist.ts:9` (tags: svg g path rect circle ellipse polygon polyline line text tspan a title desc image — **no use, defs, symbol, clipPath, foreignObject**); attrs `:27-…` include `transform`, `d`, `fill`, `stroke*`, `data-id/-ast/-p/-color-id` only (MathJax's `data-mml-node`/`data-c` must be stripped). `assertInert` `core/src/svg/inert.ts:283`; its spec `core/src/svg/security.spec.ts:123`.
- Corpus property tests (each has a module `api()` = `createMermaid(); initialize({ deterministic: true })`):
  - flowchart `conformance/src/flowchart-render.spec.ts:30-34` api, `:127` allow-list, `:135` determinism (fresh API, same bytes).
  - class `conformance/src/class-render.spec.ts:137`; ER `er-render.spec.ts:95`; sequence `sequence/render.spec.ts:150`; state `state/render.spec.ts:193` (allow-list), `:201` (determinism + both backings).
  - fuzz `conformance/src/fuzz/fuzz.spec.ts:32` (no crash/hang/allow-list violation).
  - API-level: `mermaid/src/api.spec.ts:518` determinism key.
  - postRender re-check: `mermaid/src/extensions.spec.ts:264-300`.
- Enabling an extension in a test: `await m.registerExternalDiagrams([plugin])` on the `createMermaid()` object, then `assertInert(result.svg)` — `plugin-interactions/src/index.spec.ts:33-34, :111`; `class.spec.ts:212,256`; `menus.spec.ts:222`. Layouts: `m.registerLayoutLoaders([{ name, loader }])` as in `conformance/src/flowchart-layout.spec.ts:23-28`.

## Extension contract (DESIGN §12.2 = `v13/docs/DESIGN.md:627-648`; §12.1 manifest `:595-625`; §6.1 `:336-363`; §5.3 `:324-332`)

- `core/src/pipeline/extensions.ts:20` `LaidOut`, `:38` `ExtensionClaim` (`callbacks|menus`), `:41` `HookContext`, `:55` `ExtensionPlugin` (postParse, postLayout, postRender, afterMount, claims) — **no `resources`, no label/inline provider hook**; `:95` `HookRunner` (`register :99`, `start :117`).
- Manifest: `core/src/pipeline/manifest.ts:9` Diagram, `:27` Extension, `:53` `readManifest` — only `diagram|extension` (`:66`, `:72`); T0b adds `layout`. Precedent package: `plugin-interactions/package.json` `"mermaid": { plugin: extension, id, entry, export }`.
- Resources: `core/src/pipeline/errors.ts:19-24` `Resource` already has `layout` and `math` kinds; `NotLoadedError :81` names them. `DiagramPlugin.resources?` `core/src/pipeline/types.ts:98` (diagram-only).
- `mermaid/src/api.ts`: `placeholders?` option `:88-89`; `missingFor :280-293` (layout + themes + plugin resources); **`loadResources :295-303` handles only layout/theme/diagram — `math` and `iconPack` would never load**; `prepare :467`; placeholder path `:487-495`, `:513-521` (`PLACEHOLDER` warning); `renderSync :660`; `preload :742` (`layouts :752`); `registerExternalDiagrams :784`; `registerLayoutLoaders :793`; `registerIconPacks :798` (no-op + `ICON_PACKS_UNSUPPORTED` `:522-527`).
- `mermaid/src/registry.ts`: `ExternalDiagram :60`; **`LayoutLoader :63-66` = `{ name, loader(): Promise<LayoutEngine | {layout} | {default}> }`** (v12 had `algorithm` and an async `render`); `builtIn :93-94` = layered, dagre, elk, `elk.*` → "ready" as layered; `Registry :163`; `layouts` map seeded with `layered` `:170`; `registerExternal :281` (manifest extensions `:295-303`); `registerLayouts :372`; `layout(name) :383-388` (ready / missing / unknown); `loadLayout :390`.

## Layout types (`core/src/layout/types.ts`)

`RoutePoint :22` (adds `axis`), `LayoutNode :38`, `LayoutEdge :53` (label, startLabel, endLabel, markers), `EndMarker :82`, `LayoutGroup :87` (direction, padding, title), `LayoutSpacing :98`, `EdgeRouting :108`, **`LayoutGraph :110`** (+ diagramPadding, routing, headRoom, availableWidth, turnedSpacing, metrics, grid), `LayoutModelNode :152`, `LayoutModelEdge :160`, `LayoutModelGroup :171`, **`LayoutModel :181`**, `LayoutContext :192` (`options?` only), **`LayoutEngine :196`** `(graph, ctx?) => LayoutModel`. `layered` = `core/src/layout/layered/index.ts:69`; exports `core/src/layout/index.ts`.

- Gaps for ELK: `LayoutGraph` carries no config, no node metadata (`@{ algorithm }`), no shape outline. `api.ts:557-563` calls `engine(graph)` **without a ctx**, so `elk.*` config has no path to the engine today (E3/E4 must add one, e.g. `LayoutContext.options`).
- Layout selection: `api.ts:271-272` `layoutName` reads only top-level `config.layout`; `LAYOUT_UNKNOWN` `:531-537`. Per-type `flowchart.layout` etc. is `pending` (`core/schema/config.schema.yaml:1137-1141`, `BaseDiagramConfig`).
- `flowchart-elk`: aliases `diagram-flowchart/src/plugin.ts:22`; detected `parser/detect.ts:16`, lexed `parser/lexer.ts:658`; config `mermaid/src/config-snapshot.ts:245-246` sets `layout: 'elk'` as a plugin default.

## Config validator and `gen:config`

- Source of truth `core/schema/config.schema.yaml`; status vocabulary `:14-21` (honoured / ignored / pending / removed / moved). `layout` `:522-527` (default `layered`). **`elk` section `:596-782`**: 13 keys, each `x-mermaid: { status: pending }`, section `pending` with reason "ELK layout moves to an optional plugin package (R-PLUG-8)" (`:780-782`). `legacyMathML :911`, `forceLegacyMathML :920`.
- Generator: root `package.json:27-28` (`gen:config`, `check:config`), `tools/gen-config/src/cli.ts`; `generate.ts:21-26` output paths, `SECTION_OWNERS :33-38` (diagram sections owned by packages — the precedent for fragments), `keyTreeSource :99`, `keyNotes :185`, `referenceDoc :322`, `migrationSection :361`; `schema.ts:7` `Status`, `annotationErrors :123` (ignored needs reason `:148`).
- Runtime: static `KEY_TREE` `core/src/config/generated/keys.ts:42`; `KeyTree` `core/src/config/keys.ts:10`; `resolveSite` `core/src/config/resolve.ts:151` copies `KEY_TREE` (`:162`) and opens unknown plugin sections (`:163-165`) — the hook point for T0b fragments; `check :329`, `walkObject :337`, `CONFIG_UNKNOWN_KEY :347`, moved/removed `:358-370`.

## Warnings and text output

- No central code list: `Warning.code` is a free string (`core/src/pipeline/types.ts:18-31`, `feature`/`astIds` for `ASCII_DROPPED`). Codes are defined where raised: `ASCII_DROPPED` kinds per type in `diagram-flowchart/src/ascii/warnings.ts:15-21,162`, `diagram-er/src/ascii/warnings.ts:10`, `diagram-sequence/src/ascii/warnings.ts`; config codes `core/src/config/resolve.ts:31-43`; `LAYOUT_UNKNOWN`/`PLACEHOLDER`/`ICON_PACKS_UNSUPPORTED` in `mermaid/src/api.ts`. User-facing list lives in `v13/docs/MIGRATION.md` (e.g. `:445`).
- Text output: `api.ts:573` `drawAscii` → `contextFor` with `cellProfile` (`:594-597`). It uses **the same `layoutName`** as SVG, and `missingFor(…, text=true)` still requires the layout (`:283-287`) and throws `NotLoadedError` for text (`:514`). D179 needs text output to force `layered` + one `ASCII_DROPPED` (feature `layout`).

## DDLT helpers and fixtures

- `core/src/layout/validate.ts:44` `validateLayout(graph, model) → string[]` (finite, inside, no overlap, containment, edges at their boxes; `SLACK 0.5` `:7`); `:199` `countCrossings`; grid variant `validate-grid.ts:40`. Exported `core/src/layout/index.ts`.
- Flowchart DDLT: `conformance/src/flowchart-layout.spec.ts:12-49` — captures parser-produced `LayoutGraph`s through a recording engine registered for `layered, dagre, elk, elk.box, elk.rectpacking` (`:23-28`), asserts `validateLayout` empty (`:44`), snapshots crossings (`:48`). Same pattern: `class-layout.spec.ts`, `er-layout.spec.ts`, `state/layout.spec.ts`; engine fixtures `core/src/layout/layered/layered.fixtures.ts`.

## Size job

- No core size-budget file exists yet (R-PERF-8 is #218 T0). Today's gate is R-PERF-1: `bench/src/gates.ts:18-33` (`loadedGzipBytes 80 KB`, core + flowchart), evaluated `:146-156`; bundles `bench/src/build.ts:78` (esbuild, `staticClosure :64`); PR check `bench/src/pr-check.ts`; CI job `.github/workflows/ci.yml:35` (hosted CI not run on v13 — verify locally).
- Import boundaries for S1: `tools/eslint-plugin/index.ts:4` (core → nothing), `:21-32` package classification, rule `:108`; spec `tools/eslint-plugin/rules.spec.ts:50-56`. No rule yet forbids `mermaid` importing an optional package.
