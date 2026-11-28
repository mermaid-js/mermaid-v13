# 01 — v12 reference after ticket #2 deletes v12 sources

Base commit: **`fa796a943`** (branch `mermaid-v13`, "chore(v13): configure agent skills"). All paths below exist at that commit.
`packages/mermaid/package.json` there says `"version": "12.2.0"`. The npm `mermaid@12.2.0` dist has the **same diagram set** as this tree (agentflow, cynefin, usecase, railroad, swimlanes, wardley…), so this tree and the npm oracle match closely. This is an inference from directory listings, not a byte diff.

## How to read v12 files once deleted

```bash
R=/Users/knsv/repos/mermaid-v13
git -C $R show fa796a943:packages/mermaid/src/diagrams/flowchart/parser/flow.jison
git -C $R ls-tree -r --name-only fa796a943 -- packages/mermaid/src/diagrams/flowchart
git -C $R grep -n 'No such shape' fa796a943 -- packages/mermaid/src
# materialise a subtree for reading (outside the repo):
git -C $R archive fa796a943 packages/mermaid/src/diagrams/flowchart | tar -x -C /some/tmp/dir
```
`M=packages/mermaid/src` below.

## Flowchart (parser + db)

| What | Path @ fa796a943 | Pointers |
|---|---|---|
| Grammar | `$M/diagrams/flowchart/parser/flow.jison` (646 lines) | lexer start conditions `%x` :9-28 (string, md_string, acc_title, acc_descr, acc_descr_multiline, dir, vertex, text, ellipseText, trapText, edgeText, thickEdgeText, dottedEdgeText, click, href, callbackname, callbackargs, shapeData, shapeDataStr, shapeDataEndBracket); lexer rules :30-292 (`UNICODE_TEXT` big char class ends :272); grammar from :300 (`statement` :367, `shapeData` :396, `vertexStatement` :403, `node` :429, `vertex` :443, `edgeText` :495, `linkStatement` :506, `classDefStatement` :544, `clickStatement` :552, `styleStatement` :569, `linkStyleStatement` :573, `idStringToken`/`textToken`/… :608-616, `idString` :618, `direction` :633) |
| Parser wrapper (**text rewrite**) | `$M/diagrams/flowchart/parser/flowParser.ts` (13 lines) | `src.replace(/}\s*\n/g, '}\n')` before parse. v13 #5 says no text rewrites, so the v13 lexer has to reproduce this behaviour itself. The reference implementation does the same (`pele/src/diagrams/flowchart/parser.ts:81-87`). |
| DB | `$M/diagrams/flowchart/flowDb.ts` (1422 lines), `class FlowDB` :54 | `addVertex` :144 (shape-data YAML `yaml.load(..., JSON_SCHEMA)` :168; shape validation :262-268), `addSingleLink` :309, `addLink` :379, `updateLinkInterpolate` :403, `updateLink` :417, `addClass` :441, `setDirection` :471, `setClass` :497, `setTooltip` :514, `setClickFun` :524, `setLink` :579 (uses `utils.formatUrl`), `setClickEvent` :601, `bindFunctions` :608, `getVertices/getEdges/getClasses` :620-636, `clear` :676, `addSubGraph` :701, `firstGraph` :887, `destructStartLink` :895, `destructEndLink` :938, `destructLink` :988, `getData` :1170 (LayoutData), acc/title setters :1416-1421 |
| DB text sanitising | `FlowDB.sanitizeText` :103 calls `common.sanitizeText` → **DOMPurify** (`$M/diagrams/common/common.ts:85-97`, `sanitizeMore` :70-83) | This is why v12 model text holds DOMPurify-serialised strings (`<` becomes `&lt;`). See 06-oracle-node.md |
| Types | `$M/diagrams/flowchart/types.ts` (106), `$M/types.ts` (`NodeMetaData` :1, `EdgeMetaData` :36, `ParseOptions` :97, `ParseResult` :105, `RenderResult` :136) | |
| Diagram def | `$M/diagrams/flowchart/flowDiagram.ts`, renderer `flowRenderer-v3-unified.ts`, styles `styles.ts` (298) | |
| Detectors | `$M/diagrams/flowchart/flowDetector-v2.ts` (`/^\s*(graph\|flowchart)/`, id `flowchart-v2`), `$M/diagrams/flowchart/elk/detector.ts` (`/^\s*flowchart-elk/`, sets `config.layout='elk'`, id `flowchart-elk`) | `mermaid.parse` reports `diagramType: 'flowchart-v2'` for both `graph` and `flowchart` (verified on npm 12.2.0) |

### Shape list and shape-name validation / messages
- Registry: `$M/rendering-util/rendering-elements/shapes.ts` (628 lines). `shapesDefs` array :116 (54 entries with `semanticName`, `shortName`, `aliases`, `internalAliases`, `handler`); `generateShapeMap` :545 (`undocumentedShapes` incl. `bpmn-*` ~:590-603 + every alias of every def); `shapes` :622; `isValidShape(shape) = shape in shapes` :624; `type ShapeID` :628.
- 113 shape implementation files in `$M/rendering-util/rendering-elements/shapes/`.
- Messages (exact strings, from `flowDb.ts:262-268`):
  - uppercase or `_` in name: `` `No such shape: ${doc.shape}. Shape names should be lowercase.` ``
  - unknown: `` `No such shape: ${doc.shape}.` ``
  - Renderer fallback (not parse-time): `` `No such shape: ${node.shape}. Please check your syntax.` `` at `$M/rendering-util/rendering-elements/nodes.ts:34`.
- Legacy bracket syntax → shape type mapping: `FlowDB.getTypeFromVertex` :1046 and the jison `vertex` rule :443ff.
- The reference implementation already has a flat copy of the full name list: `/Users/knsv/repos/pele/src/diagrams/flowchart/shapes.ts:2-108` (`isValidShape` :102, `canonicalShape` :106).

### Flowchart specs (oracle seed strings)
`$M/diagrams/flowchart/parser/`: `flow.spec.js`, `flow-arrows`, `flow-comments`, `flow-direction`, `flow-edges`, `flow-huge`, `flow-interactions`, `flow-lines`, `flow-md-string`, `flow-node-data`, `flow-singlenode`, `flow-style`, `flow-text`, `flow-vertice-chaining`, `subgraph.spec.js`; plus `$M/diagrams/flowchart/flowDb.spec.ts`, `flowDb-dropped-subgraph-members.spec.ts`, `flowDb-elk-duplicate-subgraph.spec.ts`, `flowDiagram.spec.ts`, `flowChartShapes.spec.js`, `flowRenderer-*.spec.ts`. About 5.2k lines and about 296 `.parse(` calls. Spec harness pattern: `flow.parser.yy = new FlowDB(); flow.parser.parse(text)`.
Docs examples: `$M/docs/syntax/flowchart.md` (116 ```` ```mermaid ```` blocks). The reference implementation has them extracted as JSON: `/Users/knsv/repos/pele/tests/corpus/flowchart-docs.json` (114 strings, from 12.1.0).

## Preprocess: front matter, directives, comments, entities

| What | Path | Notes |
|---|---|---|
| Pipeline | `$M/preprocess.ts` (91) `preprocessDiagram` :58 (returns `{code:{raw,cleaned,withComments,frontmatterLineOffset}, title, config}` :81-90) | order: `cleanupText` (CRLF→LF **and** rewrites `="x"` → `='x'` inside HTML tags :6-16) → `processFrontmatter` (:18-30, legacy `displayMode`→`gantt.displayMode`) → `processDirectives` (:32-45, `init`/`initialize` + `wrap`) → `cleanAndMerge` → `cleanupComments`; computes `frontmatterLineOffset` |
| Front matter | `$M/diagram-api/frontmatter.ts` (69): js-yaml `JSON_SCHEMA` :43-46, dedent by captured indent :33-35 | regex `frontMatterRegex` `$M/diagram-api/regexes.ts:10`, linear scanner `matchFrontMatter` :135 |
| Directives | `$M/utils.ts`: `detectInit` :98, `detectDirective` :159, `removeDirectives` :200; `directiveRegex` `regexes.ts:12` | |
| Comments | `$M/diagram-api/comments.ts`: `text.replace(/^\s*%%(?!{)[^\n]+\n?/gm, '').trimStart()`; `anyCommentRegex` / linear `stripAnyComments` `regexes.ts:19,49` | |
| Entities | `$M/Diagram.ts:77` `encodeEntities(source) + '\n'` before parse; `$M/mermaidAPI.ts:366` `decodeEntities` on the final SVG | model text holds placeholders such as `ﬂ°quot¶ß`, `ﬂ°°9829¶ß` (verified). Oracle normaliser must decode them. |
| Stray `---` diagram | `$M/diagram-api/diagram-orchestration.ts:51` registers `error`, `:54-82` registers an `---` pseudo-diagram whose parse throws "Diagrams beginning with --- are not valid…" | |

## Detector order (`$M/diagram-api/diagram-orchestration.ts`)
- `---` error pseudo-diagram first.
- If `injected.includeLargeFeatures`: `flowchartElk, mindmap, architecture` (:86).
- Then (:90-125, "first match wins"): `agentflow, c4, kanban, classDiagramV2, er, gantt, info, pie, requirement, sequence, swimlanes, flowchartV2, timeline, git, stateV2, journey, quadrantChart, sankey, packet, xychart, block, eventmodeling, treeView, radar, ishikawa, treemap, railroad, railroadEbnf, railroadAbnf, railroadPeg, venn, wardley, cynefin, usecase`.
- The reference implementation mirrors the order in `/Users/knsv/repos/pele/src/detect.ts:37-75` (33 types). That table is useful for `UNSUPPORTED_DIAGRAM` detection (R-COMPAT-7).

## Config schema and themes
- `$M/schemas/config.schema.yaml` (3345 lines). Top-level `theme` :64 (default `'default'`), `themeVariables` :67, `look` :71 (`classic`), `layout` :79 (**default `'elk'`**), `maxTextSize` :87 (50000), `maxEdges` :91, `htmlLabels` :271, `fontFamily` :278, `securityLevel` :315, `dompurifyConfig` :455, `BaseDiagramConfig` :476, **`FlowchartDiagramConfig` :2501-2647**, `FontConfig` :3328. Generated `$M/config.type.ts`; `$M/defaultConfig.ts` (358), `$M/config.ts` (358).
- Themes `$M/themes/`: `index.js` (registry of 11 themes), `theme-base.js` (498), `theme-default.js` (515), `theme-dark.js` (473), `theme-forest.js` (480), `theme-neutral.js` (480), `theme-redux.js` (418), plus out-of-scope `theme-redux-dark*.js`, `theme-redux-color*.js`, `theme-neo*.js`, `theme-helpers.js`, `erDiagram-oldHardcodedValues.ts`. Specs: `theme-base-overrides.spec.ts`, `theme-nested-overrides.spec.ts`, `theme-redux-color-superset.spec.ts`, `theme-dark.spec.js`. The M1 six are redux, default, dark, forest, neutral and base (D55/D64).
- Flowchart CSS mapping from theme variables: `$M/diagrams/flowchart/styles.ts`.

## URL sanitising (`@braintree/sanitize-url` ^7.1.2, `packages/mermaid/package.json:74`)
- `$M/utils.ts:1` import; `formatUrl(linkStr, config)` :247-260: trims, then `sanitizeUrl(url)` unless `securityLevel === 'loose'`. Used by `FlowDB.setLink` :579.
- Other users: `$M/diagrams/common/svgDrawCommon.ts`, `diagrams/sequence/svgDraw.js`, `diagrams/gantt/ganttDb.js`.
- The reference implementation's dependency-free reimplementation: `/Users/knsv/repos/pele/src/util/url.ts` (`sanitizeUrl` :44, `safeUrl` :75, `linkUrl` :101, `imageUrl` :105).

## XSS / security e2e
- Pages: `e2e/platform/xss.html`, `xss2…xss25.html` (`xss23-css.html`), `ghsa1-3.html`, `css-injection.html`, `click_security_{loose,strict,sandbox,other}.html`, `exploit.js`. Almost all use a flowchart.
- Specs: `e2e/other/pr-check/xss.spec.js` (22 tests), `e2e/other/pr-check/ghsa.spec.js` (6), `interaction.spec.js`. `mermaidUrl(..., api=true)` routes to `/xss.html?graph=` (`e2e/helpers/util.ts:48-71`).
- The reference implementation's allow-list oracle `/Users/knsv/repos/pele/tests/support/inert.ts` (132 lines) and `tests/render/security.test.ts` serve as the template for the `assertInert` test in #12.

## Public API types (`$M/mermaid.ts`, 476 lines)
- Re-exported types :25-43: `AsyncIconLoader, DetailedError, ExternalDiagramDefinition, IconLoader, InternalHelpers, LayoutData, LayoutLoaderDefinition, MermaidConfig, ParseErrorFunction, ParseOptions, ParseResult, RenderOptions, RenderResult, SVG, SVGGroup, SyncIconLoader, UnknownDiagramError`.
- `RunOptions` :45-62 (`querySelector`, `nodes`, `postRenderCallback`, `suppressErrors`).
- `interface Mermaid` :433-455; default object :458-476: `startOnLoad, mermaidAPI, parse, render, init, run, registerExternalDiagrams, registerLayoutLoaders, initialize, parseError, contentLoaded, setParseErrorHandler, detectType, registerIconPacks, getRegisteredDiagramsMetadata`.
- `mermaidAPI` (`$M/mermaidAPI.ts`, 795) object keys (npm 12.2.0): `render, parse, getDiagramFromText, initialize, getConfig, setConfig, getSiteConfig, updateSiteConfig, reset, globalReset, …`. `getDiagramFromText` :744 (needs `addDiagrams()` to have run, e.g. via a prior `parse`).
- Error shape of a jison syntax error (npm 12.2.0): message `Parse error on line 3:\n…\n---^\nExpecting 'SQE', …`, `e.hash.loc = {first_line, last_line, first_column, last_column}`. Lines count after front matter is removed.
