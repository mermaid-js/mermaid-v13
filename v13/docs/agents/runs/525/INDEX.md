# Pointer index, spec #525 (architecture, `@mermaid-js/diagram-architecture`)

Pointers only. v12 = `git show fa796a943:<path>`; the reference implementation = `/Users/knsv/repos/pele/src/diagrams/architecture/`; everything else is this worktree. `A` = `packages/mermaid/src/diagrams/architecture/`, `PL` = `packages/parser/src/language/architecture/`.

## 1. v12 sources (fa796a943)

| Pointer | What |
| --- | --- |
| `A/architectureDb.ts:82-98` | service: `The service id [${id}] is already in use by another ${kind}` (83), `The service [${id}] cannot be placed within itself` (89), `The service [${id}]'s parent does not exist. Please make sure the parent is created before this service` (92), `The service [${id}]'s parent is not a group` (97) |
| `A/architectureDb.ts:119-135` | junction: same four, `junction` wording (120, 126, 129, 134) |
| `A/architectureDb.ts:161-177` | group: same four, `group` wording (162, 168, 171, 176) |
| `A/architectureDb.ts:203-212` | `Invalid direction given for left/right hand side of edge ${lhs}--${rhs}. Expected (L,R,T,B) got ${dir}` (unreachable after the grammar) |
| `A/architectureDb.ts:214-222` | `The left-hand id [${id}] does not yet exist. Please create the service/group before declaring an edge to it.` (215); `right-hand` (220) |
| `A/architectureDb.ts:225-226` | `this.nodes.get(id)!.in`: raw TypeError when an edge end is a group id |
| `A/architectureDb.ts:227-236` | `The left-hand id [${id}] is modified to traverse the group boundary, but the edge does not pass through two groups.` (228); `right-hand` (233) |
| `A/architectureDb.ts:263-279` | align: `An align directive requires at least two members; got ${n}` (265), `align ${dir} references [${id}], which is not a service or junction` (272), `align ${dir} lists [${id}] more than once` (277) |
| `A/architectureDb.ts:348,354` | internal `BFS error: ... Please report this as a bug.` (not user-facing) |
| `A/architectureDb.ts:39-40,397-402` | config defaults from `DEFAULT_CONFIG.architecture`; `getConfigField` |
| `A/architectureParser.ts:5-11` | populate order: groups, services, junctions, edges, alignments |
| `A/architectureRenderer.ts:40-46` | `registerIconPacks` of `architectureIcons`; `cytoscape.use(fcose)` |
| `A/architectureRenderer.ts:48-153` | addServices/addJunctions/positionNodes/addGroups/addEdges (cytoscape model) |
| `A/architectureRenderer.ts:155-372` | fcose alignment + relative constraints (dropped, D328) |
| `A/architectureRenderer.ts:375-608` | `layoutArchitecture` (fcose, `withSeededRandom`; fontSize 426, padding 448) |
| `A/architectureRenderer.ts:610-642` | `draw`: title TODO (611); `g.architecture-edges` (625), `g.architecture-services` (628), `g.architecture-groups` (631); viewbox from `padding`/`useMaxWidth` (642) |
| `A/svgDraw.ts:25-191` | `drawEdges`: arrowSize `iconSize/6` (34), `path.edge` (96), `polygon.arrow` (110, 123), label `architecture-service-label` (150) |
| `A/svgDraw.ts:193-274` | `drawGroups`: `rect.node-bkg` (220), group icon via `getIconSVG` (228), title (251) |
| `A/svgDraw.ts:276-362` | `drawServices`: label width `iconSize*1.5` (294), `translate(iconSize/2, iconSize)` (306), icon (316), text icon `foreignObject`/`node-icon-text` (324-340), open-bottom `path.node-bkg` (344-348), `g.architecture-service` (354) |
| `A/svgDraw.ts:364-389` | `drawJunctions`: invisible rect, `g.architecture-junction` (382) |
| `A/architectureTypes.ts:36-41` | `ArchitectureDirectionArrow` L/R/T/B polygon points (arrow shapes) |
| `A/architectureTypes.ts:43-48` | `ArchitectureDirectionArrowShift` |
| `A/architectureTypes.ts:133-183` | direction pair / XY factor / alignment helpers (research Q5 at 141) |
| `A/architectureTypes.ts:185-191` | `ArchitectureStyleOptions`: `archEdgeColor`, `archEdgeArrowColor`, `archEdgeWidth`, `archGroupBorderColor`, `archGroupBorderWidth` |
| `A/architectureTypes.ts:193-250` | service/junction/group/hint/edge shapes |
| `A/architectureIcons.ts:8-43` | prefix `mermaid-architecture` (9); icons database 13, server 18, disk 23, internet 28, cloud 33, blank 39 |
| `A/architectureStyles.ts:4-36` | `.edge`, `.arrow`, `.node-bkg` (dash 8), `.node-icon-text` CSS |
| `A/architectureSeed.ts` | global `Math.random` swap (not ported) |
| `A/architectureDetector.ts`, `A/architectureDiagram.ts` | detector, diagram wiring |
| `A/architecture.spec.ts` | 30 cases (372 lines) |
| `A/architectureSeed.spec.ts` | 7 cases, fcose seeding (skip with reason) |
| `A/svgDraw.spec.ts:14` | 1 describe, ids (replace with `data-id`) |
| `packages/parser/tests/architecture.test.ts` | 13 cases (204 lines) |
| `PL/architecture.langium:1-57` | grammar; rules Group 35, Service 39 (`iconText=STRING`), Junction 43, Edge 47, Alignment 51; terminals ARROW_DIRECTION 55, ARROW_GROUP 56, ARROW_INTO 57 |
| `PL/arch.langium:1-2` | ARCH_ICON, ARCH_TITLE terminals |
| `PL/valueConverter.ts:11-27` | ARCH_ICON strip `()` (12); dead `ARCH_TEXT_ICON` branch (13-14, no such terminal); ARCH_TITLE strip/unquote/unescape (16-26) |
| `PL/tokenBuilder.ts:3-6` | `ArchitectureTokenBuilder`, keyword list `['architecture']` |
| `PL/module.ts:35,41,65` | `ArchitectureServices`, `ArchitectureModule`, factory `createArchitectureServices` (key `Architecture`) |
| `packages/mermaid/src/schemas/config.schema.yaml:1132-1205` | `ArchitectureDiagramConfig`: padding 1150, iconSize 1153, fontSize 1156, randomize 1159, nodeSeparation 1169, idealEdgeLengthMultiplier 1176, edgeElasticity 1183, numIter 1190, seed 1196 |
| `packages/mermaid/src/docs/syntax/architecture.md` (340 lines) | Groups 37, Services 59, Edges 81, Direction 89, Arrows 107, Edges out of groups 119, align 136, grid 185, Junctions 226, Configuration 254, Icons 321 |

## 2. The reference implementation reference

| Pointer | What |
| --- | --- |
| `parser.ts:49-84` | ID token and `ARCHITECTURE_TOKENS`; L/R/T/B-before-ID note 55-56 |
| `parser.ts:86-140,143,151` | AST interfaces, `labelValue`, `parseArchitecture` |
| `db.ts:56-136` | `fail` + `ArchitectureDb`: v12 wording at 73, 76, 78, 80, 107, 117, 124, 128, 130; new group-end message at 112 (`... is a group. Add {group} to a service inside it instead.`) |
| `db.ts:138-147` | `populate`, v12 order |
| `layout.ts:36` | `placeOnGrid` (D326); link lifting 65, like-side last 108, block slide 174 |
| `render.ts:14-19` | STUB/CORNER/LABEL_GAP/DOT constants; defaults iconSize 48, padding 20 (215-217, not v12's 80/40) |
| `render.ts:28,44` | `rank` (empty rows/cols), `fit` (label ellipsis) |
| `render.ts:89-153,155,174` | `Port`, router `route`, `simplify`, `pathData` |
| `render.ts:214-410` | pixel pass: sizes 232, edge-label gaps 281, group insets 304, ports 384-389 |
| `render.ts:415-497` | title clearance, like-side loops 426, label shift 474, group title 497 |
| `icons.ts:3-14` | five built-in glyphs on a 24 grid, `builtinIcon` |

## 3. v13 worked examples

| Topic | Pointer |
| --- | --- |
| (a) oracle loader | `packages/conformance/src/langium-lexer.ts:32-45` (`LANGIUM_LEXERS`, last row wardley), `:144` `loadLangiumLexerOracle`; `langium-lexer.spec.ts:14` (pie) |
| (a) lexer-parity specs | `packages/conformance/src/pie/lexer-parity.spec.ts:95-97`, `packet/lexer-parity.spec.ts:119-121`, `radar/lexer-parity.spec.ts:103-105`, `wardley/lexer-parity.spec.ts:121-123` |
| (a) oracle pins | `packages/conformance/package.json:59-60` (`mermaid-parser-v12` = parser 2.0.1, which exports `createArchitectureServices`) |
| (b) harvest | `packages/conformance/src/cli/harvest-v12.ts:39-106` (`HARVESTS`, wardley row 95-105), scripts `packages/conformance/package.json:15-22` |
| (b) harvested output | `packages/conformance/corpus/wardley-{cases,recovery,v12-specs}.json` |
| (c) adapter + suite | `packages/conformance/src/wardley/v13.ts:70` (`wardleyAdapter`), `wardley/v12.ts`, `registry.ts:35-187` (`PARITY_SUITES`, wardley 162-166), `divergences.json` |
| (c) DIFFERENCES | `packages/conformance/src/wardley/theme.spec.ts:153`, `treemap/theme.spec.ts:165`, `neo-theme.spec.ts:69`, `neo-dark-theme.spec.ts:84` |
| (c) port dir shape | `packages/conformance/src/wardley/` (corpus, grammar/, parity, parser, recovery, render, stress, symbols, theme specs) |
| (d) vocabulary | `packages/diagram-{wardley:13,treemap:19,xychart:21,venn:21}/src/theme/vocabulary.ts` (`THEME_VARIABLES`); sankey has none (`diagram-sankey/src/plugin.ts:23`) |
| (d) table | `diagram-*/src/theme/generated/variables.ts:19` (`THEME_VARIABLE_TABLE`, by `pnpm gen:theme`); `diagram-wardley/src/theme/table.ts:22`; rules `tools/gen-config/src/theme-packages.ts:2-7` |
| (e) graph plugin | `packages/diagram-mindmap/src/plugin.ts:26-27` (`layoutKind: 'graph'`, lazy `tree` default), `layout/prepare.ts:7,78` (`LayoutGraph`), `layout/layout.ts:19` (`ctx.layout`), `layout/invariants.ts:81`, `layout/layout.ddlt.spec.ts`; also `diagram-er/src/layout/layout.ts:16` |
| (e) core layout | `packages/core/src/layout/types.ts:39,54,88,116` (Node/Edge/Group/Graph); `packages/mermaid/src/registry.ts:202-204` (`LAZY_LAYOUTS`), `:909`; `packages/core/package.json:39-42` (`./layout/tree`); `packages/bench/src/core-chunks.spec.ts:134-135` |
| (f) icons | `packages/diagram-mindmap/src/icons.ts`, `plugin.ts:40`, `render/assets.ts:35-64`; `diagram-flowchart/src/render/assets.ts:87-118`; contract `packages/core/src/pipeline/types.ts:92-132,195-199` (`fallbackPrefix` 117) |
| (f) fallback pack test | `packages/plugin-icons/src/index.spec.ts:390` ("as M5's architecture will"), `name.spec.ts:52` (`mermaid-architecture`) |
| (g) ascii refusal | `packages/core/src/pipeline/errors.ts:95`; `packages/mermaid/src/venn.spec.ts:171-177`, `xychart.spec.ts:91`; `diagram-wardley/src/plugin.ts:15` |
| (h) language facet | `packages/diagram-wardley/src/language.ts`, `src/facet/{completions,hover,names,tables}.ts`; `packages/language-service/goldens/wardley/` (9 feature dirs) |
| (h) REQUIRED_FEATURES | `packages/language-service/src/testing/goldens.ts:143-153`, checked by `src/goldens.spec.ts:5` |
| (i) manifest | `packages/diagram-mindmap/package.json:47-58`; fields `tools/gen-config/src/registry.ts:67-85` (no `layout` field) |
| (i) gen scripts | root `package.json:27` gen:config, `:29` gen:theme, `:30` gen:registry, `:31` gen:grammar, `:35` check |
| (i) config statuses | `packages/core/schema/config.schema.yaml:5349-5357` (venn: `useWidth` ignored, `useMaxWidth` honoured, since 13.0.0) |
| (i) MIGRATION.md | generated block 255-422; venn 2336/2359, wardley 2194/2208/2233, xychart 2267/2314, sankey 2126/2169, treemap 2016/2037/2062 |
| parser shape | `packages/diagram-wardley/src/parser/` (lexer, tokens, parser, convert, messages, ids, symbols); grammar `packages/diagram-wardley/grammar/wardley.ebnf`; `tools/gen-grammar/src/generate.ts:190` |
| API spec | `packages/mermaid/src/venn.spec.ts:35` ("renders, where it was UNSUPPORTED_DIAGRAM before the port") |

### Shared files every port edits (venn PR, `git diff 521fb76ee^1 521fb76ee --stat`)

| File | Row |
| --- | --- |
| `packages/mermaid/src/generated/{detectors,registry}.gen.ts` | by gen:registry; `packages/mermaid/package.json:80` dep |
| `tools/gen-config/src/generate.ts:36-54` | `SECTION_OWNERS` |
| `knip.json:58` | package entry |
| `eslint.config.js:217` | `v12-specs/*.spec.ts` glob |
| `tools/release/src/licenses.ts:72-73,127,144` | upstream table (the reference implementation row exists), `publish.spec.ts:44`; `packages/mermaid/THIRD_PARTY_NOTICES` |
| `packages/language-service/goldens/*/completions/empty.out` | one header line per type (18 files) |
| `packages/dev/src/adapter.spec.ts:13` | `aria-roledescription` regex; `:112` handdrawn each |
| `packages/dev/src/fixtures.spec.ts:128`, `fixture-discovery.ts:26` | fixture types (architecture already at 26) |
| `packages/language-service/package.json:51,113,144`, `language-server/package.json:49` | facet deps |
| `packages/language-service/src/generated/{facets,config-schema}.gen.ts` | generated |
| `packages/language-service/src/{completion-hover,rename-round-trip}.spec.ts:68,85` | header list, rename case |
| `packages/language-service-{codemirror:33,monaco:56}/src/grammars.ts` | grammar loaders + generated files |
| `tools/gen-grammar/src/generate.ts:282`, `*-agreement.spec.ts` | gen:grammar row |
| `packages/core/src/theme/vocabulary.ts:186-223` | `usedBy` lists |
| `packages/core/src/svg/allowlist.ts:49` | only if new `data-*` attrs |
| `packages/conformance/src/{outline-identity:33,outline-roles:48}.spec.ts`, `plugin-hand-drawn/src/corpus.spec.ts:32` | outline/hand-drawn lists |
| `e2e/helpers/platform-harness.spec.ts:93`, `e2e/language/{monaco:260,codemirror:217}.spec.ts` | package and sample lists |
| `packages/bench/src/language-bundle.spec.ts:74`, `bench/package.json` | language budget |
| `v13/docs/{format-matrix.md:13,RELEASING.md:32,config-reference.md:508-518,theme-variables.md,syntax/}` | docs (architecture shows `not ported` / `pending`) |
| `.changeset/*.md` | release notes |

## 4. Corpus and existing references

| Pointer | Fact |
| --- | --- |
| `e2e/diagrams/architecture/pr-check/` | 10 `.mmd` (+ `.gitkeep`) |
| `e2e/diagrams/architecture/nightly-check/` | 8 `.mmd` |
| `e2e/diagrams/architecture/visual-check/` | 2 `.mmd` (+ `.gitkeep`); no `baseline/` yet |
| `e2e/platform/architecture-external.html`, `e2e/rendering/architecture/pr-check/architecture.spec.ts:4-6` | external pack page |
| `packages/mermaid/src/generated/detectors.gen.ts:8`, `registry.gen.ts:21` | `{ type: 'architecture', pattern: /^\s*architecture/ }`, no id/formats |
| `tools/gen-config/src/registry.ts:30` | `V12_DETECTORS` row |
| `packages/language-service/src/generated/facets.gen.ts:22` | facet row without a facet |
| `packages/core/schema/config.schema.yaml:1138-1139,2134-2216` | section; all nine own keys `status: pending` (2155...2215); `useWidth`/`useMaxWidth` inherited, no own row |
| `packages/plugin-hand-drawn/src/generated/config-fragment.ts:108` | `architecture.look` |
| `packages/conformance/src/detection.spec.ts:52` | header sample `architecture-beta` |
| `v13/docs/MIGRATION.md:359` | `architecture.look` ignored row |
| UNSUPPORTED_DIAGRAM for architecture | none found: no spec in `packages/` asserts it for `architecture-beta`; T5 adds a new `packages/mermaid/src/architecture.spec.ts` instead of flipping one |
