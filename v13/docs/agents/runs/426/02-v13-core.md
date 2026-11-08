# 02 — What the xychart port plugs into (v13 core and tooling)

Paths are workspace-relative, at `feature/426_xychart` 9ce86f346 (base `mermaid-v13` 12ba676cb). Re-verified from `runs/424/02-v13-core.md`; most of its line numbers have moved. There is no `packages/diagram-xychart` yet: the row is the bare placeholder `packages/mermaid/src/generated/registry.gen.ts:131`, from `tools/gen-config/src/registry.ts:50` (`V12_DETECTORS` L27, after `packet` L49, before `block` L51). Also in `detectors.gen.ts:28` and `language-service/src/generated/facets.gen.ts:140`.

**CDN core at base: 91,974 B gz in 2 files**; budget 94,208 (`packages/mermaid/size-budget.json`), so **2,234 B spare** (kanban measured 91,530 four ports ago). Command: `cd packages/bench && npx tsx --conditions=mermaid-source -e "import('./src/size-budget.ts').then(async m=>console.log((await m.measureCoreSize()).gzip))"` (entry `packages/mermaid/src/cdn.ts`).

## 1. Plugin contract — `packages/core/src/pipeline/types.ts` (202 lines)

- `Warning` L22–35 (`code` a plain string, no registry; declare it where raised, e.g. `QUADRANT_CONFIG_INVALID` `diagram-quadrant/src/config.ts:55`, `RADAR_CONFIG_INVALID` `diagram-radar/src/config.ts:80`).
- `DiagramParseContext` L38–46; `RenderContext` L51+ (`theme` L57, `measurer`, `units`, `idPrefix`, `inline`, `warn`).
- `DiagramPlugin<M, L>` L148–202: `id` L150, `detector` L156, `formats` L158, `layoutKind` L159, `configDefaults` L171, **`theme?: DiagramThemeTable` L176 (now exists, #414)**, `parse` L178, `labels?` L186, `layout?` L194, `render` L196, `ascii?` L201. No `ascii` for xychart.
- `UnsupportedFormatError` `core/src/pipeline/errors.ts:95`; thrown by `packages/mermaid/src/api.ts:488,499,511` when a plugin has no ascii hook. Test precedent `packages/mermaid/src/quadrant.spec.ts:68–73` (and `radar.spec.ts`, 134 lines).

## 2. The `custom` port to copy — `packages/diagram-quadrant` (5,626 lines)

- Manifest `package.json`: exports `.` and `./language`, `"mermaid": {plugin, id, types, formats: ["svg"], export: "quadrant", language}`; no ascii entry. Scripts `build`, `typecheck`, `port:v12-specs`.
- `src/plugin.ts:19–36`: `formats ['svg']`, `layoutKind 'custom'`, `configDefaults`, `detector`, `parse(text, {preprocessed})`, `labels`, `theme` (from `theme/table.ts`), `layout` over `quadrantLayoutConfig(section, warn)` (`src/config.ts`, D226 checked numbers + one warning per key), `render`.
- `src/index.ts:10–20` (what conformance imports). `parser/`: `tokens.ts lexer.ts parser.ts ast.ts detect.ts v12-text.ts value.ts styles.ts` + `lexer/parse/recovery.spec.ts`.
- `layout/`: `layout.ts types.ts invariants.ts fixtures.ts` (+ specs). **No `metrics.ts`/`env.ts`, and quadrant measures labels in render** (`render/render.ts:2, 66–76` `layoutLabel` there). xychart's spec wants measure-first, so copy **radar** for that: `diagram-radar/src/layout/metrics.ts` (`RADAR_METRICS`, the one px table), `layout.ts:35` `RadarLayoutContext = Pick<RenderContext,'config'|'measurer'|'theme'>`, `layoutLabel` at L94–95. Kanban: `layout/context.ts:6`, `metrics.ts`, `layout.ts:113`.
- `render/render.ts:233`: label at `translate(x, y) rotate(r)`, as v12 (xychart needs rotate 270 and `labelRotation`). `transform` is allowed (`core/src/svg/allowlist.ts:50`; `text-anchor`/`dominant-baseline` L86–87).
- `language.ts:1–37` (facet: `parse`, `categories`, `namespaces`, `isValidId`, `completions`, `hover`; exported as `language`), `facet/{completions,hover,names,tables}.ts`, `generated/{categories,docs,config-defaults}.ts`, `grammar/quadrant.ebnf` + `grammar/generated/*`.
- `v12-specs/{adapter.ts, quadrant.jison.spec.ts, quadrantDb.spec.ts}` from `scripts/port-v12-specs.ts`.

## 3. Theme table — newest layout

- Types `core/src/theme/diagram.ts` (86 lines): `THEME_FAMILIES` L20, `DiagramThemeEntries` L26 (`rules`, `values`, `tokens`), `DiagramThemeFamily` L39 (`dark` L41, `fallback` L47), `DiagramThemeVar.nested` L57, `DiagramThemeVarDef.usedBy` L67, `DiagramThemeTable` L71 (`section` L73, `vars` L78, `rules.light/dark` L83, `families` L85).
- Newest: **kanban** (`diagram-kanban/src/theme/{vocabulary,table,columns}.ts`, 2026-11-07 13:00): rules only, `light`/`dark` by trait. **Radar** (`diagram-radar/src/theme/vocabulary.ts` 48, `table.ts` 32) is the one to copy for xychart: `section: 'radar'`, `nested:` keys, `families: {classic, redux, neo}` with literal `values`, plus a rule (`radarAxisColor: 'lineColor'`). Both: `vars: THEME_VARIABLE_TABLE` from `theme/generated/variables.ts` (written by `pnpm gen:theme`, root `package.json:29`).
- **`ThemeVarKind` has no palette kind** (`core/src/theme/vocabulary.ts:19–27`: color, length, font, weight, filter, padding, flag, opacity). And `flatten()` (`core/src/theme/theme.ts:791–805`) maps nested keys only onto `table.vars` names. So `xyChart.plotColorPalette` → `plotColorArray` has no carrier today: T4 must pick (a vars row, a core change, or the render reading `themeVariables.xyChart.plotColorPalette` itself).
- Rules DSL `core/src/theme/dsl.ts` (`inline(v)` L24, `inline(v, b)` L119). `inline()` precedents: `diagram-er/src/theme/table.ts:15–17`, `diagram-gitgraph/src/theme/table.ts:68–70`, pie `table.ts` (`inline(headingTextColor)`).

## 4. `plotColorArray` (T0, #506, D381)

- `PALETTE_VARIABLES` `vocabulary.ts:115–131`; `plotColorArray` L127 (comment L120–125). Not a numbered palette (`NUMBERED_PALETTES` L140, `PALETTE_LIMITS` L162), but `PALETTE_SLOT` L137 makes `plotColorArray0`–`99` readable in a rule.
- `ThemeSpec.palettes` / `darkModePalettes` `core/src/theme/spec.ts:35,40`; a dark mode is `{...palettes, ...darkModePalettes}` (`theme.ts:716–718`), so a `palettes` entry carries into dark mode.
- How `seriesColorArray` is filled: `series('a b c')` `specs/palettes.ts:64` (space-separated is cheaper than an array); default `default.ts:84`, base `base.ts:51`, dark `dark.ts:81`, forest `forest.ts:93`, neutral `neutral.ts:82`; shared constants `REDUX_SERIES` `redux.ts:62` (used by `redux.ts:115`, `neo.ts:75` via import L13) and `REDUX_DARK_SERIES` `redux-dark-values.ts:70` (`redux-dark.ts:32`, `neo-dark.ts:84`); `redux-color.ts:30`, `redux-dark-color.ts:41` write their own. **Each of the eleven specs has its own `palettes:` block, no inheritance**, so T0 edits eleven files; put the base ten in `palettes.ts` once.
- Reading: `slot()` `theme.ts:270–285` (author numbered → author list → spec → `BASE_SERIES` only for `seriesColorArray`; else undefined, so an empty `plotColorArray` reads `currentColor`, L396). A non-series slot in a rule is a **literal**, not a CSS var (L390–398). Whole list: `theme.palette('plotColorArray')` (`theme.ts:153`, impl L997), as `diagram-radar/src/render/paint.ts:34` reads `cScale`. Author lists: `paletteItems` L668 (array or comma string), `MAX_PALETTE = 64` L645.
- `tools/gen-config/src/theme-direction.spec.ts:113–118` **pins `plotColorArray` as unread** (`toEqual(['plotColorArray'])`); T4 flips it. `D332_INPUTS` `packages/conformance/src/diagram-themes.ts:65` already lists it (L67).
- Identity gate: `pnpm --filter @mermaid-js/bench theme-identity --out <f> [--compare <base>] [--allow …]` (`packages/bench/src/cli/theme-identity.ts:9–14`).

## 5. Conformance

- `src/jison/types.ts` (176): `JisonTypeDescriptor` L38–60, `HarvestMethod 'run'` L36, `JISON_TYPES` L63; kanban L138–146, quadrant L165–174 (last; add xychart after it: `probe`, `e2e: ['xychart']`, `harvest: {dir: \`${V12_DIAGRAMS}/xychart\`, docs: 'xyChart.md', method: {kind: 'run', parsers: ['parser'], specs: [...]}}`).
- `oracle.ts:74` `loadJisonLexerOracle` (probe via `getDiagramFromText` L92); `harvest.ts:16` **`V12_COMMIT = 'fa796a943'`**, `harvestPath` L19 (`corpus/<type>-v12-specs.json`); `smoke.spec.ts:12` `M4_M5` list (add `'xychart'`).
- `src/registry.ts` (141): `PARITY_SUITES` L27–138 (quadrant L105–112 with `corpusFiles` and `corpus:`; radar L128–132); `DIVERGENCES_FILE` L141 → `divergences.json` (42 entries, `{id, inputHash, kind, reason, owner, since}`).
- Per-type folder: `src/quadrant/` (`corpus v12 v13 lexer-parity probe messages render render-api render-features service-symbols theme theme-names layout-parity oracle-env` + `grammar/{differential,grammar-lexer,sentences}.spec.ts, lexer-input, reference, quadrant-grammar}`). **`layout-parity.spec.ts` compares the layout with v12's builder to 0.01 px**; `oracle-env.ts` wraps the v12 DB. xychart can do the same: with no `setTmpSVGG` v12 measures `len × fontSize` by `fontSize` (01 §5), so the builder runs in Node.
- Top-level: `quadrant-layout-literals.spec.ts`, `radar-layout-literals.spec.ts` (no length literals outside metrics); `yaml-tree.spec.ts` snapshot **already has `"xychart": "48 b03f96b1331a7e50"`** (`__snapshots__/yaml-tree.spec.ts.snap:40`); `detection.spec.ts:72` (`xychart: 'xychart-beta'`).
- Theme oracles: `src/radar/theme.spec.ts` (189; `v12Vars` via `mermaid-v12` `getConfig().themeVariables`) and `src/packet/theme.spec.ts:146` `DIFFERENCES` (+ L185 exact-match check); `neo-theme.spec.ts:69`, `neo-dark-theme.spec.ts:84` read every table via `everyTable` (`diagram-themes.ts:92`).
- **`DIAGRAM_TABLES` (`diagram-themes.ts:34–47`) lists only 12 types; radar, kanban, packet, cynefin are absent**, despite `runs/414/CONTRACT.md` saying the specs "pick the package up with no edit". Add xychart there by hand (import + row) if the neo specs must compare its table.
- Stress: follow **pie** `src/pie/stress.spec.ts:54–77`: sizes 4,000 vs 32,000, thread CPU time `cpuMs` L43–48, best of 5, `expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24)` L74 (also kanban L87/152, radar L83). Packet's L97 `tLarge / tSmall` is the one not to copy.

## 6. Config

- `packages/core/schema/config.schema.yaml`: status legend L14–21; `xyChart:` L1127–1129 `pending`; `XYChartAxisConfig` L2614–~2702, `XYChartConfig` L2703–2794, every key `pending`. `useWidth`/`useMaxWidth` are inherited from `BaseDiagramConfig` L1225 (config-reference shows `xyChart.useWidth pending`, `v13/docs/config-reference.md:437–442`). Per-section override pattern: `RadarDiagramConfig` L4945+ (`useWidth` ignored with reason, `useMaxWidth` honoured).
- `tools/gen-config/src/generate.ts:36–49` `SECTION_OWNERS` (add `xyChart: 'packages/diagram-xychart'`) → `src/generated/config-defaults.ts`. `xyChart.look` already `ignored` (`MIGRATION.md:351`); nested-section row `MIGRATION.md:482` names xychart.

## 7. Labels, measurer, writer

- `layoutLabel` `core/src/text/label.ts:86`, `LabelOptions` L41 (`markdown` L43, `inline` L50). `Measurer` `core/src/text/measurer.ts:33–39` (`width(text, font, style)`, `metrics(font)`, `id`). Writer `w.label(box, x, y, attrs)` `core/src/svg/writer.ts:132` (impl L439), `outline` L128.

## 8. Theme inventory (`usedBy`)

- `vocabulary.ts`: `TEXT_USERS` L181 (append `'xychart'`), `background` L209, `primaryTextColor` L210 (xychart's two rules read these; add `'xychart'`). `tools/gen-config/src/theme-used-by.spec.ts:74–92` pins `TYPES` (read from `packages/diagram-*`, so the new dir must be listed). Also `theme-inventory.spec.ts`, `theme-tables.spec.ts` (pick it up).

## 9. Size gates

- `packages/bench/src/core-size.spec.ts` (62): entry check L33–35, budget L42–44. `packages/mermaid/src/cdn-build.spec.ts` (150): stable `chunks/diagram-<dir>.mjs` + `-language` L58; nothing lazy in the ESM closure L68; budget L98; no `usedBy` in core L107; **no diagram theme variable name in core L116–145** (scans each `packages/diagram-*` `THEME_VARIABLES`).

## 10. Shared files a new package touches (from `git grep diagram-radar|diagram-kanban`)

- `packages/{mermaid:74, conformance:39, bench:33, language-server:43}/package.json`; `language-service/package.json:45, 90, 118`; `tools/gen-grammar/package.json:31`.
- `knip.json:51–53`; `eslint.config.js:209–211` (v12-specs glob); `tools/release/src/publish.spec.ts:33–38`; `e2e/helpers/platform-harness.spec.ts:82–87`; `packages/bench/src/language-bundle.spec.ts:70–80, 153–157`.
- **`.changeset/pre.json` has no radar/kanban rows** (only quadrant L21/47/73, from the last `changeset version`); new ports add `.changeset/diagram-<x>-first-release.md` (+ e.g. `language-service-kanban.md`).
- `v13/docs/RELEASING.md:26–27` (package table), `v13/docs/format-matrix.md:33` (`xychart | not ported`), `v13/docs/syntax/<type>.md`.
- Highlighters keyed by facet id (typecheck fails without both): `language-service-codemirror/src/grammars.ts:26`, `language-service-monaco/src/grammars.ts:49`. Agreement spec `tools/gen-grammar/src/radar-agreement.spec.ts`.
- Goldens `packages/language-service/goldens/<id>/<feature>/` (radar has all nine `REQUIRED_FEATURES`, `src/testing/goldens.ts:143–153`). **Every type's `completions/empty.out` lists all diagram keywords**, so ~17 goldens change (commit 42b48084e fixed exactly this merge break).
- `outline-roles.spec.ts` / `outline-identity.spec.ts:30–34`: only the hand-drawn adopters (flowchart, class, state, er, sequence, kanban). Radar and quadrant are not there; xychart need not be unless it adopts `w.outline`.
- MIGRATION.md (2,036 lines): pairs `## Radar chart` L1952 + `## Radar SVG structure` L1975, `## Kanban` L1862/L1930, `## Quadrant chart config and theme` L1030 + SVG L1644. Add `## XY chart` + `## XY chart SVG structure`.
- Render spec `packages/mermaid/src/radar.spec.ts` (134). `api.spec.ts:86–94` uses `requirementDiagram` for `UNSUPPORTED_DIAGRAM`, not xychart, so it needs no edit.
- Baselines: `e2e/diagrams/radar/baseline/{config,data,text,theme-variables,themes}/`; `themes/` holds **five** files (`default neo neo-dark redux redux-dark-color`; quadrant `default neo neo-dark redux redux-color`), not eleven.
