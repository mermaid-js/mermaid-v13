## Quadrant chart SVG structure

What changed in the quadrant chart's SVG compared with v12 (spec #289, #312). v12's groups and
classes are kept, in v12's order: `g.main` > `g.quadrants` (`g.quadrant`: `rect` + `text`),
`g.border` (six `line`s), `g.data-points` (`g.data-point`: `circle` + `text`), `g.labels`
(`g.label`: `text`) and `g.title`, each written even when empty. The last-declared point is
still drawn first, so the first is on top. Text keeps v12's `text-anchor`, `dominant-baseline`
and `transform="translate(x,y) rotate(r)"` placement.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, a `<style>` scoped by the id that gave every text its `fill` | No root `id`; `class="mermaid mermaid-quadrant"`, `role="img"`, `aria-roledescription="quadrantChart"` (kept), `data-mermaid-version`; every element carries its colour as a presentation attribute reading a `var(--_x)` alias on the root `style` | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3) |
| A fixed `viewBox="0 0 chartWidth chartHeight"`: a point label near the edge ran off it and the browser clipped it | The same placement; the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) grows to cover any label or point drawn past the chart. A chart where everything fits keeps `0 0 chartWidth chartHeight` | The bounding box covers what is drawn (D224) |
| Groups had no ids | `g.quadrant` has `data-id="quadrant-<n>"` and, when labelled, `data-ast="q:<n>"`; `g.data-point` has `data-id="<point name>"` and `data-ast="pt:<name>"` (`pt:<name>@2` for a repeated name); `g.label` has `data-id="x-axis-start"` (`-end`, `y-axis-…`) and `data-ast="ax:x"` / `ax:x/end` / `ax:y` / `ax:y/end`; `g.title` has `data-id="title"` and the `title` statement's `data-ast` | One element per AST node maps it to its source (R-PARSE-8) |
| An unlabelled quadrant drew an empty `<text>` | Only its `<rect>` | Nothing invisible is drawn |
| Border lines styled with `style="stroke: …; stroke-width: …"` | `stroke` and `stroke-width` attributes | No inline style (R-SEC-2) |
| Labels set as `textContent`: a quoted `<br>`, a raw line break inside quotes, `<b>`/`<i>` and a markdown string's `**` showed literally, entities as written | Core's label layout with no wrap width: every `<br>` form and a raw line break inside a quoted string break the line, `<b>` and `<i>` in a quoted label render bold and italic, other tags are dropped with their text kept (`"<script>x</script>"` draws `x`, where v12 showed the tags), markdown renders, entities decode, and math works (D176). A plain label is still one `<text>`; one with breaks or emphasis is a `<text>` with `<tspan>`s. Every v12 anchor and the square stay where v12 put them, and a label's extra lines grow away from the square: a title's earlier lines go above it, so its last line sits where v12's one line sat; a top x-axis label grows up (the title above it moves up with it); a left y-axis label grows left; bottom and right labels grow down and right. The bounding box grows over them, so `viewBox` can start below 0 | D225, D224 |
| Points: `fill="hsl(…, NaN%)"` and the same `stroke` (v12's `quadrantPointFill` rule had a precedence bug and a khroma call with no amount), so points showed the root `fill: textColor` and no stroke, even with a `stroke-width`; a user `quadrantPointFill` was ignored | `fill` from `quadrantPointFill`, which defaults to `textColor`: the same look in every theme, and a user value is honoured. A `stroke` is written only when an inline or class `stroke-color` sets one, so `stroke-width` alone still draws no ring; a drawn stroke counts toward the bounding box | D231, D224 |
| A style colour without `#` (`color: ff0000`) was written as `fill="ff0000"`, which browsers ignore | Written as `fill="#ff0000"` | D235 |
| Quadrant fills 2–4 derived from `primaryColor` (or `#ECECFE` in `redux`, `redux-color` and `neo`) | Derived from `quadrant1Fill`, which is `primaryColor` (`#ececfe` in those three): the same colours unless an author sets `quadrant1Fill` alone, which now moves 2–4 too. `default` also follows an author `primaryColor`, `primaryTextColor` and `primaryBorderColor`, which v12's `theme-default.js` ignored for the quadrant fills, text fills and borders (it derived them once, in its constructor, before the overrides) | D232 |
| A point whose coordinate lexed but was not a number in [0, 1] (`0x5`, `0a5`) was drawn off the chart or at `NaN` | Left out, with one `QUADRANT_POINT_INVALID` warning per point | D226 |
| `look: neo` changed nothing in a quadrant chart | Every theme family draws it plain, without gradient, shadow or palette; families differ by colour only | D227 |
| Border lines in v12's khroma `primaryBorderColor` | Core's `primaryBorderColor`, the border colour of every other type, so some themes change (table below) | R-THEME-11 |
| `themeVariables.darkMode: true` switched `primaryTextColor` and `textColor` to `#eee` in `redux`, `redux-color`, `base` and `neo`, and so every quadrant text | Core's theme specs keep their text colours under `darkMode`, so quadrant text does too. This is core behaviour for every type, not a quadrant change | Core |

Quadrant border colours (`quadrantExternalBorderStrokeFill` and `quadrantInternalBorderStrokeFill`)
where v12 and v13 differ; the other themes keep v12's colour.

| Theme | v12 | v13 |
| --- | --- | --- |
| `default` | `#c7c7f1` | `#c9c9d9` |
| `dark` | `#cccccc` | `#4c4d4d` |
| `forest` | `#abb594` | `#aec281` |
| `neutral` | `#d4d4d4` | `#cacaca` |
| `base` | `#eeddbb` | `#d9cfbc` |
| `redux`, `redux-color` | `#171717` | `#28253d` |
