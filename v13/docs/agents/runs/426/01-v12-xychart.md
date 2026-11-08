# 01 — v12 xychart, pointers (fa796a943)
Read a file with `git show fa796a943:packages/mermaid/src/diagrams/xychart/<path>` (abbreviated `X/` below). 24 files, 3,383 lines incl. specs.

## 0. Oracle = fa796a943, checked
- `packages/conformance/package.json:51` `"mermaid-v12": "npm:mermaid@^12.2.0"`; resolves to `node_modules/.pnpm/mermaid@12.2.0/…/mermaid` (`package.json` `"version": "12.2.0"`).
- Checked by extracting `sourcesContent` from `dist/chunks/mermaid.core/xychartDiagram-4URNHDU4.mjs.map`: all 16 `.ts` sources are **byte-identical** to fa796a943. The `.jison` there is the generated parser; its `rules:` array matches `X/parser/xychart.jison` rule for rule.
- The generated lexer shows what jison really built (use this, not the .jison text, when reasoning):
  - `\b` is added to `title`, `xychart-beta`, `xychart`, `x-axis`, `y-axis`, `line`, `bar` (all `/i`). **`vertical|horizontal` gets no `\b`**: `xychart verticalx` lexes `CHART_ORIENTATION` + `ALPHA`.
  - **jison.jison L51–53 collapse into one garbage rule** (#26): the `(?:"\`)` quote is never closed, so the rule's regex is the literal text of L51–53. So no `md_string` push, no `MD_STR`, and a bare backtick is a lexical error (spec's "MD_STR unreachable").
  - acc rules became `(?!\n||)*[^\n]*` (the `;|#` was lost): `accTitle: a ; b` keeps `a ; b`.
  - State `title` (`%x`, L6) has no rules and is never pushed. `title` text is lexed as ordinary tokens.

## 1. Lexer — `X/parser/xychart.jison` (177 lines)
- L2 `case-insensitive`. Exclusive: `string md_string title acc_title acc_descr acc_descr_multiline` L4–9. Inclusive: `axis_data axis_band_data data data_inner` L10–13.
- Rules in order (line → token):
  - L15 `%%(?!\{)[^\n]*` skip; **L16 `[^\}]%%[^\n]*` skip, which eats the char before `%%`** (`]%% c` loses `]`).
  - L17 `<axis_data>\r?\n` pop+NEWLINE; L18 `<data>\r?\n` pop+NEWLINE; L19 `[\n\r]+` NEWLINE; L20 `%%[^\n]*` skip.
  - L22 `title`; L24/25 `accTitle\s*:\s*` → `acc_title_value`; L26/27 `accDescr\s*:\s*`; L28–30 `accDescr\s*{` multiline (`}` pops, `[^\}]*` value).
  - L32 `xychart-beta`, L33 `xychart` → `XYCHART`; L34 `vertical|horizontal` → `CHART_ORIENTATION`.
  - L36/37 `x-axis`/`y-axis` push `axis_data`; L38 `<axis_data>[` push `axis_band_data`; L39 `<axis_data>-->` `ARROW_DELIMITER`.
  - L42/43 `line`/`bar` push `data`; L44 `<data>[` push `data_inner`.
  - L45 `<axis_data,data_inner>[+-]?(?:\d+(?:\.\d+)?|\.\d+)` `NUMBER_WITH_DECIMAL`; L46 `<data_inner,axis_band_data>]` pop.
  - L51–53 md_string (dead, §0); L54–56 `"` string, `[^"]*` → `STR` (an unterminated `"` swallows to EOF).
  - L59 `[`, L60 `]`, L61 `[A-Za-z]+` ALPHA, L62 `:` COLON, L63 `+`, L64 `,`, L65 `=`, L66 `*`, L67 `#` BRKT, L68 `_`, L69 `.`, L70 `&`, L71 `-` MINUS, L72 `[0-9]+` NUM, L73 `\s+` skip, L74 `;` SEMI, L75 EOF.
- State quirks: `;` pops nothing; `data` only pops at a newline, so `line [1] ; bar [2]` stacks `data` twice (harmless, inclusive). **Inside `axis_data` a digit run is `NUMBER_WITH_DECIMAL` (L45 before L72), not `NUM`**, so `x-axis Year2024 [a]` fails (NUMBER is not an `alphaNumToken`), while `bar Q1 2024 [1]` (state `data`) gives `NUM`. `COLON` and `COMMA` are not `alphaNumToken`s.

## 2. Grammar — same file
- `start` L83–88; `chartConfig` L90–92 (`setOrientation`); `document` L94–97; `statement` L99–111 (title L101 `.trim()`, axes L102–103, line L104–105, bar L106–107, acc L108–110).
- `plotData` L113–115, `dataPoints` L117–120 (right-recursive), `dataPoint` L122–125 (`{value: Number, label}`).
- `parseXAxis` L127–131 (no title → `setXAxisTitle({text:''})`), `xAxisData` L133–136 (band or `N --> N`), `bandData` L138–140, `commaSeparatedTexts` L142–145, `parseYAxis` L147–151, `yAxisData` L153–155.
- `eol` L157–161 (NEWLINE | SEMI | EOF); `text` L164–167; `alphaNum` L169–172 joins with `''` (no blanks); `alphaNumToken` L175.

## 3. DB — `X/xychartDb.ts` (255 lines)
- Module state L26–35: `plotIndex`, `tmpSVGGroup`, config, theme, data, `plotColorPalette` (split on `,` + trim), `hasSetXAxis`, `hasSetYAxis`.
- Theme merge `getChartDefaultThemeConfig` L42–46: `cleanAndMerge(theme-default getThemeVariables().xyChart, config.themeVariables.xyChart)`; config merge L47–53 `cleanAndMerge(defaultConfig.xyChart, config.xyChart)`.
- Default data L55–71: y linear `Infinity/-Infinity`, x **band with no categories**, title `''`.
- Setters: `textSanitizer` L73 (trim + `sanitizeText`); `setOrientation` L81 (anything not `horizontal` → `vertical`); `setXAxisTitle` L88; `setXAxisRangeData` L91 (sets `hasSetXAxis`); `setXAxisBand` L95; `setYAxisTitle` L103; `setYAxisRangeData` L106; `setYAxisRangeFromPlotData` L112–123 (widens min/max, no flag).
- **Order-dependent core `transformDataWithoutCategory` L125–164**:
  - L130–134: no x axis yet → `setXAxisRangeData(min(prev,1), max(prev,len))`, **which sets `hasSetXAxis = true` (L93)**, so the inferred range comes from the **first** plot only, not the longest (the spec wording "longest" needs an oracle probe).
  - L139–141 truncate to band category count; L143–145 y range from the truncated data; L147–149 band → `[cat, data[i]]` (missing → `undefined`); L151–161 linear → evenly spaced string x (`${min}` for one point).
- `getPlotColorFromPalette` L166–168 (`i % len`). `setLineData` L175–189 (`strokeWidth: 2` L184; `pointLabels` only if any label non-empty L186). `setBarData` L191–201 (labels dropped).
- `getDrawableElem` L203–209: throws `No Plot to render, please provide a plot with some data` L205; sets `title = getDiagramTitle()` L207. Getters L211–221; `clear` L223–232; export L234–255.
- Detector `X/xychartDetector.ts:10` `/^\s*xychart(-beta)?/` (case-sensitive). `X/xychartDiagram.ts` has no `styles`.

## 4. chartBuilder — orchestrator (`X/chartBuilder/orchestrator.ts`, 218 lines)
- Components built L32–58 (title, plot, legend, xAxis, yAxis; axis colours from theme L40–55).
- Vertical `calculateVerticalSpace` L61–128, in this order:
  1. plot gets `floor(w*pct/100)`, `floor(h*pct/100)` L67–76;
  2. title gets the full `width` and the remaining height L78–83 (`plotY`);
  3. x axis `bottom` L84–89, from the remaining width/height;
  4. y axis `left` L90–96 (`plotX`);
  5. legend L97–101, given the remaining width and **`chartHeight`**;
  6. leftovers go to the plot L102–113; positions L115–124; `recalculateOuterPaddingToDrawBar` if any bar L125–127.
- Horizontal L130–199: same order, x axis `left` L154, y axis `top` L161, `plotY = titleYEnd + yAxisHeight` L167.
- `getDrawableElement` L209–217 emits in component order title, plot, legend, xAxis, yAxis (L213, `Object.values`).
- `X/chartBuilder/index.ts:6–14` `XYChartBuilder.build`. Types `X/chartBuilder/interfaces.ts` (theme L8–22, config L87–117, data L119–124, elems L138+).

## 5. Components (`X/chartBuilder/components/`)
- `axis/baseAxis.ts` (446): `BAR_WIDTH_TO_TICK_WIDTH_RATIO = 0.7` **L12**, `MAX_OUTER_PADDING_PERCENT_FOR_WRT_LABEL = 0.2` **L13**.
  - **`labelRotation` outside [-90, 90] becomes 0, not clamped** (L37–40).
  - `getRange` L53 (range ± outerPadding); `getTickDistance` L68 (range / tick count, duplicates counted); `recalculateOuterPaddingToDrawBar` L84–89 (`floor(0.7*dist/2)`).
  - Horizontal space L91–136, drop order axis line → labels (outerPadding = min(w/2, 0.2·width) L99–100; rotated height L103–109; + 2·labelPadding) → tick → title. Vertical L138–172: same order, label padding from the label height L147.
  - Draw: left L201–276 (class `axisl-line` L207; title rotate 270 L268); bottom L277–353 (label offset by rotation L301/L307, `calculateOffsetByRotation` L192–199); top L354–429; `right` throws L436.
- `axis/bandAxis.ts` (45): `scaleBand().paddingInner(1).paddingOuter(0).align(0.5)` L29–34; unknown value → `range[0]` L43.
- `axis/linearAxis.ts` (38): `scale.ticks()` (default 10) L24; **domain reversed when position `left`** L29–31 (y vertical, and x in horizontal charts). `axis/index.ts:24–47` `getAxis`.
- `plot/barPlot.ts` (60): `barPaddingPercent = 0.05` **L20**; `barWidth = min(outerPadding*2, tickDistance)*0.95` L22–24; vertical bars run from the value to the **plot bottom** (L52, not from 0), horizontal from the plot's left edge L33–36; `strokeWidth: 0` L38/L54.
- `plot/linePlot.ts` (95): d3 `line()` L22–28 (x/y swapped when horizontal); `labelOffset = 10` **L49**, `fontSize = 12` **L50**; empty label skipped L55; group `labels` L86.
- `plot/index.ts` (97): plot class index = position in `plots` across both kinds (L58, `bar-plot-1` can follow `line-plot-0`).
- `legend.ts` (167): `LEGEND_MARKER_TO_FONT_RATIO = 0.75` **L18**, `ITEM_SPACING = 0.5` **L19**, `MARKER_SPACING = 0.35` **L20**; named plots only L55–57; width/height L73–78 (rows use `fontSize`, not measured height); dropped whole if it does not fit L80–87; markers rect (bar) / path (line) L109–128; labels L141–154.
- `chartTitle.ts` (105): needs `height + 2*titlePadding <= available`, `showTitle`, non-empty title L42–53; `alignTo` L64–72 centres over the plot, clamped inside `width`.
- `textDimensionCalculator.ts` (46): no SVG group → `len*fontSize` × `fontSize` L12–17; else a hidden `g` with `font-size` only (**no font-family**) L24–27, divided by `getScreenCTM` scale L31–34.

## 6. Renderer — `X/xychartRenderer.ts` (262 lines)
- **L17 `labelData = plots[0].data.map(d => d[1])`**: every bar plot's data labels show plot 0's values. The `.toString()` (L113, L165) runs before the size filter, so an `undefined` value (missing band point) or a shorter plot 0 throws.
- `g.main` L33; `rect.background` L34–38 fill L45; **`configureSvgSize(svg, height, width, true)` L41 hard-codes useMaxWidth**; `viewBox 0 0 w h` L43; `g.mermaid-tmp-group` L47.
- `getGroup` L63–78 nests `g.<class>` by prefix. Empty-data shapes skipped L81.
- `rect` L88–100. **Data labels run for every `rect` shape (L102), so legend bar markers get labels too.** Horizontal L105–159: `charWidthFactor 0.7` L107, `rightMargin 10` L109, start `0.7*height` and step −1 L127–135, uniform `floor(min)` L138, anchor start/end L155. Vertical L160–226: `yOffset 10` L161, start `width/(len*0.7)` L193, baseline `auto`/`hanging` L222. Fill `dataLabelColor`, `font-size: Npx`.
- `text` L229–244: `x=0 y=0` + `transform translate() rotate()` L27, baseline `text-before-edge` for `top` L19, anchor L23. `path` L245–255 (fill `none` unless set).

## 7. Config schema — `fa796a943:packages/mermaid/src/schemas/config.schema.yaml`
- Top level `xyChart:` L417–418. `XYChartAxisConfig` **L1427–1503** (all required L1432–1444): showLabel true, labelFontSize 14, labelPadding 5, showTitle true, titleFontSize 16, titlePadding 5, showTick true, tickLength 5, tickWidth 2, showAxisLine true, axisLineWidth 2, labelRotation 0 (L1497, min −90 max 90).
- `XYChartConfig` **L1504–1582**, `allOf BaseDiagramConfig`, `unevaluatedProperties: false`: width 700 L1521, height 500 L1526, titleFontSize 20, titlePadding 10, showDataLabel false L1541, showDataLabelOutsideBar false, showTitle true, showLegend true L1553, legendFontSize 14, legendPadding 10 L1562, xAxis/yAxis L1567/L1570, chartOrientation `vertical` L1573, plotReservedSpacePercent 50 (min 30) L1577.
- `useMaxWidth` default true at `BaseDiagramConfig` L483–489 (ignored by the renderer, §6). `useWidth` L481.

## 8. Theme blocks (`fa796a943:packages/mermaid/src/themes/`)
Every block: `backgroundColor ← background`, the 11 others `← primaryTextColor`, each `this.xyChart?.<k> ||` first.

| file | block lines | palette line |
| --- | --- | --- |
| theme-default.js | 374–390 | 389 |
| theme-base.js | 341–357 | 356 |
| theme-dark.js | 310–326 | 325 |
| theme-forest.js | 346–362 | 361 |
| theme-neutral.js | 331–347 | 346 |
| theme-redux.js / -color / -dark / -dark-color | 297 / 368 / 323 / 385 | 311 / 382 / 337 / 399 |
| theme-neo.js / neo-dark.js | 296 / 309 | 310 / 323 |

The six redux/neo blocks have **no `dataLabelColor`** (falls back to theme-default's via the DB merge, §3). Palettes verbatim:

- default: `#ECECFF,#8493A6,#FFC3A0,#DCDDE1,#B8E994,#D1A36F,#C3CDE6,#FFB6C1,#496078,#F8F3E3`
- base, all four redux, neo, neo-dark: `#FFF4DD,#FFD8B1,#FFA07A,#ECEFF1,#D6DBDF,#C3E0A8,#FFB6A4,#FFD74D,#738FA7,#FFFFF0`
- dark: `#3498db,#2ecc71,#e74c3c,#f1c40f,#bdc3c7,#ffffff,#34495e,#9b59b6,#1abc9c,#e67e22`
- forest: `#CDE498,#FF6B6B,#A0D2DB,#D7BDE2,#F0F0F0,#FFC3A0,#7FD8BE,#FF9A8B,#FAF3E0,#FFF176`
- neutral: `#EEE,#6BB8E4,#8ACB88,#C7ACD6,#E8DCC2,#FFB2A8,#FFF380,#7E8D91,#FFD8B1,#FAF3E0`
- `themes/theme-xychart.spec.js` (12 lines): one `it.each` over all themes, `legendTextColor === primaryTextColor`. `applyOverride` at `themes/theme-helpers.js:15`.

## 9. v12 specs and case counts
| file | cases | note |
| --- | --- | --- |
| `X/parser/xychart.jison.spec.ts` (572) | 58 `it` (3 describes: main L37, `point labels` L471, `accessibility` L534) | mock `yy` L12–24, so it asserts setter calls; harvest gives text only |
| `X/xychartDb.spec.ts` (126) | 6 | sanitized titles L21; band truncation L42–124 |
| `X/chartBuilder/components/chartTitle.spec.ts` (151) | 8 | |
| `X/chartBuilder/components/legend.spec.ts` (203) | 3 | |
| `X/chartBuilder/textDimensionCalculator.spec.ts` (43) | 3 | |
| `themes/theme-xychart.spec.js` | 1 `it.each` (all themes) | |
- There is no renderer unit spec. Browser spec `e2e/rendering/xychart/nightly-check/xyChart.spec.js` (15 `test`, same on this branch) checks bar/label pairing on `g.bar-plot-0`.

## 10. Docs
`fa796a943:packages/mermaid/src/docs/syntax/xyChart.md` (286 lines, 8 `mermaid-example`; generated copy `docs/syntax/xyChart.md`, 386). Neither is on this branch. Sections: Orientations L28, Title L37, x-axis L53, y-axis L62, Line L75, Bar L84, Legend (v11.17) L93, Config table L116 (`showDataLabel` L132), AxisConfig L135 (`labelRotation` "only bottom X axis" L150), Theme variables L152, palette colours L181, data labels (v11.14) L206, point labels (v11.16) L239. Demo `demos/xychart.html`; example `packages/examples/src/examples/xychart.ts`.

## 11. Corpus — `e2e/diagrams/xychart/` (48 .mmd, file list identical to fa796a943)
`nightly-check/` 38, `pr-check/` 10 (`.gitkeep` in `pr-check/` and `visual-check/`). Many carry a front-matter `description:`.

| group (files) | covers |
| --- | --- |
| simplest (`should-render-the-simplest-possible-xy{,-beta}-chart`) | header alone + one line, both keywords |
| data labels (`data-labels-*` 6, `*-with-label(s)*` 8, `*-without-labels-by-default` 2, `*-negative-and-decimal-*` 2) | `showDataLabel`, `showDataLabelOutsideBar`, both orientations, below-floor values, 1 and 20 bars |
| point labels (`*-point-labels` 2, `*-mixed-labels-*`, `*-only-one-has-labels`) | `line [5 "x"]`, sparse labels, `xychart horizontal` |
| axis toggles (`render-with-show-axis-{label,tick,title,line}-false`) | per-axis `show*` config |
| rotation (`rotated-label-45-degrees`, `label-rotation-clamped-{above,below}-limit`) | `labelRotation` 45, 120, −100 (→ 0) |
| sparklines (`render-spark-{bar,line}-*`) | 200×20, dark, everything hidden, `plotReservedSpacePercent: 100` |
| fit (`should-drop-the-title-…-too-short`, `should-keep-legend-inside-…`) | 1200×60 title drop; width 4000 legend |
| legends (`legends-for-named-plots`, `multiple-plots-can-be-rendered`) | named line+bar markers; 6 unnamed plots |
| ranges (`correct-distances-…`, `x-axis-range-same-value`, `*-without-y-axis-with-different-range`, `decimals-and-negative-…`) | `0 --> 2` with 4 points, `0 --> 0`, inferred y, negatives |
| optional titles (`x-axis-title-not-required`, `y-axis-title-not-required`, `should-render-a-chart-without-title`, `should-render-a-complete-chart`) | axis forms with and without titles |
| config (`should-use-all-the-config-from-{directive,yaml}`, `render-all-the-theme-color`) | `%%{init}`, YAML config + forest, every `xyChart.*` theme var |

## 12. Tick models available locally
- **Pele `pele@1.13.0` is local** (`node_modules/.pnpm/pele@1.13.0/node_modules/pele`, a `packages/bench/package.json:44` dep) but ships **no `ticks.ts` source**: only `dist/diagrams/xychart/ticks.d.ts` (`tickStep(span,count)`, `tickIndex`, `tickValue`, `ticksBetween(lo,hi,step)`) and minified `dist/esm/chunks/364JUB4J.js` (`function se` uses thresholds 7.07/3.16/1.41, i.e. rounded √50/√10/√2, and caps at 100 ticks). It is a model, not exact d3.
- **The exact oracle is local too**: `node_modules/.pnpm/d3-array@3.2.4/node_modules/d3-array/src/ticks.js` (55 lines: `e10/e5/e2` L1–3, `tickSpec` L5, `ticks` L29, `tickIncrement` L46) and `d3-scale@4.0.2/src/band.js` (`rescale` L20–31: `step = span / max(1, n − pInner + 2·pOuter)`, so with `paddingInner(1)` the band is a point scale, one category centred).
