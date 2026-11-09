# 02: v13 seams a wardley port touches (#430)

Pointers only, at `feature/430_wardley` (base `12ba676cb`). `C/` = `packages/conformance/src/`, `K/` = `packages/core/src/`.

## T1 lexer gate and harvest

- `C/langium-lexer.ts`: `LangiumLexerDescriptor` `:22-29`; `LANGIUM_LEXERS` `:32-39` (radar, pie, info, gitGraph,
  packet, cynefin; no wardley yet); `loadLangiumLexerOracle(type)` `:138`. The spec's row fits; factory and key exist
  in the installed 2.0.1 (see 01).
- `C/cli/harvest-v12.ts`: `Harvest` `:29-36`; `HARVESTS` `:39-85` (radar `:67-76`, cynefin `:77-85`; no wardley);
  header regex `:132-135` (case-sensitive, `(?![\w.-])`); `harvestPath` `:90-91` → `corpus/<type>-v12-specs.json`;
  `harvest()` `:123`; CLI `:166-167`. Reads at `V12_COMMIT = 'fa796a943'` (`C/jison/harvest.ts:16`); its comment `:17-19`
  says the tag is not in this repo (the wardley files equal `mermaid@12.2.0`, see 01).
- `C/cli/harvest-v12.spec.ts:13-19` asserts every `HARVESTS` row's committed JSON equals a fresh harvest: commit
  `corpus/wardley-v12-specs.json` with the row. Scripts `packages/conformance/package.json:15-20` (`harvest:<type>`).
- Wardley inputs: `D/wardleyParser.spec.ts`, `D/wardleyBuilder.spec.ts` (no sources), `examples/wardley.ts`,
  `docs/syntax/wardley.md`; header `wardley-beta`.

## T2 parity

- `C/registry.ts`: `PARITY_SUITES` `:27`; radar row `:128-132`, cynefin `:133-137`
  (`{ adapter, corpusDirs: ['e2e/diagrams/<t>'], corpusFiles }`). `ParitySuite` `C/corpus.ts:10`.
- `C/types.ts` `DiagramAdapter` `:8-31`: `v12Types` `:12`, `v12Config` `:23`, `v12ConfigFor(text)` `:29` (how to hand
  v12 a `wardley-beta` section, which v12 only takes via `initialize()`, D421), `normaliseV12(db)` `:30`, called with
  the live DB right after the oracle parse (`:5`), which suits wardley's singleton.
- Radar pair: `C/radar/v12.ts` (`radarV12Snapshot` `:21-40`) and `C/radar/v13.ts` (`normaliseV12` `:47`).

## Radar conformance suite (`C/radar/`), closest Langium custom-layout example

- `lexer-parity.spec.ts`: T1 tokens, images, hidden vs 2.0.1. `stress.spec.ts` / `parser-stress.spec.ts`: lexer and
  parser linear (n vs 8n, bar 24×). `corpus.ts`: gate corpus (e2e, harvested, `corpus/radar-cases.json`, CRLF and
  commented copies).
- `parity.spec.ts`: accept/reject + model vs v12, divergences listed. `parser.spec.ts`: model, AST ids, warnings,
  symbols, spans. `recovery.spec.ts`: N errors → N diagnostics (`corpus/radar-recovery.json`).
- `grammar/grammar-lexer.spec.ts`: `.ebnf` `@lexer` equals 2.0.1. `grammar/differential.spec.ts`,
  `grammar/sentences.spec.ts`: reference vs hand-written vs v12 (corpus, generated sentences).
- `layout-corpus.spec.ts`: invariants on parser-produced models (T3). `render.spec.ts` (546 lines): well-formed,
  allow-list, deterministic, no NaN/foreignObject/empty `<g>` (T4). `theme.spec.ts`: table vs v12
  `getThemeVariables()` in eleven themes (T5). `probe.spec.ts`, `service-symbols.spec.ts`: T6.
  `render-api.ts`: fresh deterministic `mermaid`. Cynefin adds `config.spec.ts`, `boundaries.spec.ts`, `fuzz.spec.ts`.

## Package layout

- `packages/diagram-radar/`: `grammar/radar.ebnf` + `generated/*`; `src/parser/{tokens,lexer,parser,convert,normalise,
  ast,detect,index}.ts`; `src/model.ts`; `src/config.ts` (`RADAR_CONFIG_INVALID` `:12`, `radarLayoutConfig` `:67`,
  `radarUseMaxWidth` `:88`); `src/layout/{layout,metrics,types,invariants,fixtures}.ts` (`layoutRadar` `:72`,
  `RADAR_METRICS` `metrics.ts:25`); `src/render/{render,paint}.ts` (`renderRadar` `:20`); `src/theme/{vocabulary,
  table}.ts` + `generated/variables.ts`; `src/facet/*`, `src/language.ts`; `src/plugin.ts`; `src/v12-specs/*` +
  `scripts/port-v12-specs.ts`; `src/generated/*`. Manifest `package.json:47-58`; exports `.`, `./language`, `./testing`.
- `packages/diagram-quadrant/` (coordinate plane): `layout/types.ts` (`QuadrantLayout` `:111`, points `:95`),
  `layout/layout.ts` (`layoutQuadrant` `:262`), `render/render.ts` (`renderQuadrant` `:59`), `layout/invariants.ts`.

## Core kit

- Parser kit (`K/parser-kit/index.ts:1-58`): `TokenCursor` `cursor.ts:26` (`peek`…`eat` `:64-90`), `TRIVIA` `:24`,
  `kindSet` `:13`; `TokenView` `view.ts:11-16`, `significantTokens` `:22`, `skipTo` `:46`; `sourceView`/`cook`
  (`source-view.ts`, v12's preprocessing as offsets, pitfall 1); `ParseState`, `Diagnostics`, `AstIds`, `Probe`.
  Radar uses `significantTokens` + `sourceView` + `cook` (`diagram-radar/src/parser/parser.ts:216-260`), no
  `TokenCursor`; quadrant, cynefin, kanban use `TokenCursor`.
- `SvgWriter` `K/svg/writer.ts:119-140` (`open`, `close`, `leaf`, `outline`, `text`, `label`, `path`, `styleSheet`);
  `LabelBox` `:62`. Measurer `K/text/measurer.ts:33-39` (`width(text, font, style)`, `metrics(font)`, `id`),
  `FontKey` `:5`; `layoutLabel` `K/text/label.ts:86`; `pxProfile` `K/layout/units.ts:134`.
- `DiagramPlugin` `K/pipeline/types.ts:148-201` (`layoutKind` `:159`, `configDefaults` `:171`, `theme` `:176`,
  `parse` `:178`, `labels` `:186`, `layout` `:194`, `render` `:196`); `DiagramParseContext` `:38-46` (`preprocessed`,
  front-matter title, D218); `RenderContext` `:51`. Radar's plugin `diagram-radar/src/plugin.ts:20-33`.

## Theme table

- `v13/docs/agents/runs/414/CONTRACT.md`: shape `:5-30`, precedence/families/nested `:34-37`, direction `:39`,
  `inline()` `:47`, vocabulary and `gen:theme` `:62-77`. Types `K/theme/diagram.ts`: entries `:25-47`, table `:71-85`.
- T0a/T0b **have landed**: radar, cynefin, kanban have `src/theme/vocabulary.ts` (`THEME_VARIABLES`, `usedBy`, `nested`)
  and `generated/variables.ts` (`THEME_VARIABLE_TABLE`); tables take `vars: THEME_VARIABLE_TABLE`
  (`diagram-radar/src/theme/table.ts:27-32`, `section: 'radar'`; `diagram-cynefin/src/theme/table.ts:21-60` with
  `rules.light`, `families.classic.dark`, `redux: { fallback: 'classic' }`). The spec's core fallback is not needed.
- **`gridColor` is not shared vocabulary**: it is gantt's own row (`packages/diagram-gantt/src/theme/vocabulary.ts:17`,
  `usedBy: ['gantt']`, value `table.ts:23`). Core `K/theme/vocabulary.ts` has `background` `:209`, `primaryTextColor`
  `:210`, `lineColor` `:211`, `mainBkg` `:246`, no `gridColor`, no wardley names. CONTRACT `:39` lets rules read only
  shared or own vars, `:74`/`:76` put a two-type row in core and fail `gen:theme` on another package's name. So the
  spec's "gridColor as shared vocabulary" needs a call: move it to core (touches gantt and core size) or family literals.
- Checks that pick a table up: `tools/gen-config/src/theme-{direction,used-by,tables,inventory}.spec.ts`;
  `C/diagram-themes.ts` (`DIAGRAM_TABLES` `:34`, `D332_INPUTS` `:65`, `everyTable` `:92`).

## Registry and config

- Row `packages/mermaid/src/generated/registry.gen.ts:149` (after venn `:148`, before cynefin `:150-156`); **the
  spec's `:104` is stale**. `generated/detectors.gen.ts:40`. Source until packaged: `tools/gen-config/src/registry.ts:62`
  (`V12_DETECTORS`); then `gen:registry` reads the manifest. `C/detection.spec.ts:84`.
- `packages/core/schema/config.schema.yaml`: `wardley-beta` `:1175-1177` `pending`; def `:5192-5253`, keys `pending` at
  `:5211, 5217, 5223, 5229, 5235, 5241, 5247, 5252`. Radar's honoured form `:1166-1168` (`since: 13.0.0`).
  `tools/gen-config/src/generate.ts:35-48` `SECTION_OWNERS` needs `'wardley-beta': 'packages/diagram-wardley'`.
  Generated: `K/config/generated/keys.ts:37`, `config.type.ts:240`, `:2449-`.

## Radar T5 (#449) footprint

`7fbd64a65` (45 files) + `1c66021f9`, `0d0aca0bc`, `a9a292c9e`, `8b0c7bbf8`, `373e38103`, fast-forwarded into
`feature/422_radar`, merged as #474 (`f36c79410`): `.changeset/*` (2); `e2e/diagrams/radar/baseline/**` (config, data,
text, theme-variables, themes default/redux/redux-dark-color/neo/neo-dark); `e2e/helpers/platform-harness.spec.ts`,
`mmd-snapshots.spec.ts:173`; `C/__snapshots__/yaml-tree.spec.ts.snap`; `C/radar/{layout-corpus,lexer-parity}.spec.ts`,
`render-api.ts`, `theme.spec.ts` (new); schema + `config.type.ts`; `packages/dev/src/{adapter,fixtures}.spec.ts`;
package README, `package.json`, `config.ts`, `generated/config-defaults.ts`, `index.ts`, `plugin.ts`, layout;
`language-service/src/generated/{config-schema,facets}.gen.ts`; `packages/mermaid/package.json`,
`generated/{detectors,registry}.gen.ts`, `src/radar.spec.ts` (new), `src/cdn-build.spec.ts`; `pnpm-lock.yaml`;
`tools/gen-config/src/generate.ts`; `tools/release/src/publish.spec.ts`; `v13/docs/{MIGRATION,RELEASING,
config-reference,format-matrix}.md`.

## Size gates

- `packages/bench/src/core-size.spec.ts:42-45` vs `packages/mermaid/size-budget.json` (`gzipBytes: 94208`, entry
  `src/cdn.ts`); `packages/mermaid/src/cdn-build.spec.ts:98-102` same on the CDN closure, `:58-65` a chunk per diagram
  (`chunks/diagram-<id>.mjs`, `-language.mjs`), `:104-132` no `usedBy` or package theme names in the static closure.
- Headroom (not measured here): 92,981 B gz after radar T5 (`runs/422/GAPS.md:87`), 92,316 after kanban T7
  (`runs/424/INDEX.md:13`): about 1.2–1.9 KB. A registry row costs ~18–25 B.
