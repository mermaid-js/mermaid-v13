# 01 — v12 requirement pointer notes (spec #520)

**Refs.** `V=fa796a943:packages/mermaid/src/diagrams/requirement`, `R=fa796a943:packages/mermaid/src`. Read with `git show $V/<file>`. Every file under `$V` and `$R/rendering-util/rendering-elements/shapes/requirementBox.ts` is byte-identical at the 12.2.0 commit `1fb786986` (the harvest reads `fa796a943`, `packages/conformance/src/jison/harvest.ts:16`). `markers.js` differs by 86 added lines elsewhere (L993+), not in the requirement markers; the syntax page differs by 4 lines (a front-matter `description`), so its line numbers shift by 4.
Oracle dist: `packages/conformance/node_modules/mermaid-v12/dist/chunks/mermaid.core/requirementDiagram-EQYSW5RA.mjs` (12.2.0, installed in this worktree).
Sizes: `parser/requirementDiagram.jison` 267, `requirementDb.ts` 351, `requirementRenderer.ts` 39, `styles.js` 124, `types.ts` 51, `requirementDetector.ts` 24, `requirementDiagram.ts` 15; specs `parser/requirementDiagram.spec.js` 850, `requirementDb.spec.ts` 107.

## 1. Lexer — `$V/parser/requirementDiagram.jison` L6–105

- L7 `%options case-insensitive`. L9–15 exclusive states `string`, `token` (declared, never entered), `unqString` (declared, never entered), `style`, `acc_title`, `acc_descr`, `acc_descr_multiline`. 71 rules, first match wins; jison adds `\b` after keyword rules.
- L18 `"title"\s[^#\n;]+` returns `title`, which no grammar rule takes: `title x` and `text: title page` reject.
- L19–25 acc rules (`accTitle\s*":"\s*`, `accDescr\s*":"\s*`, `accDescr\s*"{"\s*` → `acc_descr_multiline`, `[\}]` pops, `[^\}]*` value). No token for the `{`.
- **L26–29 `.*direction\s+(TB|BT|RL|LR)[^\n]*`**, before everything else in INITIAL, so it matches anywhere in a line at any token start (Q2/D432); case-insensitive, so `direction lr` works.
- L30 `(\r?\n)+` NEWLINE, then **L31 `\s+` skip** (also eats `\n`: blanks before a line end swallow it, Q1/D431), L32 `\#[^\n]*` and L33 `\%%[^\n]*` comments (only at a token start), L34 `<<EOF>>`.
- L36 `requirementDiagram` RD; L38–41 `{` `}` `:::` `:`; L43–46 `id`, `text`, `risk`, `verifyMethod`; L48–53 the six kinds; L55–57 `low|medium|high`; L59–62 `analysis|demonstration|inspection|test`; L64 `element`; L66–72 seven relations; L74–75 `type`, `docref`.
- L77–86 `style` state: `\w+` ALPHA, `:` COLON, `;` SEMICOLON, **`%` PERCENT** (grammar wants `PCT`: parse error), `-` MINUS, `#` BRKT, `" "` skipped (spaces dropped), `"` begins `string`, **`\n` pops without a NEWLINE**. L88–89 `classDef`/`class` also begin `style`.
- L91–93 `<-` END_ARROW_L, `->` END_ARROW_R, `-` LINE. L95–97 quoted strings (`"` begin/pop, `[^"]*` qString: spans lines, no escapes, `""` gives no qString → reject).
- **L99 `[\w][^:,\r\n\{\<\>\-\=]*` unqString, `yytext.trim()`**: comes after every keyword, so `test_req` lexes whole but `element test {` → VERIFY_TEST, `text: high quality` → HIGH_RISK. A trailing `%% c` after a relation end is part of the name.
- L101–103 `<*>\w+` ALPHA, `<*>[0-9]+` NUM (unreachable after `\w+`), `<*>","` COMMA.

## 2. Grammar — same file L107–267

- L111–114 `start: directive NEWLINE start | directive start | RD NEWLINE diagram EOF` (acc directives may precede the header). L116–120 `directive` actions `.trim()` then `setAccTitle`/`setAccDescription`.
- L122–133 `diagram` right-recursive over requirementDef, elementDef, relationshipDef, directive, direction, styleStatement, classDefStatement, classStatement, NEWLINE.
- L135–144 `direction` → `setDirection('TB'|…)`.
- L146–149 `requirementDef: requirementType requirementName (STYLE_SEPARATOR idList)? STRUCT_START NEWLINE requirementBody` → `addRequirement($2,$1)` (+ `setClass([$2],$4)`). `{` must be followed by NEWLINE.
- L151–161 `requirementBody` right-recursive: the innermost (last written) field's action runs first and outer ones overwrite it, so the **first** of repeated fields wins. Ends at `STRUCT_STOP`.
- L163–190 kind/risk/verify map to `yy.RequirementType.*`, `yy.RiskLevel.*`, `yy.VerifyType.*` (canonical display strings, §3).
- L192–203 `elementDef`/`elementBody` (`type`, `docref`).
- **L205–209 relations**: `id <- rel - id` → `addRelationship($3, $5, $1)` (src = right end); `id - rel -> id` → `addRelationship($3, $1, $5)`.
- L227–234 `classDef idList stylesOpt`; `class idList idList`; `id ::: idList` → `setClass([$1],$3)`.
- L236–241 `idList`: ALPHA or `id`, comma-separated. L243–257 `style idList stylesOpt`; `stylesOpt` comma list of `style` = concatenated `styleComponent` (L257: ALPHA NUM COLON UNIT SPACE BRKT PCT MINUS LABEL SEMICOLON; UNIT, SPACE, PCT, LABEL are never lexed).
- L260–265 every name/value is `unqString | qString`.

## 3. Preprocessing path

- `$R/Diagram.ts:77` `encodeEntities(source) + '\n'`, L83 `parser.parse`. `encodeEntities` `$R/utils.ts:895–918`; **L898 `/style.*:\S*#.*;/g`** is the cubic rewrite on long `style` lines (pitfall 5). Front matter, directives and whole-line `%%` are stripped first (see 427's `01-v12-sankey.md` §2 for the shared lines).
- Detector `$V/requirementDetector.ts:10` `/^\s*requirement(Diagram)?/` (case-sensitive, no `\b`). `$V/requirementDiagram.ts:10–12` `get db()` returns a **new `RequirementDB` per diagram**.

## 4. DB — `$V/requirementDb.ts`

- L27–33 state: `relations[]`, `latestRequirement`, `requirements` Map, `latestElement`, `elements` Map, `classes` Map, `direction = 'TB'`.
- L35–65 canonical values: kinds `Requirement`, `Functional Requirement`, `Interface Requirement`, `Performance Requirement`, `Physical Requirement`, `Design Constraint`; risk `Low|Medium|High`; verify `Analysis|Demonstration|Inspection|Test`; relations lower-case `contains…traces`. Types in `$V/types.ts:1–51`.
- L67–86 constructor binds setters (jison calls them unbound). L103–124 initial records: empty strings, `cssStyles: []`, `classes: ['default']`.
- L126–142 `addRequirement`: first definition wins (`!has(name)`), later body dropped silently, latest reset either way. L172–186 `addElement` same. Requirement and element maps are separate (shared names allowed).
- L148–170, L192–202 field setters write the pending record. L204–210 `addRelationship(type, src, dst)`: kept whatever the ends.
- **L216–224 `clear()` does not reset `direction`** (harmless in v12, which builds a new DB per diagram; the v12 spec reuses one DB, `parser/requirementDiagram.spec.js:10–14`).
- L226–240 `setCssStyle`: `requirements.get ?? elements.get`; **`return` on the first unknown id** (stops the whole loop); splits entries on `,`.
- L242–255 `setClass`: pushes class names, copies the class's `styles` (only if the class exists already). L257–286 `defineClass`: creates/extends `{id, styles, textStyles}` (`/color/` → textStyles with `fill`→`bgFill`), then appends the styles to every node that **already** has the class (so `classDef default` hits only earlier nodes).
- **L292–342 `getData()`**: requirements then elements as nodes (`id = name`, `shape: 'requirementBox'`, `cssClasses = classes.join(' ')`, `look`, `colorIndex = nodes.length`); edges `id: ${src}-${dst}-${counter}`, `start`/`end` = `requirements.get(x)?.name ?? elements.get(x)?.name` (undefined for unknown), `label: '&lt;&lt;type&gt;&gt;'`, `classes: 'relationshipLine'`, `style: ['fill:none', contains ? '' : 'stroke-dasharray: 10,7']`, `labelpos: 'c'`, `pattern` normal/dashed, `arrowTypeStart: 'requirement_contains'` or `arrowTypeEnd: 'requirement_arrow'`, `labelType: 'markdown'`. Returns `{nodes, edges, other: {}, config, direction}`.
- L344–350 acc/title getters; `getConfig = () => getConfig().requirement` (unused by the renderer).

## 5. Renderer — `$V/requirementRenderer.ts` (39 lines)

- **L12 reads `state: conf`**, not `requirement`: L22–23 `state.nodeSpacing ?? 50`, `state.rankSpacing ?? 50` (state schema has no defaults, so 50/50 unless a user sets `state.*`), L34 `state.titleTopMargin ?? 25` (state default 25), L38 `state.useMaxWidth ?? true`. Same v12 bug as class (`class.useMaxWidth` precedent).
- L20 `getRegisteredLayoutAlgorithm(layout)` (top-level `layout`; dagre unless set). L24–27 markers `requirement_contains(_neo)`, `requirement_arrow(_neo)` by `look`. L29 unified `render`. L30–36 `insertTitle(svg, 'requirementDiagramTitleText', margin, getDiagramTitle())`. L38 `setupViewPortForSVG(svg, 8, 'requirementDiagram', …)`.

## 6. Shape — `$R/rendering-util/rendering-elements/shapes/requirementBox.ts` (263 lines)

- L23–24 `padding = 20`, `gap = 20`. L25 requirement vs element by `'verifyMethod' in node`. **L30 body alignment `start` only when `config.layout === 'elk'`, else `center`** (the label is still placed at `x + padding/2`, L157).
- L39–48 `<<Kind>>` / `<<Element>>` line; L51–57 name with `font-weight: bold`, then `+ gap`. L60–92 `ID: `, `Text: `, `Risk: `, `Verification: `; L93–110 `Type: `, `Doc Ref: `. Empty field → `addText` returns 0 and draws nothing (L211–213).
- L112–115 box = text bbox + 20 each way, centred. L119–131 roughjs rectangle (`roughness 0`, `fillStyle solid` unless handDrawn) classed `basic label-container outer-path`, `style = nodeStyles`.
- L133–136 `data-color-id="color-${colorIndex % borderColorArray.length}"` only when `borderColorArray` is non-empty.
- L140–165 re-translate labels: first two centred, body at `x + padding/2`; all `+ padding` down.
- **L168–185 divider** only when there is body text, at `y + typeHeight + nameHeight + gap`; neo draws a 0.001-thick polygon, else a rough line; class `divider`.
- L189–191 `intersect.rect`. L193–199 node styles copied onto every `path` when not handDrawn and the theme has `requirementEdgeLabelBackground` or a palette.
- L204–263 `addText`: `createText(sanitizeText(decodeEntities(text)), {width: calculateTextWidth + 50, classes: 'markdown-node-label', useHtmlLabels})` (markdown on every line); SVG path adds 6 to the bbox height (L247).
- Stroke width: `handDrawnShapeStyles.ts:123` `userNodeOverrides` defaults `strokeWidth` to **1.3**, fill `mainBkg`, stroke `nodeBorder` (L117, L121): the theme's `requirementBorderSize` `'1'` never applies.

## 7. Markers — `$R/rendering-util/rendering-elements/markers.js`

- L869–887 `requirement_arrow`: id `${id}_${type}-requirement_arrowEnd`, refX 20, refY 10, 20 × 20, `orient auto`, path `M0,0 L20,10 M20,10 L0,20` (open chevron).
- L889–915 `_neo`: same plus `markerUnits userSpaceOnUse`, `stroke-width = strokeWidth`, `viewBox 0 0 25 20` (the 0.8 scale), `stroke-linejoin miter`.
- L917–934 `requirement_contains`: id `…-requirement_containsStart`, refX 0, refY 10, 20 × 20; circle cx 10 cy 10 r 9 `fill none`, lines (1,10)–(19,10) and (10,1)–(10,19). L936–958 `_neo`: `userSpaceOnUse`, every child `stroke-width = strokeWidth`. Registered L1101–1104.

## 8. Styles — `$V/styles.js` (124 lines)

- L4–48 `genColor`: gated by `isColorTheme(theme, borderColorArray)` (`$R/diagrams/common/colorThemeGate.ts`); one rule per slot `[data-look][data-color-id="color-i"].node path|rect { stroke: border[i]; fill: bkg[i % len] }` (fill omitted with no `bkgColorArray`: redux-dark-color).
- L56–63 `marker` fill/stroke `relationColor`; `marker.cross` `lineColor`. L65–68 `svg` font.
- **L70–88 dead selectors**: `.reqBox` (`requirementBackground`, `requirementBorderColor`, `requirementBorderSize`), `.reqTitle, .reqLabel` (`requirementTextColor`), `.reqLabelBox` (`relationLabelBackground`), `.req-title-line`: the unified output has none of these classes (Q5/D435).
- L89–92 `.relationshipLine` stroke `relationColor`, width `strokeWidth` under neo else `1px`. L93–95 `.relationshipLabel` (dead). L96–104 `.edgeLabel` background/`rect` fill `edgeLabelBackground`, text `relationLabelColor`. L105–108 `.divider` `nodeBorder`, width 1. L109–116 `.label` colour/fill `nodeTextColor || textColor`. **L117–119 `.labelBkg` `requirementEdgeLabelBackground ?? edgeLabelBackground`**, not gated on colour themes (ER's is, `$R/diagrams/er/styles.ts:83–91`).

## 9. Config — `fa796a943:packages/mermaid/src/schemas/config.schema.yaml`

- Top-level `requirement:` L419–420. `BaseDiagramConfig` L476 (`useWidth`, `useMaxWidth` default true, per-type `theme`/`look`/`layout` L490–525, "diagram-scoped beats global").
- `RequirementDiagramConfig` L1089–1131: required `useMaxWidth`; **`theme` default `redux-color` (L1098–1100), `look` default `neo` (L1101–1103)**, no `layout` default; `rect_fill` `#f9f9f9`, `text_color` `#333`, `rect_border_size` `0.5px`, `rect_border_color` `#bbb`, `rect_min_width` 200, `rect_min_height` 200, `fontSize` 14, `rect_padding` 10, `line_height` 20. None is read by the source (§5).
- So a config-free v12 requirement renders in redux-color + neo; the syntax page also claims ELK (`syntax/requirementDiagram.md:30`) though no `layout` default exists.

## 10. Theme variables — `fa796a943:packages/mermaid/src/themes/theme-*.js`

- Every theme has the block: base L359–368, dark L371–380, default L392–399, forest L364–371, neutral L380–387, neo L313–322, neo-dark L326–335, redux L314–323, redux-dark L340–349, redux-color L385–394, redux-dark-color L402–411. Rules: `requirementBackground = primaryColor`, `requirementBorderColor = primaryBorderColor`, `requirementBorderSize = '1'`, `requirementTextColor = primaryTextColor`, `relationColor = lineColor`, `relationLabelColor = actorTextColor`; `relationLabelBackground` = `labelBackground` (default), `edgeLabelBackground` (forest, neutral), else `darkMode ? darken(secondaryColor, 30) : secondaryColor`.
- `requirementEdgeLabelBackground` only in the four redux themes: redux L324 `#FFFFFF`, redux-dark L350 `#16141F`, redux-color L395 `#FFFFFF`, redux-dark-color L412 `#16141F` (equal to each theme's `erEdgeLabelBackground`, L384/L410/L456/L473).

## 11. v12 specs

- `$V/parser/requirementDiagram.spec.js`: **37 `it` + 1 `test.each`** = 38 declarations (the spec's "38"); at runtime 43 (the L583–601 loop over `__proto__`/`constructor` doubles two `it`s; L840 `test.each` × 4 directions). 42 `reqDiagram.parser.parse` calls in text; harvest name `reqDiagram` (L3). Sources built with `[...].join('\n')`, so the `run` harvest is needed. One shared DB reused across tests (L10–14).
- `$V/requirementDb.spec.ts`: 10 `it` (L11–93), DB calls only (no parse; no harvested source).
- Syntax page `fa796a943:packages/mermaid/src/docs/syntax/requirementDiagram.md` (387 lines): **9 `mermaid-example` blocks** at L11, L38 (defaults), L64 (`theme: default`, `look: classic`, `layout: dagre`), L144 (markdown in quotes), L181 (larger example), L262 (direction), L289 (style), L311 (classDef), L367 (combined); plain fences L107, L128, L161, L167, L333–363 are grammar sketches. L28–34 claims redux-color/neo/ELK defaults.

## 12. Corpus — `e2e/diagrams/requirement/` (current tree; 172 `.mmd` + 3 `.gitkeep`, same 175 files at `fa796a943`)

- `nightly-check` 168, `pr-check` 2 (`sample.mmd`: three kinds, two elements, satisfies/traces/contains/`<- copies -`; `should-render-a-basic-…-classic-look-and-default-theme.mmd`), `visual-check` 2 (`with-a-theme-default.mmd`: leading blank line before `---`; `with-a-title-default.mmd`: indented closing `  ---`).
- Variants by suffix: `-default` 24, `-elk-layout` 24, `-handdrawn-look` 24 (each 16 scenarios + 8 `-without-htmllabels`), and 16 each of `-neo-look-{neo,neo-dark,redux,redux-color,redux-dark,redux-dark-color}-theme` (config `look: neo` + `theme:`). 31 scenario stems; `-default` files have no config (so v12 draws them redux-color + neo, §9).
- Feature hits (files): kinds requirement 172, functional 22, performance 19, interface/physical/designConstraint 12 each, element 142; relations `- contains ->` 22, `- copies ->` 12, `<- copies -` 16 (the only reverse form), derives 36, satisfies 85, verifies 39, refines 18, traces 22; risk low 52 / medium 55 / high 115; verify analysis 42, demonstration 19, inspection 46, test 127; `style` 18, `classDef` 30 (`classDef default` 6), `class` 12, `:::` 19, `direction` 42, quotes 111, front-matter `title` 7, `htmlLabels: false` 27 (3 of them `flowchart.htmlLabels`), `docref` 40.
- Absent (as the spec says): `accTitle`/`accDescr`, `%%`, CRLF, trailing blanks, `themeVariables`, `<- contains -`.
- `packages/conformance/src/preprocess.spec.ts:98–100` already lists `visual-check/with-a-theme-default.mmd` as a decided divergence: **v13's preprocess accepts it** (v12 `render()` rejects the leading blank line). Only the title file is a v13 rejection by preprocess.

## 13. The reference implementation

- `/Users/knsv/repos/pele/` **does not exist** on this machine. The only copy is `pele@1.13.0` in `packages/bench/node_modules/pele/` (bench dependency, `packages/bench/package.json:50`): `dist/diagrams/requirement/{db,graph,index,lexer,parser,render,tokens,types}.d.ts`, `dist/esm/diagrams/requirement.js` (a 244 B re-export), `dist/entries/requirement.d.ts`. Types only; read the chunk it re-exports for behaviour. MIT reference (D325), never the oracle.
