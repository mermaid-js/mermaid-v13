# 02 — What the railroad port plugs into (v13 core and tooling)

Paths are workspace-relative on `feature/526_railroad` at 521fb76ee, after venn (#533), sankey (#532), xychart (#535), wardley (#529) and treemap (#516). There is no `packages/diagram-railroad` yet. Models: packet and radar (Langium types, `custom` layout) and pie (the first Langium lexer oracle, D213/D220).

## 1. Plugin contract: `packages/core/src/pipeline/types.ts` (208 lines)

- `Warning` L22–35. `DiagramParseContext` L38–45 (`config`, `preprocessed`). `RenderContext` L51–100: `measurer` L53, `theme` L57, `idPrefix` L61, `availableWidth` L77, `inline` L90.
- `DiagramPlugin<M, L>` L148–208:
  - `id` L150, `configSection?` L156 (only when the section is not `id`), **`aliases?` L157**, `detector` L162, `formats` L164, `layoutKind` L165;
  - `configDefaults` L177, `theme?: DiagramThemeTable` L182, `parse` L184, `labels?` L192;
  - `layout?` L200, `render` L202, `ascii?` L207.
- The context is filled at `packages/mermaid/src/api.ts:650–690`. The measurer is `selectMeasurer` L658–660 (`mermaid/src/measurer.ts:154`); the theme is `themeFor(config, …, {rules, diagram: plugin.theme})` L647–649. In text mode the measurer is `backend.cellMeasurer` L728.
- Config section: `sectionOf` `api.ts:395–397` = `configSection ?? id ?? detected.id`. One plugin `id: 'railroad'` gives all four types the `railroad` section.
- `diagramType` is `detected.type` (`api.ts:432`, `:569`), so the four v12 ids come out with no extra code.

## 2. Several types in one plugin: flowchart

- `packages/diagram-flowchart/src/plugin.ts:23–25`: `id: 'flowchart'`, `aliases: ['graph', 'flowchart-v2', 'flowchart-elk']`, `formats`.
- Manifest `diagram-flowchart/package.json:53–67`: `"types": ["flowchart-elk", "flowchart-v2"]` (only the detector rows the package owns), plus `export`, `ascii` and `language`.
- `tools/gen-config/src/registry.ts`:
  - `V12_DETECTORS` L27, railroad rows L57–60;
  - `DiagramManifest.types` L68–72, `readManifests` L108 (loops `types` L129);
  - `generateRegistry` L139, `generateFacets` L183, `generateDetectors` L233.
  - Output: `registry.gen.ts:162–165`, `detectors.gen.ts:35–38`, `facets.gen.ts:175–178`. A manifest owning a type adds `id`/`formats` to that row. Flowchart's two rows share `id: 'flowchart'` and `section: 'flowchart'` (`facets.gen.ts:7–12, 84–87`).
- **Facet id = plugin id.** `FirstPartyFacetId` (emitted from `registry.ts:223–229`) is the union of ids, and each highlighter map has one row per id. Four railroad notations under one id therefore get **one** Lezer parser and one Monarch file unless the maps change. This bears on Q2/T0.

## 3. Package skeleton: `packages/diagram-packet`

- `package.json`:
  - exports `.`, `./ascii`, `./language` and `./testing` L13–34 (each with `mermaid-source` → `src/…`); `files: ["dist"]`; core peer only L46–51;
  - manifest L52–65: `plugin`, `id`, `types`, `formats ["svg","ascii"]`, `export`, `ascii`, `language`;
  - script `port:v12-specs` L44.
- `src/plugin.ts:18–32` is the whole plugin: `layoutKind: 'custom'`, `configDefaults` from `generated/config-defaults.ts`, `theme` from `./theme/table.ts`, `parse` with `ctx.config.packet`.
- Files:
  - `src/{index,config,model,labels,normalise,language,testing,ascii}.ts`;
  - `parser/{tokens,lexer,parser,ast,convert,detect,index,langium-names}.ts` + `{lexer,parse,convert}.spec.ts`. `lex` is at `lexer.ts:70`, `parsePacket` at `parser.ts:189` and `packetTokens` at `index.ts:35`;
  - `layout/{layout,types,metrics,invariants,fixtures,index}.ts` + specs. `PACKET_METRICS` `metrics.ts:19` is the one-px-table pattern (pitfall 13);
  - `render/{render,paint,index}.ts`: `renderPacket` L31, `openRoot` L89–130 (`w.open('svg'…)` L107), `textElement` for title/desc L131;
  - `theme/{vocabulary,table}.ts` + `theme/generated/variables.ts`;
  - `facet/{completions,hover,tables}.ts`; `generated/{categories,docs,config-defaults}.ts`;
  - `grammar/packet.ebnf` + `grammar/generated/packet.{grammar,monarch.json,tmLanguage.json,tokens.js}`;
  - `v12-specs/{adapter,packet.spec,renderer.spec,langium-packet.spec}.ts` + `scripts/port-v12-specs.ts`.
- `parser/langium-names.ts:14–30`: `LANGIUM_NAMES` maps kind → Chevrotain token name (`'packet-beta'`, `'TITLE'`, `'STRING'`, …, `LEXICAL_ERROR`). It is exported only from `testing.ts:7`, so the render chunk never carries it.
- Radar has the same layout: `diagram-radar/src/parser/` adds `normalise.ts`, and `v12-specs/` has `adapter.ts`, `langium-radar.spec.ts` and `radar.spec.ts`. Pie: `diagram-pie/src/parser/` adds `recovery.spec.ts`.

## 4. Conformance (Langium path)

- **`LANGIUM_LEXERS`** `packages/conformance/src/langium-lexer.ts:32–45`: `{probe, factory, key}` per v13 id (radar, pie, info, gitGraph, packet, treemap, cynefin, wardley).
  - `loadLangiumLexerOracle(type)` L144–151, `load` L153–187, `lexWith` L189–208.
  - `langiumParserVersions()` L119–139 is the D213 version check, tested in `src/langium-lexer.spec.ts:6`. Pie's oracle cases are at L14/L32/L48.
  - Railroad needs four rows; the factory and key names are confirmed in `01-v12-railroad.md` §12.
- **`HARVESTS`** `src/cli/harvest-v12.ts:39–105` (`{header, files, docs}`).
  - `harvestPath` L110, `harvest` L143. The header regex at L152–154 is case-sensitive with `(?![\w.-])`.
  - Script rows: `conformance/package.json:15–22` (`harvest:packet` L18; add `harvest:railroad`).
  - Drift check: `src/cli/harvest-v12.spec.ts:14–20` (`it.each(Object.keys(HARVESTS))`).
- **`PARITY_SUITES`** `src/registry.ts:35`. The packet entry is L130–135, radar L136–140; `DIVERGENCES_FILE` L189.
  - `DiagramAdapter` `src/types.ts:8–31`: `v12Types: string[]` L12, so one adapter can list the four railroad ids. Also `v12ConfigFor` L29 and `normaliseV12` L30. `ParitySuite` `src/corpus.ts:10`.
- **Packet's adapter**: `src/packet/v13.ts:58–69` (`packetAdapter`, `v12ConfigFor`). Snapshots: `src/packet/v12.ts:48` and `v13.ts:17`. Corpus: `src/packet/corpus.ts:18,27,30` (`packetGateCorpus` = e2e + specs + cases).
- **Packet's lexer-parity spec**: `src/packet/lexer-parity.spec.ts` (161 lines).
  - Imports `LANGIUM_NAMES, packetTokens` from `@mermaid-js/diagram-packet/testing` L4, and `decodeEntities` from `flowchart/v12.ts` L5.
  - `EXCLUDED` (with `(commented)` ids) L46–65. `v12Streams` L75, `v13Streams` L85, oracle L121, count pin `expect(e2e).toBe(25)` L157.
  - The other Langium gates are the same: `pie/lexer-parity.spec.ts:97`, `radar/lexer-parity.spec.ts:105`, `treemap/…:119`, `wardley/…:123`. Grammar-lexer differentials are in `<type>/grammar/grammar-lexer.spec.ts:15,31`.
- Per-type folder (radar): `corpus, v12, v13, lexer-parity, parity, parser, parser-stress, stress, recovery, probe, render, render-api, layout-corpus, service-symbols, theme` + `grammar/`. Corpus files: `corpus/packet-{v12-specs,cases}.json`, `radar-{v12-specs,cases,recovery}.json`.
- `src/detection.spec.ts:79–82` already lists the four headers.

## 5. Theme (D331): `packages/diagram-kanban/src/theme/`

- `vocabulary.ts` (24 lines): rows `{alias, kind, usedBy}`. `table.ts` (17): `rules.light`/`rules.dark`. `columns.ts` (21): `perSlot`. `generated/variables.ts` is written by `pnpm gen:theme` (`package.json:29`).
- The packet variant: `diagram-packet/src/theme/vocabulary.ts:12–33` (flat `packet*` variables with `nested`) and `table.ts:22–56` (`section: 'packet'`, `rules: {light}`, `families` L51).
- Types: `core/src/theme/diagram.ts`, `THEME_FAMILIES` L20 and `DiagramThemeTable` L71.
- Shared rows railroad reads, in `core/src/theme/vocabulary.ts`: `secondaryColor` L214, `tertiaryColor` L215, `background` L216, `primaryTextColor` L225, `lineColor` L234, `fontFamily` L247, `fontSize` L259, `primaryBorderColor`/`secondaryBorderColor`/`tertiaryBorderColor` L261–263, `secondaryTextColor`/`tertiaryTextColor` L264–265, `textColor` L266, `mainBkg` L285, `titleColor` L312. **`secondBkg` and `labelBackground` are absent (0 hits)**, as the spec says.
- `pnpm gen:config` owners: `tools/gen-config/src/generate.ts:36` `SECTION_OWNERS` (packet L44, venn L53); add `railroad`.

## 6. Writer, measurer, labels

- `SvgWriter` `core/src/svg/writer.ts:127–143`: `open` L128, `close` L129, `leaf` L130, `outline` L136, `text` L138, `label` L140, `path()` L142. `AllowedTag` `svg/types.ts:142` (has `rect`, `circle`, `path`).
- `PathBuilder` `core/src/svg/path.ts:7–25`: `arcTo(rx, ry, rotation, large, sweep, x, y)` L14 has the **same signature as v12's**. Numbers go through `num()` (2 decimals); `pathBuilder()` is at L82.
- Measurer: `Measurer` `core/src/text/measurer.ts:33`, `FontKey` L5; `layoutLabel` `core/src/text/label.ts:91`. Measure-first in a custom layout: `diagram-packet/src/layout/layout.ts:27,51–52` (`ctx.measurer`, `metrics`).

## 7. ASCII (D347)

- `diagram-packet/src/ascii.ts:28–42`: the `ascii(model, _layout, ctx)` hook, `asciiOptions(ctx.config)`, `ascii`/`unicode` glyphs from `@mermaid-js/core/ascii`. It draws from the model, not the px layout.
- Helpers `src/ascii/{draw,warnings,packet.fixtures}.ts`. Manifest key `ascii` `package.json:63`, export `./ascii` L19–23. D347 is `v13/docs/DECISIONS.md:519`.
- Bench: `packages/bench/src/ascii-size.spec.ts:43–46` (the packet SVG render loads no ascii chunk).

## 8. Sizes

- `packages/bench/src/core-size.spec.ts` (`measureCoreSize` is imported from `size-budget.ts:165`).
- Budget `packages/mermaid/size-budget.json`: core 98,304 B gz (D546), loaded 131,072.
- Run with `cd packages/bench && npx tsx --conditions=mermaid-source -e "import('./src/size-budget.ts').then(async m=>console.log((await m.measureCoreSize()).gzip))"`.
- `packages/mermaid/src/cdn-build.spec.ts` checks the stable `chunks/diagram-<id>.mjs`. Language budget: `bench/src/language-budget-packet.spec.ts`; bundle: `language-bundle.spec.ts:60`.

## 9. Language facet and goldens

- Facet `diagram-packet/src/language.ts:27–40` (`LanguageFacet`, `parse`, `categories`, `namespaces`, `standalone`). Its re-exports L21–24 (`detectPacket`, `packetTokens`, `parsePacket`).
- Goldens `packages/language-service/goldens/<id>/{astAt,completions,definition,diagnostics,folding,hover,references,rename,semanticTokens}`. `REQUIRED_FEATURES` is at `language-service/src/testing/goldens.ts:143`.
- Highlighter maps keyed by facet id: `language-service-codemirror/src/grammars.ts` (`LEZER_HIGHLIGHTERS`, packet L25, radar L26) and `language-service-monaco/src/grammars.ts` (packet L48, radar L49).
- gen-grammar: `tools/gen-grammar/src/generate.ts` (349 lines).
  - `GRAMMARS` L22 has one `{type, title, kinds}` per diagram (packet L155, radar L180, venn L282).
  - `grammarPath(type)` = `packages/diagram-<type>/grammar/<type>.ebnf` L298–299, with `generatedDir`/`sourceDir` L300–302.
  - `generateFor` L305–336 writes `<type>.{tmLanguage,monarch}.json`, `.grammar`, `.tokens.js`, `v13/docs/syntax/<type>.md` and `generated/{categories,docs}.ts`. `generate` L338–349.
  - So one grammar per package. The spec's `generate.ts:22,233-271` is stale, and T0 lands here.

## 10. Wiring rows (packet's, to copy)

- `diagram-packet` appears in the `package.json` of `packages/{mermaid,bench,conformance,language-service,language-server}` and `tools/gen-grammar` (L29).
- Also `tools/release/src/publish.spec.ts:35`, `e2e/helpers/platform-harness.spec.ts:84` and `bench/src/language-bundle.spec.ts:60`.
- knip: `knip.json:35–60` (`packages/bench` `ignoreDependencies`, with diagram packages at L42–58; add `@mermaid-js/diagram-railroad`).

## 11. MIGRATION.md (2,404 lines)

Sections to mirror: `## Pie chart` L1532 / `## Pie SVG structure` L1578, `## Packet diagram` L1598 / `## Packet SVG structure` L1643, `## Radar chart` L1973 / `## Radar SVG structure` L1996. The last ones are `## Venn diagram` L2336 / `## Venn SVG structure` L2359.

## 12. Recipe docs

`v13/docs/agents/port-diagram/{README,parser-method,language,theming,pitfalls,orchestration}.md`. `parser-method.md:9` says Langium types gate on Chevrotain tokens (D213), and `:11` covers the corpus and harvest.
