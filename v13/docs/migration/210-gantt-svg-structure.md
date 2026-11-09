## Gantt SVG structure

What changed in the gantt's SVG compared with v12's `ganttRenderer.js` and `styles.js`, and why
(DESIGN §7.2, spec #293). v12's classes stay on the elements they were on: `section sectionN`,
`task`, `milestone`, `vert`, `task|active|done|crit|activeCrit|doneCrit` + N, `clickable`,
`taskText`, `taskTextOutsideLeft|Right`, the `taskTextN`, `taskTextOutsideN`, `activeTextN`,
`doneTextN`, `critTextN`, `activeCritTextN`, `doneCritTextN`, `milestoneText` and `vertText`
classes, `sectionTitle sectionTitleN`, `grid`, `tick`, `today`, `exclude-range` and `titleText`.
Class lists are written with single spaces and no trailing blank.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, a `<style>` scoped by the id that gave every element its colour; `viewBox="0 0 w h"` fixed | No root `id`; `class="mermaid mermaid-gantt"`, `role="img"`, `aria-roledescription="gantt"`, `data-mermaid-version`; colours are presentation attributes reading `var(--_x)` aliases of v12's gantt theme variables. The `viewBox` is `0 0 w h` grown to cover what is drawn (an outside label, a wide title) | Inert output (R-SEC-2), R-A11Y-1, D224 |
| Element ids `<id>-<task id>` on bars, `<id>-<task id>-text` on labels, `<id>-exclude-<date>` on excluded days | No ids. A bar carries `data-id="<task id>"` and `data-ast="t:<id>"`, its label `data-id` only; a section title `data-id="<section>"` and `data-ast="s:<section>"`. A section statement v12 drew no title for (a repeated name, a section of only `vert` markers) gets an empty `<g class="sectionTitle" data-id data-ast>` | R-PARSE-8, no colliding ids |
| `width-<n>` classes on labels | Dropped | They held the measured width, which depends on the measurer |
| A linked task wrapped in `<a xlink:href target="_top">` only under `securityLevel: sandbox`; otherwise `href` was a `window.open(url, '_self')` handler on the bar and label. v12's sanitizer rewrote the URL (`https://example.com` → `…com/`) | The bar and label of a task a `click … href` names sit in one `<a href>`, after the other tasks, in every security level, with no `target`. The URL is kept as written and checked by core: an unsafe one draws the task unlinked with one `URL_REFUSED` warning | R-SVG-4, R-SEC-4, D23, D62 |
| `todayMarker` written as a `style` attribute with `,` turned into `;` | Split on `,` (the statement stops at `;`, so none reaches the value) and checked: allowed properties become presentation attributes on the line, others are dropped with `STYLE_PROPERTY_DROPPED` | R-SEC-2 |
| A `transform-origin` attribute on every bar and every excluded-day rect; milestones turned by CSS, `transform: rotate(45deg) scale(0.8, 0.8)` about it | No `transform-origin`. A milestone carries the same geometry as a `transform` attribute about v12's origin (its square's centre; above the marker for a task tagged both `vert` and `milestone`, which keeps both, as in v12) | No CSS in the output |
| `<g class="grid" transform="translate(leftPadding, h − 50)">` (top axis: `translate(leftPadding, topPadding)`) and d3's `<g class="tick" transform="translate(x, 0)">` per tick | The same elements at absolute coordinates, without `transform` | The renderer writes absolute coordinates |
| Tick text `fill="#000"` `stroke="none"` `font-size="10"`, overridden by `.grid .tick text { fill: textColor }`; d3's tick lines `stroke="currentColor"` (the page's colour, as v12's `.grid .tick { stroke: gridColor }` matched only the group); d3's axis path, hidden by `.grid path { stroke-width: 0 }`; `shape-rendering: crispEdges` on ticks and `doneCrit` bars | Tick text in `textColor` at 10px; tick lines in `gridColor` at v12's 0.8 opacity; no axis path; no `shape-rendering` | What v12's CSS meant; `shape-rendering` is not an allowed attribute |
| `cursor: pointer` on clickable bars and labels; `text-height` on labels | Dropped; the `clickable` class stays for host CSS | No CSS in the output |
| A `<text class="titleText">` always, empty without a title | Only when there is a title | Nothing invisible is drawn |
| An HCL colour scale (`#00B9FA` → `#F95002`) built and never used | Dropped | It never reached the output |
| Section titles `<text dy="−(n−1)/2 em">` with `alignment-baseline: central` `<tspan dy="1em">`s | One `<text>` with a `<tspan>` per `<br>` line at an absolute `y`, 1em apart, each line centred on its own row as v12 drew it | `alignment-baseline` is not an allowed attribute |
| Slots past `section3` (`numberSectionStyles` over 4) had no rule, so their bands, bars and inside labels took the root's `fill: textColor`, bars no stroke, and outside labels `taskTextDarkColor` (`.taskTextOutsideLeft`/`Right`) | Kept | P2 |
| `look: neo` changed only colour variables | Every theme draws gantt without gradient outline or shadow | D278 |
