# 01 — v12 sankey pointer notes (spec #427)

**Refs.** `V=fa796a943:packages/mermaid/src/diagrams/sankey`, `R=fa796a943:packages/mermaid/src`. Read with `git show $V/<file>`. Every file under `$V` is byte-identical at the 12.2.0 commit `1fb786986` (the harvest reads `fa796a943`, `packages/conformance/src/jison/harvest.ts:16`); the syntax page differs by 4 lines (fence order), and so does the schema's line numbering (`SankeyDiagramConfig` L2674 at 12.2.0, L2691 at `fa796a943`, same content).
Oracle dist: `node_modules/mermaid-v12/dist/chunks/mermaid.core/sankeyDiagram-SY24JHO5.mjs`. **No `node_modules` in this worktree or the main checkout**; a full 12.2.0 install sits at `/Users/knsv/repos/mermaid-v13/.tmp/perf-verify/node_modules/.pnpm/` (read-only use). Results marked (probed) came from `loadOracle()` there plus a `setInput` capture, as `jison/oracle.ts` does.

## 1. Grammar — `$V/parser/sankey.jison` (67 lines)

- L13 `case-insensitive`. L15–16 exclusive states `escaped_text`, `csv`. L19–25 macros; `TEXTDATA` L25 = `[\x20-\x21\x23-\x2B\x2D-\x7E]`.
- Rules, first match wins: L29 `sankey-beta` / L30 `sankey` (INITIAL, push `csv`, `SANKEY`; jison adds `\b`), L31 `<<EOF>>`, L32 `CRLF|LF` NEWLINE, L33 COMMA, L34 DQUOTE (push `escaped_text`), L35 `{TEXTDATA}*` NON_ESCAPED_TEXT (**can match empty**), L36 `"(?!")` DQUOTE (pop), L37 `(TEXTDATA|,|CR|LF|"")*` ESCAPED_TEXT.
- Grammar: L45 `start: SANKEY NEWLINE csv opt_eof`; L47–49 `csv`, `csv_tail`, `opt_eof`; L51–58 `record` action (trim, `replaceAll('""','"')`, `parseFloat(value.trim())`, `yy.addLink`); L60–67 `field`/`escaped`/`non_escaped`.
- `sanitizeText` is **not** in the record action (spec says `sankey.jison:44-49`): it runs in `findOrCreateNode` (`$V/sankeyDB.ts:49`).

## 2. Preprocessing path (what the lexer sees)

- `$R/preprocess.ts:6–17` `cleanupText` (CRLF and lone CR → `\n`; `<tag a="x">` → single quotes), L19–31 front matter, L33–45 directives, L58–65 `preprocessDiagram` → `cleanupComments` (`$R/diagram-api/comments.ts:6–8`: drops `^\s*%%(?!{)` lines, then `trimStart`).
- `$R/Diagram.ts:45–48` sets `parser.parser.yy = db`, L49 `db.clear()`, L52–54 `setDiagramTitle(metadata.title)`, L77 `encodeEntities(source) + '\n'`, L83 `parser.parse(textToParse)`.
- `$V/sankeyDiagram.ts:9–10` wraps `parser.parse` with `prepareTextForParsing` (`$V/sankeyUtils.ts:1–8`: strip blanks at the very start/end of the whole text (no `m` flag), collapse `[\n\r]+` to `\n`, `trim()`). So the appended `\n` is trimmed away again.
- **Oracle capture needs no change.** In the dist (L535–536, L796–797) `parser.parser = parser` and the wrapper is installed on that same object, so `probe.parser.parser.lexer.setInput` (wrapped at `packages/conformance/src/jison/oracle.ts:97–102`) is called by the original parse with the *prepared* text. (probed) `---\ntitle: T\n---\nsankey\n\n  a , b , 1  \n%% c\n\n\nb,c,2` → lexedText `sankey\n  a , b , 1  \nb,c,2`. The lexed text has no trailing `\n`, so `keepAppendedNewline` clipping never applies.
- (probed) The oracle's `getDiagramFromText` passes no metadata, so `getDiagramTitle()` is `''` there; only render (`$R/mermaidAPI.ts:578–579`) passes the front-matter title.

## 3. Oracle facts (probed against 12.2.0)

- **Non-ASCII and tabs are not lexer errors.** `Zürich,b,1` and `a\tb,c,1`: L35 matches the empty string forever, giving `NON_ESCAPED_TEXT ""` until `MAX_STALLED` (1000, `oracle.ts:69`) stops the stream; no `LEXICAL_ERROR`. Parse fails with `Expecting 'NEWLINE', 'EOF', 'COMMA', got 'NON_ESCAPED_TEXT'`. The spec's "is a lexer error" is wrong for v12; the gate must normalise this stall (e.g. treat ≥2 empty `NON_ESCAPED_TEXT` as a lexical error).
- `sankey   \na,b,1` **rejects** (blanks after the header: `SANKEY`, `NON_ESCAPED_TEXT "   "`). `   sankey\n…` is accepted (stripped). `sankey a,b,1`, `sankey` alone, `sankey-betax` (`SANKEY` + `-betax`) reject; `sankeyx` lexes as one `NON_ESCAPED_TEXT`.
- `SANKEY\na,b,1`: not detected (lexedText undefined).
- `,b,1` rejects (`got 'COMMA'`); `a,b,` rejects (`got 'EOF'`); `a,b,1,` rejects. `"a" ,b,1` and `"a"x,b,1` reject. Unterminated `"abc,b,1` → `ESCAPED_TEXT "abc,b,1"` then an empty `ESCAPED_TEXT`, reject.
- Accepted: `"a,1","b ""q""",3` (ids `a,1`, `b "q"`); `"a\nb",c,1`; trailing `"c\n",d,2\n`; CRLF (already `\n`); `  %% x` indented comment lines (removed); `1;` → 1; `1 %% c` → 1; `abc` → NaN (JSON `null`); `c,c,-3` (self-link parses).
- `&lt;x` and `<b>y</b>` stay as written (DOMPurify patched to identity; `encodeEntities` leaves them).
- A whitespace-only line between rows rejects (`got 'NEWLINE'` after `NON_ESCAPED_TEXT "   "`).

## 4. DB — `$V/sankeyDB.ts` (87 lines)

- L14–18 `links`, `nodes`, `nodesMap`; L20–25 `clear` (+ `commonClear`). L27–33 `SankeyLink(source, target, value = 0)`; L40–42 `addLink` (repeats kept). L48–58 `findOrCreateNode`: `sanitizeText(ID, getConfig())` then first-appearance order.
- L63–70 `getGraph()` → `{nodes: [{id}], links: [{source, target, value}]}`: the parity snapshot. L72–87 exports (acc/title setters exist but no grammar rule calls them).
- `$V/sankeyDetector.ts:6` `/^\s*sankey(-beta)?/`; registered `$R/diagram-api/diagram-orchestration.ts:22,108`.

## 5. Renderer — `$V/sankeyRenderer.ts` (286 lines)

- L27–35 align map (`left`, `right`, `center`, `justify`). L44–57 `findCentralNodeLayer`: first node with the strictly largest `value`, else layer 0.
- L90–102 config reads; **L91 `height` falls back to `defaultSankeyConfig.width`** (dead once defaults merge). L102 `nodeColors ?? {}`.
- L113 `getGraph()`; L121–129 `d3Sankey().nodeId(d=>d.id).nodeWidth(nodeWidth).nodePadding(nodePadding + (showValues ? 15 : 0)).nodeAlign(...).extent([[0,0],[width,height]])`; L134 `sankey(graph)` mutates nodes and links in place (array order unchanged: SVG order = model order).
- L140 `scaleOrdinal(schemeTableau10)`; L149–151 `nodeColors[id] ?? colorScheme(id)`. First call order is the rect loop (L154–172), so a slot is the node's index among uncoloured nodes, mod 10.
- L154–172 `g.nodes` > `g.node` (`id` from `Uid.next('node-')` L161, `transform translate(x0,y0)`, plus stray `x`/`y` attrs L165–166) > `rect` height/width/fill.
- L174–179 `getText`: `id` or `` `${id}\n${prefix}${Math.round(value*100)/100}${suffix}` `` (D395: drawn on one line).
- L189–203 `getLabelPosition`: outlined by layer < central → `x0 - 6`/`end`, else `x1 + 6`/`start`; legacy by `x0 < width/2`.
- L206 `g.node-labels` `font-size 14`; L208–218 `appendLabel` (`y` = node centre, `dy` `0` or `0.35em`); L220–225 outlined = `.sankey-label-bg` then `.sankey-label-fg`, legacy = one unclassed `text`.
- L228–237 `g.links` (`fill none`, `stroke-opacity 0.5`) > `g.link` with inline `style="mix-blend-mode: multiply"`.
- L239–258 gradient: `linearGradient` *inside each `g.link`* (not in `<defs>`), id `Uid.next('linearGradient-')`, `userSpaceOnUse`, `x1 = source.x1`, `x2 = target.x0` (no `y1`/`y2`), stops `0%`/`100%`.
- L260–273 stroke: `url(#…)` via `d.uid` (Uid's `toString`), source/target colour, or the literal `linkColor` string (unchecked). L275–279 `path d = sankeyLinkHorizontal()`, `stroke-width max(1, width)`. L281 `setupGraphViewbox(undefined, svg, 0, useMaxWidth)`.

## 6. Styles — `$V/styles.js` (36 lines)

- L2–8 `.label`, `.node-labels` `font-family`. L11–16 `.sankey-label-bg` stroke `mainBkg || background || '#fff'`, 4px, round join, `paint-order: stroke`. L19–21 `.sankey-label-fg` fill `textColor`.
- **L24–26 `.node rect { shape-rendering: crispEdges }`**: not in the spec; v13 has no `shape-rendering` attribute or style property (02 §4).
- L29–33 `.link` fill none, opacity 0.5, `mix-blend-mode: multiply` (duplicates the inline style).

## 7. Config — `fa796a943:packages/mermaid/src/schemas/config.schema.yaml`

- Top-level `sankey:` L433–434. Enums: `SankeyLinkColor` L2648–2660, `SankeyLabelStyle` L2661–2671, `SankeyNodeAlignment` L2673–2689.
- `SankeyDiagramConfig` L2691–2753: `width` 600 (L2698), `height` 400, `linkColor` `gradient` (anyOf enum | string, L2704–2711), `nodeAlignment` `justify`, `useMaxWidth` **false** (own key, L2715), `showValues` true, `prefix`/`suffix` `''`, `nodeWidth` 10, `nodePadding` 12, `labelStyle` `legacy`, `nodeColors` (map of string, no default). Inherits `BaseDiagramConfig` (`useWidth`).

## 8. d3-sankey 0.12.3 (`D=…/.pnpm/d3-sankey@0.12.3/node_modules/d3-sankey/src`)

Deps resolve to d3-array 2.12.1 and d3-shape 1.3.7 (`pnpm-lock.yaml:7402–7405`).
- `sankey.js` (369 lines): sort helpers L5–15 (`ascendingSourceBreadth`, `ascendingTargetBreadth` tie-break on `index`, `ascendingBreadth` by `y0`); `find` L33–37 (`missing: <id>`); `computeLinkBreadths` L39–52.
- Defaults L55–64: `dx 24`, `dy 8`, `align justify`, `sort`/`linkSort` undefined, `iterations 6`. Pipeline L66–75.
- `computeNodeLinks` L126–147; `computeNodeValues` L149–155 (`max(sum(out), sum(in))`); `computeNodeDepths` L157–173 and `computeNodeHeights` L175–191, **each throws `circular link` at L169 / L187** (`++x > n`).
- `computeNodeLayers` L193–209 (`kx = (x1-x0-dx)/(x-1)`, layer clamp L198; `x ≥ 2` whenever one acyclic link exists, so `kx` is finite); `initializeNodeBreadths` L211–231 (`ky` = min over columns, L212); `computeNodeBreadths` L233–243 (`py = min(dy, (y1-y0)/(maxColumn-1))` L235; `alpha = 0.99^i`, `beta = max(1-alpha, (i+1)/iterations)`).
- Relaxation: `relaxLeftToRight` L246–266, `relaxRightToLeft` L269–289 (weights `value * (target.layer - source.layer)`, skip when `!(w > 0)`, column re-sorted by `ascendingBreadth` when `sort === undefined`).
- `resolveCollisions` L291–298 (middle node `length >> 1`), `…TopToBottom` L301–308, `…BottomToTop` L311–318 (threshold `1e-6`). `reorderNodeLinks` L320–329, `reorderLinks` L331–338, `targetTop` L341–352, `sourceTop` L355–366.
- **d3-array semantics the port must copy**: `sum` skips NaN and 0 (`if (value = +value)`, `d3-array@2.12.1/src/sum.js:5`); `min`/`max` skip null/NaN (`min.js:5–6`). Relies on stable `Array.prototype.sort`.
- `align.js` (23 lines): `left` L7, `right` L11 (`n - 1 - height`), `justify` L15, `center` L19–23 (`min(sourceLinks, target.depth) - 1`).
- `sankeyLinkHorizontal.js` (15 lines): source `[source.x1, y0]` L4, target `[target.x0, y1]` L8; d3-shape 1.3.7 `link/index.js:52–54` `curveHorizontal`: `M x0,y0 C mx,y0 mx,y1 x1,y1` with `mx = (x0+x1)/2`; d3-path 1.0.9 prints numbers unrounded.

## 9. d3 `schemeTableau10` (d3-scale-chromatic 3.1.0, `src/categorical/Tableau10.js`)

`#4e79a7 #f28e2c #e15759 #76b7b2 #59a14f #edc949 #af7aa1 #ff9da7 #9c755f #bab0ab`.

## 10. v12 spec and harvest — `$V/parser/sankey.spec.ts` (91 lines)

- **6 `it`s, 6 parse calls** (not "about 20"): L16 and L24 `energy.csv` via `fs.readFileSync(path.resolve(__dirname, …))` with `cleanupComments('sankey(-beta)\n\n ' + data)`; L32, L41 `__proto__`; L78–89 the #7528 loop (19 nodes, 16 links asserted).
- **Every call goes through `prepareTextForParsing`, so the `run` harvest records nothing**: `runSpec` (`harvest.ts:213`) stubs imports as inert proxies, the argument is a proxy, and `harvest.ts:77` keeps strings only. (run) `runSpec(sankey.spec.ts, ['sankey'])` → 6 calls, 0 strings. `literals` would get only the two `__proto__` templates. T1 needs a harvest extension (real `prepareTextForParsing`/`cleanupComments`, `fs` reading `$V/parser/energy.csv` from git) or a hand-built corpus file.
- `$V/parser/energy.csv` (99 lines): 15 `%%` lines, 70 rows; leading/trailing blanks (L1–2), quoted fields L12 `"sankey"`, L27, L30 `"""Biomass imports"""`, L34–35 quoted commas, L95–96 `"""Wave"""`.
- Syntax page `fa796a943:packages/mermaid/src/docs/syntax/sankey.md` (253 lines): 8 `mermaid-example` blocks at L15 (energy, `showValues: false`), L106 (`%%` comment row), L119 (blank lines), L133 (commas), L144 (`""`), L196 (outlined), L217 (`nodeWidth 15`, `nodePadding 20`), L236 (`nodeColors`).
- Not in the spec: `fa796a943:packages/examples/src/examples/sankey.ts` (114 lines), `fa796a943:demos/sankey.html` (3 diagrams with config at L22, L66, L89).

## 11. Corpus — `e2e/diagrams/sankey/` (identical to `fa796a943`)

18 `.mmd`: `pr-check` 3, `nightly-check` 15, `visual-check` only `.gitkeep`. Rows are indented two spaces and follow a blank line after `sankey` (prepare collapses it).
- pr-check: `should-render-a-simple-example` (the only `sankey-beta`, no config); `should-render-complete-financial-flow-with-custom-colors` (**width 800, height 500, outlined, showValues, prefix `$`, suffix `B`**, 13 `nodeColors`); `should-render-labels-with-apple-style-outlined-text` (800×500, outlined).
- nightly-check: `align-nodes-left`, `align-nodes-right`, `center-nodes`, `justify-nodes` (a→…→e plus x→c→y, **width 410**, `useMaxWidth: false`, a blank line between groups); `custom-node-colors` (a, b), `fallback-colors-for-unspecified-nodes` (a only); `custom-node-width` (20) and `default-node-width` (`useMaxWidth: false`); `legacy-label-style-by-default` (`sankey: {}`), `legacy-plain-labels`, `outlined-labels`; `links-are-gradient`, `links-same-color-as-source-node`, `links-same-color-as-target-node`, `links-use-hex-color` (`#636465`).
- **The spec's "none uses `prefix`/`suffix` or `width`/`height`" is wrong** (financial flow and the align files). The rest holds: no quotes in bodies, no `showValues: false`, no `nodePadding`, no theme, cycle, NaN or rejected text; the docs fill quotes, `""`, `showValues: false` and `nodePadding`.
- Mind the e2e count pins in a new `lexer-parity.spec.ts` (kanban `packages/conformance/src/kanban/lexer-parity.spec.ts:99–101`).
