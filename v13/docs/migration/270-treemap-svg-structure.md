## Treemap SVG structure

What changed in the treemap's SVG compared with v12 (spec #428, DESIGN §7.2). v12's class names
are kept (`treemapTitle`, `treemapContainer`, `treemapSection`, `treemapSectionHeader`,
`section<n>`, `treemapSectionLabel`, `treemapSectionValue`, `treemapNode`, `treemapLeafGroup`,
`leaf<n>`, `treemapLeaf`, `treemapLabel`, `treemapValue`), and so are the rectangles, the paints
and the draw order.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="treemap"`, and `class="flowchart"` from v12's `setupViewPortForSVG(…, 'flowchart', …)` | No root `id` and no `flowchart` class; `class="mermaid mermaid-treemap"`, `role="img"`, `aria-roledescription="treemap"`, `data-mermaid-version`, `font-family`; the `viewBox` is the bounding box of what is drawn, padded by `diagramPadding`, as v12 measured it | R-SEC-2, R-A11Y-1, D224 |
| A `<style>` scoped by the id; its one effective rule, `.treemapTitle`, gave the title's fill and size | No `<style>` (except under `theme: 'auto'`, core's light/dark sheet): the title carries `fill` (`treemapTitleColor`) and `font-size` (`treemapTitleFontSize`), colours reading `var(--_x)` aliases on the root `style` | Inert output (R-SEC-2), host re-theming with `--mermaid-*` (R-THEME-3) |
| A `<clipPath>` per section and leaf (`clip-section-<id>-<i>`, `clip-<id>-<i>`) and `clip-path` on their texts | No `clipPath`: text is fitted, truncated or left out so it stays inside its box | D405, R-SEC-2 |
| `g.treemapContainer` moved down by the title band and each group moved to its box with `transform`, rects at 0,0 | No transforms: every rect and text has absolute `x`/`y` | The layout places everything |
| The hidden root drawn as `g.treemapSection` (`section0`) with `display: none` on its four children, and with no rows as one transparent `leaf0` | Not drawn (it still counts, so sections start at `section1`); with no rows there is no `g.treemapContainer` | Nothing invisible is drawn |
| A leaf label or value that did not fit written with `display: none`; an empty section value for 0; an empty label when truncation left nothing | Left out | Nothing invisible is drawn |
| Leaf groups `treemapNode treemapLeafGroup leaf<i> <class>x` | `treemapNode treemapLeafGroup leaf<i> <class>` | D403 |
| Inline `style` attributes (class styles with `!important`, and `white-space`, `overflow`, `text-overflow` on texts) | Presentation attributes: `fill`, `stroke`, `font-*`, `text-anchor`, `dominant-baseline`. `classDef` styles are checked: an unsupported property or unsafe value is dropped with `STYLE_PROPERTY_DROPPED` / `STYLE_VALUE_DROPPED` | R-SEC-2 |
| No source mapping | Each section's and leaf's group carries `data-id` and `data-ast` (`node:<name path>`, `@2` for a repeated path), their rects and texts `data-id`; an in-text title's text carries both (`title`) | R-PARSE-8, D408, pitfall 12 |
| `look: neo` and the redux themes: the same treemap as the classic themes | The same: treemap differs between families by colour only | D227 |
