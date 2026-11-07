# 02 — What the kanban port plugs into (v13 core and tooling)

Paths are workspace-relative, at `feature/424_kanban` = `origin/mermaid-v13` dd4b9d19f. There is no `packages/diagram-kanban` yet. The registry row is the bare placeholder at `packages/mermaid/src/generated/registry.gen.ts:18`, whose source is `tools/gen-config/src/registry.ts:33` (`V12_DETECTORS`, between `c4` and `classDiagram`).
**Core size at base: 91,530 B gz in 2 files**, against a budget of 94,208, so 2,678 B spare. Measured with `cd packages/bench && npx tsx --conditions=mermaid-source -e "import('./src/size-budget.ts').then(async m=>console.log((await m.measureCoreSize()).gzip))"`.

## 1. Plugin contract — `packages/core/src/pipeline/types.ts` (168 lines)

- `Warning` L21–34: `code` is a plain string. There is **no central code registry**: a code is declared where it is raised and documented in MIGRATION/DECISIONS (e.g. `JOURNEY_SCORE`, `diagram-journey/src/layout/layout.ts:83–93`). `KANBAN_PRIORITY` follows that pattern (D375).
- `DiagramParseContext` L37–44 (`config`, `preprocessed`, `limits`).
- `RenderContext` L50–93: `securityLevel` L58, `idPrefix` L60, `linkSchemes?` L64, `layout()` L66 (unused for `custom`), `inline?` L79, `icon?` L87, `warn` L92. It is filled in at `packages/mermaid/src/api.ts:670–690` (`securityLevel: resolveSecurityLevel(…)` L677, `linkSchemes: s.options.linkSchemes` L683).
- `DiagramPlugin<M, L>` L129–168: `id` L131, `detector` L137, `formats` L139, `layoutKind` L140, `configDefaults` L142, `parse` L144, `labels?` L152, `icons?` L159, `layout?` L160, `render` L162, `ascii?` L167. There is **no `theme` field yet**; it is #414 T0a (D331), which the INDEX says T4 waits on.

## 2. A `custom` port to copy — `packages/diagram-journey` (and timeline)

- Manifest `diagram-journey/package.json:42–53` (`plugin`, `id`, `types`, `formats`, `export`, `language`); exports `.` and `./language` L13–24. With ascii, copy `diagram-sequence/package.json:19–23, 47–59` (`./ascii` export + `"ascii": "./dist/ascii.js"`).
- `src/plugin.ts:10–31`: the detector regex, `configDefaults` from `generated/config-defaults.ts`, `parse(text, ctx)` → `parseJourney(text, {preprocessed})`, `labels`, `layout`, `render`. `src/index.ts:6–35` lists what conformance imports (`JISON_NAMES`, `*Tokens`, `parse*`, `detect*`).
- `parser/` (journey): `detect.ts:8–10` uses `diagramStart` (`@mermaid-js/core/preprocess`) with no regex. Also `tokens.ts`, `lexer.ts`, `parser.ts`, `ast.ts`, `index.ts`, and specs `lexer.spec.ts`, `parse.spec.ts`, `recovery.spec.ts`.
- `layout/` (journey): `metrics.ts` (one table, pitfall 13), `env.ts` (fonts and measure), `layout.ts`, `types.ts` (the plain-data layout), `invariants.ts`, `fixtures.ts`, `layout.spec.ts`. Timeline splits further (`lr.ts`, `td.ts`, `finish.ts`).
- `render/`:
  - journey `render.ts:74–106` `openRoot` is the root template: `viewBox`, `useMaxWidth` → `max-width`, `aria-*`, `theme.rootStyleText()`, `${idPrefix}-title/-desc` **from `model.accTitle/accDescr` only**. Kanban has neither, so in practice it writes no ids at all.
  - `paint.ts` reads every theme variable before the root is written.
  - timeline adds `family.spec.ts`, `properties.fixtures.ts` and `testing.fixtures.ts`.
- `language.ts`, `facet/{completions,hover,symbols,tables}.ts`, `generated/{categories,docs}.ts` (from `gen:grammar`), `grammar/<type>.ebnf` + `grammar/generated/*`.
- `v12-specs/<spec>.spec.ts` + `adapter.ts`, written by `scripts/port-v12-specs.ts` (`pnpm --filter … port:v12-specs`).
- Wiring a new package touches these files, which timeline/journey each appear in:
  - `packages/{mermaid,conformance,bench,language-service,language-server}/package.json` (language-service also at L52–81);
  - `tools/gen-grammar/package.json:26`, `knip.json:39`, `.changeset/pre.json:24,50`, `tools/release/src/publish.spec.ts:33`, `e2e/helpers/platform-harness.spec.ts:82`, `packages/bench/src/language-bundle.spec.ts:35`.
  - Render spec precedent: `packages/mermaid/src/journey.spec.ts` (155 lines) and `timeline.spec.ts`.

## 3. Conformance side

- `packages/conformance/src/registry.ts:17–73` `PARITY_SUITES` (`{adapter, corpusDirs, corpusFiles, corpus?}`); types are in `ParitySuite` (`corpus.ts:10`) and `DiagramAdapter` (`types.ts:8`). Add kanban as on the mindmap branch (see 01 §8). The divergence list is `packages/conformance/divergences.json` (`registry.ts:76`); D373 is recorded there.
- Jison: `src/jison/types.ts:63–165` `JISON_TYPES` (put kanban after `mindmap` L125–137; `HarvestMethod 'run'` L36); `oracle.ts:74` `loadJisonLexerOracle` (generic, via `getDiagramFromText(probe)` L92); `harvest.ts:37` (writes `corpus/<type>-v12-specs.json`, `harvestPath` L19); `smoke.spec.ts:11` M4 list; `oracle.spec.ts`, `harvest.spec.ts`.
- Per-type folder precedent: `src/journey/` and `src/timeline/`, each with `lexer-parity.spec.ts`, `corpus.ts`, `v12.ts`, `v13.ts`, `probe.spec.ts`, `messages.spec.ts`, `render.spec.ts`, `stress.spec.ts`, `service-symbols.spec.ts`, `layout-corpus.spec.ts` and `grammar/{differential,grammar-lexer,sentences}.spec.ts` (journey also `lexer-quirks.spec.ts`, `parity.spec.ts`, `theme.spec.ts`).
  - Lexer-parity count pins: timeline `lexer-parity.spec.ts:85–86` (57 e2e, 24 specs); journey L65 (35).
- Top-level per-type specs to mirror: `src/timeline-theme-names.spec.ts` (no theme names in the package), `src/timeline-layout-literals.spec.ts` (no literals outside metrics).
- `src/yaml-tree.spec.ts:128–154` + snapshot L20 (kanban digest; T1 updates it).
- Hand-drawn coverage: `src/outline-roles.spec.ts:21–29` `TYPES` (add `kanban: {dirs: ['kanban'], roles: ['group','node', …]}`; the priority bar would be a `mark` or `divider`, which is a choice) and `src/outline-identity.spec.ts:22–30`.

## 4. Core seams

- **Labels**: `layoutLabel(text, font, width, measurer, opts)` `packages/core/src/text/label.ts:86`; `LabelOptions.markdown` L41–43 (default false); markdown lines L198, inline L249–331. Drawn with `w.label(box, cx, cy, attrs)` `core/src/svg/writer.ts:132`.
  - **Timeline and journey do not pass `markdown`** (`diagram-timeline/src/layout/env.ts:131–134` even `plain()`s the text; `diagram-journey/src/layout/env.ts:80–81`).
  - The `markdown: true` precedents are `diagram-pie/src/layout/layout.ts:50` (custom layout), `diagram-class/src/layout/prepare.ts:228–231` and `diagram-state/src/layout/prepare.ts:152`. All pass `inline: ctx.inline` (math and `fa:` boxes, D176, D292).
  - A left-aligned box: `{...label, left: true}` (`diagram-timeline/src/render/render.ts:250`; journey `leftAligned()` `render.ts:134`).
- **Links**: `checkUrl(url, {securityLevel, linkSchemes, warn})` `core/src/svg/url.ts:129–147` returns a branded `SafeUrl` or `undefined` + `URL_REFUSED` (L138). `checkLinkTarget` L183. `SvgWarning` codes `core/src/svg/types.ts:167–178`.
  - Callers: `diagram-flowchart/src/render/render.ts:394, 405–409` (`ctx.securityLevel ?? 'default'`, `w.open('a', {href, target})`), `diagram-class/src/render/render.ts:432`, `diagram-state/src/render/render.ts:449`.
  - **The writer adds `rel="noopener noreferrer"` to every `_blank` `<a>` itself** (`writer.ts:371–387`, `BLANK_REL` `allowlist.ts:154`); `href` is allowed on `a` (`allowlist.ts:91,151`).
- **Hand-drawn** (D302/D379): `w.outline(role, tag, attrs)` `writer.ts:84–128` (`OutlineRole` L90, `OutlineTag` L93), plain `leaf` unless a drawer is installed.
  - Ports that use it: flowchart (`render/shapes.ts:130`, `render.ts:283` group, `shapes.ts:809` divider line), class (`render.ts:288` group, `445`), er (`render.ts:283`, `374`), state (`render/shapes.ts:74`). Timeline and journey do not (`theme.outline()` in timeline `paint.ts:147,170` is the gradient paint, a different thing).
  - Docs `v13/docs/MIGRATION.md:609–692`; L666 lists kanban as "not ported yet" (update it).
- **Palette and colour maths**: `theme.palette(name)` / `paletteRgba(name)` `core/src/theme/theme.ts:144–146`; `PALETTE_LIMIT = 12` `vocabulary.ts:192`; `cScale` is a palette, not a `THEME_VARIABLES` row (`vocabulary.ts:180–187`).
  - Timeline's computed colour: `brighter()` `diagram-timeline/src/render/paint.ts:78–90` (rgba → hex → `checkColor`), slot wrap `at()` L121, `slotted()` L122–127, `live = theme.autoDeclarations() !== undefined` L101 (under `theme: 'auto'` keep the variable).
  - **khroma `lighten`/`darken` is not exported**: `rgbToHsl`/`shiftHsl`/`hslToRgb` live in `core/src/theme/color.ts:99,122,131`, but `core/src/theme/index.ts:4–13` exports only `composite, contrastRatio, formatColor, invertColor, luminance, mixColors, parseColor`. D374's "lighten 10" therefore needs either an in-package HSL step (≈30 lines, khroma's maths) or a core export, which would be a core change and so a kanban T0 per the spec. #414's rule DSL already has `lighten`/`darken` (`theme.ts:377–385`) once `DiagramPlugin.theme` lands.
- **Dark trait**: `Theme.dark: boolean` `theme.ts:100` already exists = `spec.dark || themeVariables.darkMode` (`theme.ts:697–698, 785`). No diagram reads it yet. `neo-dark`'s spec sets `dark: true` (`theme/specs/neo-dark.ts:26`; header L1–8), which is how D374's "neo-dark darkens" falls out.
- **YAML**: `parseYaml(src, {start, end})` / `isYamlMap` from `@mermaid-js/core/preprocess` (`core/src/preprocess/index.ts:11`; `yaml.ts:910–947`; JSON schema, errors as diagnostics).
  - Flowchart's reader `diagram-flowchart/src/parser/parser.ts:832–882`: it joins the pieces (the `"` toggle L845–848, the `<br/>` rewrite only inside strings), joins back-to-back blocks L857–861, and parses in place when the text is unchanged and has no `#` (L866–870, so diagnostic ranges stay exact). Each error becomes a `SHAPE_DATA` diagnostic over the whole block (L871–879). A non-map value becomes `null` (L881).
  - Kanban differs: non-map data and a non-lowercase `shape` are errors (spec T2).
- **AST ids**: `nodeId` `core/src/parser-kit/ast.ts:95`, `AstIds` L104 (`node()` L111–115: `n:<id>`, then `@2`, `@3`, …).
  - **`LanguageFacet.standalone`** (D289: ids that repeat, rename one occurrence) exists only on the mindmap branch (`git diff origin/mermaid-v13...origin/feature/294_mindmap -- packages/core/src/parser-kit/language.ts`, +6 lines after `namespaces` L77). T6 needs #406 merged first, or it re-adds the field.

## 5. Config

- Schema `packages/core/schema/config.schema.yaml`: status legend L14–21; top-level `kanban:` L1006–1008 `pending`; `KanbanDiagramConfig` L2049–2066 (`padding` L2056, `sectionWidth` L2060, `ticketBaseUrl` L2064, all `pending`).
  - `useWidth`/`useMaxWidth`/`layout`/`theme`/`look` are inherited from `BaseDiagramConfig` (L1089, `useWidth` L1094, `useMaxWidth` L1097, `layout` L1146) with no kanban override. To set kanban's own status, add per-section `$ref` overrides as pie does (L2075–2083: `useWidth` ignored with a reason, `useMaxWidth` honoured).
  - `kanban.layout` and `kanban.theme` stay `pending`, and the spec does not decide them.
- Generated rows: `v13/docs/config-reference.md:539–551` (`kanban.look` is already `ignored`, L547); MIGRATION's look row `MIGRATION.md:355`.
- `pnpm gen:config` (`package.json:27`, `--check` L28 in `pnpm check`) writes `core/src/config/generated/*`, the per-package `src/generated/config-defaults.ts` for `SECTION_OWNERS` (`tools/gen-config/src/generate.ts:36–44`; add `kanban: 'packages/diagram-kanban'`), config-reference and the MIGRATION config table.
- `gen:registry` (`package.json:30`; `DiagramManifest` `tools/gen-config/src/registry.ts:68`, `readManifests` L103, `generateRegistry` L134) also writes `packages/language-service/src/generated/facets.gen.ts` (`FACETS_PATH` L19).

## 6. Theme inventory (`usedBy`)

- `tools/gen-config/src/theme-used-by.spec.ts`: `TYPES` is **pinned** at L50–60 (add `'kanban'`); `readsOf` L34–40 scans `'name'` after `x(` or `x:`; `DYNAMIC_READS` L17–24 is for computed names.
- Rows kanban reads, all in `core/src/theme/vocabulary.ts`:
  - `background` L238 (`['core']` only today);
  - `textColor` L250–258, `nodeBorder` L260, and `fontFamily`/`fontSize` via `TEXT_USERS` L204.
  - Each gains `'kanban'`. `cScale` is not scanned (a palette).
- #410 is the merged PR that made `THEME_VARIABLES` a pure call (`vocabulary.ts:227–233`), not an inventory. **`NOT_RENDERING_YET` does not exist in this tree** (grep).
- Theme specs: `core/src/theme/specs/*.ts` (11 themes + `palettes.ts`, `scales.ts`, `geometry.ts`). `v13/docs/theme-variables.md`; the theming recipe is `v13/docs/agents/port-diagram/theming.md`.

## 7. e2e, sizes, language, ascii

- Baselines: `e2e/diagrams/<type>/baseline/<topic>/*.mmd` (journey: `actors config scores sections text themes`; timeline adds `directions`). `baseline/themes/` has **one file per theme (11)**, not four. Runner `e2e/rendering/mmd-snapshots.spec.ts` + `e2e/helpers/mmd-snapshots.ts:142–150` (the duplicate-baseline guard).
- Size: `packages/bench/src/core-size.spec.ts` (62 lines; closure L26–31, budget L42–44); `packages/mermaid/size-budget.json`; `packages/mermaid/src/cdn-build.spec.ts:57–64` (a stable `chunks/diagram-<id>.mjs`, `-language`, `-ascii` per first-party diagram) and L67–74 (nothing lazy in the ESM closure). A registry row costs about 22–35 B gz (mindmap notes). Text path: `packages/bench/src/ascii-size.ts:1–40` (15 KB gz, `LIMITS.asciiGzipBytes`).
- Language:
  - goldens `packages/language-service/goldens/<id>/<feature>/` (journey has all nine of `REQUIRED_FEATURES`, `language-service/src/testing/goldens.ts:143–153`); runner `src/goldens.spec.ts`.
  - Highlighters `packages/language-service-codemirror/src/grammars.ts:11–21` `LEZER_HIGHLIGHTERS` and `packages/language-service-monaco/src/grammars.ts:32–44` `MONARCH_HIGHLIGHTERS`. Both are keyed by `FirstPartyFacetId` (from `facets.gen.ts`), so a new id fails typecheck until both rows exist.
  - Per-type agreement spec `tools/gen-grammar/src/journey-agreement.spec.ts`.
- ascii: `diagram-sequence/src/ascii.ts` (56 lines). `layoutAscii` L27–30 reruns the layout with `cellMeasurer` + `cellProfile(asciiOptions(ctx.config).padding)`; the hook is `ascii(model, layout, ctx: TextRenderContext)` L38. Imports `@mermaid-js/core/ascii` and `@mermaid-js/core/layout`.

## 8. MIGRATION.md sections to mirror

- Per-port pairs: `## User journey` L1201 (`### Layout` L1203, `### Config` L1233, `### Themes` L1258) + `## Journey SVG structure` L1269; `## Timeline config` L1299 + `## Timeline SVG structure` L1326; `## Pie chart` L1356 + `## Pie SVG structure` L1390.
- Kanban adds `## Kanban` + `## Kanban SVG structure` after them.
- Rows in shared sections to update: the hand-drawn list L666, the flowchart shape note L887 (`kanbanItem` draws as a rectangle in flowchart), and the config table (generated).
