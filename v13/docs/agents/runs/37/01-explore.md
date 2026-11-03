# 01-explore: pointer notes for #45-#50 (spec #37, M2 ASCII output)

Paths are relative to the worktree root. Line numbers are as of HEAD aad5fcbf5. Pointers only.

## State of the tree (what already landed)

- #41/#42/#43/#44 are merged: `UnitProfile` (`packages/core/src/layout/units.ts`), `LayoutGraph.grid` / `metrics`
  (`packages/core/src/layout/types.ts:~97-114`), the `core/ascii` kit (PR #76), ADR-13 (`v13/docs/adr/0013-unit-profile.md`).
- `RenderContext.units` exists (`packages/core/src/pipeline/types.ts:45`) but `api.ts:539` hardcodes `pxProfile`. No cell path wired yet.
- Not present anywhere: `snapRoute`, `repairRoute`, any `ascii` hook, `TextRenderResult`, `LaidOut.units`, `ascii` config section, CLI, ADR-14 file.
- `v13/docs/agents/runs/37/INDEX.md` already lists this file; tickets/ dir is empty.

## #45 core/ascii: snapRoute + repairRoute

- Kit files (all in `packages/core/src/ascii/`): `canvas.ts:13` Canvas class; `draw.ts:15` drawText, `:35` CellRect, `:42` BoxOptions, `:58` drawBox;
  `glyphs.ts:11` Stroke, `:21` Sides, `:28` GlyphSet, `:54` `unicode`, `:67` `ascii`, `:121` glyphFor(arms, set), `:142` `junction(a, b)` (junction merge lives in glyphs.ts, no junction.ts);
  `measurer.ts:11` Grapheme, `:28` graphemeWidth, `:45` cellWidth, `:54` `cellMeasurer`; barrel `index.ts` (11 lines, add new exports here).
- Specs sit beside each file (`*.spec.ts`); new `snap.ts`/`repair.ts` should follow that.
- No snap/repair stubs. Only Canvas has no occupancy/free-cell API; repair needs its own occupancy grid (boxes, label patches, group frames, edge cells).
- Layout types, `packages/core/src/layout/types.ts`: `RoutePoint` (`:22`, x/y + `axis: 'v'|'h'`), `LayoutModelNode` (`:117`, centre + size),
  `LayoutModelEdge` (`:125`, `points`, `label?` centre, `ports:{source,target}` Side), `LayoutModelGroup` (`:132`, centre, size, `title` centre), `LayoutModel` (`:142`, nodes/edges/groups Maps, `direction`).
  Centres are not top-left: odd widths give `k+0.5` centres (see research item 1).
- `packages/core/src/layout/units.ts`: `cellProfile(padding)` `:210`, `fromPx` `:218`, `UnitProfile` `:79`, comment `:145` says constants were hand-scaled.
- Research `v13/docs/research/ascii-snapping.md`: TL;DR `:13-41` (snap alone not enough, port capacity on LR is the main problem);
  "Recommendation for #42" `:331-362`; "What the repair router (#45) has to cover" `:363-392` (table of cases + sizing notes: bound the search window, repair segments not edges, model order, mark repaired paths occupied);
  open questions `:393-407` (too many ends per side; are sibling buses a defect, D79 tees). Self-loops are #42's job, not repair.
- Lint rule: `tools/eslint-plugin/index.ts` `import-boundaries`: header `:4-5`; `isCoreAscii` `:30`, `isAsciiCode` `:31-35`; core/ascii must not import SVG code `:96-98`;
  only ASCII code (path with an `ascii` dir or `ascii.*` file) may import `@mermaid-js/core/ascii` `:100-104`. Fixtures/tests: `tools/eslint-plugin/rules.spec.ts:36-42`.
  Consequence: flowchart entry must live at `src/ascii.ts` or `src/ascii/` to import the kit; core pipeline code cannot import it.
- Core `package.json` already exports `./ascii` (`packages/core/package.json`, `"./ascii"` entry).

## #46 diagram-flowchart ascii entry

- Plugin object: `packages/diagram-flowchart/src/plugin.ts:20-41` (`formats: ['svg']` at `:23`; `layout`/`render` at `:38-40`). `index.ts` (16 lines) is the package entry.
- Prepare: `src/render/prepare.ts:106` `prepare(model, ctx)` -> `Prepared` (`:47`: graph, groups, nodes, edges, pads); `NodeView` `:15`, `EdgeView` `:34`.
  It reads `theme.number(...)` px values for pads (`:~118-124`) and has px constants at `:55-62` (LABEL_W/H, GROUP_PAD, TITLE_PAD, EDGE_WRAP, IMG, ICON); `ROUTING` map `:64`. Check how #43 routed these through `ctx.units` before relying on them.
- Layout/render: `src/render/render.ts:31` `layoutFlowchart` (calls `(ctx.layout ?? layered)(prepared.graph)`, no routing/grid override), `:73` `renderFlowchart`, `:25` `FlowLayout`; edge route `inset()` `:~40-60` moves ends onto shape outlines (SVG only).
- Context: `src/render/context.ts:18` `FlowRenderContext` has measurer/theme/warn/layout but no `units`, no ascii options.
- Shapes: parser name list `src/parser/shapes.ts:5` `SHAPE_GROUPS` (v12 `shapesDefs`; `:52` undocumented names; `:61` set). Render-side defs in `src/render/shapes.ts` (`shapeSize` `:716`, `drawShape` `:718`, `isDrawnShape` `:734`, `canonicalShape` `:744`) are the SVG table; the D82 shape -> text-form table is new.
- Manifest: `packages/diagram-flowchart/package.json` `mermaid` key: `formats: ["svg"]`, `export: "flowchart"`; no `entry` key; `exports` has only `"."` (needs `./ascii` with `mermaid-source`/`types`/`default` like core's).
- Build: `"build": "tsc -p tsconfig.build.json"` (plain tsc, rootDir src, outDir dist, specs excluded), so `src/ascii.ts` emits `dist/ascii.js` automatically; no bundler. Registry codegen reads manifests: `tools/gen-config/src/registry.ts:~117-123` (writes `formats`), output `packages/mermaid/src/generated/registry.gen.ts`.
- Manifest type already allows ascii: `packages/core/src/pipeline/manifest.ts:7` `PluginFormat`, `:9-20` DiagramManifest (has `entry`, `export`, no `ascii` key yet), `:48` `readManifest`, `:~38` FORMATS set.
- `DiagramPlugin` type `packages/core/src/pipeline/types.ts:64-80`: `formats` at `:71`; no `ascii` hook type yet.
- Warning type: `packages/core/src/pipeline/types.ts:18` `Warning`; flowchart `FlowWarning` `render/context.ts:9`.

## #47 mermaid API, config, hooks

- `packages/mermaid/src/api.ts`: `RenderOptions` `:72` (`format?: 'svg'|'ascii'` already typed, `:85`), `RenderResult` `:94` (svg-only shape), `Prepared` `:115`, `createMermaid` `:316`,
  `prepareWith` `:443`, `prepare` `:458`, `draw` `:~466` (throws `UnsupportedFormatError` for any non-svg format at `:467-475`: replace), `renderSync` `:576`, `render` `:~582` (3rd arg is `container?: Element`, must also accept options object), `supportsFormat` `:667` (uses `registry.formats`).
  Units hardcoded `:539`; `defaultIdPrefix` hashes units id `:211-217`. Hook run: `:~560-570` (`drawDiagram`).
- Errors: `packages/core/src/pipeline/errors.ts:9` codes (UNSUPPORTED_FORMAT exists; `ASCII_TOO_WIDE` is a warning code, not here), `:44` MermaidError, `:95` `UnsupportedFormatError(diagramType, format)`, `:124` `errorFromDiagnostics`.
- Registry: `packages/mermaid/src/registry.ts` `FirstPartyEntry` formats `:28,38`, `formats()` `:193`, `entryExport` `:86`, manifest plugins `:214-223`; generated table `src/generated/registry.gen.ts` (load() imports package root; ascii needs a second lazy `import('@mermaid-js/diagram-flowchart/ascii')`).
- Config: schema `packages/core/schema/config.schema.yaml` (every key needs `x-mermaid` annotation, header `:14`; no `ascii` section yet). Generator `tools/gen-config/src/{cli,generate,schema}.ts`; run `pnpm gen:config` (`package.json:24`), `pnpm check:config` (`:25`, part of `pnpm check` `:32`).
  Outputs: `packages/core/src/config/generated/{config.type,defaults,keys}.ts` and `v13/docs/config-reference.md` (`generate.ts:23`). `gen:registry` for manifests.
- Hooks: `packages/core/src/pipeline/extensions.ts`: `LaidOut` `:17-20` (kind graph|custom; add `units`), `HookContext` `:25`, `ExtensionPlugin` `:39` (postParse/postLayout/postRender/afterMount), `HookRun` `:55` (`editsTree` `:57`), `HookRunner` `:79`. postRender needs an SvgTree, so ASCII mode must skip it by construction.
- Tests to extend: `packages/mermaid/src/api.spec.ts` (529 lines), `extensions.spec.ts`, `measurer.spec.ts`; type test precedent `packages/conformance/src/api-types.spec.ts`.
- Measurer: `packages/mermaid/src/measurer.ts:158` `selectMeasurer`; ASCII uses `cellMeasurer` from core/ascii regardless.

## #48 conformance

- Layout: `packages/conformance/` has `ascii/` (fixtures), `corpus/flowchart-v12-specs.json`, `divergences.json` (`[]`), `src/`.
- Fixtures: `packages/conformance/ascii/{ascii(92),extended-chars(47),multibyte(3)}/<name>/{input.mmd,upstream.txt,meta.json}`; `README.md` describes format and says expected.txt arrives with #48.
  `meta.json` keys: `source`, `charset` (`ascii` for ascii+multibyte, `unicode` for extended-chars), optional `paddingX`/`paddingY`/`maxWidth` numbers (read as render options).
- Divergences: `packages/conformance/ascii/ascii-divergences.json` entries `{fixture, kind, reason}`, kinds `rejected-input|reinterpreted|structural` (`structural` reserved for #48). Existing check `src/ascii-fixtures.spec.ts:32-96` (completeness, exists-once, rejected-input matches oracle `:76`).
- Separate older pattern for SVG parity: `src/divergences.ts` (`loadDivergences` `:15`, `inputHash` `:6`, entries with inputHash so stale ones fail) and `src/types.ts`. Reuse the stale-entry idea; the ascii list has no hash.
- Corpus: `src/corpus.ts` (`resolveCorpus` `:31`, `corpusFromDir` `:19`, `REPO_ROOT` `:7`); spec `src/corpus.spec.ts`. In-repo flowchart sources: `corpus/flowchart-v12-specs.json`, `src/flowchart/`, `src/stress.spec.ts`.
  Existing suites to model property tests on: `flowchart-layout.spec.ts:12` (layered over parser graphs), `flowchart-render.spec.ts`, `stress.spec.ts:215`, `parity.spec.ts`. No fast-check; "properties" here are loops over the corpus.
- No `expected.txt` files exist yet; generation script will be new (suggest a `src/cli/` tool like `harvest-flowchart.ts`).

## #49 CLI bin

- `packages/mermaid/package.json`: no `bin`; `exports` only `"."`; `dependencies` are workspace-only (`@mermaid-js/core`, `diagram-flowchart`); `"build": "tsc -p tsconfig.build.json"`; `files: [dist, THIRD_PARTY_NOTICES]`. Needs `bin: { mermaid: ./dist/cli.js }` with a shebang; tsc keeps the shebang.
- Table measurer: `packages/core/src/text/table.ts:98` `tableMeasurer`; selection `packages/mermaid/src/measurer.ts:158` (`deterministic: true` forces it).
- R-ERR-2 formatter: `packages/core/src/parser-kit/format.ts:33` `formatDiagnostic(src, d, lines?)`; `errorFromDiagnostics` (`errors.ts:124`) already puts snippet+caret in `MermaidError.message`, so the CLI can print `error.message`.
- Zero-dep check: `tools/check-deps/check-deps.ts` (~`:21-27`, forbids runtime deps in core and diagram packages; spec `check-deps.spec.ts`); `tools/release/src/public-gate.ts` also mentions R-PERF-2. Confirm whether `mermaid` package is covered; the CLI must use `node:` builtins only (`parseArgs` from `node:util`).
- Exit codes: 0 / 1 / 2 on `UnsupportedFormatError` (`code === 'UNSUPPORTED_FORMAT'`). Process-spec precedent: none in mermaid package; bench has `src/cli/` scripts run with `tsx --conditions=mermaid-source`.

## #50 bench, docs, ADR

- Gates: `packages/bench/src/gates.ts:18` `LIMITS` (`loadedGzipBytes` for R-PERF-1, 80 KB per `gates.spec.ts:123`), `:31` `GateId` union, `:119` `evaluateGates`, size gate `:131-146` (reads `v13.size`, a gzip total, `source: loaded|static`). Add a new gate id (e.g. `ascii-size`) with a 15 KB limit and report it in `report.ts`.
- Sizing: `packages/bench/src/build.ts:56` `bundle` (esbuild), `:29-30,42` `staticClosure` (static imports only, lazy chunks separate); spec `build.spec.ts:31` already tests static vs lazy. Reuse for "SVG-only page never loads ascii chunk".
- CI: `.github/workflows/ci.yml:35-60` bench job (`pnpm --filter @mermaid-js/bench bench ...`, `BENCH_REPORT_ONLY: speed`).
- Generators pattern for matrix: `tools/gen-config/src/` (`generate.ts` writes files + `--check` mode, `registry.ts` reads manifests); `check:*` scripts in root `package.json:25-32`. Add `gen:formats` or fold into `gen:registry`; wire into `pnpm check`.
- Docs location: `v13/docs/` (flat: DESIGN, DECISIONS, REQUIREMENTS, MIGRATION, `config-reference.md`, `theme-variables.md`, `syntax/flowchart.md`, `research/`, `adr/`). No existing user-docs site or `docs/` content besides `docs/agents`. Put the page at `v13/docs/ascii.md` (or `syntax/`), the matrix generated inside it or as `v13/docs/format-matrix.md`.
- ADR: `v13/docs/adr/0013-unit-profile.md` is the only ADR file, format: title `# ADR-13: ...`, `Status:` line, Context, Decision. Name ADR-14 `v13/docs/adr/0014-text-output.md`. DESIGN.md table `:779-783` already reserves ADR-14 "Text output: diagram ascii hooks over the shared layout, core/ascii kit, snapped stepped routes with a repair router (D76, D78)".

## Open questions

1. LR port capacity (research Q1): option (a) grow box, (b) bundle ends, or (c) spill? ADR-13/#42 outcome should be checked in `units.ts`/layered engine; #45 repair assumes it. Grep showed no `grid` use in `core/src/layout/layered/` (`grid` only in types), so verify #42's rounding actually landed before #45 builds on it.
2. Is `RenderContext.units` honoured by the flowchart builder (#43)? `prepare.ts` still reads px constants at `:55-62`; confirm before #46.
3. Sibling buses with tees: defect or allowed form in the corpus properties (research Q2, D79)? Affects #45 repair and #48 "no overlapping" property.
4. Where does `ascii` entry live in the manifest: `"ascii": "./dist/ascii.js"` key is new, so `DiagramManifest` and `readManifest` (`manifest.ts:9,48`) and the registry generator need extending (assign to #46 or #47?).
5. Third arg of `render`: how to tell a v12 `Element` from an options object in a DOM-free core (duck-type)? Overloads on `format` need `TextRenderResult` exported from `packages/mermaid/src/index.ts`.
6. `ASCII_TOO_WIDE` and `ASCII_DROPPED`/`ASCII_SHAPE` are warning codes; is there a closed warning-code list to update? (not found in a first pass.)
7. `packages/mermaid` zero-dep gate: does `check-deps` cover `mermaid`? If it does not, #49 must add it.
8. ASCII goldens: `maxWidth`/`paddingX`/`paddingY` from meta.json map to `ascii.maxWidth` / `ascii.padding` (`compact|roomy` only). paddingX/Y numeric values have no config home; decide mapping in #48.
9. Corpus properties "renders wherever SVG renders" over the in-repo corpus: which shapes/features SVG-only fixtures would trip `UnsupportedFormatError`? Probably none for flowchart, but verify.
10. Size gate scope: does the 15 KB budget include the cell profile and `layered` engine (already in R-PERF-1 core)? Spec says core/ascii + flowchart ascii entry only.
