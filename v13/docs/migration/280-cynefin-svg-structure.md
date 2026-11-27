## Cynefin SVG structure

What changed in the cynefin diagram's SVG compared with v12 (spec #423, D361–D366). v12's groups
and classes are kept, in v12's order, inside one `<g transform="translate(padding,padding)">`:
`g.cynefin-backgrounds` (`rect.cynefinDomain`, complex, complicated, chaotic, clear),
`g.cynefin-boundaries` (`path.cynefinBoundary` ×2, `path.cynefinCliff`), `path.cynefinConfusion`,
`g.cynefin-labels` (`text.cynefinDomainLabel`), `g.cynefin-subtitles` (`text.cynefinSubtitle`,
only with `showDomainDescriptions`), `g.cynefin-items` (always; a translated `g` per item with
`rect.cynefinItem` or `rect.cynefinItemOverflow` and `text.cynefinItemText`), `g.cynefin-arrows`
(only with transitions) and `text.cynefinTitle`. Selectors that use these classes keep working.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="cynefin"`, a `<style>` scoped by the id that gave every stroke, font size, weight and text colour | No root `id`; `class="mermaid mermaid-cynefin"`, `role="img"`, `aria-roledescription="cynefin"` (kept), `data-mermaid-version`; no `<style>` (except `theme: 'auto'`): every fill, stroke, width, dash, opacity and font is a presentation attribute, colours reading `var(--_x)` aliases on the root `style` | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3, D152) |
| `<title>` and `<desc>` written twice: once by the renderer without ids, once with ids (`chart-title-<render id>`, `chart-desc-<render id>`) by the accessibility step | One `<title id="<id>-title">` (from `accTitle` only) and one `<desc id="<id>-desc">` | D133 |
| Arrowheads: `<defs><marker id="cynefin-arrow-<render id>">` after the root `<g>`, referenced by `marker-end` on each line | No `<marker>`, `<defs>` or id: each transition is `path.cynefinArrowLine`, then a `path.cynefinArrowHead` (v12's marker triangle, `6 × arrowWidth` long, its tip `0.1` of that past the line end as `refX 9` put it), then `text.cynefinArrowLabel` | `<marker>` and `marker-end` are not in the allow-list, and the id broke R-SEC-2 |
| No source mapping | `data-ast` on the drawn block of each declared domain (its quadrant `rect` or the ellipse), on each item `g` and on each transition's line; `data-id` (domain name, item label, or `from-to`) on those and on labels, subtitles, arrowheads and arrow labels, which carry no `data-ast`. Undeclared quadrants have `data-id` but no `data-ast`. Replaced blocks, dropped self-loops and confusion items past the third have no element; the `+N more` badge that stands for those items carries neither attribute | One `data-ast` element per AST node (R-PARSE-8, pitfall 12) |
| Texts placed with `dominant-baseline` (`middle`, `central` for items, `auto` for arrow labels) | Each text placed by its measured baseline, at the same centre | Core's label layout |
| Items, transition labels and the title set with d3 `.text()`: `<br>` and tags printed as written, entities decoded | Core's label layout ([Labels and text](#labels-and-text)): `<br>` breaks the line, markdown strings, entities, math and icons render; a badge is at least 26 px tall and grows with its label's lines, a title or transition label of several lines grows up from where v12 drew its one line. The fixed domain texts and `+N more` stay plain | D363, D225 |
| Item widths measured with `getBBox()` after the CSS applied, or `label.length × 7` when it returned 0 | Measured in the font they are drawn in; no character-count fallback | Pitfall 16 |
| A fixed `viewBox="0 0 width+2·padding height+2·padding"`: a fifth quadrant item, confusion items below the ellipse, a wide title or one in a `padding` under about 18 ran off it | The same placement (D361), except that a long list grows its row (D617); the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) grows to cover whatever is drawn past it, so it can start below 0. A diagram where everything fits keeps v12's | D361, D224 |
| Quadrants were always half the canvas: from the fifth item a domain's list ran over the horizon onto the next row's headings and items, or below the canvas | A row of quadrants grows to fit its longest list, reaching to where the list's next badge would start; the horizon, the confusion ellipse with its items, the cliff and the lower row move down with it, and the fold spans the taller canvas. The texts keep their place under the row's top edge, and transitions run between them. No item is hidden; `confusion` still shows three and a `+N more` badge. Lists of four one-line items or fewer keep v12's geometry | D617 |
| `seed: 0` (the default) hashed the SVG element id, so the waves changed with every render id | `seed: 0` hashes the render's `idPrefix` with v12's hash: deterministic for a given `id` option, different for two diagrams on a page. A non-zero `seed` draws v12's exact paths | D362, R-ARCH-6 |
| A later block of a domain silently replaced the earlier one's items | The same, with one `CYNEFIN_DUPLICATE_DOMAIN` warning per render naming the replaced blocks | D364, D226 |
| `x --> x` dropped with a console `log.warn`; repeated transitions drawn on top of each other | Dropped with one `CYNEFIN_SELF_LOOP` warning per render (the statement keeps its AST node); repeats drawn as v12 drew them | D365, D226 |
| Out-of-range or non-finite `width`, `height`, `padding` and `boundaryAmplitude` drawn as given (negative rect sizes, `NaN` in path data) | `width`, `height` and `padding` fall back to their defaults and `boundaryAmplitude` clamps to [0, 50], each with one `CYNEFIN_CONFIG_INVALID` warning per render; a non-finite `seed` counts as 0 | D366, D226 |
| `look: neo` and the neo and redux themes drew the same shapes as the classic themes | The same: cynefin differs between families by colour (and the theme's font family) only, with no gradient and no shadow. Checked against v12 12.2.0's computed styles in every theme, with and without `look: neo` | D215, D227 |
| `format: 'ascii'` | Throws `UnsupportedFormatError`: cynefin has no text output | D320 |
| Items, transition labels and the title drawn as written: `**b**`, backticks and tags printed | Each goes through core's label handler: markdown only in a markdown string (`"`…`"`, also `'`…`'` for items and transition labels); plain `**b**`, a code span and a title in bare backticks (`` title `x` ``) drawn as written, while a quoted title (`title "`…`"`) is now read as markdown (v13 had it the other way round); tags draw, `<br>` and a written `\n` break the line, blank lines and a trailing `<br>` are dropped. `legacyMarkdown` changes nothing here, since v12 read no markdown in cynefin | #1368, D733 |

### Cynefin theme colours

v12 read `themeVariables.cynefin` (`complexBg` … `arrowWidth`). v13 keeps that nested object and
adds a flat name for each key (`cynefinComplexBg` … `cynefinArrowWidth`, CSS
`--mermaid-cynefinComplexBg`, …); the flat name wins when both are set (D335, D540). An author's
value wins in every theme, as in v12, and `boundaryWidth: 0` stays 0. The lengths (16, 12, 2, 4,
2) and the colours in `default`, `neutral`, `base` and `dark` are v12's. What changed
(`packages/conformance/src/cynefin/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `neo`, `redux`, `redux-color` | No cynefin block: `default`'s literals, so boundaries and arrows `#333333`, text `#333`, labels `#131300`, whatever the theme's own colours, and a `lineColor` override changed nothing | Boundaries and arrows in the theme's `lineColor`, text in its `textColor`, labels in its `primaryTextColor` (`#000000`, `#333333`/`#28253d`, `#333333`/`#28253d`); a `lineColor` override moves them | D333(b), R-THEME-11 |
| `neo-dark`, `redux-dark`, `redux-dark-color` | `default`'s light literals: pale backgrounds (`#E8F5E9` …), cliff `#8B0000`, dark inks on a dark page | `dark`'s entry: backgrounds `#1B5E20` `#0D47A1` `#BF360C` `#F57F17` `#4A148C`, cliff `#FF6B6B`, and the theme's own line, text and label colours (`#cccccc`, `#cccccc`, `#e0dfdf`) | D333(b), R-THEME-11 |
| `forest` | Its own backgrounds `#C8E6C9` `#DCEDC8` `#FFE0B2` `#FFF9C4` `#D7CCC8` and cliff `#8B4513` | `default`'s backgrounds and cliff `#8B0000` (forest's own lines and inks are kept). Set `themeVariables.cynefin` to draw v12 forest's | D541 |
