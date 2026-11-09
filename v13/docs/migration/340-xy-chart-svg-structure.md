## XY chart SVG structure

What changed in the XY chart's SVG compared with v12 (spec #426, #510). v12's class names are kept
(`main`, `background`, `plot`, `bar-plot-<n>`, `line-plot-<n>`, `chart-title`, `legend`,
`bottom-axis`/`left-axis`/`top-axis` with `axis-line`, `ticks`, `label`, `title`), and so is v12's
draw order.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"` and a `g.mermaid-tmp-group` used to measure text | No root `id` and no measuring group; `class="mermaid mermaid-xychart"`, `role="img"`, `aria-roledescription="xychart"`, `data-mermaid-version` and the theme's `font-family` | Inert output (R-SEC-2), no colliding ids (R-A11Y-1) |
| `<title>` and `<desc>` | Written only from `accTitle` and `accDescr`, with the ids `<id>-title` and `<id>-desc` | D133 |
| A fixed `viewBox` (the 700 × 500 canvas) | v12's positions; the `viewBox` grows to cover everything drawn (the axis strokes make the default 701 wide). The background `rect` is still v12's canvas | D224 |
| `width="100%"` and `max-width` always | The same by default; `width` and `height` with `xyChart.useMaxWidth: false` | D387 |
| Colours as fills and strokes from the `xyChart` block | Presentation attributes reading `var(--_x)` aliases on the root `style` (literal with `output.cssVariables: false`); the plot colours are always literal. Under `theme: 'auto'` the root has `data-p` and a theme `<style>` | R-THEME-3, R-THEME-8 |
| No source mapping | `data-ast` on the in-text title's `g.chart-title`, each plot's `g.bar-plot-<n>`/`g.line-plot-<n>` and each drawn axis's `g.<position>-axis`; `data-id` (the plot's AST id) on bars, lines, point labels, data labels and legend rows. The legend has no `data-ast` | R-PARSE-8, pitfall 12 |
| Paths as d3 wrote them | `M…L…` with two decimals (axis lines, ticks, legend strokes); a line plot's `d` keeps d3 `line()`'s three decimals | Core's path writer |
| Data labels' `font-size="<n>px"` | `font-size="<n>"` | Presentation attributes |
| A label with `<br>` printed as one `<text>` | A `<text>` of `<tspan>`s, one per line (core's label writer); a one-line text that v12's chart builder drew (title, axis text, legend names, point labels) is v12's `<text>` at `translate(x,y) rotate(r)` | D385 |
| Data labels placed with `x` and `y` | `x="0" y="0"` with `transform="translate(x,y) rotate(0)"`, as every other text; the same position | Choice (#510): one text writer |
| A plot whose values are all missing threw | The plot's group is written, with nothing drawn in it; a hidden axis part writes no group, an axis with every part hidden none at all | D383 |
| `look: neo` and the redux themes: the same chart as the classic themes | The same: the XY chart differs between families by colour only | D227 |
