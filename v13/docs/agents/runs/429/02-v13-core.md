# 02 — What the venn port plugs into (v13 core and tooling)

Paths are workspace-relative at `feature/429_venn` = 12ba676cb, after kanban (#476) and radar (#474) merged. This revises `runs/424/02-v13-core.md` with every pointer re-checked. There is no `packages/diagram-venn` yet.
- Registry row: `packages/mermaid/src/generated/registry.gen.ts:148`, generated from `tools/gen-config/src/registry.ts:61` (`V12_DETECTORS`, no `i` flag).
- Core size at base: **not measured**, because this worktree has no install. Measure with `cd packages/bench && npx tsx --conditions=mermaid-source -e "import('./src/size-budget.ts').then(async m=>console.log((await m.measureCoreSize()).gzip))"` after `pnpm i`. Budget 94,208 B (`packages/mermaid/size-budget.json`).

## 1. Plugin contract — `packages/core/src/pipeline/types.ts` (202 lines)

- `Warning` L22–35 (`code` L23, a plain string with no central registry; declare `VENN_*` where they are raised, D417). `DiagramParseContext` L38–45.
- `RenderContext` L51–102: `measurer` L53, `theme` L57, `securityLevel` L59, `idPrefix` L61, `availableWidth` L77, `inline` L90, `warn` L101. It is filled at `packages/mermaid/src/api.ts:656–690`, with the theme built from `plugin.theme` at L647–648.
- `DiagramPlugin<M, L>` L148–202: `id` L150, `formats` L158, `layoutKind` L159, `configDefaults` L171, **`theme?: DiagramThemeTable` L176 (landed; it was missing in kanban's notes)**, `parse` L178, `labels?` L186, `layout?` L194, `render` L196, `ascii?` L201.
- **`UnsupportedFormatError`** `core/src/pipeline/errors.ts:95–105` (`'UNSUPPORTED_FORMAT'`). It is thrown by `mermaid/src/api.ts:487–488` (detected type without `'ascii'` in `formats`), L499 and L914. The plugin only declares `formats: ['svg']`. Spec precedent: `packages/mermaid/src/radar.spec.ts:69–76` (D320) and `quadrant.spec.ts:68–76`.

## 2. The `custom` model to copy — `packages/diagram-quadrant`

- `package.json`: exports `.` and `./language` L13–24, `"files": ["dist"]` L25–27 (**venn adds `THIRD_PARTY_NOTICES`**), and the `mermaid` manifest L42–53 (`plugin`, `id`, `types`, `formats: ["svg"]`, `export`, `language`). There are no `dependencies`, only a core peer L36–41.
- `src/plugin.ts:19–36` is the whole plugin. It holds the id, `formats`, `layoutKind: 'custom'`, `configDefaults` from `generated/config-defaults.ts`, `parse` → `parseQuadrant(text, {preprocessed})`, `labels` and `theme` (`./theme/table.ts`). `layout` reads `ctx.config.<section>` through `config.ts` (D226 checks), and `render` delegates to the renderer.
- Files to mirror:
  - `src/{config,model,labels,index,language}.ts`;
  - `parser/{tokens,lexer,parser,ast,detect,index,styles,v12-text,value}.ts` + `{lexer,parse,recovery}.spec.ts`;
  - `layout/{layout,types,invariants,fixtures,index}.ts` + specs;
  - `render/{render,paint,index}.ts`;
  - `theme/{vocabulary,table}.ts` + `theme/generated/variables.ts`;
  - `facet/{completions,hover,names,tables}.ts`, `generated/{categories,docs,config-defaults}.ts`, `grammar/quadrant.ebnf` + `grammar/generated/*`;
  - `v12-specs/{adapter,*.spec}.ts` + `scripts/port-v12-specs.ts`.
- Radar (`packages/diagram-radar/src`) is the newest custom port with a theme table, with the same layout plus `test-context.ts` and `testing.ts`.
- Root template: `diagram-quadrant/src/render/render.ts:177–208` `openRoot` (viewBox, `useMaxWidth`, `aria-*`, `theme.rootStyleText()`, `styleSheet` for `auto`, title/desc ids). Venn takes its `<title>` from the diagram title (D133). Fonts are read before the root is written (L186–188).
- Wiring a package (kanban's rows to copy):
  - `packages/mermaid/package.json:69`, `bench/package.json:28`, `conformance/package.json:34`, `language-service/package.json:40,75,113`, `language-server/package.json:38`;
  - `tools/gen-grammar/package.json:27`, `knip.json:53`, `tools/release/src/publish.spec.ts:33`, `e2e/helpers/platform-harness.spec.ts:82`, `packages/bench/src/language-bundle.spec.ts:69–70`;
  - `.changeset/pre.json`: only quadrant is there (L21, L47, L73); kanban added none.

## 3. Conformance

- `src/registry.ts:27` `PARITY_SUITES` (kanban's entry L114–120: `corpusDirs`, `corpusFiles` `corpus/<type>-v12-specs.json` + `<type>-cases.json`, `corpus`); `DIVERGENCES_FILE` L141. `ParitySuite` `corpus.ts:10`, `DiagramAdapter` `types.ts:8`.
- **`JISON_TYPES`** `src/jison/types.ts:63–174`:
  - `JisonTypeDescriptor` L38–56: `probe`, `yy?: (context: { db; lexer: JisonLexer }) => unknown` L46, `e2e`, `harvest {dir, docs, method}`;
  - `JisonLexer` L9–15 (`setInput`, `lex`, `yytext`, `_input`); `HarvestMethod` L18–36 (`literals`/`chains`/`run`).
  - **One descriptor already has a `yy` builder**: `state` L95, `Object.assign(new db.constructor(), { lexer })`, for `yy.lexer.unput`. Kanban is at L138–146. Venn's spec says `literals`, while kanban, quadrant and journey use `run`.
- `src/jison/oracle.ts`: `loadJisonLexerOracle(type)` L74–81.
  - `defaultYy` L84–87 returns venn's plain-object DB **itself** (shared state, bad for venn).
  - `load` L89–143 wraps `setInput` only (L97–102). `tokens()` calls `yy({db, lexer})` **once per run** (L116), then loops `lexer.lex()` with no per-token hook (L120–139).
  - So a venn builder must observe tokens itself, for example by returning a `yy` whose `getIndentMode` reads state it updates. It can wrap `lexer.lex` (the property is read each iteration), but the wrapper persists on the shared lexer.
  - **Checking the emulation "against the parser's own stream" needs a new capture**: wrap `lexer.lex` during `lexedText`'s `oracle.parse` (L103–108), which nothing does today.
- Harvest: `src/jison/harvest.ts:19` `harvestPath`, L27 `hasV12History`, L37 `harvest`. `smoke.spec.ts:12` `M4_M5` list (add `venn`). Kanban's lexer-parity count pins are at `src/kanban/lexer-parity.spec.ts:99–101` (53 e2e, 32 specs, 136 cases). `commented()` is `src/sequence/corpus.ts:48` and `LINE_SEPARATORS` is `src/gantt/corpus.ts:22`.
- Per-type folder to mirror: `src/radar/`, which has `corpus, v12, v13, lexer-parity, parity, parser, parser-stress, stress, recovery, probe, render, render-api, layout-corpus, service-symbols, theme` + `grammar/`. Quadrant adds `layout-parity.spec.ts`, which is the model for the T3 solver-vs-venn.js check. Top-level: `src/radar-layout-literals.spec.ts`, `src/mindmap-theme-names.spec.ts`.
- Hand-drawn coverage: `src/outline-roles.spec.ts:28` `TYPES` (kanban L39–42) and `src/outline-identity.spec.ts`.
- Theme oracle: `src/diagram-themes.ts:34–47` `DIAGRAM_TABLES` (no kanban or radar rows), `D332_INPUTS` L65, `everyTable` L92. Per-type spec with `DIFFERENCES`: `src/radar/theme.spec.ts` (reads `getConfig().themeVariables` from v12 in 11 themes). Venn's variables are flat, so the radar `nested` mapping is not needed.

## 4. Core seams

- **Labels**:
  - `layoutLabel(raw, font, maxWidth, measurer, options)` `core/src/text/label.ts:86`; `LabelOptions` L41–51 (`markdown`, `style`, `inline`); greedy `wrap` L387.
  - **There is no max-lines option**, so venn's "at most three lines" (D414) is package code.
  - Exports: `core/src/text/index.ts:4–19`. `Measurer` `text/measurer.ts:33–39` (`width`, `metrics`, `id`), `FontKey` L5–11.
  - Measure-first in a custom layout: `diagram-radar/src/layout/layout.ts:79–95` and `diagram-pie/src/layout/layout.ts:35–50` (`family = ctx.theme.value('fontFamily')`, `inline: ctx.inline`, `markdown` when the text is a markdown string).
  - Drawn with `w.label(box, x, y, attrs)` `svg/writer.ts:132`.
- **`SvgWriter`** `core/src/svg/writer.ts:119–140`: `open` L120, `close` L121, `leaf` L122, `outline` L128, `text` L130 (escaped, only in `text`/`tspan`/`title`/`desc`), `label` L132, `path()` L134. `PathBuilder` `svg/path.ts:7–25`: `moveTo`, `lineTo`, `curveTo`, `quadTo`, **`arcTo` L14** (which region paths need), `close`, `done`, with numbers to 2 decimals.
- **Hand-drawn `w.outline(role, tag, attrs)`** (writer.ts:128, `OutlineRole` L90, `OutlineTag` L93 includes `circle` and `path`):
  - **It takes no sketch options.** The plugin picks them by role: `plugin-hand-drawn/src/roles.ts:54–68` (`NODE` 0.7/hachure/fillWeight 1.5/gap 1.5; `GROUP`, `COMPOSITE`, `MARK` with angle 120, `EDGE`).
  - The only per-diagram hook is the class regex (`COMPOSITE_PART` L51/L63).
  - `SketchOptions` `sketch.ts:15–21` (roughness < 1 enforced L142, **`fillStyle` only `solid | hachure`** L128/L144, so there is no `cross-hatch`).
  - The drawer `drawer.ts:90–101` and fill opacity via `fill-opacity` (`pathAttrs` L78–88). Activation is `config.handDrawn` or `look: handDrawn` (`drawer.ts:54–59`, `index.ts:2–14`).
  - v12's venn parameters (fillWeight 2, gap 8, angle −41+60i, cross-hatch gap 6 angle 60) therefore need a plugin-hand-drawn change: a venn role/class row, or an options channel on `outline`.
  - Precedent use: `diagram-flowchart/src/render/assets.ts:91` (`w.outline('node', 'circle', …)`). Kanban's per-type spec is `plugin-hand-drawn/src/kanban.spec.ts`. MIGRATION's hand-drawn list `v13/docs/MIGRATION.md:708–711` names venn as not ported.
- **Theme** (`v13/docs/agents/runs/414/CONTRACT.md`; types `core/src/theme/diagram.ts`):
  - `THEME_FAMILIES` L20 (`classic`, `redux`, `neo`); `DiagramThemeTable` L71–86 (`section?`, `vars`, `rules {light, dark?}`, `families?`); a family has `dark?` L41 and `fallback?` L47.
  - DSL `core/src/theme/dsl.ts:1–40`: `lightenHsl`/`darkenHsl` (khroma), `adjustHue`, `literal()`, `inline()`, palette slots `cScale<n>`/`borderColorArray<n>` as literals, `currentColor` past the end.
  - **The DSL's `adjust(a, r, g, b)` is RGB channels**, so v12's `adjust(c, {l: -30, h: 60})` becomes `literal(darkenHsl(adjustHue(c, 60), 30%))`.
  - `inline()` needs a variable, not a palette slot (`theme.ts:415–425`).
  - Worked table: `diagram-kanban/src/theme/vocabulary.ts:11–24` (rows with `alias`, `kind`, `usedBy`), `table.ts:11–17` (`rules.light`/`rules.dark` with `lightenHsl(cScale${n}, 10%)` / `darkenHsl(…)`, via `perSlot` `columns.ts:17–21`), `generated/variables.ts` (`pnpm gen:theme`).
  - **Palette-on (non-empty `borderColorArray`) cannot be expressed in a rule.** The precedent is render-side `theme.palette('borderColorArray')`: `diagram-flowchart/src/render/render.ts:82–100` `paletteSlots`, also class `render.ts:73`, er `render.ts:59`, mindmap `paint.ts:11`. theming.md L15/L19/L29/L55.
  - `Theme` `core/src/theme/theme.ts:107–156`: `dark` L109 (a trait = `spec.dark || darkMode`, L841–842, **not v12's `isDark(background)`**), `color` L112, `value`, `rgba`, `palette` L153, `paletteRgba` L155. There is no `family` on `Theme`.
  - **HSL lighten/darken for an author `style.fill` base**: `rgbToHsl`/`shiftHsl`/`hslToRgb` `color.ts:99,122,131` are not exported (`theme/index.ts:4–13`). This needs in-package maths or a core export.
  - Shared rows venn reads (`vocabulary.ts`): `primaryColor` L206, `background` L209, `primaryTextColor` L210, `fontFamily` L221, `textColor` L229, `titleColor` L271. Each gains `'venn'`. `PALETTE_LIMIT` L156.
  - `tools/gen-config/src/theme-used-by.spec.ts`: `DYNAMIC_READS` L27–36 (add `venn: venn1…venn8`, as pie and kanban did), `readsOf` L48–59, pinned `TYPES` list L66–84 (add `'venn'`).

## 5. Config

- `packages/core/schema/config.schema.yaml`: top-level `venn:` L1172–1174 `pending`; `VennDiagramConfig` L5150–5186.
  - **`venn.theme` default `'redux-color'` L5157–5160 `pending`**: the spec does not decide it, and state and class mark theirs `honoured` (L2961, L3200).
  - `venn.look` L5161 is ignored. `width`/`height`/`padding`/`useDebugLayout` are `pending`. `useMaxWidth`/`useWidth` come from `BaseDiagramConfig` with no venn override; copy pie's per-section `$ref`s.
- `pnpm gen:config` (`package.json:27`): `SECTION_OWNERS` `tools/gen-config/src/generate.ts:36–49` (add `venn: 'packages/diagram-venn'`). MIGRATION config row `MIGRATION.md:378`.
- `pnpm gen:registry` (`package.json:30`): `DiagramManifest` `tools/gen-config/src/registry.ts:68`, `readManifests` L103, `generateRegistry` L134, `FACETS_PATH` L19.

## 6. Licences

- `tools/release/src/licenses.ts`:
  - `Upstream` L22–29 (**one `holder`, one `copyright` string**); `UPSTREAMS` L31–51 (the reference implementation, sanitize-url, @iconify/utils); `REQUIRED_CREDITS` L54–58;
  - header check L120–127 (`\bMIT\b` + `holder`); notices check L193–197 (`'MIT License'` + `copyright`, `"files"` must list it); per-upstream `section` L136–148; listed files `src/…` L150, L199–212;
  - `othersOnly` L187 (no the reference implementation text is needed when every ported file is another upstream's).
  - venn.js has **two** holders, so either one entry must pick a holder and copyright line, or the shape grows. fmin's BSD-3 is outside what the checker models.
- CLI `licenses-cli.ts`, `pnpm check:licenses` (`package.json:20`, inside `check` L35, and `.github/workflows/release.yml:95`). Spec `licenses.spec.ts`.
- How a package ships notices: `packages/plugin-icons/THIRD_PARTY_NOTICES` (a per-upstream section: name, underline, what was ported, indented `src/…` paths, then the MIT text) + `package.json:20–22` `"files"`. The header form is `plugin-icons/src/resolve.ts:1–10`. The reference implementation's / D66 form is `core/src/layout/layered/layered.ts:1–7` and `core/src/layout/tree/tree.ts:1–9` (`core/THIRD_PARTY_NOTICES`, 113 lines).

## 7. Tests, sizes, language

- Stress pattern: `packages/conformance/src/pie/stress.spec.ts:54–78` (n = 4k vs 32k, best of 5, CPU time, `expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24)` L74), also `pie/parser-stress.spec.ts`. Venn's 80k-line `set` input fits this pattern.
- Size:
  - `packages/bench/src/core-size.spec.ts` (62 lines; budget check L42–45);
  - `packages/mermaid/src/cdn-build.spec.ts:58–66` (a stable `chunks/diagram-<id>.mjs` and `-language` per diagram), L68–75 (nothing lazy in the ESM closure), L116–131 (no package theme name in the closure, via `packageThemeNames` L134–148 scanning `src/theme/vocabulary.ts`);
  - `packages/bench/src/size-budget.ts`.
- e2e baselines: `e2e/diagrams/<type>/baseline/<topic>/*.mmd`, runner `e2e/rendering/mmd-snapshots.spec.ts`.
- Language: goldens `packages/language-service/goldens/<id>/` (`REQUIRED_FEATURES` `src/testing/goldens.ts:143`); highlighters `language-service-codemirror/src/grammars.ts:28` and `language-service-monaco/src/grammars.ts:51` (kanban rows); `tools/gen-grammar/src/kanban-agreement.spec.ts`.
- MIGRATION sections to mirror: `## Kanban` L1862 / `## Kanban SVG structure` L1930, `## Radar chart` L1952 / `## Radar SVG structure` L1975. The last section is Cynefin, L1995 (file is 2,036 lines).
