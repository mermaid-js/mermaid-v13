# 01 — v12 treeView pointer notes (spec #518)

**Refs.** Read with `git show fa796a943:<path>`. `M=packages/mermaid/src/diagrams/treeView`, `G=packages/parser/src/language/treeView`, `R=packages/mermaid/src`. `$M` and `$G`, `treeView.test.ts` and `examples/tree-view.ts` are byte-identical to `mermaid@12.2.0` (tree hashes checked in `/Users/knsv/repos/mermaid`). The syntax page differs only by the harvest commit's front matter and beta warning. The schema block is the same text 17 lines lower. Mostly code-read; "probed" marks what was run against 2.0.1 or the 12.2.0 oracle.
Files: `$M/{boxDrawingPreprocessor,db,detector,diagram,icons,parser,renderer,styles,types}.ts` (840 lines), specs `$M/{boxDrawingPreprocessor,db,icons,parser}.spec.ts`; `$G/{treeView.langium,tokenBuilder,valueConverter,module,index}.ts` (190 lines). Registered at `$R/diagram-api/diagram-orchestration.ts:26,113`, `packages/parser/src/parse.ts:55–58,120`, `langium-config.json:20`.

## 1. Grammar: `$G/treeView.langium` (64 lines)

- L26–30 `entry TreeView`: `"treeView-beta" TitleAndAccessibilities? nodes+=TreeNode*`. L32–34 the fragment is `(accDescr|accTitle|title)+`, so metadata is allowed only before the first node. That rule is in the grammar; `db.ts` has none. `tokenBuilder.ts:5` `super(['treeView-beta'])` is the only keyword.
- Terminals in file order: L15 `ACC_DESCR`, L16 `ACC_TITLE`, L17 `TITLE` (`/[\t ]*title(?:…|[\t ][^\n\r]*|)/`: the empty alternative is the `title.txt` trap); L40 `CLASS_ANNOTATION` `/[ \t]+:::[ \t]*[A-Za-z_][\w-]*/`; L42 `ICON_ANNOTATION` `/[ \t]+icon\([\w-]*(?::[\w-]+)?\)/`; L43 `DESC_ANNOTATION` `/[ \t]+##[^\n\r]*/`; L46 `INDENTATION` `/[ \t]{1,}/`; L49 `QUOTED_NAME` `/"[^"]*"|'[^']*'/`; L51 hidden `WS` (never reached); L52 hidden `ML_COMMENT` `/\%\%[^\n]*/` (hidden group); L53 hidden `NL` `/\r?\n/` (whitespace, so it is skipped); L57 `BARE_NAME` (negative lookahead per char, quadratic). The L36–39 comment says the order is deliberate: annotations must come before `INDENTATION`.
- L59–64 `TreeNode: indent=INDENTATION? (name=QUOTED_NAME|name=BARE_NAME) (class=…|icon=…|desc=…)*`. Each annotation uses `=`, so the last of each kind wins (probed: `a :::x :::y` gives `y`).
- Built tokens in 2.0.1: `node_modules/.pnpm/@mermaid-js+parser@2.0.1/…/dist/chunks/mermaid-parser.core/chunk-NGNAAXSQ.mjs:26131–26139`; grammar JSON at L28676.

## 2. Value converter: `$G/valueConverter.ts` (38 lines)

- L10 `INDENTATION` returns `input.length` (a tab counts 1). L13 `QUOTED_NAME` strips the first and last char. L17 `BARE_NAME` strips trailing `[\t ]+` only. L21 `CLASS_ANNOTATION` trims, drops `:::`, trims again. L26 `ICON_ANNOTATION` takes `substring(5, len-1)` of the trimmed text (`icon()` gives `''`). L31 `DESC_ANNOTATION` trims, drops `##`, trims again. Title and accessibility values go through the common converter.
- `module.ts:65` `createTreeViewServices()` returns `{ shared, TreeView }`, so the descriptor key is `TreeView`.

## 3. Box pass: `$M/boxDrawingPreprocessor.ts` (209 lines)

- Regexes L9–14: `ALL_BOX_CHARS /[─━│┃└┗├┣]/`, `BRANCH_CHAR /[└┗├┣]/`, `DASH_CHAR /[─━]/`, `DECORATION_ONLY /^[\s│┃]+$/`, `METADATA_LINE /^\s*(title[\t ]|accTitle[\t ]*:|accDescr[\t ]*[:{])/`, `COMMENT_LINE /^\s*%%/`. L16 `INDENT_UNIT` is 4 spaces.
- L72–78: the keyword line is the first line whose `trim() === 'treeView-beta'`; if there is none, the input is returned as-is (L80–83). L86–98 collect the content lines after it (skipping blank, comment, metadata and decoration lines, tabs made 4 spaces). L101 if none holds a box char, return unchanged with an empty map.
- L37–45 `inferSegmentWidth`: the index of the first `BRANCH_CHAR` match with `index > 0` in any content line, else 4.
- L113–117: lines up to and including the keyword pass through and are mapped. L120–206 per line: blank (L126), comment (L134) and metadata (L142) pass; decoration-only lines are dropped (L150); tabs become 4 spaces (L155). With a branch char (L158–184): `depth = round(col/width)+1` (L163); skip the branch char, then dashes, then **spaces only** (L166–172); `trimEnd`. Empty content throws (L175–179) `Line ${orig}: Empty node — expected a filename or directory name after the box-drawing prefix`. Otherwise emit `INDENT_UNIT.repeat(depth)+content`.
- Then: a line that is all box chars and blanks is dropped (L185). A line with a box char but no branch is emitted as the raw line, i.e. a root item (L188–193). A line with leading blanks and no box char throws (L194–199) `Line ${orig}: Unexpected indentation without box-drawing characters. In box-drawing format, use ├── or └── prefixes for indented nodes.` Anything else passes as root (L200–205).
- L50–56 `remapErrorLines`: `/\bline\s+(\d+)\b/gi` becomes `line ${orig}` when mapped. It rewrites only line numbers, never columns or offsets.

## 4. Parser and DB

- `$M/parser.ts` (57 lines): L45 `preprocessBoxDrawing(input)` runs **outside** the `try`, so the box-pass errors are thrown as written (they already name the original line). L47 `parse('treeView', text)`; L50–54 remap the message only when `lineMap.size > 0`. Langium's message format: `Lexer error on line N, column C: …` / `Parse error on line N, column C: …` (`dist/mermaid-parser.core.mjs:276–290`). `populate` L11–41: L12 `populateCommonDb`; L14 `level = indent ?? 0`; L20–23 a trailing `/` marks a directory and is sliced off; L27 `cssClass = x || undefined`; L33 `icon()` gives `'none'`; L37 the description goes through `sanitizeText` (identity in the oracle, `oracle.ts:42–74`).
- `$M/db.ts` (91 lines): L22–33 state `cnt: 1` plus a virtual root `{id 0, level -1, name '/', nodeType 'directory'}`. L44 `getCount` counts the root. L48–50 `getConfig = cleanAndMerge(DEFAULT_CONFIG.treeView, getConfig().treeView)`. L52–75 `addNode`: L60 pops while `level <= top.level`, then pushes the node as a child of the new top. Title and accessibility come from `commonDb`.
- `$M/types.ts` (50 lines): `Node` L14–25 (`id, level, name, nodeType, icon?, cssClass?, description?, BBox?, children`); `TreeViewDiagramStyles` L40–48 (the seven keys). `$M/detector.ts:7` `/^\s*treeView-beta/`. `$M/diagram.ts` has no `init`.

## 5. Renderer: `$M/renderer.ts` (242 lines)

- L10–15: `registerIconPacks` for `mermaid-treeview`, run **at module load**. L17–19: `ICON_SIZE 14`, `ICON_GAP 4`, `DESC_GAP 16`. L28–50: icons resolved up front (`getIconSVG`, 14×14) into a map keyed by node id.
- `positionLabel` L52–110: label classes L61–67 are `treeView-node-label`, then ` treeView-node-dir`, then ` ${cssClass}` raw. Icon L73–79: `g.treeView-node-icon` at `translate(x+paddingX, y+paddingY)`, filled by `.html(svg)` (a nested `<svg>`). Label L82–91: `.text(name)`, `dominant-baseline: middle`, measured with `getBBox`; `height = labelH + 2·paddingY`, `labelX = x + paddingX + (icon ? 18 : 0)`, `y = rowTop + height/2`. L93–95: `width = labelW + 2·paddingX + (icon ? 18 : 0)`. L98–107: a `highlight` class inserts a first-child `rect.treeView-highlight-bg` at **`x` = the row's x (indent), not the label's x**, with `y+1`, height `h−2`, `rx 3`, and width 0 for now.
- `drawTree` L130–216. L146 `indent = depth·(rowIndent+paddingX)`. L150–157: a horizontal line per node, from `indent−rowIndent` to `indent` at the row centre (the root's runs from `−rowIndent` to 0). L159: `totalWidth = max(indent+width)`. L163–180: post-order, a vertical line per parent at `x+paddingX`, from the parent row's **bottom** (`y+height`) to the last child's centre `+ lineThickness/2`. L184–200: the description column is `max(labelRightEdge over all rows, root included) + 16`, as `text.treeView-node-description`; it widens `totalWidth` to `descX+descW+paddingX`. L202–213: each highlight rect gets width `totalWidth − x + 8`, then `totalWidth = max(totalWidth, x+rectW+2)`.
- `draw` L218–236: `svg > g.tree-view`. L234 `viewBox = "-${lt/2} 0 ${totalWidth} ${totalHeight}"`, with no padding. L235 `configureSvgSize(svg, totalHeight, totalWidth, useMaxWidth)`. No title, no accessibility nodes are drawn.

## 6. Icons: `$M/icons.ts` (100 lines)

- L15–27 the `mermaid-treeview` pack, 24×24: `folder` and `file`, each one `currentColor` path (`file` uses `fill-rule="evenodd"`).
- `detectIcon` L43–55: L44 `filenameIcons?.[name]` (a prototype read); L48–49 an extension only when `lastIndexOf('.') > 0` (dotfiles get none); L52 `extensionIcons[ext] ?? extensionIcons[ext.slice(1)]`, lower-cased.
- `qualifyIcon` L58–66: `pack:name` is kept as-is; L62 `icon in treeViewIcons.icons || !defaultIconPack` gives `mermaid-treeview:icon`, else `defaultIconPack:icon`.
- `getNodeIcon` L77–100: `none` gives undefined; an explicit icon is qualified; `!showIcons` gives undefined; a file tries `detectIcon` (`none` hides, a hit is qualified); otherwise the built-in `folder` or `file`.

## 7. Styles and config

- `$M/styles.ts` (58 lines) L5–13: `labelFontSize 16px, labelColor black, lineColor black, iconColor #546e7a, descriptionColor #6a9955, highlightBg rgba(255, 193, 7, 0.15), highlightStroke #ffc107`. They come from `themeVariables.treeView` through `cleanAndMerge`, and no theme sets them. CSS L29–55: label (size, fill, `white-space: pre`), `.treeView-node-dir` bold, line stroke, icon `color`, description (label size, italic, pre), highlight fill and stroke with `stroke-width: 1`.
- Schema: `$R/schemas/config.schema.yaml:2834–2900` at `fa796a943` (`2817–2883` at the tag). `rowIndent` 10, `paddingX` 5, `paddingY` 5, `lineThickness` 1 (all `minimum: 0`), `showIcons false`, `defaultIconPack ''`, `filenameIcons {}`, `extensionIcons {}` (`additionalProperties: string`). `useMaxWidth` comes only from `BaseDiagramConfig`. `$R/defaultConfig.ts:288–291` spreads the JSON and adds a stray `useWidth: undefined`.
- `$R/utils/sanitizeDirective.ts:9–30,66–73`: for `filenameIcons` and `extensionIcons`, values must match `/^[\w-]+(?::[\w-]+)?$/`, and keys starting `__` or containing `proto` or `constr` are deleted. Spec: `sanitizeDirective.spec.ts:12–46` (3 treeView `it`s).

## 8. Tests, docs, examples (case counts)

- `$M/boxDrawingPreprocessor.spec.ts` (514 lines): **42** `it`s in 16 describes, with 29 `[…].join('\n')` inputs. `$M/parser.spec.ts` (380 lines): **33** (29 integration + 4 box/indent equivalence at L270+), 31 `parseAndGetNode(` calls (helper L14–19 prepends `treeView-beta\n`), 9 `parser.parse(`. `$M/db.spec.ts` **18**, `$M/icons.spec.ts` **23**.
- `packages/parser/tests/treeView.test.ts` (248 lines): **28** (basic 9, structured terminals 15, title/acc 4). `packages/parser/tests/treeViewValueConverter.test.ts` (112 lines): **19**. `$R/rendering-util/multi-diagram-id-uniqueness.spec.ts:120` has one snippet.
- Syntax page `$R/docs/syntax/treeView.md` (285 lines; `docs/syntax/treeView.md` is the generated copy): **13** `mermaid-example` fences (L47, 58, 70 box; 91, 103, 115, 131, 157, 175, 191 annotations and icons; 218, 230, 243 examples). 3 plain fences (L23, L34, L206 comments) are **not harvested** (`FENCE` only takes `mermaid`). Tables L262 (config) and L275 (theme).
- `packages/examples/src/examples/tree-view.ts`: **5** `code:` entries (default L9; two with front matter). None uses box drawing. `demos/treeView.html`: 9 diagrams.
- Cypress (deleted before 12.2.0): `git -C /Users/knsv/repos/mermaid show 0233eba0af^:cypress/integration/rendering/treeView/treeView.spec.ts` (226 lines, **15** `it`s, one-to-one with the 15 `.mmd`; indents 12/16/20…, custom-config 6/10/14).

## 9. v13 corpus `e2e/diagrams/tree-view/` (15 `.mmd`; byte-equal to `mermaid@12.2.0`'s e2e)

The flattening was done upstream in v12's own commit `7a38a04a6` ("migrate inline snapshot tests to mmd fixtures"). It mapped Cypress indents 12 and 16 both to 2. **F** = flattened against Cypress.
- nightly `should-hide-default-icons-with-icon-none-and-icon`: `icon(none)`, `icon()`, `showIcons`. OK.
- nightly `…a-simple-treeview…-quoted-labels`: one quoted root. OK.
- nightly `should-render-combined-annotations`: `:::highlight icon(fa:bell) ## …`. **F**: `src/`, `.env`, `Dockerfile`, `package.json` lost their parent `my-project/`.
- nightly `should-render-icon-overrides`: `icon(fa:bell)`, `icon(folder)`. **F**: all five rows are at depth 1 (`model.bin`/`weights.h5` should sit under `data/`, `index.js` under `src/`).
- nightly `…unprefixed-icon-overrides-via-default-icon-pack`: `defaultIconPack: fa`, `icon(bell)`. OK.
- pr `…filename-and-extension-config-maps`: `filenameIcons`, `extensionIcons` (with `none`), `material-icon-theme`. OK.
- pr `…consecutive-spaces-and-unicode-in-labels`: `But  _  _ton💓.tsx`. OK.
- pr `…a-complex-treeview…-quoted-labels`: deep nesting. **F**: `folder1`, `folder2`, `file7.ts` are siblings of `root` instead of its children.
- pr `…bare-unquoted-labels-with-icons`: bare names, dotfile, `showIcons`. **F**: `src/`, `.gitignore`, `package.json`, `README.md` lost `my-project/`.
- pr `…class-annotations-for-highlighting`: `:::highlight` ×2. **F**: `components/`, `App.tsx`, `index.js` lost `src/`.
- pr `should-render-descriptions`: `##` on files and a directory. **F**: completely flat (`index.js`, `config.ts`, `utils/` should be under `src/`).
- pr `…emoji-as-icons…`: emoji names. OK.
- pr `…unknown-icon-fallback-for-unregistered-icons`: `icon(unregistered:icon)`. OK.
- pr `…custom-config-and-quoted-labels`: `rowIndent 80`, `lineThickness 3`, nested `themeVariables.treeView`. **F**: like multiple roots. Its closing `---` has trailing blanks (in Cypress too).
- pr `…multiple-roots-and-quoted-labels`: **F**: `file1.js`/`file2.ts` promoted out of `folder1`, `file3.spec.ts`/`folder3` out of `folder2`. Its `description:` front matter describes the flattened tree, so it needs rewriting too.
- 8 F, 7 OK. Fixture icon packs: `packages/dev/src/icon-packs.ts:18` (`fa`), L92 (`material-icon-theme`); `packages/dev/src/fixture-discovery.ts:56` maps `tree-view` to `treeView`.

## 10. v13 pointers

- `packages/conformance/src/langium-lexer.ts:32–45` `LANGIUM_LEXERS` (pie L34, packet L37, treemap L38 `{probe:'treemap\n"a": 1', factory:'createTreemapServices', key:'Treemap'}`). Add the `treeView` row there. `load` L153–187 wraps the v12 **diagram's** `parser.parse` (L166–172), i.e. `$M/parser.ts:44`, so it captures the text **before** the box rewrite. `lexWith` L189–208.
- `@mermaid-js/parser` is not under `packages/conformance/node_modules/@mermaid-js/` (only v13 packages are). The alias `mermaid-parser-v12` points to `node_modules/.pnpm/@mermaid-js+parser@2.0.1/…`, which **exports `createTreeViewServices`** (probed). `realpath` of `mermaid-v12/../@mermaid-js/parser` and of the alias is the same directory, and its `exports['.'].import` is `dist/mermaid-parser.core.mjs` both ways, so it is one module instance.
- How the oracle reaches it: `oracle.ts:95` `getDiagramFromText`, then the 12.2.0 chunk `mermaid@12.2.0/…/dist/chunks/mermaid.core/diagram-ODIL2UCW.mjs` (L39 `import { parse } from "@mermaid-js/parser"`, L70 the box pass, which is module-local and not exported, L249–262 `parser.parse`). That calls `mermaid-parser.core.mjs:259–273` `parse`, which uses a private `parsers.treeView` built lazily at L198–202 from its own `createTreeViewServices()`. Interception point for T1: the instance is unreachable, so patch the shared prototype (the `LangiumParser` `parse`, or the `Lexer`'s `tokenize`) from the oracle's own services. Note the prototype is shared by every Langium type, so arm it only during a treeView `input()`.
- `packages/conformance/src/cli/harvest-v12.ts:39–105` `HARVESTS` (radar L67, treemap L77); header regex L152–154; scripts at `packages/conformance/package.json:15–22`. `PARITY_SUITES` is at `packages/conformance/src/registry.ts:35`.
- Already present: `packages/core/schema/config.schema.yaml:1171–1173` (`treeView`, `status: pending`), `:5041` the defs; `core/src/config/generated/keys.ts:34`; `mermaid/src/generated/registry.gen.ts:146`, `detectors.gen.ts:31`; `language-service/src/generated/facets.gen.ts:157`; `conformance/src/detection.spec.ts:75`.
- Pele: **`/Users/knsv/repos/pele` does not exist on this machine**, so the files are unlisted. The four places the spec says Pele is better: linear bare-name lexing (one lookahead per blank run); own-property icon lookups; box-mode column remapping (Q6); an early exit when the text has no box glyph. `v13/docs/research/pele.md:71,339` mention treeView only in passing.

## Traps

1. **Highlight width ratchets**: each highlight adds 10 to `totalWidth` (renderer L207–210), so every later highlighted row is 10 px wider than the one before. The rect starts at the row's indent, not at the label's x (the spec says label x).
2. **Box mode makes a node of a `│   %% c` line** (probed: it becomes a node named `│   %% c` with the next row nested under it). `COMMENT_LINE` needs `%%` first and the line has a box char, so it falls into the L188 root-item branch.
3. **Indented `%%` comment lines fail at the Langium level** (`INDENTATION INDENTATION`, probed). They render only because v12's preprocessing strips comment lines before `parser.parse` (probed on the oracle). `lexText` on raw text will disagree with `lex(source)`.
4. **`title…`, `accTitle…` or `accDescr…` names after the first node are a parse error** (probed `  a\n  title.txt`), not just the first-node quirk the spec lists.
5. `icon(constructor)`/`icon(toString)` hits L62 `in` and becomes `mermaid-treeview:constructor`, ignoring `defaultIconPack`. D486 covers only the map lookups (L44, L52).
6. A branch glyph mid-line (`foo ├ bar`) is taken as the prefix: `foo` is dropped and the depth comes from its column (L158–173). After the dashes only spaces are skipped.
7. The viewBox x shift of `−lt/2` is not added to its width, so the right edge clips `lt/2`. The root's horizontal line lies wholly at negative x.
8. Descriptions are `sanitizeText`'d in v12 but identity in the oracle, so parity compares the raw text. `sanitizeDirective` drops icon-map keys containing `constr` or `proto` in directives (whether front matter goes through it is unprobed).
9. `plugin-hand-drawn/schema/config.fragment.yaml:42` maps `treeView.look`, yet v12 never sketched treeView (D301).
10. The spec's schema range `2817–2880` is the tag's numbering. At `fa796a943`, which harvest and these notes use, it is `2834–2900`.
