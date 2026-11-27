## Event modeling

The event modeling parser accepts the v12 language, `eventmodeling` (oracle parity over every e2e
fixture, the v12 spec strings and the syntax page; grammar in
[syntax/eventmodeling.md](./syntax/eventmodeling.md)). Lanes, relations, box order and v12's
placement constants are kept (spec #527). What changes:

| v12 | v13 | Why |
| --- | --- | --- |
| Syntax errors: Langium's first message, naming tokens; a duplicate frame id threw | Every error, in words, with hints for the usual slips (a keyword as a name, `title` at a line start, upper-case keywords, parts out of order, a four-digit id, block data written inline). A duplicate frame id is the error `EVENTMODELING_DUPLICATE_FRAME`, with v12's message, at the second id | R-PARSE-1 |
| A source of the wrong kind, a `->>` to a later or undefined frame, an undefined `[[data]]` and a `note` or `gwt` on an undefined frame were dropped silently (the first was reported only by the unused validator) | The same output, with one warning per render for each kind: `EVENTMODELING_INVALID_SOURCE` (v12's validator message), `EVENTMODELING_UNKNOWN_SOURCE`, `EVENTMODELING_UNKNOWN_DATA`, `EVENTMODELING_UNKNOWN_FRAME`, every case in `related` | D525, D226 |
| `%%` comment lines were kept for parsing (`preserveCommentsWhenParsing`), except in a text over `maxTextSize` (50,000), which v12 parsed with the comments stripped | Comment lines are always kept, whatever the text's length | Spec #527 T1 |
| A new lane for every namespaced frame, so two frames of one namespace in one band could draw two lanes of the same name | One lane per band and namespace, as the syntax page says | D522 |
| Data drawn as HTML through `foreignObject`, sliced off by one: empty quoted data, a lost last character, `&nbsp;` spaces; tags, entities and `<br/>` read as markup; a referenced data block drew a trailing blank line | The text between the braces or quotes, dedented and trimmed, in mono, as written: indentation and blank runs kept (a tab to the next 4-column tab stop, before dedenting), empty data drawn as no data, `<tags>`, `&entities;` and `<br/>` shown as text, no trailing blank line. `dataType` is still ignored | D523 |
| `title`, `accTitle` and `accDescr` values kept their keyword, `:` and blanks | The keyword, `:` and surrounding blanks are stripped, as for every other type; `accTitle` and `accDescr` become the SVG's `<title>` and `<desc>`. The `title` is not drawn, as in v12 | D524, D218 |
| Box sizes from 16 px bold trebuchet markup strings, a box with data at a third of its width | Boxes sized from the name and data measured in the theme's font (each `clamp(text + 20, 80, 450) + 20` wide, `clamp(text + 20, 80, 750) + 20` high, v12's bounds), so boxes and every later x differ | D521 |
| A box could overlap or touch (less than 10 px from) its lane's previous box | It moves right to 10 px past it; later boxes follow | D521 |
| A relation within a lane ran from one box's middle through both boxes, and through every box between them; a frame named as its own source drew a line through its box | A relation to the next box of its lane runs from the source's right edge to the target's left edge. One that skips boxes of its lane runs under the row, from the source's bottom to the target's bottom, overlapping ones 10 px apart. A self relation loops under the box's bottom right corner. A lane that holds such a route or loop is taller, so the lanes below it move down; box tops in their lane stay | D521, D659 |
| Text past the greatest box height (750 px) was clipped by the `foreignObject`, mid-line | Lines past it are left out, data lines first, then name lines | Spec #527 T3 |
| Lanes reached 15 px past the rightmost box, unless an earlier box ended right of the last one | Lanes reach 25 px past the rightmost box | Spec #527 T3 |
| Notes, `gwt` blocks and entities were parsed and not drawn | The same: in the model and the language service, not drawn | D526 |
| An `eventmodeling.padding` that was not a number was used as given | A number of 0 or more, or a numeric string as its number; anything else (or a value so large the drawing would not stay finite) draws with 30 and one `EVENTMODELING_CONFIG_INVALID` warning. A `useMaxWidth` that is not `true` or `false` draws as `true`, with the same warning | D226 |
| `eventmodeling.rowHeight` (default 32) and `eventmodeling.useWidth` were never read | Accepted and ignored, with no warning ([Config](#config)) | |
| `look: handDrawn` (top level or `eventmodeling.look`): v12 never sketched an event model | Without `@mermaid-js/plugin-hand-drawn`, `look` is ignored with one `LOOK_REMOVED` warning, as in every section. With the plugin, `look: handDrawn` sketches the event model: lanes, boxes and relations are drawn with roughjs, as other edge diagrams are; the arrowheads and the text are drawn as before. A visible change from v12, which drew it plainly (option A, decided by the maintainer on 2026-11-10, with D537's line hops; the D-id is the maintainer's to number) | D301, D303, D537 |
| `lineHops: true` (or `'arc'`, `'gap'`) on crossing relations | New in v13 (D537): event modeling relations go through core's shared edge-path step, so where two cross the later one draws a 6px hop. The shared key defaults to `false` (D689), so crossings hop only where a document turns hops on. v12 had no hops for event models | D537 |
| `format: 'ascii'`: no text output | Throws `UnsupportedFormatError` | D320, R-ASCII-5 |

### Event modeling theme colours

Event modeling reads its own 14 flat theme variables, v12's names (`emUiFill`, `emUiStroke`,
`emProcessorFill`, `emProcessorStroke`, `emReadModelFill`, `emReadModelStroke`, `emCommandFill`,
`emCommandStroke`, `emEventFill`, `emEventStroke`, `emSwimlaneBackgroundOdd`,
`emSwimlaneBackgroundStroke`, `emRelationStroke`, `emArrowhead`), and one new one, `emTextColor`
(core's `textColor`), for box and lane text, which v12 left to the page's colour. Every light
theme of every family draws v12 `default`'s values, relations and arrowheads in the theme's line
colour (`canvasLineColor`: `lineColor`, which `default` and `dark` keep under an override, as v12
does, D656); the dark themes draw v12 `dark`'s. An author's value is drawn as given in every theme, as in v12; the
author's `darkMode` alone keeps the light values, as in v12. What changed
(`packages/conformance/src/eventmodeling/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `neo-dark` | No `em*` variables: the renderer's light fallbacks (`default`'s pastels, `rgb(250,250,250)` lanes) and `#000` relations and arrowheads | `dark`'s values (`#2d2d2d` UI boxes, the darker kind colours, lanes 5% and 12% lighter than the background) and `lineColor` relations | D527, D333 |
| `redux-dark` | The same light fallbacks and `#000` relations | `dark`'s values and `lineColor` | D527, D333 |
| `redux-dark-color` | The same light fallbacks and `#000` relations | `dark`'s values and `lineColor` | D527, D333 |
| Every theme | Box and lane text in the page's colour (black on a dark lane in `dark`) | `emTextColor`, core's `textColor` | D527 |

## Event modeling SVG structure

What changed in the event model's SVG compared with v12 (spec #527, DESIGN §7.2). v12's class
names (`em-swimlane`, `em-box`, `em-relation`) and its draw order (lanes, then boxes, then
relations) are kept.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"` and v12's `role` | No root `id`; `class="mermaid mermaid-eventmodeling"`, `role="img"`, `aria-roledescription="eventmodeling"`, `data-mermaid-version`, `font-family` from the theme; the `viewBox` is what is drawn plus `padding`; `useMaxWidth` as v12 (`width="100%"`, `max-width`) | R-SEC-2, R-A11Y-1 |
| `<defs>` with `<marker id="em-arrowhead-<id>">` and `marker-end` on every relation | No `<defs>`, `<marker>` or `marker-end`: each `path.em-relation` is followed by its own `<polygon>` head (v12's `0 0, 10 3.5, 0 7`, filled `emArrowhead`). The only ids are `<id>-title` and `<id>-desc`, from `accTitle` and `accDescr` | R-SEC-2, D133 |
| Box text in a `foreignObject` holding XHTML `div`s and `span`s | SVG `<text>` and `<tspan>` through core label layout: the bold name centred, the data in mono, left-aligned, its indentation kept; data is text, never HTML | R-SEC-2, D523 |
| Lane labels as HTML-less `<text>` at (30, `y + 30`) in the page's colour | `<text>` start-anchored at the same point, bold, filled `emTextColor` | D527 |
| Text at v12's 16 px | Text in `emTextColor` at the theme's `fontSize` | D527 |
| A self relation drew a straight line through its box | A 4-point path under the box's bottom right corner, as is a relation under its row (one that skips boxes of its lane); every other relation is `M…L…`, as v12, ending at its head's tip | D521, D659 |
| Relations were always straight lines, or right-angled routes under a row; no curve key | Unset, the same lines and heads, byte for byte. The new `eventmodeling.curve`, then the new top-level `curve`, draw every relation between frames with `flowchart.curve`'s names (`linear`, `step`, `rounded`, `basis`, …): the line stops at the head's base and the head follows the end of the drawn line. A relation from a frame to itself keeps its loop whatever the curve. An unknown name draws `rounded` with one `CURVE_UNKNOWN` warning. Event modeling has no text output | D733, D760 |
| No source mapping | `data-id` on every element; `data-ast` on each `g.em-box` (`frame:<id>`) and each `path.em-relation` drawn for a `->>` (`relation:<source>-><target>`, the first `->>` of that source). A source repeated in one frame (`->> 01 ->> 01`) draws one path; the AST nodes of its repeats (`relation:01->02@2`, …) are not drawn. Lanes (`lane:<index>`) and inferred relations carry `data-id` only | R-PARSE-8, D528 |
| `rgb(250,250,250)`, `rgb(240,240,240)` and `white` paints | The same colours as hex | |
| `look: neo` and the redux themes: the same model as the classic themes | The same: event modeling differs between families by colour only | D227 |
