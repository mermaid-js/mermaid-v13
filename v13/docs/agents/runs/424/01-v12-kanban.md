# 01 — v12 kanban pointer notes (spec #424)

**Refs.** The `mermaid@12.2.0` tag exists only in the OSS checkout `/Users/knsv/repos/mermaid`; in this repo use its commit `1fb786986` (an ancestor of `fa796a943`, which the harvest uses: `packages/conformance/src/jison/harvest.ts:16`). Every kanban file below is byte-identical between the two. Only `docs/syntax/kanban.md` differs (the `mermaid`/`mermaid-example` fence order), and `clusters.js` gains `pool` after L803.
`V=1fb786986:packages/mermaid/src/diagrams/kanban`, `SH=1fb786986:packages/mermaid/src/rendering-util/rendering-elements`, `R=1fb786986:packages/mermaid/src`. Read with `git show $V/<file>`.
Oracle dist: `packages/conformance/node_modules/mermaid-v12/dist/chunks/mermaid.core/kanban-definition-FNSA4HC5.mjs`. Results marked (probed) came from `loadOracle()` (`packages/conformance/src/oracle.ts`, DOMPurify patched to identity) followed by `db.getData()`.

## 1. Grammar — `$V/parser/kanban.jison` (166 lines)

- L8 `case-insensitive`. L13–20 exclusive states: `NODE NSTR NSTR2 ICON CLASS shapeData shapeDataStr`, plus **`shapeDataEndBracket` (L20), which is declared and never entered**.
- Rule order (INITIAL unless noted). First match wins.
  - L24 `\@\{` pushState `shapeData`, `yytext=""` → `SHAPE_DATA` (empty image). It is the first rule, so it beats the comment and id rules.
  - L27 `<shapeData>["]` push `shapeDataStr` → `SHAPE_DATA` `"`. L32 `<shapeDataStr>["]` pop → `SHAPE_DATA` `"`.
  - L35 `<shapeDataStr>[^\"]+` → `SHAPE_DATA`, with `\n\s*` → `<br/>` (L37–38). L40 `<shapeData>[^}^"]+` → `SHAPE_DATA` (`^` excluded). L44 `<shapeData>"}"` pops and returns no token.
  - L48 `\s*\%\%.*` → `SPACELINE`. L50 `"kanban"` → `KANBAN` (jison adds `\b`; see §6). L51–53 `:::` / `<CLASS>.+` / `<CLASS>\n`. L55 `::icon(`, L58–59 `<ICON>[^\)]+` / `)`.
  - L56 `[\s]+[\n]` → `SPACELINE`. L57 `[\n]+` → `NL`. L60–67 the eight `NODE_DSTART`s, in mindmap's order. L68 `[\s]+` → `SPACELIST`.
  - L70 `[^\(\[\n\)\{\}@]+` → `NODE_ID`. L71 `<<EOF>>`. L72–77 `NSTR2`/`NSTR`. L78–85 the eight `NODE_DEND`s. L86 `<NODE>[^\)\]\(\}]+`, L87 `<NODE>.+(?!\(\()`.
- Grammar L97–162. `start` L97, `spaceLines` L103, `mindMap: KANBAN document | KANBAN NL document` (L109–112; the non-terminal keeps mindmap's name), `stop` L114, `document` L121.
  - `statement` L126–137: L127 `SPACELIST node shapeData` → `addNode($1.length, id, descr, type, $3)`; L132 `node shapeData` → level 0. The other statements are mindmap's.
  - L141–155 `node`, `nodeWithoutId` (id = descr), `nodeWithId`. L152 bare `NODE_ID` → `type: 0`, where mindmap wrote `yy.nodeType.DEFAULT`.
  - L157–162 `shapeData: shapeData SHAPE_DATA {$1+$2} | SHAPE_DATA`, so adjacent blocks concatenate.

### Diff against `mindmap.jison` (`diff <(git show $R/diagrams/mindmap/parser/mindmap.jison) <(git show $V/parser/kanban.jison)`)

Kanban adds only: the three `%x` lines; the six shape-data rules (L24–47); `@` in the `NODE_ID` class (L70); `KANBAN` for `MINDMAP`; the two `… shapeData` statement alternatives (L127, L132); the `shapeData` rule (L157–162); and `type: 0`. Everything else is identical line for line, so mindmap's lexer, its parity gate and its quirks carry over unchanged outside `@{`.

## 2. DB — `$V/kanbanDb.ts` (255 lines)

- L10–13 module state; L15–20 `clear`. L25–48 `getSection`: it scans **all** nodes on each call and throws at L39 if any has `level < nodes[0].level`, which is why the next item throws, not the shallow one.
- L54–97 `getData`. Columns L61–72 (`labelType 'markdown'`, `isGroup`, `ticket`, `shape 'kanbanSection'`, `look: conf.look`). Cards L73–93 by `parentId === section.id` (the D373 bug), `rx/ry 5`, `cssStyles ['text-align: left']`. **Cards get no `look`** (L76–91), see §3. `edges` is always empty.
- L99–165 `addNode`.
  - L101–107 `padding` from `mindmap.padding`, ×2 for types 1, 2 and 6. L113 `width` from `mindmap.maxNodeWidth`. Neither is read downstream for kanban: the renderer overwrites `width`, and kanbanItem reads `padding || 10`.
  - L110 `id: sanitizeText(id) || 'kbn' + cnt++`: an id that sanitises to `''` becomes `kbn<n>` (not in the spec; unprobed, since the oracle sanitises to identity).
  - L122–129 YAML wrap (`{\n…\n}` or `…\n`), `yaml.load` with `JSON_SCHEMA`; core's `parseYaml` is the same schema (`packages/core/src/preprocess/yaml.ts:2`).
  - L131–133 shape check. (probed) A non-string `shape` (`shape: 5`) throws `doc.shape.toLowerCase is not a function`, a TypeError the spec does not list; Pele `String()`s it (`db.ts:51`).
  - L136–138 `shape === 'kanbanItem'` is kept on the node, but nothing reads it.
  - L139–141 `label` is kept **raw**, and getData's `sanitizeText` turns it into a string (probed: `label: 5` → `"5"`). A falsy `label` (`''`, `0`) is ignored (probed).
  - L142–150 `toString()` for `icon`, `assigned`, `ticket` (probed: `ticket: 2038` → `"2038"`, `assigned: [x, y]` → `"x,y"`). L152–154 `priority` raw (probed: `[1,2]` stays an array).
  - (probed) Duplicate YAML keys reject (`duplicated mapping key`), as js-yaml does.
- L157–164 parent: `section.id || 'kbn'+cnt++` (the fallback is dead, since ids are never empty here).
- L167–196 `nodeType`/`getType` (unused for drawing). L202–214 `decorateNode`: no guard (`nodes[length-1]` undefined → TypeError), `icon`/`class` sanitised, and a second `:::` **overwrites**. L216–235 `type2Str` is dead. L238 `getLogger`.
- `$V/kanbanTypes.ts:3` `KanbanDB = typeof kanbanDb`. `$V/kanban-definition.ts:8–13` `{db, renderer, parser, styles}`; the db is a module object, not a class (hence no `yy` builder in the descriptor).
- `$V/detector.ts:9` `/^\s*kanban/`. Registered at `$R/diagram-api/diagram-orchestration.ts:93`.

## 3. Renderer, item shape, section cluster

- `$V/kanbanRenderer.ts` (102 lines): L19 the dead `conf.htmlLabels = false`. L25–27 `domId = ${id}-${node.id}`. L32–35 `g.sections`, `g.items`. L42 `padding = 10`.
  - L46–63 column loop: `WIDTH = sectionWidth || 200` (L47), `x = W·k + (k−1)·5` (L51), `height = 3W`, `y = 0`, `rx/ry 5`.
  - L59 `cssClasses = section.cssClasses + ' section-' + k`, which writes the literal `undefined` class when there are none.
  - L61 `maxLabelHeight = max(25, labelBBox.height)`.
  - L65–89 cards: `top = −1.5W + maxLabelHeight` (L69), `item.width = W − 15` (L79), `y` advances `bbox.h + 5` (L84), column height L87.
  - L92–97 `setupGraphViewbox(…, mindmap.padding ?? kanban.padding, mindmap.useMaxWidth ?? kanban.useMaxWidth)`. `mindmap.padding` has a default, so `kanban.padding` is never reached.
- `$SH/shapes/kanbanItem.ts` (163 lines):
  - L9–22 `colorFromPriority` (exact strings; `Medium` → `null`, anything else → `undefined`, and d3 then removes the attribute).
  - L34 title wrap `width − 10` (= W − 25). L40 `labelHelper` (`$SH/shapes/util.ts:50`).
  - L46–53 link: `ticketBaseUrl.replace('#TICKET#', ticket)`, `svg:a.kanban-ticket-link`, `xlink:href`, `target _blank`, inserted `:first-child`.
  - L55–81 ticket and assignee through `insertLabel` (`util.ts:155`). **Both wrap at the same `W − 25`** (`options.width`, L58), which the spec does not say.
  - L83–105 geometry. L112–123 hand-drawn branch; L124–153 rect `basic label-container __APA__` plus the priority `line` (L137–152).
- **Hand-drawn reality:** `kanbanItem.ts:112` tests `kanbanNode.look === 'handDrawn'`, but `getData` never sets `look` on cards (`kanbanDb.ts:76–91`), and `insertNode` does not default it (`$SH/nodes.ts:14–55`). So in v12 **cards are never sketched and the priority bar is always drawn**. Only columns sketch (`clusters.js:359`, `node.look` from `kanbanDb.ts:70`). D379's "v12 dropped the bar as a bug" describes dead code (code-read, not rendered).
- `$SH/clusters.js:308–418` `kanbanSection`:
  - L319–321 `class 'cluster ' + cssClasses`, `id domId`, `data-look`. L326–333 `createText(…, {width: node.width})`.
  - L346–351 width (`node.padding` is undefined, so the comparison is always false and `width = node.width`).
  - L359–377 rough path, fill `clusterBkg`, stroke `clusterBorder`. CSS `.section-k path` overrides both.
  - L380–389 the rect. L391–396 label at the column top + `subGraphTitleTopMargin` (`getSubGraphTitleMargins`, flowchart's key, 0 by default).
- `createText` `$R/rendering-util/createText.ts:306–325` defaults (`markdown = true` L314, `width = 200` L319). `<br>` normalising L366–368, icons L344 (`replaceIconSubstring`).
- `labelHelper` `util.ts:61` (`useHtmlLabels` from global config, so L19's flag is ignored), L89 markdown from `labelType`, L98 wrap width. `insertLabel` `util.ts:177` sanitises and decodes entities.

## 4. Styles — `$V/styles.ts` (111 lines) and the global sheet

- L6–74 `genSections`. L9–16 `lineColor<i>` (dead). L18–19 `adjuster = darkMode ? darken : lighten`.
  - L21–30 `.section-${i−1} rect|path|circle|polygon` with fill and stroke `adjuster(cScale<i>, 10)`, over `i < THEME_COLOR_LIMIT`, so selectors run from `section--1` to `section-10`.
  - L31–33 `.section-k text` (`cScaleLabel`; matches only SVG text). L34–54 mindmap leftovers.
  - L56–64 `.node rect…` `background`/`nodeBorder`/1px and L66–70 `.kanban-ticket-link`. Both sit **inside the loop**, so they are emitted 12 times.
- L77–110 `getStyles`: `.edge`, `.section-root` (`git0`), `.icon-container`, L98–101 `.cluster-label, .label {color, fill: textColor}`, L102–108 `.kanban-label` (dead), `getIconStyles()`.
- The spec's "`styles.ts:120-122`" (neo gradient/shadow) is the **global** `$R/styles.ts:120–123` `[data-look="neo"].node rect, [data-look="neo"].cluster rect…`. Cards carry no `data-look` (§3), so under `look: neo` only the column rects take the gradient stroke and shadow.
- Schema `$R/schemas/config.schema.yaml:1257–1272` `KanbanDiagramConfig` (`padding 8`, `sectionWidth 200`, `ticketBaseUrl ''`), top-level `kanban:` L427. There is no `look` default for kanban.

## 5. v12 spec, docs and other sources

- `$V/kanban.spec.ts` (494 lines) has **30 `it`s**. KNBN-1, 2, `3`, 4, `5`, 6, 7, 8, 9, 13–25, 30–37. The textual `kanban.parse(` count is 32, but two are in comments (L67, L94).
- `beforeEach` L9–13 and L409–413 set `yy = kanbanDB` and `clear()`. KNBN-6 L98–106 is the only throw test.
- (run) The harvest with the spec's descriptor gives **32 items = 29 spec strings + 3 docs**: KNBN-33 repeats KNBN-32 (`icon: star`) and is deduped, so there is no `#26`. (Ran: `harvest('kanban')` from `harvest.ts:37` with the descriptor patched into `JISON_TYPES` at runtime.)
- Docs: the harvest reads `fa796a943:packages/mermaid/src/docs/syntax/kanban.md` (3 `mermaid-example` blocks). Example 3 = `knsv2-46` minus its YAML comment.
- **Not in the spec:**
  - `1fb786986:packages/examples/src/examples/kanban.ts` (42 lines) has two nested boards. One uses `ticketBaseUrl`, numeric tickets `2038`, and id-less `[text]` cards.
  - `$V/samples.md` (105 lines) holds design sketches (`style n2 …`, `showIds`, `fields`, `descr:`), unchecked. `style n2 stroke:#AA00FF,fill:#E1BEE7` lexes as one `NODE_ID`, i.e. a column. Do not harvest it as-is.

## 6. Oracle facts the spec does not list (probed)

- **An item whose text starts with the word `kanban` is rejected**, in any case: `kanban\n  Kanban board` → `got 'KANBAN'`. Rule L50 precedes L70 and is case-insensitive with `\b`. `kanbanCard`, `mykanban` and `todo[Kanban]` are fine. Mindmap's lexer already does this (`lexer.ts:319–322`: `literal('mindmap')` + `!isWord`).
- `kanbanx\n  a` → `Expecting 'SPACELINE', 'KANBAN', got 'NODE_ID'` (matches the spec's "detected, then rejected").
- `::icon()` lexes with no `ICON` token and is accepted with no icon. `b{{c}` rejects; `b{{c}}` is a column labelled `c`. Tabs: `\ta\n\t\tb` → column `a`, card `b`.
- `a; b` is one id `a; b` (the spec says `;` is id text; confirmed).
- `label: "x⏎      y"` → `x<br/>y`, via `shapeDataStr` (L37), so a v13 label can break there.

## 7. Corpus

- **This tree** `e2e/diagrams/kanban/`: 11 `.mmd`, 10 in `pr-check`, 1 in `nightly-check` (`7-should-handle-prioritization`), and `visual-check` has only `.gitkeep`. File names keep the original's duplicate numbers (`6-…` ×2, `7-…` across both folders) and its missing 9. The spec's counts are right.
- Originals `git show 7a38a04a6^:e2e/rendering/kanban/kanban.spec.ts` (167 lines). Each template ends `\n      ` (a blank line of 6 spaces), so keep or trim it deliberately, then oracle-check. L5 1 single section (dup `docs` in one column); L17 2 multiple sections (`id2` bare); L30 3 single wrapping node; L41 4 wrapping at end; L55 5 wrapping at top; L69 6 wrapping in middle; L84 6 assignments; L97 7 prioritization (all four values, plus `m` with none); L112 7 external tickets (no `ticketBaseUrl`); L125 8 assignments + priority + ticket; L138 10 full example, with front matter `ticketBaseUrl: 'https://abc123.atlassian.net/browse/#TICKET#'`.
  - The nested `10-full-example` has **6 columns** (`id1 id7 id9 id10 id11 id12`), not 15. The 15-column / black-column case (D374) exists only in the flat file, so that flat variant must be one of the two kept.
- 12.2.0 `1fb786986:e2e/platform/dev-diagrams/knsv/` (also at `fa796a943`; absent from this tree, which has no `e2e/platform/dev-diagrams`):
  - `knsv2-31-kanban-tickets.mmd` (16 lines): `github.com/your-repo/issues/#TICKET#`, emoji labels, `ticket: 103` numeric.
  - `knsv2-45-…` (3 lines) = original #8.
  - `knsv2-46-…` (24 lines) = docs example 3: `# sectionWidth: 300` YAML comment, `[Create Documentation]` id-less card, a blank line, `id3` in two columns.
- Digest: `packages/conformance/src/__snapshots__/yaml-tree.spec.ts.snap:20` `"kanban": "26 fd35370b28efcc4b"`. Spec `packages/conformance/src/yaml-tree.spec.ts:128–154`; `shapeData` scan L97. The count is front matter plus `@{}` reads per folder, and file ids feed the hash, so renames change it as well. Update with `-u` in T1.

## 8. Mindmap v13 lexer to copy (`B=origin/feature/294_mindmap`; not merged; PR #406)

- `git show $B:packages/diagram-mindmap/src/parser/lexer.ts` (475 lines).
  - Header L1–20 lists the jison facts. `S` states L50–57, `S_NAMES` L60, `lex()` L73, class L81, `run` L156, `emit` L213, `begin`/`pop` L236/243, `literal` L273 (`\b` + case), `step` L288.
  - State methods: `initial` L310, `node` L368, `nstr` L393, `nstr2` L403, `icon` L416, `classState` L426. `isIdStop` L435 (**add `@`**), `opener` L442, `closer` L460.
- Kanban adds the `shapeData`/`shapeDataStr` states to `S`/`S_NAMES` and an `@{` check before the comment check in `initial`. Core's parser-kit already exports every import (`packages/core/src/parser-kit/index.ts`, `char-codes.ts`).
- `$B:…/parser/tokens.ts` (75 lines): `T` L10–54, `JISON_NAMES` L62–75. Kanban renames `Mindmap`→`Kanban`/`KANBAN` and adds `ShapeDataStart` (empty image, see the spec), `ShapeData`, `ShapeDataQuote?` and `ShapeDataEnd` (no jison name).
- What a kanban T1/T2 copies, and where it goes:

| From `$B:` | To |
| --- | --- |
| `packages/diagram-mindmap/src/parser/{lexer,tokens,index,detect}.ts`, `lexer.spec.ts` | `packages/diagram-kanban/src/parser/` |
| `packages/conformance/src/mindmap/lexer-parity.spec.ts` (106 lines; normalisation L12–33, `VARIANT` L36, counts L86–87, skip rule L95–104) | `packages/conformance/src/kanban/lexer-parity.spec.ts` |
| `…/conformance/src/mindmap/corpus.ts` (`LINE_SEPARATORS` L18, `EDGE_CASES` L35, `MID_LINE_DIRECTIVES` L101, `mindmapGateCorpus` L131, `mindmapParityCorpus` L154) | `…/conformance/src/kanban/corpus.ts` |
| `…/conformance/src/mindmap/{v12,v13}.ts` (snapshot + `DiagramAdapter`), `probe.spec.ts`, `messages.spec.ts`, `grammar/*` | `…/conformance/src/kanban/` (T2) |
| `packages/conformance/corpus/mindmap-cases.json` | `…/corpus/kanban-cases.json` |
| `$B:packages/diagram-mindmap/{scripts/port-v12-specs.ts, src/v12-specs/adapter.ts}` | `packages/diagram-kanban/…` (T2) |

- Descriptor: the mindmap one is already on base at `packages/conformance/src/jison/types.ts:125–137`; add `kanban` after it. Smoke: `packages/conformance/src/jison/smoke.spec.ts:11` `M4` list.
- PARITY_SUITES adapter: `git diff origin/mermaid-v13 $B -- packages/conformance/src/registry.ts` shows the mindmap entry (`corpus: mindmapParityCorpus`). Kanban copies it with `kanban-v12-specs.json` and `kanban-cases.json`.

## 9. Pele (`/Users/knsv/repos/pele` does not exist on this machine)

Read it with `gh api 'repos/obsidianmd/pele/contents/src/diagrams/<path>?ref=3a2f075' -H 'Accept: application/vnd.github.raw'`. The spec's line cites check out.
- `kanban/db.ts` (89 lines): YAML L39–47, non-mapping ignored L49–50, `String(doc.shape)` L51, decoration guard L82–88. `kanban/parser.ts` (9 lines) delegates to `common/outline.ts`.
- `common/outline.ts` (339 lines): `tokenName` L42 (KANBAN/MINDMAP), `getType` L64, `tokenize(src, kanban)` L115, `@{` at L151–152, data states L226–239, `parseOutline` L262.
- `kanban/render.ts` (292 lines): ticket URL with a function replacer and `safeUrl` at L248.
