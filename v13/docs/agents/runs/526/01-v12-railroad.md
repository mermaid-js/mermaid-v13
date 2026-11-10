# 01 — v12 railroad, its four Langium grammars, oracle, corpus (pointer notes)

v12 source is `git show fa796a943:<path>`. Line numbers are at fa796a943, which spec #526 says is byte-identical to the 12.2.0 sourcemaps. Runs used this worktree's install (`PATH=~/.volta/bin:$PATH`, `packages/conformance`, `npx tsx --conditions=mermaid-source`).

## 1. Files (`fa796a943:packages/mermaid/src/diagrams/railroad/`, 2,140 LOC excluding specs)

| File | Lines | What |
| --- | --- | --- |
| `railroadDetector.ts` | 32 | id `railroad`, `/^\s*railroad-beta/i` L14 |
| `ebnfDetector.ts` / `abnfDetector.ts` / `pegDetector.ts` | 22 each | ids `railroadEbnf`/`railroadAbnf`/`railroadPeg`, `/^\s*railroad-<n>-beta/i` L10. Note the `i` flag and no word boundary |
| `railroadDiagram.ts` (18), `ebnfDiagram.ts` / `abnfDiagram.ts` / `pegDiagram.ts` (12 each) | | `{parser, db, renderer, styles: getStyles}`. Only the parser import differs |
| `parser/railroadParser.ts` | 113 | IR → model, `transformExpression` L26–73 |
| `parser/ebnfParser.ts` | 169 | EBNF → model L28–136 |
| `parser/abnfParser.ts` | 151 | ABNF → model L25–118, `parseRepeat` L51–61 |
| `parser/pegParser.ts` | 160 | PEG → model L25–127, `nodeToLabel` L66–77 |
| `railroadDb.ts` | 155 | module-level state L7–11, plain-object `db` L140–153 |
| `railroadRenderer.ts` | 669 | `PathBuilder` L17–56, `RailroadRenderer` L61–624, `draw` L638–666 |
| `styles.ts` | 368 | `buildRailroadStyleOptions` L189–254, `getStyles` L259–366 |
| `railroadTypes.ts` | 203 | node kinds L7–55, `RailroadRule` L60–64, `RailroadStyleOptions` L69–113, `DEFAULT_RAILROAD_CONFIG` L123–167, `RailroadDB` L190–203 |

Registration: `diagram-api/diagram-orchestration.ts:37–40` (imports) and `:117–120` (in this order: railroad, Ebnf, Abnf, Peg).

## 2. Model (`railroadTypes.ts`)

There are seven kinds: `terminal{value}` L7, `nonterminal{name}` L12, `sequence{elements}` L17, `choice{alternatives}` L22, `optional{element}` L27, `repetition{element,min,max,separator?}` L32–38 and `special{text}` L40. `separator` is never set by any parser. `RailroadRule{name, definition, comment?}` L60–64, and no parser sets `comment`. `max: Infinity` comes out as `null` in JSON, so model parity must normalise it.

## 3. Parsers (Langium AST → model)

All four do the same at L92–111/L148–167/L130–149/L139–158: `db.clear()`, `LangiumParser.parse(input)`, throw `MermaidParseError` on any lexer or parser error, then `populateCommonDb(ast, db)`, `if (ast.title) db.setTitle(ast.title)`, `rules.map(db.addRule)`. Services are built at module load: `createRailroadServices().Railroad.parser.LangiumParser` (railroadParser L24), `…Ebnf…().RailroadEbnf…` (ebnf L26), `…Abnf…().RailroadAbnf…` (abnf L23), `…Peg…().RailroadPeg…` (peg L23).

- **IR** L26–73: `RailroadTerminalExpr`→terminal, `NonTerminalExpr`→nonterminal, `SpecialExpr`→special, `SequenceExpr`/`ChoiceExpr` collapse when they have one child (L45, L49), `OptionalExpr`→optional, `OneOrMoreExpr`→rep{1,∞}, `ZeroOrMoreExpr`→rep{0,∞}.
- **EBNF**: `transformChoice` L28–39 and `transformSequence` L41–52 collapse single children. Primary L54–88: `EbnfGroup` → its choice (no node), `EbnfOptional` `[ ]` → optional, `EbnfRepetition` `{ }` → rep{0,∞}. Postfix L90–123: `?` → optional, `*` → rep{0,∞}, `+` → rep{1,∞}, **`- X` → `sequence[node, terminal('-'), X]`** L111–119. Postfixes fold left with `reduce` L125–129, so they stack.
- **ABNF**: alternation and concatenation collapse L25–49. `parseRepeat` L51–61: `"n*m"` split on `*` (empty min is 0, empty max is ∞), exact `"n"` gives `{n,n}`. `transformElement` L63–82: `{0,1}` → optional, anything else → `repetition{min,max}`. Primary L84–111: string and NumVal → terminal (raw text, e.g. `%x41-5A`), RuleName → nonterminal, Group → its alternation, `[ ]` → optional.
- **PEG**: choice and sequence collapse L25–49. Prefix L51–64: `&`/`!` → `special{text: op + nodeToLabel(inner)}`. `nodeToLabel` L66–77: terminal `"v"` (quoted), nonterminal name, special text, anything else `(...)`. Suffix L79–96 `? * +`. `PegAny` → `special{text:'.'}` L112–116.

## 4. DB (`railroadDb.ts`)

- **One DB object shared by all four types** (each `*Diagram.ts` imports `./railroadDb.js`). Confirmed in the oracle: four distinct parser objects, one DB.
- `sanitizeText` L13–15 uses `common.sanitizeText` with the global config. `sanitizeAstNode` L17–38 runs it on terminal, nonterminal and special text and recurses. Under the oracle DOMPurify is patched to identity, so `<b>x</b>` survives.
- `addRule` L71–88: sanitises; on a duplicate name (`ruleMap.has` L82) it `log.warn`s, **pushes anyway** L86, and `ruleMap.set` L87, so `getRules` holds both and `getRule` returns the last.
- `getRule` L100–102 is never called by the renderer. `setTitle` L56–59 (sanitised), `setDiagramTitle = setTitle` L134. `setAccTitle` L107–110 strips leading blanks `/^\s+/g`. `setAccDescription` L122–125 does `/\n\s+/g → '\n'`. `clear` L43–51 also calls `commonClear`.

## 5. Renderer (`railroadRenderer.ts`)

Config is `buildRailroadStyleOptions()` (L656). Text is measured with `getBBox` of a temp `<text>` at `fontFamily`/`fontSize` (L74–93, cached per string). That is normal weight: the bold rule name is measured unbolded. Below, `p` = padding, `r` = arcRadius, `hs`/`vs` = separations, and `(w, up, down)` is the box.

- **PathBuilder** L17–56 writes `M x y `, `L x y `, `A rx ry rot large sweep x y ` (flags `1`/`0`) and `trim()`s, with absolute coordinates and unrounded numbers. `H`/`V` exist but are unused.
- **terminal** L98–131: `w = tw + 2p`, `h = th + 2p`, up = down = h/2. `rect` at 0,0 with **`rx=ry=10` fixed** L112–113, `text` at (w/2, h/2).
- **nonterminal** L136–162: the same box with a square `rect`.
- **special** L473–499: text `'? ' + t + ' ?'` (measured and drawn), square `rect` (dashed only through CSS).
- **sequence** L167–217: `w = Σw + (n−1)·hs` L180, `up = max up`, `down = max down`. Child i at `translate(x, maxUp − up_i)` L187–191, connector `M x+w_i maxUp L x+w_i+hs maxUp` L194–203.
- **choice** L222–313: `H = Σh + (n−1)·vs` L233, `W = maxW + 4r` L236–237, `centerY = H/2` L241. Child at `elemX = 2r + (maxW − w)/2`, `elemY` cumulative L248–250, `elemCenterY = elemY + up`. Left path: if `elemCenterY === centerY` a straight `M 0 cY L elemX ecY` L255–256. Otherwise `M 0 cY A r r 0 0 below r cY±r L r ecY∓r A r r 0 0 !below 2r ecY L elemX ecY` L258–271. Right path: straight `M rs ecY L W cY` L280–281, or `M rs ecY L W−2r ecY A … !below W−r ecY∓r L W−r cY±r A … below W cY` L283–296. Result: up = H/2, down = H − H/2 L304–311. The main line is at H/2 whatever the branches' `up`, so even counts have no straight branch.
- **optional** L318–366: `W = w + 4r`, `H = h + 2r`. Element at `(2r, 2r)`, `cY = 2r + up`. Two stubs, `M 0 cY L 2r cY` and `M 2r+w cY L W cY` L336–342. Bypass `M 0 cY A r r 0 0 0 r cY−r L r r A r r 0 0 1 2r 0 L W−2r 0 A … 1 W−r r L W−r cY−r A … 0 W cY` L345–353. up = cY.
- **repetition** L371–468: `W = w + 4r`, `H = h + 2r + (min===0 ? 2r : 0)` L378–379. `elemY = bypass ? 2r : 0`, `cY = elemY + up`. The same two stubs L392–412. Loop below: `loopY = elemY + h + r` L415, path L416–440 (`A` sweep 1 throughout). The bypass for `min === 0` is the same as optional's, L445–457. **Only `min` is read** (L522); `max` is ignored, and `min ≥ 1` draws as `+`.
- **rule** L535–604: `g.railroad-rule[transform=translate(0,y)]` L536–539. Label `name + ' ='` L541, `nameWidth = measure(label).width + 20` L542, `defX = nameWidth + 20` L543. Definition `g` (no class) at `translate(defX, baseline − up)` with `baseline = max(20, up)` L548–550. Then `g.railroad-rule-name-group > text.railroad-rule-name` at x 0, y baseline L552–558. `g.railroad-start > circle` cx `nameWidth`, r `markerRadius` L561–566. `g.railroad-end > circle` cx `defX + w + 10` L569–574. Lead-in `M nameWidth+mR baseline L defX baseline` L577–586, lead-out `M defX+w baseline L defX+w+10−mR baseline` L589–598. Returns `h = max(40, defY + h + 2p)`, `w = defX + w + 10 + mR` L600–603.
- **diagram** L609–623: `y = p`, then per rule `y += h + vs`. Size is `(maxW + 2p, y + p)`, so the trailing `vs` is kept and content starts at x = 0, not p.
- **draw** L638–666: `svg.attr('class','railroad-diagram')` L643, `useMaxWidth = railroad.useMaxWidth ?? true` L645. With no rules, size is 200×100 and nothing is drawn L650–654. `configureSvgSize` plus `viewBox 0 0 W H` L626–633.
- The renderer has no `showMarkers`/`compactMode` check (markers always drawn), no title, no ids, no `<marker>`. Each child is rendered into the parent first and then `appendChild`-moved into the group (L190, L249), so DOM order is children first, then that group's paths.

## 6. `styles.ts`

- Inputs L9–16. `RAILROAD_STYLE_OPTION_KEYS` L21–46 (24 keys). Sanitisers: colour regex L18–19, font regex L20, `sanitizeNumberValue` (finite and ≥ 0) L103–112.
- `buildThemeDefaults` L125–187, **the theme mapping** (`a ?? b`, then the default if the result is not a valid colour):
  - fonts: `fontFamily` L126, `fontSize` (> 0) L130;
  - terminal: Fill `secondBkg ?? secondaryColor` L136–139, Stroke `secondaryBorderColor ?? lineColor` L140–143, Text `secondaryTextColor ?? textColor` L144–147;
  - nonTerminal: Fill `mainBkg ?? background` L148–151, Stroke `primaryBorderColor ?? lineColor` L152–155, Text `primaryTextColor ?? textColor` L156–159;
  - line and marker: `lineColor` L160, markerFill `lineColor` L161;
  - comment: Fill `labelBackground ?? tertiaryColor` L162–165, Stroke `tertiaryBorderColor ?? lineColor` L166–169, Text `tertiaryTextColor ?? textColor` L170–173;
  - special: Fill `tertiaryColor ?? secondaryColor` L174–177, Stroke `tertiaryBorderColor ?? secondaryBorderColor` L178–181;
  - ruleNameColor `titleColor ?? textColor` L182–185.
- `buildRailroadStyleOptions` L189–254: theme variables = `getThemeVariables()` **from `theme-default.js`** (L4), then `config.themeVariables`, then option overrides L193–197. Then the `railroad` config section wins per key L199–253.
- `defaultConfig.ts:298–318` sets the 16 colour/font keys to `undefined`, so the theme decides unless the user sets them.
- CSS L280–365: `.railroad-diagram` font; `.railroad-terminal rect`/`text`; `.railroad-nonterminal rect`/`text`; `.railroad-line {stroke, stroke-width, fill:none}`; `.railroad-start circle, .railroad-end circle {fill: markerFill}`; `.railroad-comment ellipse`/`text` (italic; **never drawn**); `.railroad-special rect` with `stroke-dasharray: 5,3` L344; `.railroad-special text` uses **`nonTerminalTextColor`** L348; `.railroad-rule-name {font-weight: bold}`; empty `.railroad-group`. Texts are `text-anchor: middle; dominant-baseline: middle`.
- Themes: `secondBkg` is `'calculated'` in the dark ctors (`theme-dark.js:20`, `neo-dark:27`, `neutral:33`, `redux-dark-color:27`). `theme-neo-dark.js:97–100` resolves it, with a comment saying railroad's fill was `calculated`. **The 12.2.0 dist has that fix** (`===\"calculated\"?` in `mermaid.esm.min/chunk-FWWDAFD2.mjs`). `labelBackground` is set only in `theme-default:38`, `theme-dark:29` and `neo-dark:35`.

## 7. Langium grammars (`fa796a943:packages/parser/src/language/railroad{,-ebnf,-abnf,-peg}/`)

Each directory has `<n>.langium`, `module.ts` (56/58 lines), `tokenBuilder.ts` (7), `valueConverter.ts` and `index.ts` (re-exports the module). They do not import `common`.

- **Entry** (IR L62–66, EBNF L90–94, ABNF L66–70, PEG L64–68): `'<keyword>' (title=TITLE | accTitle=ACC_TITLE | accDescr=ACC_DESCR)* rules+=Rule*`.
- **Token builders** extend `AbstractMermaidTokenBuilder([keyword])` (`common/tokenBuilder.ts:14–28`), which appends `(?:(?=%%)|(?!\S))` to the header keyword.
- **Value converters**: the common one (`common/valueConverter.ts:44–70`) handles TITLE/ACC_TITLE/ACC_DESCR, trimming and squeezing `[\t ]{2,}`; multi-line `accDescr` is stripped per line. On top of that:
  - IR, EBNF and PEG: `decodeEscapedString` (`\n \r \t`, `\c` → `c`) for strings, and a quoted TITLE is stripped and decoded (`valueConverter.ts:44–52`, `:62–64`);
  - EBNF also: `EBNF_SPECIAL_SEQUENCE` → `slice(1,-1).trim()` L66–68;
  - ABNF: `ABNF_STRING` `slice(1,-1)` with no escapes L31–33, and a quoted title is sliced, not decoded L13–21.
- **Chevrotain token order** as built by `@mermaid-js/parser@2.0.1`, dumped from `services.parser.Lexer.definition`. Keywords come first, then terminals in grammar order; whitespace is skipped and the rest are `hidden`.
  - IR: `railroad-beta` `nonterminal zeroOrMore oneOrMore sequence optional terminal special choice` (all LONGER_ALT `RR_ID`) `= ; ( , )` TITLE ACC_TITLE ACC_DESCR `RR_ID /[A-Z_a-z][\w-]*/` `RR_STRING /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/`, then RR_WHITESPACE (skipped), and hidden RR_YAML, RR_DIRECTIVE, RR_SINGLE_LINE_COMMENT `/[\t ]*%%[^\n\r]*/`, RR_BLOCK_COMMENT `/\/\*[\s\S]*?\*\//`.
  - EBNF: `railroad-ebnf-beta` `::= = ; | , ( ) [ ] { } ? * + -` TITLE ACC_TITLE ACC_DESCR EBNF_ID EBNF_STRING (same regexes) `EBNF_SPECIAL_SEQUENCE /\?(?=[^?;]*[^?\s;][^?;]*\?)[^?;]*\?/`, then WS, and hidden YAML, DIRECTIVE, SINGLE_LINE_COMMENT, BLOCK_COMMENT, `EBNF_ISO_COMMENT /\(\*[\s\S]*?\*\)/`. **LONGER_ALTs on punctuation:** `(`→ISO_COMMENT, `?`→SPECIAL_SEQUENCE, `-`→YAML.
  - ABNF: `railroad-abnf-beta` `= ; / ( ) [ ]` TITLE ACC_TITLE ACC_DESCR `ABNF_RULENAME /[A-Za-z][A-Za-z0-9-]*/` `ABNF_STRING /"[^"]*"/` `ABNF_NUMVAL /%[xXdDbB][0-9A-Fa-f]+(?:-[0-9A-Fa-f]+|\.[0-9A-Fa-f]+)*/` `ABNF_REPEAT /[0-9]*\*[0-9]*/` `ABNF_EXACT_REPEAT /[0-9]+/`, then WS, and hidden YAML, DIRECTIVE, SINGLE_LINE_COMMENT, `ABNF_COMMENT /;[^\n\r]*/`. **`;` has LONGER_ALT ABNF_COMMENT**: `;` at end of line is the rule end, while `;` followed by text is a comment. This is the `a = "x" ; b = "y" ;` failure.
  - PEG: `railroad-peg-beta` `<- ; / & ! ? * + ( ) .` TITLE ACC_TITLE ACC_DESCR PEG_ID PEG_STRING (same as IR), then WS, and hidden YAML, DIRECTIVE, SINGLE_LINE_COMMENT, `PEG_LINE_COMMENT /#[^\n\r]*/`.
  - The shared header terminals in all four (L3–5): `TITLE /title(?:[\t ][^\n\r]*?(?=%%)|[\t ][^\n\r]*|)/`, `ACC_TITLE /accTitle[\t ]*:(?:…)/`, `ACC_DESCR /accDescr(?:[\t ]*:(…)|\s*{([^}]*)})/`. YAML `/---[\t ]*\r?\n(?:[\S\s]*?\r?\n)?---(?:\r?\n|(?!\S))/`, DIRECTIVE `/[\t ]*%%{[\S\s]*?}%%(?:\r?\n|(?!\S))/`. TITLE comes before the ID terminal and has no LONGER_ALT, so `titleCase` lexes as TITLE `title` + ID `Case`, which the oracle confirms (rule `Case`).
- Grammar rule lines: IR rules L68–113. EBNF `EbnfRule` L96–98 (`=` or `::=`), Choice L100, Sequence L104 (`','?`), Term L108, Primary L112–119, postfixes L145–166. ABNF Rule L72, Alternation L76, Concatenation L80 (`+`), Element L84–86 (REPEAT or EXACT), Primary L88–94. PEG Rule L70 (`<-`), Prefix L82–84 (at most one `&`/`!`), Suffix L86–88 (at most one), Primary L90–95, `PegAny` L109.
- `packages/parser/src/parse.ts:80–98` lazily builds the four parsers under the keys `railroad`, `railroadEbnf`, `railroadAbnf` and `railroadPeg`.

## 8. Specs (141 cases, all plain `it`, no `.each`)

| File | Cases | Sources |
| --- | --- | --- |
| `railroadDetector.spec.ts` | 14 (10 detector + 4 loader) | inline `detector('…')` strings |
| `ebnfDetector` / `abnfDetector` / `pegDetector.spec.ts` | 6 each | same |
| `parser/railroadDiagram.spec.ts` (IR) | 26 | `const input = \`` template literals, indented, leading `\n` |
| `parser/ebnfDiagram.spec.ts` | 14 | same |
| `parser/abnfDiagram.spec.ts` | 12 | same |
| `parser/pegDiagram.spec.ts` | 14 | same |
| `railroadDb.spec.ts` | 12 | none (calls `db.*` directly) |
| `railroadRenderer.spec.ts` | 6 | `const text = \`railroad-beta…` at L35, L66, L87, L106, L129, L151. jsdom with `getBBox` stubbed to `8·len × 16` (L10–24). Pins e.g. marker `cy 40`, `translate(74, 0)`, `L 88 62` |
| `styles.spec.ts` | 18 | none (calls `getStyles(opts)`) |
| `packages/parser/tests/railroad.test.ts` | 7 | IR only, through `createRailroadServices` and `parse('railroad', …)` |

That is 32 detector + 26 IR + 14 EBNF + 12 ABNF + 14 PEG + 12 DB + 6 renderer + 18 styles + 7 parser = 141.

**Harvest dry run.** I mutated `HARVESTS` at runtime and called `harvest()`, with header `railroad(?:-ebnf|-abnf|-peg)?-beta` over the 4 parser specs, the renderer spec, the 4 detector specs, `railroad.test.ts`, the 4 example files and the docs page. It gives **106 sources: IR 44, EBNF 26, ABNF 17, PEG 19**, matching the spec. Per file: IR spec 25, EBNF 13, ABNF 11, PEG 13, renderer 5, detectors 3/3/2/2, `railroad.test.ts` 7, examples 2 each, docs 14. The harvest header is case-sensitive, so `RAILROAD-EBNF-BETA` (from the detector specs) is not harvested.

## 9. Config

- v12 schema `packages/mermaid/src/schemas/config.schema.yaml`: top-level `railroad:` L453–454, and `RailroadDiagramConfig` **L3196–3306** (`allOf BaseDiagramConfig`, `unevaluatedProperties: false`). The 24 keys and defaults: `compactMode` false, `padding` 10, `verticalSeparation` 8, `horizontalSeparation` 10, `arcRadius` 10, `fontSize` 14, `fontFamily` 'monospace', `terminalFill` #FFFFC0, `terminalStroke` #000000, `terminalTextColor` #000000, `nonTerminalFill` #FFFFFF, `nonTerminalStroke`/`nonTerminalTextColor`/`lineColor` #000000, `strokeWidth` 2, `markerFill` #000000, `commentFill` #E8E8E8, `commentStroke` #888888, `commentTextColor` #666666, `specialFill` #F0E0FF, `specialStroke` #8800CC, `ruleNameColor` #000066, `showMarkers` true, `markerRadius` 5. These equal `DEFAULT_RAILROAD_CONFIG`.
- `defaultConfig.ts:298–318`: `...defaultConfigJson.railroad`, then 16 keys set to `undefined` (fontSize, fontFamily, and the 14 colour keys). The numbers stay.
- `config.type.ts:363` and `:2595–2600` (`RailroadDiagramConfig extends BaseDiagramConfig`).
- v13 now: `packages/core/schema/config.schema.yaml` top-level L1189–1191 `pending`, and `RailroadDiagramConfig` **L5557–5691**, with 24 `pending` marks. The spec's `:5336+` is stale.

## 10. Docs, examples, demos, e2e

- Syntax page `packages/mermaid/src/docs/syntax/railroad.md` (324 lines; generated `docs/syntax/railroad.md` 459). It has **14 `mermaid-example` fences**: EBNF ×9 (L24, 53, 66, 75, 87, 107, 120, 163, 174), ABNF ×2 (L197, 207), PEG ×2 (L229, 240), IR ×1 (L264). Sections: Visual Elements L290, Theme Integration L301, Limitations L305.
- Examples `packages/examples/src/examples/railroad{,-ebnf,-abnf,-peg}.ts` (48/35/29/30 lines), registered at `examples/src/index.ts:31–34,66–69`. `demos/railroad.html` (112 lines) has 8 `<pre class="mermaid">`.
- e2e at fa796a943 and **identical in the current tree**: `e2e/diagrams/railroad/pr-check/` has 9 `.mmd` (`abnf-alternation-and-repetition`, `ebnf-iso-14977-notation`, `ebnf-sequences-and-choices`, `ir-a-simple-rule`, `ir-dark-theme`, `ir-multiple-rules-in-one-diagram`, `ir-optional-and-repetition-operators`, `ir-sequences-and-choices`, `peg-ordered-choice-and-suffixes`). There is no `nightly-check` and no `baseline/`. `e2e/rendering/railroad/{nightly,pr,visual}-check/.gitkeep` is empty. There are no cypress specs.

## 11. Current tree rows

- `packages/mermaid/src/generated/detectors.gen.ts:35–38` and `registry.gen.ts:162–165`: four rows with the `i` flag and no `id`/`formats` yet. Source is `tools/gen-config/src/registry.ts:57–60` (`V12_DETECTORS`).
- `language-service/src/generated/facets.gen.ts:175–178` has the four rows, each with `id` = its type for now.
- `conformance/src/detection.spec.ts:79–82`, `dev/src/fixture-discovery.ts:47` (`railroad: [4 types]`), `plugin-hand-drawn/src/generated/config-fragment.ts:210` (`railroad.look`).
- Order pins: `mermaid/src/treemap.spec.ts:57–60` (railroad right after treemap) and `venn.spec.ts:63–65` (venn right after railroadPeg).

## 12. Oracle

- `packages/conformance/package.json:59–60`: `mermaid-parser-v12` = `npm:@mermaid-js/parser@2.0.1`, `mermaid-v12` = `npm:mermaid@^12.2.0`. Both resolve to 12.2.0 / 2.0.1, and mermaid's own `@mermaid-js/parser` symlink is `@mermaid-js+parser@2.0.1`, so the D213 version check holds.
- `src/oracle.ts:61–104` loads `mermaid-v12`, patches DOMPurify to identity L67–74, then `parse` → `mermaidAPI.getDiagramFromText`.
- `src/langium-lexer.ts`: `LANGIUM_LEXERS` L32–45 is `{probe, factory, key}`. `load` L153–187 calls `parserModule[factory]()[key].parser.Lexer` L154–161, gets v12's parser via `getDiagramFromText(probe).parser` and wraps `parse` to capture the input L166–172. `lexWith` L189–208 cuts at the first error.
- **Exports confirmed** in the installed 2.0.1: `createRailroadServices` (key `Railroad`), `createRailroadEbnfServices` (`RailroadEbnf`), `createRailroadAbnfServices` (`RailroadAbnf`), `createRailroadPegServices` (`RailroadPeg`), plus `Railroad{,Ebnf,Abnf,Peg}{Module,GeneratedModule}`. In each, `services.parser.Lexer` has `tokenize`, `definition`, `tokenTypes` and `chevrotainLexer`, so the existing `load` works unchanged. Each row's probe must reach its own parser, because the four v12 parser objects are distinct.
- Probes (oracle, no DOM shim):
  - each header parses to `railroad`/`railroadEbnf`/`railroadAbnf`/`railroadPeg`, and the captured input has `\n` appended;
  - `RAILROAD-EBNF-BETA` is detected, reaches the EBNF parser, then is rejected ("Expecting token of type 'railr…");
  - `titleCase = …` gives rule `Case`; `railroad-beta title x` gives title `x` and 0 rules;
  - ABNF `a = "x" ; b = "y" ;` is rejected;
  - duplicate `a` gives both rules in `getRules()`;
  - EBNF `b - c` gives `sequence[b, terminal '-', c]` nested inside the outer sequence;
  - PEG `!(a b) &x .` gives `special '!(...)'`, `'&x'` and `'.'`;
  - ABNF `3*5x` gives `repetition{min 3, max 5}`;
  - `accTitle:   t` gives `t`, and `accDescr {\n  a\n   b\n}` gives `a\nb`.
- **Surprises:**
  - All four types share one DB, which the oracle returns as `db`. It is valid only until the next parse, which is fine, but every type's snapshot reads the same object.
  - Langium gave punctuation keywords LONGER_ALTs to hidden or other terminals (EBNF `(`/`?`/`-`, ABNF `;`). The v13 lexers must copy these to match.
  - `max: Infinity` comes back as JSON `null`.
