# 02: v13 seams for `@mermaid-js/diagram-ishikawa` (spec #519)

Paths from the repo root; `C` = `packages/conformance/src/`. Recipe: `v13/docs/agents/port-diagram/` (`parser-method.md` §4 file layout :32, `pitfalls.md`, `language.md`, `theming.md`, `orchestration.md`).

## Lexer oracle (T1)

- `C/jison/types.ts`: `JisonTypeDescriptor` :67-85 (`probe`, optional `yy`, `e2e`, `harvest {dir, docs, method}`); `HarvestMethod` :19-52 (`literals` / `chains` / `run`); `V12_DIAGRAMS` :87; `startsWith()` :114 (case-sensitive); `JISON_TYPES` :116. Rows to copy: `kanban` :191-199 (`run`), `venn` :258-267 (`literals` + custom `yy`), `mindmap` :182. Add `ishikawa` after `venn`; doc comment :1-7 lists the types. Pie and cynefin are Langium in v12 (not here; `C/cli/harvest-v12.ts`).
- `C/jison/oracle.ts`: `JisonLexerOracle` :36-65 (`tokens`, `lexedText`, `pulledTokens`); `loadJisonLexerOracle` :83; `defaultYy` :93 (new instance of the DB class: fine for `IshikawaDB`); `load` :98 (probe through `mermaid-v12` `getDiagramFromText`).
- `C/jison/smoke.spec.ts:12-22` `M4_M5` list: add `'ishikawa'`.
- `C/jison/harvest.ts`: `V12_COMMIT` :16, `harvestPath` :19 (`packages/conformance/corpus/<type>-v12-specs.json`), `harvest()` :37-98: reads only `*.spec.*` under `dir` plus the docs page fences (:91-95). `C/jison/harvest.spec.ts` pins every committed corpus. CLI `C/cli/harvest.ts` (`pnpm --filter @mermaid-js/conformance harvest ishikawa`).
  - **Gap:** with `dir: …/ishikawa` the harvest sees `ishikawa.spec.ts` (3) and the docs fence (1) only. `examples/ishikawa.ts` (2) and `multi-diagram-id-uniqueness.spec.ts:126` (1) are reached only by `HARVESTS` in `C/cli/harvest-v12.ts:38-101` (Langium types), so the spec's "drop the `id: 'ishikawa'` literal" has nothing to drop in the jison path. Add those 3 sources as `.mmd` or `ishikawa-cases.json`, or extend `harvest.ts`.
- Gate spec to copy: `C/venn/lexer-parity.spec.ts:70-139` (pins e2e/specs/cases counts :114-116, skip rules :120-138) or `C/kanban/lexer-parity.spec.ts:62` (indentation jison, closest lexer shape). Variants: `VARIANTS` `C/venn/corpus.ts:67-75`, gate builder :80; `commented()` `C/sequence/corpus.ts:48` (9 comment lines per line, or a mid-line `%% cut` for ≤ 2-line bodies); `body`/`crlf`/`tabs` `C/kanban/corpus.ts:15-24`; `crCut` `C/timeline/corpus.ts:45`. `LINE_SEPARATORS` exist only as type-specific lists: `C/gantt/corpus.ts:22`, `C/gitgraph/corpus.ts:19` (and `lineSeparators` `C/xychart/corpus.ts:55`); write ishikawa's own (U+2028 is `\s` for v12's SPACELIST).
- Stress (linear): `C/venn/stress.spec.ts`, `C/venn/parser-stress.spec.ts`.

## Parity (T2)

- `C/types.ts`: `DiagramAdapter<M>` :8-31 (`id`, `v12Types`, `detect`, `parse` throws on reject, `normaliseV13`, `normaliseV12`, optional `v12Config`/`v12ConfigFor`); `CorpusItem` :33.
- `C/registry.ts`: `PARITY_SUITES` :35-186; venn row :177-185 (`adapter`, `corpusDirs`, `corpusFiles`, `corpus`), cynefin row :147-151 (no custom corpus). `DIVERGENCES_FILE` :189 (`packages/conformance/divergences.json`).
- Adapter examples: `C/venn/v13.ts:27-43` (`parseVennForParity` strips the front-matter title as the oracle does, throws the first error; `vennAdapter` :36), `C/venn/v12.ts:20-46` (snapshot of the v12 DB), `C/cynefin/v13.ts:36`. Ishikawa: snapshot `getRoot()` as preorder `[level, text]` + `getDiagramTitle()`; decode entities via `C/flowchart/v12.ts` `decodeEntities` as venn does.
- Grammar specs dir to copy: `C/venn/grammar/` (`differential`, `grammar-lexer`, `reference`, `sentences`); `C/venn/recovery.spec.ts`, `messages.spec.ts`, `probe.spec.ts`, `service-symbols.spec.ts`.

## Package layout (models)

- `packages/diagram-venn/`: `package.json` (exports `.`, `./language`, `./testing` :13-29; peer `@mermaid-js/core` :41-46; manifest `"mermaid"` :48-59: `plugin diagram`, `id`, `types`, `formats ['svg']`, `export`, `language ./dist/language.js`); `grammar/venn.ebnf` + `grammar/generated/{.grammar,.monarch.json,.tmLanguage.json,.tokens.js}`; `scripts/port-v12-specs.ts`; `src/{codes,config,index,labels,language,model,plugin,sizes,test-context,testing}.ts`; `src/parser/{ast,detect,index,lexer,parser,text,tokens,warnings}.ts`; `src/layout/{geometry,index,invariants,layout,metrics,mmd.fixtures,styles,types}.ts`; `src/render/{colour,context,harness,index,paint,render}.ts`; `src/facet/{completions,hover,names,tables}.ts`; `src/generated/{categories,config-defaults,docs}.ts`; `src/theme/` (own table; ishikawa needs none); `src/v12-specs/{adapter,venn.spec}.ts`.
- `packages/diagram-cynefin/`: same shape; `src/render/path.ts`, `src/layout/{boundaries,config,random}.ts`, `src/theme/lengths.ts`; manifest `package.json:47`.
- `packages/diagram-pie/`: the spec's model; `src/layout/{arc,fixtures,invariants,layout,metrics,types}.ts`, `src/render/{paint,render}.ts`, `src/parser/{convert,recovery.spec}.ts`, `src/v12-specs/{adapter,pie,pieRenderer,langium-pie}.spec.ts`; manifest `package.json:47`. No ascii.
- Indentation-jison lexer peers: `packages/diagram-kanban/src/parser/lexer.ts` (573 lines, plus `limits.ts`, `symbols.ts`) and mindmap.
- Plugins: `packages/diagram-venn/src/plugin.ts:22-35`, `packages/diagram-pie/src/plugin.ts:18-31` (`layoutKind: 'custom'`, `configDefaults`, `detector`, `parse(text, ctx)` with `ctx.preprocessed`, `labels`, `layout`, `render`, optional `theme`).

## Core contract

- `packages/core/src/pipeline/types.ts`: `RenderContext.measurer` :53, `.units` :55; `TextRenderContext` :140; `DiagramPlugin<M, L>` :148-207 (`formats` :164, `layoutKind` :165, `configDefaults` :177, `theme?` :182, `parse` :184, `labels?` :192, `layout?` :200, `render(model, layout, ctx, w)` :202, `ascii?` :207 (first-party ships it as a lazy entry instead)).
- Measuring: `Measurer` `packages/core/src/text/measurer.ts:33-39` (`width(text, font, style)`, `metrics(font)`); D225 label layout `layoutLabel(raw, font, maxWidth, measurer, options)` `packages/core/src/text/label.ts:91`, `LabelOptions` :41-56 (`inline`, `keepWords` :55: keep v12's never-split-a-word). Usage: `packages/diagram-venn/src/layout/layout.ts:86-96` (font from `ctx.theme.value('fontFamily')`, `measure(text, font, maxWidth)` with `ctx.inline` and `keepWords`), pie `src/layout/layout.ts:49-50` (`Infinity` = break only at `<br>`).
- Drawing labels: `w.label(box, x, y, attrs)` `packages/core/src/svg/writer.ts:140`, impl `writeLabel` :360-395 centres on (x, y) (`text-anchor middle`, or `start` with `box.left`). **No end anchor:** v12's `.align`/`up`/`down` labels are `text-anchor: end`, so compute the centre as `x1 - width/2` in the layout. Venn: `packages/diagram-venn/src/render/render.ts:196`.
- `SvgWriter` `writer.ts:127-150` (`open`/`leaf`/`close`, `outline` :136, `text`, `label`, `path`, `styleSheet`). `OutlineRole` :98 (`node|part|divider|mark|group|edge`), `OutlineTag` :101 (`line` and `path` allowed).
- `PathBuilder` `packages/core/src/svg/path.ts:8-25` (`moveTo`, `lineTo`, `curveTo`, `quadTo` :13 / impl :43, `arcTo`, `close`, `done`; two decimals).
- Allowlist `packages/core/src/svg/allowlist.ts:9-28`: no `marker` (arrowheads must be paths), `defs` only for the gradient (:105-109). `data-id`/`data-ast` :44-45 (typed `packages/core/src/svg/types.ts:70-71`); a new `data-*` needs both files (venn's `data-venn-sets` :49 / :77-78).
- data-id/data-ast: venn `render.ts:10-13` (doc), area group `data-id` + `data-ast` :114-115, label `data-id` only :144, text node both :184-185; test `packages/diagram-venn/src/render/render.spec.ts:92-102`.
- Root: venn `openRoot` `render.ts:200-230` (`viewBox` = layout bounds, `useMaxWidth` via `config.venn?.useMaxWidth !== false` :206, `role img`, `aria-roledescription`, `aria-labelledby` + `<title id="${idPrefix}-title">`, `theme.rootStyleText()`, `auto` style sheet). Pie :117 same `useMaxWidth` read.
- Theme reads: `Theme` `packages/core/src/theme/theme.ts:113-145` (`color(name)`, `value(name)`, `font()`, `length`). Shared rows needing `ishikawa` in `usedBy`: `packages/core/src/theme/vocabulary.ts` `lineColor` :234, `fontFamily` :247, `fontSize` :259 (`TEXT_USERS`), `textColor` :266, `mainBkg` :285. `tools/gen-config/src/theme-used-by.spec.ts:80-103` pins the scanned `TYPES` list; `NOT_DRAWN_YET` :75.

## Hand-drawn (`w.outline`)

- Venn's use: `w.outline('node', 'path', …)` `render.ts:121`, :133; specs `C/outline-roles.spec.ts:48` (venn row), `C/outline-identity.spec.ts:33`, :44, `packages/plugin-hand-drawn/src/venn.spec.ts`, `unsketched.spec.ts`. Edge example: `packages/diagram-mindmap/src/render/edges.ts:53`.
- Drawer: `packages/plugin-hand-drawn/src/roles.ts` `NODE` :11 (roughness 0.7, fillWeight 1.5, hachureGap 1.5), `EDGE` :43 (0.3), `optionsFor(role, attrs)` :54 (role only); `drawer.ts` `GEOMETRY` :22 (`line` supported), `drawEdge` :61.
- **Conflict:** D494 says "with v12's parameters (roughness 1.5, fill weight 2.5, gap 5, stroke 2)", but `w.outline` takes no per-call options (MIGRATION.md :2397-2403, venn accepted role defaults) and D304 (`DECISIONS.md:441`) allows only roughness below 1 for determinism. Getting v12's numbers needs a plugin/core seam or an escalation (D490/D499).
- MIGRATION.md :724-728 lists ishikawa among "sketched once their ports adopt it".

## Diagnostics and warnings

Package-local constants, no central registry: `packages/diagram-venn/src/codes.ts:1-20` (D417 doc pattern), emitted in `src/parser/warnings.ts`; asserted in `packages/mermaid/src/venn.spec.ts:156`; goldens `packages/language-service/goldens/venn/diagnostics/errors.out`. Add `ISHIKAWA_EMPTY`, `ISHIKAWA_INDENT_CLAMPED` the same way, plus MIGRATION rows.

## Registry, config, docs (T5)

- Detector source `tools/gen-config/src/registry.ts:27` `V12_DETECTORS`, ishikawa :55 (`'i'` flag, after `radar`, before `treemap`). `pnpm gen:registry` (root `package.json:30`) writes `packages/mermaid/src/generated/registry.gen.ts`: ishikawa row :154 is bare `{ type, pattern }` (spec cites :142, now :154); venn's full row :166-172 (`id`, `formats`, `load`; kanban/flowchart add `loadAscii`, :12). Also `detectors.gen.ts:33`; language `packages/language-service/src/generated/facets.gen.ts:166` (bare ishikawa row), venn :180-185, `FirstPartyFacetId` :210. Order pins: `packages/mermaid/src/treemap.spec.ts:57-59`, `radar.spec.ts:8`; header `C/detection.spec.ts:77`.
- Schema `packages/core/schema/config.schema.yaml`: status legend :14-21; `ishikawa` property :1144-1146 `pending`; `IshikawaDiagramConfig` :2320-2337 (`diagramPadding` :2326 default 20, `useMaxWidth` :2334 default `false` :2336, both `pending`). Venn as honoured model :1181-1183. `pnpm gen:config` (`tools/gen-config/src/generate.ts`: `SECTION_OWNERS` :36, venn :53 → `src/generated/config-defaults.ts`; pending/honoured filter :418).
- `v13/docs/config-reference.md:543-553` (`useWidth`, `theme`, `layout` rows inherited from the base; `look` ignored :551); legacy alias `ishikawa.look: "handDrawn"` :1019. MIGRATION config table `ishikawa.look` :363.
- MIGRATION.md per type: Venn :2336 (table), Venn SVG structure :2359, theme colours :2380, hand-drawn para :2397; Pie :1532/:1578; Kanban :1882/:1951; Cynefin SVG :2083. D492 already cited in the sankey row :2183.
- Release wiring (from #501): `.changeset/{diagram-venn-first-release,mermaid-venn,language-service-venn}.md`, `v13/docs/RELEASING.md`, deps `packages/mermaid/package.json:80`, `packages/language-server/package.json:49`, `packages/language-service/package.json:51/113/144`, `packages/bench/package.json:40`. Dev gallery already maps `ishikawa` (`packages/dev/src/fixture-discovery.ts:38`).

## ASCII (T7)

Only custom-layout ascii: `packages/diagram-kanban/src/ascii.ts` (entry, `cellMeasurer`, `asciiOptions`, `unicode`/`ascii` glyphs from `@mermaid-js/core/ascii`), `src/ascii/{draw,warnings}.ts`, manifest `./ascii` `package.json:19-23`, `formats` :58-61, plugin `formats` `src/plugin.ts:48`. No `tree(1)` printer exists anywhere (no `├── ` outside specs), no treeView or mindmap ascii: ishikawa writes its own.

## Size, knip, language service

- Core budget: `packages/bench/src/core-size.spec.ts:42-44` (`checkBudget`), `measureStaticClosure` `packages/bench/src/size-budget.ts:133`, `measureCoreSize` :165 (not in the spec file); limit `packages/mermaid/size-budget.json` 98,304 B gz (CDN entry `src/cdn.ts`). `bench/src/core-chunks.spec.ts`. Language bundle row `bench/src/language-bundle.spec.ts:74`, budget spec `language-budget-venn.spec.ts`, `cli/language-venn.ts`.
- knip: the only per-package list is `knip.json:35-58` (`packages/bench` `ignoreDependencies`, venn :58); `packages/*` entry globs :14-22 cover a new package.
- Goldens `packages/language-service/goldens/<type>/<feature>/*.mmd|.out` (venn: 9 features); `REQUIRED_FEATURES` `packages/language-service/src/testing/goldens.ts:143`; `UNLISTED_FACETS` `src/testing/unlisted-facets.ts:13`. Highlighters: `LEZER_HIGHLIGHTERS` `packages/language-service-codemirror/src/grammars.ts:11` (venn :33), `MONARCH_HIGHLIGHTERS` `packages/language-service-monaco/src/grammars.ts:32` (venn :56); specs codemirror `highlighters.spec.ts:54`, :261, monaco :53, :78. Grammar gen `tools/gen-grammar/src/generate.ts` `GRAMMARS` :23, venn entry :282.
- "UNSUPPORTED" spec: none lists ishikawa. Generic case `packages/mermaid/src/api.spec.ts:86-93` (requirementDiagram); the per-port model is `packages/mermaid/src/venn.spec.ts:35` ("renders, where it was UNSUPPORTED_DIAGRAM"); language `packages/language-service/src/service.spec.ts:110` (`NO_LANGUAGE_SUPPORT`, on requirementDiagram).

## Closest worked run: venn (`v13/docs/agents/runs/429/`)

`INDEX.md` (ticket table, core size log, merge log, finish rule), `01-v12-venn.md`, `02-v13-core.md`, `IMPLEMENTER.md`, `GAPS.md`, `tickets/*.md`:
- #486 T1: new package, lexer only; `venn` in `JISON_TYPES` with `yy`, oracle `pulledTokens`; `lexer-parity.spec.ts` (7 variants, 16 line-separator cases), `stress.spec.ts`; corpus json + 19 fixtures; smoke list.
- #488 T2: `parseVenn`, model, flat AST ids, codes; `venn.ebnf` in `gen:grammar`; `PARITY_SUITES` row + divergences; grammar differential, recovery, messages, parser-stress; ported v12 specs.
- #491 T3: `layoutVenn` + ported solver; layout parity vs v12, corpus invariants, `.mmd` layout fixtures; schema default change.
- #495 T4: plugin, renderer, theme table; `w.outline('node','path')`; `data-venn-sets` allowlist; conformance `render.spec.ts` (11 themes, inert, deterministic, AST round-trip), `theme.spec.ts`.
- #498 T6: `./language` facet, probe, goldens (29 cases), service-symbols, venn-agreement, bench language budget.
- #501 T5: manifest, `gen:registry`, config honoured, MIGRATION sections, baselines (22), highlighter rows, outline-roles/identity, hand-drawn spec, changesets, `mermaid/src/venn.spec.ts`.
- final: 15 review fixes (helpers, type unions, renames, root-export trims).
