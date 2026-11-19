## Venn SVG structure

What changed in the venn diagram's SVG compared with v12 (spec #429). v12's classes and draw
order are kept: `text.venn-title`, then a group translated by the title height holding each
`g.venn-area.venn-circle.venn-set-<n>` (with `data-venn-sets`), each
`g.venn-area.venn-intersection`, and `g.venn-text-nodes` > `g.venn-text-area` >
`text.venn-text-node`; each area holds its `path` and `text.label`.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="venn"`, a `<style>` scoped by the id that sized the title (`32px`, over its `font-size` attribute) and the text nodes | No root `id`; `class="mermaid mermaid-venn"`, `role="img"`, `aria-roledescription="venn"` (kept), `data-mermaid-version`, and `<title id="<id>-title">` from the title, since venn has no `accTitle`. No `<style>` (except `theme: 'auto'`'s variables-only sheet): fills, strokes, opacities and font sizes are presentation attributes, colours reading `var(--_x)` aliases on the root `style` | R-SEC-2, R-A11Y-1, D133, R-THEME-3 |
| Paint set inline with `style="fill: …; fill-opacity: …"` on each path and label | Presentation attributes (`fill`, `fill-opacity`, `stroke`, `stroke-width`, `stroke-opacity`, `font-size`) | R-SEC-2 |
| Text nodes: `foreignObject` > HTML `span` per cell | `text.venn-text-node` per node, inside its `g.venn-text-area`; no `foreignObject` | D414, R-SEC-2 |
| Two solves per render: the circles' (venn.js padding 15) and the text nodes' and hand-drawn circles' (`venn.padding`, 8), so `g.venn-text-nodes` and a sketch were placed on circles of another size | One solve: circles, labels, `g.venn-text-nodes` and the sketch share the drawn circles, at an author's `venn.padding`, else 15 | D412 |
| Title and labels placed by `dominant-baseline` (`middle`) and the title at `x="50%"` | Each placed by its measured box at the same centre, with `text-anchor="middle"` and no `dominant-baseline` | Core's label layout |
| No source mapping | `data-ast` on each drawn set's and overlap's `g.venn-area` and each `text.venn-text-node`; `data-id` (the area's sets joined with `_`, a text node's id, `title`) on those and on labels, which carry no `data-ast`; `data-venn-sets` kept | R-PARSE-8, pitfall 12 |
| An area venn.js marked disjoint was drawn off the canvas (a label at y −1000, a `M 0 0` path); an overlap with no label wrote an empty `text` | Neither is written | Nothing invisible is drawn |
| `style A stroke-width: 4px` reached the CSS as `4 px` (v12 joins value tokens with a blank), which the browser dropped, so the circle kept its default width | The number is read, so the circle is drawn 4 wide | v12's evident intent |
| The `viewBox` was always `0 0 width height` | v12's positions; the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) covers whatever is drawn, so a wide stroke or a long title can grow it | D224 |
| `look: neo` and the redux and neo themes: the same shapes as the classic themes | The same: venn differs between families by colour only | D227 |

### Venn theme colours

Each set `i` takes the `i mod n`th of the `venn1`…`venn8` slots that are set, else
`primaryColor`, as in v12, and an author's `venn<k>` wins in every theme. With a palette
(`borderColorArray`, which `redux-color` and `redux-dark-color` carry, or an author's in any
theme), an unset slot `k` takes the palette's entry `k − 1`, as those two themes filled theirs in
v12. `redux`, `redux-dark`, `neo` and `neo-dark` set no slot, so every circle is `primaryColor`,
as in v12. The title is `vennTitleTextColor` (v12's `titleColor || tertiaryTextColor`), overlap
labels and text nodes `vennSetTextColor`. What changed
(`packages/conformance/src/venn/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `base`, `forest` | `venn3` darkened `tertiaryColor` by 30 | By 40, as `default`: one classic light formula, so the third set is 10 % darker than in v12. Set `venn3` to draw v12's | D415 |
| `neutral` | The eight slots were its `cScale` greys (`#555`, `#F4F4F4`, …), which no override of a base colour moved | `default`'s formula on neutral's colours, so the slots follow an author's `primaryColor`, `secondaryColor` or `tertiaryColor`. Set `venn1`…`venn8` to draw v12's | D415 |
| `default` | `venn3` `#b5ff20`, from the unrounded `tertiaryColor` | `#b9ff20`, from the hex | D333(a) |
| Every theme | A set label was the circle colour lightened or darkened by 30 in the browser | The same colour, computed when the diagram is drawn: a host's `--mermaid-venn<k>` override, or the dark half of `theme: 'auto'`, does not move it | Labels are a literal colour |

Hand-drawn (`@mermaid-js/plugin-hand-drawn`): v12 sketched each circle at roughness 0.7 with a
hachure of the circle colour at 0.3 alpha, fill weight 2, gap 8 and angle −41 + 60 per set, and a
styled overlap cross-hatched in its fill at 0.7 alpha (fill weight 2, gap 6, angle 60, no
stroke). v13 sketches each circle and each
overlap a style fills as a `node` outline (roughness 0.7, hachure, fill weight 1.5, gap 1.5, the
hachure at the area's `fill-opacity`), and draws an unfilled overlap plain: the outline hook takes
no per-call options (D319, D302).
