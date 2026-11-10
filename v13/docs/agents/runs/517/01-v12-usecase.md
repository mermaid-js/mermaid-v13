# 01 — v12 usecase, shapes, config, corpus, Chevrotain oracle (pointer notes)

v12 source is `git show fa796a943:packages/mermaid/src/diagrams/usecase/<file>` (the spec says it matches `mermaid@12.2.0` apart from three spec and DB lines). This worktree has **no `node_modules`**. The bundle reads below use the sibling install `.claude/worktrees/518-treeview-e1abe2/node_modules/.pnpm/mermaid@12.2.0` (several M5b worktrees have the same one).

## 1. Files (`fa796a943:…/diagrams/usecase/`)

| File | Lines | What |
| --- | --- | --- |
| `parser/usecase.tokens.ts` | 410 | tokens L126–321, default-mode order L323–391, modes L393–400, flat vocabulary L403–410 |
| `parser/usecase.lexer.ts` | 5 | `usecaseLexer = new Lexer(usecaseLexerModes)` L5 (a module singleton) |
| `parser/usecase.parser.ts` | 705 | `CstParser` with `nodeLocationTracking: 'full'` L135; rules L137–664; gates L668–702 |
| `parser/usecase.visitor.ts` | 976 | CST → builder drafts; `build` L78, `generateId` L876, `solidMinlen` L879 |
| `parser/usecaseModelBuilder.ts` | 1,050 | `finalize` L280–356, all semantic errors (§4) |
| `parser/usecaseJson.ts` | 378 | `parseOrderedJsonObject` L345 (`JSON.parse` L352, `Invalid JSON: …` L367, `…object root` L371) |
| `parser/usecase.chevrotain.ts` | 45 | `parser.parse`: `db.clear()` L11, `runChevrotainParse` L14–23, location suffix L26–41 |
| `usecaseDb.ts` | 574 | state, getters, `getData` L295–543 |
| `usecaseRenderer.ts` | 298 | `draw` L237–296 |
| `styles.ts` | 399 | `roleColors` L51–60, `genColor` L75–187, `getStyles` L189–397 |
| `usecaseTypes.ts` | 327 | `ActorType` L6, `ARROW_TYPE` L47, `Direction` L91, `DEFAULT_DIRECTION = 'LR'` L93 |
| `usecaseAst.ts` | 177 | v12 `GraphAST` (`buildUsecaseGraphAST` L117). D476 drops it |
| `usecaseDetector.ts` | 22 | `/^\s*usecase-beta(?:\s|$)/` L10 (no `i` flag) |
| `usecaseDiagram.ts` | 12 | `{parser, db, renderer, styles}` |

Shared: `common/parser/runChevrotainParse.ts` (lexer errors throw `Error lexing usecase diagram: … at line L, column C [s,e)` L25–29; parser errors throw `Error parsing usecase diagram: <chevrotain message>` L35–37), `common/colorThemeGate.ts` (`COLOR_THEMES` L17, `isColorTheme` L37, `safeLook` L53, `stampColorSlot` L114–125).

## 2. Lexer (`usecase.tokens.ts`)

- Custom matchers: `matchMarkdownString` L13 (scans to `` `" ``), `matchComment` L25 (only blanks before `%%` on the line, to the line end), `isIndentedLineStart` L45, `matchAccDescrBlock` L70 (**`indexOf('}')` from the opening**), `matchJsonObject` L82–113 (brace depth and string-aware, `null` when unclosed), `matchStereotypeText` L115 (**`indexOf('>>')` over the rest of the input**, then rejects a line break).
- Categories: `LABEL_TEXT` L126 and `WORD` L127 (`Lexer.NA`). Keywords are `keyword()` L212 with `longer_alt: IDENTIFIER` and category `WORD` (L215–234). `include`/`extend` are `/i` (L231–232). `JSON` L227 is not exported but sits in the mode list.
- `IDENTIFIER` `/\w+/` L137 with `longer_alt: NUMBER`. `NUMBER` L129 `(?:\d+\.\d+|\d+|\.\d+)(?:[A-Za-z]+)?`. `HWS` L143 is the only `SKIPPED` token.
- Operators L236–276: `--\|>`, `..>`, `<<` (push `stereotype`), `>>` (pop), `:::`, `--+>`, `<--+`, `--o`, `o--`, `--x`, `x--`, `--+`, `@{`, `@`, braces, brackets, parens, `,`, `:`. Then `HASH_COLOR` L278, `PLAIN_STRING` L283 (`"…"|'…'`, one line), `CSS_IDENTIFIER` L287 (`--x…` or `a-b…`, so `my-node` is not an id), `CSS_ESCAPED_COMMA`, `DASH`, `DOT`, `PERCENT`, `CSS_PUNCTUATION` L300, `LABEL_PUNCTUATION` L310 `[;<>\\`]`, `LABEL_SYMBOL` L317 (anything outside printable ASCII).
- **Default-mode order** L323–391: categories, `HWS`, markdown (closed, then unclosed), `COMMENT`, `NEWLINE`, the three acc tokens, `JSON_DECLARATION_START` L193 (`json[\t ]+\w+[\t ]*@[\t ]*(?={)`, push `jsonBody`), keywords, operators, `HASH_COLOR`, `PLAIN_STRING`, `CSS_IDENTIFIER`, `IDENTIFIER`, `NUMBER`, punctuation, `LABEL_PUNCTUATION`, `LABEL_SYMBOL`.
- **`jsonBody`** L397: `JSON_OBJECT_LITERAL` (pop), `UNCLOSED_JSON_OBJECT_LITERAL` `/{[^]*/` (pop). **`stereotype`** L398: `STEREOTYPE_END`, `STEREOTYPE_TEXT`, `UNCLOSED_STEREOTYPE_TEXT` `/[^\n\r]+/` (pop).
- Probed on 12.2.0: `actor A %% x` lexes `PERCENT PERCENT IDENTIFIER` with no lexer error, and the *parser* rejects it. `A &lt;&lt;X&gt;&gt;` also lexes cleanly (`&` → `CSS_PUNCTUATION`, `;` → `LABEL_PUNCTUATION`) and the parser rejects at `&`. So lexer parity must include error-free streams of text v12 rejects.

## 3. Parser (`usecase.parser.ts`)

- `start` L137 `USECASE lineEnd line*`. `line` L143: `blankLine | commentLine | GATE isStatementStart statement`. `statement` L154–175 tries, in order: acc title, acc descr, direction, actor, systemBoundary, note, json, classDef, class, style, **GATE `isMetadataAssignment` (L668: id/string/markdown then `@{`)**, then **GATE `!isForbiddenPlantUmlStatement` (L681; the words L76–82, lower-cased first token, `IDENTIFIER` only)** entityStatement.
- `actorStatement` L203 (`actor item ((, item)+ | relationTail)?`), `actorItem` L221 (name, metadata?, stereotype?, classSuffix?), `actorName` L228 (`ID ('(' label ')')? | STR | MD`; no `[…]` for actors). `actorDeclarationOnly` L245 is the boundary-body form.
- `entityStatement` L255, `entityName` L261–292 (`ID` with `(…)` or `[…]`, or `STR`/`MD`, then metadata, stereotype and `:::` in that fixed order). `nodeLabel` L294: string, markdown or `LABEL_TEXT+`.
- `relationTail` L309 (`ID @` gated on LA(1)/LA(2), then `arrow entityName`). `arrow` L321. Labelled forms: `<-- label --` L338–347, `-- label (--> | -- | --o | --x)` L349–365, `o-- label --` L371, `x-- label --` L386. Each is gated by **`hasLabeledRight` L689–702, a scan to the next non-label token** (the per-`--` lookahead the spec calls possibly quadratic). `semanticRelation` L405: `..> : (include|extend)` or `--|>`.
- `metadata` L418–431 (`@{`, newlines allowed, `,` or newline separators L444, optional trailing comma, `}`), `metadataProperty` L433 (key id/string, value id/string/`true`/`false`).
- `systemBoundaryStatement` L462–472 (name, metadata?, `:::`?, body, `end`); `systemBoundaryName` L474; body L507 (blank, comment, `boundaryElement` L517 = `actorDeclarationOnly` or `entityName lineEnd`). There is no nesting and no relation inside.
- `noteStatement` L543 (`note for ID label`), `stereotype` L551, `classSuffix` L557, `jsonStatement` L566, `directionStatement` L573, `classDefStatement` L585, `classStatement` L596 (two id lists; the visitor splits them at the first gap without a comma, `visitor.ts:628–656`), `styleStatement` L611, `styles`/`styleValue`/`styleComponent` L618–664.

## 4. Visitor and model builder

- Ids: `generateId(label) = label.replace(/\W/g, '_')` (`visitor.ts:876`) for string or markdown names (`actorName` L197–221, `entityName` L288). `minlen = max(1, dashes − 1)` L879. Only point and markerless arrows count dashes (L687–736); circle and cross are always 1. `include`/`extend` labels become `«include»`/`«extend»` in `getData` (`usecaseDb.ts:263–268`).
- Notes are `note-<n>` in source order (`modelBuilder.ts:836`). Anonymous edges are `edge-<n>` (L546). The JSON id comes from `JSON_DECLARATION_START` (`visitor.ts:566–611`).
- Direction: `setDirection` stores `TD` as `TB` (`modelBuilder.ts:237–239`), and the last one wins (L350). Default `LR` (`usecaseTypes.ts:93`). `setAccTitle`/`setAccDescription` overwrite, so the last wins (L240–245). Acc text is trimmed after `:` or inside `{…}` (`visitor.ts:127–140`).
- **Ordering** (`finalize` L280–356): `first` = earliest offset per id over relation ends, elements, boundaries and JSON (L285–299). Declarations are then registered in offset order (L300–340). Actors and use cases are materialised by `first` (L497, re-sorted by `reorderElements` L599), as are boundaries (L504) and JSON (L522). Relations stay in source order (L535–564). An undeclared endpoint becomes an ellipse use case (`resolveEndpoint` L566–597).
- Metadata: actor `type` ∈ `normal|hollow|awesome` (L727), `icon` (string), `business` (bool) (L721–758); use case `business` only (L689–719); boundary `type` ∈ `rect|package` (L636–646); edge `animate` (bool) or `animation` ∈ `fast|slow` (L663–675). `inferMetadataKind` L976–1004 feeds the "unresolved" message.
- **Every thrown message** (each ends ` at line L, column C [s,e)` via `locationText` L153; `conflict()` L1039–1048 appends `; previous declaration at …` and ` (label "…")` for generated ids):
  - L367 `ID 'x' is declared as both <kind> and <kind>`; L376/L461 `Generated ID 'x' collides with another declaration`; L411 `ID 'x' has conflicting labels`; L415 `Use case 'x' has conflicting shapes`; L422 `Element 'x' belongs to more than one system boundary`; L429 `Element 'x' has conflicting stereotypes`; L452 `… declared as both <kind> and boundary`; L472 `Boundary 'x' has conflicting titles`.
  - L574 `Relationship endpoint 'x' uses ::: without declaring the node`; L631 `Metadata target 'x' is unresolved[ (metadata implies <kind>)]`; L651 `Metadata target 'x' is not an explicit edge`.
  - L710 `Use case 'x' has conflicting business metadata`; L732/L741/L750 `Actor 'x' has conflicting type|icon|business metadata`; L766 `Actor 'x' cannot combine icon with type '<t>'`; L771 `Business actor 'x' must use normal or hollow geometry`; L776 `Rectangular use case 'x' cannot be a business use case`.
  - L798/L808 `Parent boundary 'p' for 'x' is unresolved` (looks unreachable from the grammar). L826 `Note target 'x' is unresolved`; L831 `Note target 'x' must be an actor or use case, not <kind>`; L892 `Class/style target 'x' is unresolved or anonymous`.
  - L907/L914 `Relationship source|target 'x' cannot be <kind>`; L924 `<include|extend> relationship requires use-case endpoints`; L932 `Generalization requires actor-to-actor or use-case-to-use-case endpoints`; L941 `JSON relationship 'a' to 'b' permits only point, reversed-point, or markerless solid association`.
  - L1011 `Metadata property 'k' is invalid for <kind> 'x'`; L1024 `ID 'x' is declared more than once (<kind> and <kind>)`.
  - Also `usecaseDb.ts:72` `Cannot commit an incomplete usecase model` (internal) and `visitor.ts:928/960` (CST shape, internal).

## 5. DB (`usecaseDb.ts`)

- State: `createModel` L35–51 (direction `LR`, config from `DEFAULT_CONFIG.usecase` L33). `commit` L81–95 (structured clone, then `assertCompleteModel` L53–74). `clear` L97–100 (also clears the common title, which is why the front-matter title never reaches `insertTitle`; D472).
- Getters L102–116: `getActors`/`getActor`, `getUseCases`/`getUseCase`, `getSystemBoundaries`/`getSystemBoundary`, `getRelationships`, `getNotes`/`getNote`, `getJsonNodes`/`getJsonNode`, `getClassDefs`/`getClassDef`, `getDirection`. The `db` object is L545–574 (it also has `getConfig`, `createModel`, `commit`, `getAST`, the common title and acc functions, and `getData`).
- `getCompiledStyles` L118–135 (`classDef default` first, last property wins). `flattenJsonRows` L149–211. `actorShape` L213, `useCaseShape` L226 (business ellipse → `usecaseBusiness`, rect → generic `rect`). `associationMarkers` L233–252. `relationshipVisuals` L254–284 (generalization → `extension`).
- **Colour index stamping** (comment L313–333): `colorIndex` runs across **actors first (L337–362), then use cases (L364–387)**, `boundaryColorIndex` from 0 over boundaries (L427–447). Notes (L389) and JSON (L411) get none. Each note also adds an internal dotted edge `<note>-edge` (L483–508).
- Node post-pass L510–522: `wrappingWidth`, `minWidth = minNodeWidth` except actors and groups, `spreadPorts` on ellipses. The return L524–542 has `layoutAlgorithm: 'dagre'`, which the renderer overrides.

## 6. Renderer (`usecaseRenderer.ts`)

- `draw` L237–296. **`layoutAlgorithm = getRegisteredLayoutAlgorithm(layout)` L277** with the global `layout`, whose 12.2.0 default is `elk` (`config.schema.yaml:79–86`; docs page L27–29).
- `prepareUsecaseLayoutData` L100–142: dom ids `usecase-<id>` L34, plain labels escaped L86, and a stereotype on an ellipse or rect use case is folded into a markdown label `«s»<br/>label` L122–134 (actors and business ovals draw it themselves).
- `annotateUsecaseElements` L144–210: `data-usecase-id`, `data-usecase-kind`, `role="img"`, `aria-label` on nodes, edge paths get an id plus `aria-hidden` (note connectors) or `role`/`aria-label`. Accessible names L46–84.
- `applyUsecaseFonts` L224–232 sets `--mermaid-usecase-*` custom properties, applied twice (L281, L295). `insertTitle(svg, 'usecaseDiagramTitleText', 0, …)` L287–292; `setupViewPortForSVG(svg, diagramPadding, …)` L293.

## 7. `styles.ts`

- `roleColors` L51–60: `actorBkg = usecaseActorBkg ?? actorBkg ?? mainBkg`, `actorBorder = usecaseActorBorder ?? actorBorder ?? primaryColor`, `bkg = usecaseBkg ?? mainBkg`, `border = usecaseBorder ?? nodeBorder ?? primaryColor`, `boundaryBkg = usecaseBoundaryBkg ?? clusterBkg`, `boundaryBorder = usecaseBoundaryBorder ?? clusterBorder`, `includeLine`/`extendLine = … ?? lineColor`.
- **`genColor` L75–187 only runs when `isColorTheme(theme, borderColorArray)`, that is when the theme *name* is `redux-color`/`redux-dark-color` *and* the palette is non-empty** (L79). An author palette under another theme is ignored, unlike D474's `slot()`.
- **Boundaries take palette slot `i` under both schemes** (L110–124). The `[data-color-id]` rule outranks `.system-boundary rect.boundary-body` (L292–298), so **under the colour themes the `usecaseBoundary*` greys never paint a stamped boundary.** v12's own spec confirms it (`usecaseRoleColors.spec.ts:69` "still numbers the system boundaries"). D474's "boundary greys as a family rule" therefore targets a value v12 does not show; T4 should check this against 12.2.0 computed styles.
- Under `rotate`: use case bodies L141–152, actor glyphs L158–181 (no descent into handDrawn paths).
- `getStyles`: actor text `actorTextColor ?? primaryTextColor` L198; glyph fill/stroke 2px L201–208; neo-outranking rules L209–230 and L248–275 (skipped under handDrawn); fonts through `var(--mermaid-usecase-*, fallback)` 14px/12px L235–237, L280–282; stereotype and business marker L285–290; boundary 1px L292–298; titles `titleColor ?? primaryTextColor` L300–308; notes `noteBkgColor`/`noteBorderColor`/`noteTextColor` L310–319; JSON `mainBkg` / `nodeBorder ?? primaryColor` L321–333; relations `lineColor`, dash `3` for include/extend/note L335–354; edge labels `edgeLabelBackground`, 10px L361–382; markers `lineColor`, extension filled `mainBkg` L384–395.

## 8. Shared shapes (`fa796a943:…/rendering-util/rendering-elements/`)

- Registered in `shapes.ts:25,45–50,586–…`. Line counts: `usecaseActor.ts` 274, `…Hollow` 33, `…Awesome` 27, `…Icon` 71, `usecaseBusiness.ts` 126, `usecaseEllipse.ts` 72, `usecaseJsonTable.ts` 195, `usecaseShapes.spec.ts` 523 (13 tests). Notes and `[rect]` use cases use the generic `note`/`rect` shapes.
- `usecaseActor.ts`: `ACTOR_FIGURE_WIDTH 56`, `HEIGHT 72`, `LABEL_GAP 8`, `STEREOTYPE_LABEL_GAP 2`, `DEFAULT_ACTOR_PADDING 8` L21–26; business marker L35–57 (π/3, ratio 0.6, per-variant circle); `renderUsecaseActor` L154–253 (stamp L194, stereotype `«s»` L197–208, glyph group `usecase-actor-glyph` L210, invisible outline rect L239–247, `intersect.rect`); stick figure path L255–265. handDrawn uses `rough.svg` + `userNodeOverrides(node, hollow ? {fill:'none'} : {})` (L90–94, L113–121).
- Hollow: head circle (0,−23,r 9) + body path (`…Hollow.ts`). Awesome: one silhouette path. Icon: frame 52 / icon 42 / centre −2, `rx 4`, `getIconSVG(… fallbackPrefix 'fa')`, class `usecase-actor-icon-fallback` when missing.
- `usecaseEllipse.ts`: `rx = w/2 + 2·pad`, `ry = h/2 + 2·pad` L27–28 (pad = `halfPadding ?? 10`), `intersect.ellipse` L61–69. `usecaseBusiness.ts`: the same radii over label+stereotype L66–74, marker chord L75–81 + L109.
- `usecaseJsonTable.ts`: cell padding 8×4, border 1 L34–36, title/key/value labels L75–98, `intersect.rect` L193.
- handDrawn defaults `handDrawnShapeStyles.ts:108–125` (roughness 0.7, hachure, fillWeight 1.5, gap 1.5, seed `handDrawnSeed`).
- **Boundary** `clusters.js:659–803`: `getUsecaseSystemBoundaryGeometry` L659–686 (package tab height `label + 10`, tab width `min(w, max(80, label + 20))`, horizontal label padding 20 for package); `usecaseSystemBoundary` L688–803 (classes L701, `data-look` L705, stamp L709, title `createText` L712–727, handDrawn body/tab with **`fill = style || clusterBkg`, `stroke = style || clusterBorder`** L735–752, title placement L776–786, `offsetY` L796). Registered at L817.

## 9. Config (`fa796a943:packages/mermaid/src/schemas/config.schema.yaml`)

`usecase:` L445–446 → `UsecaseDiagramConfig` L2956–3069: required `useMaxWidth`, `wrappingWidth`, `minNodeWidth`; **`theme` default `'redux-color'` L2967–2969, `look` default `'neo'` L2970–2972**; `wrappingWidth` 120, `minNodeWidth` 120, `actorFontSize` 14, `actorFontFamily` `"Open Sans", sans-serif`, `actorFontWeight` `normal`, `usecaseFontSize` 12, `usecaseFontFamily`, `usecaseFontWeight`, `nodeSpacing` 50, `rankSpacing` 50, `diagramPadding` 20, `colorScheme` `role|rotate` default `role` L3040–3069 (the description L3041–3065 states the actors-then-use-cases numbering). Spec: `fa796a943:packages/mermaid/src/config.usecase.spec.ts` (8 tests).

## 10. Themes (`fa796a943:packages/mermaid/src/themes/`)

- `theme-redux-color.js`: `borderColorArray` L59–72 (12; slot 9 is `'#A3E635 '` with a trailing space), `bkgColorArray` L74–87 (12), usecase rows **L95–102** (all eight).
- `theme-redux-dark-color.js`: `borderColorArray` L74–87, **`bkgColorArray = []` L89**, usecase rows **L100–104** (three borders and two lines; no fills).
- No other theme sets a `usecase*` variable or a palette. `actorBkg`/`actorBorder`: `theme-base.js:76–77`, `default` L207–208, `dark` L133–134, `forest` L115–116, `neutral` L134–135, `neo` L96–97, `neo-dark` L116–117, `redux` L54/L103–104, `redux-dark` L123–127, `redux-color` L55, `redux-dark-color` L155–159. Per-diagram defaults table: `docs/config/theming.md:51`.

## 11. v12 specs and harvestable sources

| Spec | Lines | Tests | `usecase-beta` literals |
| --- | --- | --- | --- |
| `usecase.parser.spec.ts` | 1,191 | 41 sites (11 `.each`) | 65 |
| `usecase.spec.ts` | 1,202 | 39 (12 `describe`s) | 33 |
| `parser/usecase.parser.spec.ts` | 232 | 10 (3 `.each`) | 51 |
| `parser/usecase.lexer.spec.ts` | 173 | 11 (1 `.each`) | 0 (raw lexer inputs, tokens and images asserted) |
| `parser/usecaseJson.spec.ts` | 157 | 9 (1 `.each`) | 0 (JSON literals) |
| `usecaseDb.spec.ts` | 188 | 4 | 3 |
| `usecase-colorIndex.spec.ts` | 140 | 6 | 7 |
| `usecaseRoleColors.spec.ts` | 184 | 12 (3 `.each` over the two colour themes) | 0 (calls `getStyles`) |
| `usecaseRenderer.spec.ts` | 289 | 6 | 1 (DOM) |
| `usecase.docs.spec.ts` | 54 | 1 `jsdomIt` (renders every docs fence) | — |

Also `clusters.spec.ts` (3), `multi-diagram-id-uniqueness.spec.ts` (1 usecase source), `e2e/rendering/usecase/nightly-check/usecase.spec.ts` (499 lines, 9 tests, 6 sources incl. `FULL_DIAGRAM` L11 and `THEMED_DIAGRAM` L65), `packages/examples/src/examples/usecase.ts` (3), `demos/usecase.html` (1).

## 12. Syntax page

`fa796a943:packages/mermaid/src/docs/syntax/usecase.md`, 599 lines, **24 `mermaid-example` fences** (L15, 37, 61, 96, 115, 139, 158, 169, 189, 205, 221, 241, 258, 271, 292, 316, 331, 359, 417, 449, 488, 517, 537, 589). Sections: defaults L27 (states ELK), actors L90, labels L152, lines and comments L183, boundaries L201, relationships L235, notes L310, JSON L327, styling L355, colours L384 (rotation L436), config L470, accessibility L513, PlantUML migration L571–599. Also `docs/syntax/usecase.md`.

## 13. Corpus (`e2e/diagrams/usecase/**/*.mmd`, this worktree)

- **32 files**: `nightly-check` 22 (`01`–`20` + `themed-elements-redux{,-dark}-color-theme`), `pr-check` 10. There is no `visual-check`. It is unchanged since fa796a943.
- **`&lt;` in 4 files**: `nightly-check/09-business-and-stereotypes.mmd` (L4 in the description, L11, L13, L14), `nightly-check/20-full-featured-order-system.mmd` (L18, L21), `pr-check/complete-hand-drawn-rendering-contract.mmd` (L14, L24, L31, L33) and `pr-check/small-representative-visual-snapshot.mmd` (L15, L25, L32, L34). The last two also hold `Hostile("&lt;img src=x onerror=…&gt;")` (L33/L34), an XSS case inside a quoted string. Decoding it (D471) produces a raw `<img …>` label, which is what v12's browser spec rendered.
- Themes: `base`, `dark`, `default`, `forest`, `neutral` (1 each), `redux-color` ×2, `redux-dark-color` ×2. `rotate`: `pr-check/palette-rotation-redux{,-dark}-color-theme.mmd`. handDrawn: `pr-check/complete-hand-drawn-rendering-contract.mmd` only.

## 14. The v12 lexer in `mermaid@12.2.0`

- `packages/conformance/package.json:60` `"mermaid-v12": "npm:mermaid@^12.2.0"`. The package `exports['.']` points at `dist/mermaid.core.mjs`. `chevrotain` is a dependency, `~13.2.0`, and resolves to `.pnpm/chevrotain@13.2.0` (`"type": "module"`, import and require both `lib/src/api.js`, so there is no dual-package split). It is the only chevrotain in the store.
- **Chunk `dist/chunks/mermaid.core/usecaseDiagram-WPOLBNNX.mjs`** (3,991 lines), loaded lazily from `mermaid.core.mjs:650` (detector L647). **`chevrotain` is an external import there**: L516 `import { Lexer as Lexer2 }`, L519 `createToken, Lexer`, L891 `CstParser, EOF, tokenMatcher`. `runChevrotainParse` L52, `Usecase = keyword("USECASE", …)` L703, `usecaseLexerModes` L870, **`usecaseLexer = new Lexer2(…)` L888**, `db` L486, `usecaseParser` L1408, `UsecaseModelBuilder` L1876, `usecaseVisitor` L3468, `parser.parse` L3470ff. `mermaid.esm.mjs`'s chunk (`chunks/mermaid.esm/usecaseDiagram-WIC6AC6W.mjs`) inlines chevrotain (no import), so it must not be used.
- **Hook checked in Node 26 with no DOM shim**: resolve `chevrotain` with `createRequire(<mermaid-v12>/package.json)`, `import()` it, wrap `Lexer.prototype.tokenize` (`lexer_public.js:248`), then `mermaid.parse(…)`. The usecase lexer is recognisable by `this.lexerDefinition.modes.defaultMode` holding a token named `USECASE`. It captured the preprocessed text (with `\n` appended) and the result. Calling `lexer.tokenize(text)` again gave the same stream. Probe script: scratchpad only, not committed.
