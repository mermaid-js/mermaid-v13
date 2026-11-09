## Pie SVG structure

What changed in the pie chart's SVG compared with v12 (spec #288, DESIGN §7.2). The v12 class
names are kept (`pieOuterCircle`, `pieCircle`, `highlighted`, `highlightedOnHover`, `slice`,
`pieTitleText`, `legend`), so selectors that use them keep working.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `aria-roledescription="pie"`, `role="graphics-document document"`, a `<style>` scoped by the id | No root `id`; `class="mermaid mermaid-pie"`, `role="img"`, `aria-roledescription="pie"`, `data-mermaid-version`; colours, strokes, sizes and the opacity are presentation attributes on each element, colours reading `var(--_x)` aliases on the root `style` | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3) |
| Everything in one `<g transform="translate(225,225)">`: the pie in an inner `<g>`, the title at `y=-200` and each legend row in it | The outer circle, slices and percentages in one `<g transform="translate(cx,cy)">` at the pie's centre; the title and the legend rows are siblings after it, in root coordinates | The layout places them; a `left` or `top` legend moves the pie, not the title |
| Percentages: `<text class="slice" transform="translate(x,y)" style="text-anchor: middle">` | `<text class="slice" data-id x y text-anchor="middle">` | No transform per label |
| Legend row: `<g class="legend" transform="translate(x,y)">` with `<rect style="fill;stroke">` at the origin and `<text x="22" y="14">` | `<g class="legend" data-id data-ast>` with `<rect x y width height fill stroke>` and a start-anchored `<text>`, both in root coordinates | One element per section maps it to its source (R-PARSE-8) |
| No source mapping; d3 bound each section as `__data__` | Each legend row carries `data-ast="slice:<label>"` (every section has a row, shown or not); its slice `<path>` and percentage `<text>` carry the same `data-id` only. A repeated label (`slice:<label>@2`) is not drawn and has no element | One `data-ast` element per AST node (R-PARSE-8, pitfall 12) |
| `highlightSlice: "<label>"`: class `highlighted`, and `scale: 1.05; opacity: 1` from the `<style>` | Class `highlighted` and `transform="scale(1.05,1.05)" opacity="1"` on that slice's path | No style sheet (D222) |
| `highlightSlice: "hover"`: class `highlightedOnHover` and a `:hover` rule that scaled the slice | Class `highlightedOnHover` on every slice, no hover effect, and one `PIE_HOVER_IGNORED` warning per render. Host CSS can target the class | No style sheet (D222); an interactions hover can come later |
| `highlightSlice: ""` (the default) highlighted a slice labelled `""` | Highlights nothing | v12 bug (#335) |
| Title and legend text set with d3 `.text()`: `<br>` and tags printed as written, entities decoded | Core's label layout ([Labels and text](#labels-and-text)): `<br>` breaks the line, `<b>`/`<i>` are drawn bold and italic, entities decode; a legend label of several lines stays left-aligned | D225 |
| The viewBox widened only for the title; many sections or a wide `top`/`bottom` legend were clipped | The viewBox covers everything drawn, and may start at a negative `x` or `y` | D224 |
| `neo` and the redux themes: the same pie as the classic themes | The same: pie differs between families by colour only, with no gradient and no shadow | D227 |
