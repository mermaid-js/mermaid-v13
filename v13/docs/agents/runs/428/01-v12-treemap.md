# 01 — v12 treemap pointer notes (spec #428)

**Refs.** Read with `git show fa796a943:<path>` (the harvest commit). `M=packages/mermaid/src/diagrams/treemap`, `G=packages/parser/src/language/treemap`, `R=packages/mermaid/src`. Everything is code-read; nothing probed. Oracle: `packages/conformance/node_modules/mermaid-v12` is 12.2.0, whose only treemap code is bundled in `dist/mermaid.js` (no `treemap-*.mjs` chunk).
Files: `$M/{db,detector,diagram,parser,renderer,styles,types,utils}.ts`, `$M/utils.test.ts`; `$G/{treemap.langium,tokenBuilder,valueConverter,treemap-validator,module,index}.ts`. Registered at `$R/diagram-api/diagram-orchestration.ts:33,116`; parser at `packages/parser/src/parse.ts:100`, `langium-config.json:45`.

## 1. Grammar — `$G/treemap.langium` (90 lines)

- L44–50 `entry Treemap`: `TREEMAP_KEYWORD (TitleAndAccessibilities | TreemapRows+=TreemapRow)*`. L50 `TREEMAP_KEYWORD` is a terminal `'treemap-beta' | 'treemap'`. Detector `$M/detector.ts:10` `/^\s*treemap/` (matches both, and `treemapfoo`). The v13 gen rows already carry it: `registry.gen.ts:143`, `detectors.gen.ts:34`.
- L13–21 title/accTitle/accDescr: same three terminals as the other Langium diagrams (`ACC_DESCR` L19, `ACC_TITLE` L20, `TITLE` L21). Interface L40 says `accDescr`, `TreemapAst` (`types.ts:60`) says `accDescription`; `populateCommonDb` bridges.
- Terminals, in file order: L52 `CLASS_DEF` (`classDef\s+<id of 2+ chars>(\s+<[^;\r\n]*>)?;?`: a one-letter class name does not lex); L53 `:::`; L54 `:`; L55 `,`; L58 `INDENTATION` `/[ \t]{1,}/`; L60–62 hidden `WS`, `ML_COMMENT` (`%%[^\n]*`), `NL`; L82 `ID2`; L84 `NUMBER2` `/[0-9_\.\,]+/` (so `1_000`, `1.2.3`, `,` alone lex); L89 `STRING2` `"…"|'…'` (no escapes, may span lines).
- `INDENTATION` is declared before the hidden `WS` with the same class, so it wins every space run, not just line starts. That is why `Leaf` (L78) allows `INDENTATION?` around the separator. Unprobed: check how trailing blanks and a blank-only line lex.
- Rules: L64 `TreemapRow: indent=INDENTATION? (item=Item | ClassDef)`. L71 `Item: Leaf | Section`. L75 `Section: name=STRING2 (':::' classSelector=ID2)?`. L78 `Leaf: name=STRING2 INDENTATION? (':'|',') INDENTATION? value=MyNumber (':::' ID2)?`. L87 `MyNumber returns number: NUMBER2`. The unquoted-name form does not exist: every name is a quoted string.
- `$G/tokenBuilder.ts:5` `super(['treemap'])`: only `treemap` is a keyword (not `treemap-beta`; that is the terminal).
- Validator `$G/treemap-validator.ts:30` `checkSingleRoot` ("Multiple root nodes are not allowed") is registered in `module.ts:88`, but `parse.ts:146` fails only on lexer and parser errors, so it **never runs**: `treemap.test.ts:92` parses `"Root1"\n"Root2"` fine. `getRoot` (`db.ts:46`) wraps all level-0 rows in a nameless synthetic root.

## 2. Value converter — `$G/valueConverter.ts` (44 lines)

- L13 `NUMBER2` → `parseFloat(input.replace(/,/g,''))`. So `1,234` → 1234, `1.2.3` → 1.2, `_` or `,` alone → `NaN`. No `_` stripping.
- L16 `SEPARATOR` and L19 `STRING2` strip the first and last char. `SEPARATOR` is used as a keyword in `Leaf`, so its branch is dead for `:` (it would return `''`).
- L22 `INDENTATION` → `input.length` (a tab counts 1). The parser re-`parseInt`s it (`$M/parser.ts:42`).
- L24–40 `ClassDef` (rule, not terminal) → `{$type:'ClassDefStatement', className, styleText}` via `classDefRegex` L5; `styleText` is `undefined` when absent. Such a row has no `item`.
- Title/accessibility terminals go through the shared `common/valueConverter.ts:6–9`.

## 3. DB and tree building

- `$M/parser.ts` (108 lines): L28–32 first pass collects every `classDef` (so a class can be used before it is defined). L35–59 second pass: `level = indent ? parseInt(indent) : 0`; `name = item.name ? String(name) : ''` (L82); `cssCompiledStyles` = the class's `styles`, or `undefined` when empty. L62 `buildHierarchy`; L65–74 `addNode` over the flattened tree with depth as level. L96–101 throws unless `yy` is a `TreeMapDB`.
- `$M/utils.ts` (64 lines) `buildHierarchy`: stack of `{node, level}`. L28 only a `Leaf` has `children: undefined`; a `Section` starts `[]`. L40 pops while `top.level >= item.level`, so indent is relative and any width works; a deeper-than-parent row nests one level. L35 `value` is set only on a `Leaf`. L58 a leaf never goes on the stack, so a row indented under a leaf attaches to the leaf's parent.
- `$M/db.ts` (95 lines): L37 `addNode` (`nodes`, `levels`, `outerNodes`; `root ??=` unused). L50–70 `addClass`: L52 swaps `\,` for a placeholder, then `,` → `;`, then splits on `;`. L55 `isLabelStyle` (`handDrawnShapeStyles.ts:53`) sends the label-ish keys into `textStyles` as well as `styles`. Style strings are not trimmed. L28–35 `getConfig` = `cleanAndMerge(defaults.treemap, userConfig.treemap)`. L89–94 acc/title setters are `commonDb`'s.
- `$M/types.ts` (80 lines): `TreemapNode`, `TreemapDiagramConfig` (L70; `borderWidth`, `valueFontSize`, `labelFontSize` are declared and never read by the renderer), `TreemapStyleOptions` L22.
- `$M/utils.test.ts`: 4 `it`s (empty input, flat roots, nested sections, leaf values).

## 4. Renderer — `$M/renderer.ts` (535 lines)

- L11 imports `scaleOrdinal, treemap, hierarchy, format, select` from `d3`. L17–19 constants: `DEFAULT_INNER_PADDING 10`, `SECTION_INNER_PADDING 10`, `SECTION_HEADER_HEIGHT 25`.
- Size L40–44: `width = nodeWidth·10` (default 1000, not the 960 fallback), `height = nodeHeight·10` (400), `titleHeight = title ? 30 : 0`. L47 `viewBox 0 0 W H+title`, L48 `configureSvgSize`. **L525–526 `setupViewPortForSVG(svg, diagramPadding ?? 8, 'flowchart', useMaxWidth||false)` then overwrites the viewBox** with the content bbox plus padding.
- Colours L80–123: three `scaleOrdinal` ranges. `colorScale` and `colorScalePeer` start with `'transparent'`, then `cScale0..11` / `cScalePeer0..11` (13 entries); `colorScaleLabel` is `cScaleLabel0..11` (12). The domain is filled lazily, in first-call order, keyed by node **name** (equal names share a colour; the first colour requested gets `transparent`). Order of first use: all sections (pre-order), then leaves via their parent, then labels.
- Layout L144–161: `hierarchy(root).sum(value ?? 0).sort(desc by value)`. `treemap().size([W,H]).paddingInner(config.padding ?? 10).round(true)`; `paddingTop/Left/Right/Bottom` apply only to nodes with children: top 25+10, sides and bottom 10. Default tiling (squarify, ratio φ).
- Sections L164–309: `g.treemapSection` per branch (including the synthetic root, `depth 0`, which gets `display:none` on header, rect, label and value). Header rect L175 (`treemapSectionHeader`, `fill none`). Clip path **L193 `clip-section-${id}-${i}`** (width `x1−x0−12`, height 25). Main rect L199 class `treemapSection section${i}`, fill `colorScale(name)` opacity .6, stroke `colorScalePeer(name)` width 2 opacity .4, plus `styles2String(...)` node and border styles inline. Label L219: x 6, y 12.5, bold 12px, `fill: colorScaleLabel(name)`, class styles with `color:`→`fill:`. L240–284 truncation: reserve `30+10` for the value (when `showValues !== false && d.value`), min width 15, drop one char at a time with `...` until `getComputedTextLength` fits, else `''`. Value text L287 (`showValues`): x `w−10`, anchor end, 10px italic.
- Leaves L312–355: `isComplexTreemap = leaves > 20` (L314) switches the constants L316–322 (base label 16/38, value 14/28, min label 4/8, min value 4/6, pad 2/4, threshold 8/10, gap 1/2). Group class `treemapNode treemapLeafGroup leaf${i}[ ${classSelector}]x` (the literal trailing `x` is a v12 quirk, L330). Rect: fill and stroke both `colorScale(parent.name)`, fill-opacity .3, stroke-width 3, class styles inline. Clip path **L360 `clip-${id}-${i}`**, size `w−4` by `h−4`.
- Label fitting L383–455 (needs real text metrics): hide if either available dim `< threshold` (avail = dim − 2·pad); shrink the font by 1px while the text is wider than avail and above the min; then shrink until label + gap + value font fits the height; final hide check differs between simple and complex. Value font = `clamp(round(label·0.6), minValue, baseValue)`; its y is `h/2 + labelFont/2 + gap`; hidden when the label is hidden, wider than avail, or `y + font > h − 4`.
- Value format L50–77 (`format` = d3-format): default `,`. `'$0,0'` → `'$' + format(',')`. Starts with `$` and contains `,` → `'$' + format(',' + first /\.\d+/ match)` (so `$,.2f` becomes `,.2` with **no `f`**, i.e. the type is dropped; unprobed whether that prints as `.2` precision-only). Other `$…` → `'$' + format(rest || '')`. Else `format(str)`. A throw (bad specifier) falls back to `format(',')`. A zero or absent value prints `''`.
- `getClasses` L529 returns the db's classDef map (the renderer's only extra export).

## 5. Styles — `$M/styles.ts` (58 lines)

- Takes effect: `.treemapTitle` (fill `titleColor`, 14px). That is all, plus the weak fallbacks below.
- Dead: `.treemapNode.section` and `.treemapNode.leaf` (no element has both classes: sections are `.treemapSection`, leaves `.treemapNode.treemapLeafGroup`). `.treemapLabel` and `.treemapValue` set fill and size, but both are overridden by the inline `style` the renderer writes (L372, L467). `labelColor`/`valueColor` default to `themeVariables.textColor`. The config-sourced `valueFontSize`/`labelFontSize` (12/14) never reach them.

## 6. Config and themes

- `$R/defaultConfig.ts:326–337` block: `useMaxWidth true, padding 10, diagramPadding 8, showValues true, nodeWidth 100, nodeHeight 40, borderWidth 1, valueFontSize 12, labelFontSize 14, valueFormat ','`. It is hand-written there; no `config.schema.yaml` entry.
- `cScalePeer` per theme (`$R/themes/theme-*.js`):
  - `lighten(cScaleN,10)` unconditionally: `dark` L225.
  - `darkMode ? lighten : darken` by 10: `base` L185/187, `neutral` L172/174, `neo` L205/207, `neo-dark` L218/220, `redux` L206/208, `redux-dark` L232/234, `redux-color` L276/278, `redux-dark-color` L279/281.
  - `darken(cScaleN,25)` after `cScaleN = darken(cScaleN,10)`, with peers 1 and 2 pre-set to `darken(secondaryColor,45)` and `darken(tertiaryColor,40)`: `default` L162–167, `forest` L138–143.
  - All use `||`, so an explicit `cScalePeerN` wins. `cScaleLabel` is separate (`scaleLabelColor`, or inverted `labelTextColor` for 0 and 3 in `default`; `cScale1` for 0 and 2 in `neutral`; `darken(cScaleN,75)` in `redux-dark-color` L289). The renderer reads `getConfig().themeVariables`, i.e. the resolved theme.
  - `theme-redux-color-superset.spec.ts:42` lists treemap among the categorical-scale consumers.

## 7. Tests, docs, corpus

- `packages/parser/tests/treemap.test.ts`: **17** `it`s (basic 3, data types 2, validation 1, title/acc 4, classDef and `:::` 7). No renderer spec and no db spec exist.
- `$R/rendering-util/multi-diagram-id-uniqueness.spec.ts:113` has a treemap snippet (two sections, three leaves) for the clipPath-id uniqueness check (ids at renderer L193 and L360). `diagram-beta-policy.spec.ts:59` lists `treemap` as graduated.
- `$R/docs/syntax/treemap.md`: **8** `mermaid-example` fences (L48, 60, 74, 96, 112, 130, 182, 201) and 2 plain fences (L24, L33). Sections: syntax, `classDef`, theme config, diagram padding, options table (L145), value formatting (L164). `packages/examples/src/examples/treemap.ts`: 2 `code:` entries, header `treemap-beta`. `demos/treemap.html` has 2 diagrams.
- Corpus `e2e/diagrams/treemap/` (worktree): `nightly-check` 16, `pr-check` 10, `visual-check` 0 (+ `.gitkeep`) = **26** `.mmd`. Also `e2e/platform/dev-diagrams/knsv/knsv2-02-treemap.mmd`.

## 8. v13 pointers

- `packages/conformance/src/langium-lexer.ts:32` `LANGIUM_LEXERS` (rows `radar` L33 … `cynefin`): add `treemap: { probe: 'treemap-beta\n"a": 1', factory: 'createTreemapServices', key: 'Treemap' }`.
- `packages/conformance/src/cli/harvest-v12.ts:39` `HARVESTS`: `radar` L67 is the model (`header`, `files`, `docs`). Treemap files: `$M/utils.test.ts`, `packages/parser/tests/treemap.test.ts`, `packages/examples/src/examples/treemap.ts`, `multi-diagram-id-uniqueness.spec.ts`; docs `$R/docs/syntax/treemap.md`.
- `packages/conformance/src/registry.ts:27` `PARITY_SUITES`: radar entry L128–132 (`adapter`, `corpusDirs ['e2e/diagrams/radar']`, `corpusFiles [corpus/radar-v12-specs.json]`).
- Nearest example, `packages/diagram-radar/` (Langium-lexed, d3-free): `grammar/radar.ebnf` + `grammar/generated/`, `src/{plugin,language,model,config,labels,index,testing,test-context}.ts`, `src/parser/{ast,convert,detect,lexer,normalise,parser,tokens,index}.ts`, `src/layout/*`, `src/render/{render,paint,index}.ts`, `src/generated/{docs,config-defaults,categories}.ts`, `src/v12-specs/{adapter,radar.spec,langium-radar.spec}.ts`, `scripts/port-v12-specs.ts`. Conformance side: `packages/conformance/src/radar/` (`corpus`, `v12`, `v13`, `parity.spec`, `lexer-parity.spec`, `render.spec`, `theme.spec`, …).
- **d3 resolution.** From `packages/conformance`, `require.resolve('d3-hierarchy')` and `('d3-format')` both **fail**; its `package.json` has no `d3*` dependency (only `mermaid-v12`). From the oracle dir (`node_modules/.pnpm/mermaid@12.2.0/node_modules/mermaid`) `d3` resolves to **7.9.0**, which depends on `d3-hierarchy` **3.1.2** and `d3-format` **3.1.2** (both in `node_modules/.pnpm`, hoisted under `d3@7.9.0/node_modules`). The treemap package has zero dependencies (R-PERF-2) and re-implements both; T3's oracle specs reach the real ones through the conformance package (resolve them from the `mermaid-v12` dir with `createRequire`, or add them as conformance dev dependencies pinned to 3.1.2).
