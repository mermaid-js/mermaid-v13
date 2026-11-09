## Ishikawa diagram

The ishikawa parser accepts the v12 language (`ishikawa` and `ishikawa-beta`, any case; oracle
parity over the corpus, grammar in [syntax/ishikawa.md](./syntax/ishikawa.md)), and the layout
is v12's fishbone geometry, ported into the package (D491): with the two overlap fixes below
off, every compared corpus source lays out as v12 drew it. What changes (spec #519):

| v12 | v13 | Why |
| --- | --- | --- |
| The effect was also stored as the diagram title (`setDiagramTitle`); no title was drawn, and the SVG had no `<title>` | No title is drawn. The SVG `<title>` is the front-matter `title` when one is given, else the effect as drawn, as plain text (entities decoded, a `<br>` or a wrap a space) | D492, D218, R-A11Y-1 |
| Cause and sub-cause labels were laid out at the config `fontSize` (16) and drawn at the theme's | Measured and drawn at the theme's `fontSize`, one source: classic themes are unchanged; in `neo` and the redux themes (14 px) the bones fit the text they draw | D493 |
| The effect was drawn at 14 px, weight 600, and wrapped at `floor(110 / (fontSize × 0.6))` characters of the config `fontSize` (11) | The same 14 px 600 in every theme, measured, and wrapped at 110 px scaled by the size it is drawn at, `110 × 14 / 16 = 96.25` px in every theme: the same 11 characters at 0.6 em | D493, D495 |
| Sub-causes wrapped at 15 characters by word count, `<br>` counted as characters; cause labels never wrapped | Core's label layout (D225): entities, `<br>` forms, math and icons work. Sub-causes wrap at `144 × fontSize / 16` px; cause labels still never wrap, only break at `<br>` | D495 |
| Labels passed through `sanitizeText` (DOMPurify) | Text is escaped when written, never sanitised: `<b>`, `<T>` and the like are shown as written, and known HTML tags are read as the label subset ([Labels and text](#labels-and-text)) | R-SEC-1 |
| The first pair of causes always started 20 px left of the head, so a short leaf cause's label box could sit on the head (`baseline-clamp`, fixture 13) | A pair whose box would reach over the head's back on the head's rows starts further left by the overlap | The layout invariant (no label over the head) |
| A leaf cause's bone was 20 % of its side's length, so a tall (`<br>`) label on a short bone was drawn across the spine | A cause bone is at least long enough that its label box clears the spine (`(h/2 + 2 − 11) / sin 82°`). With both fixes, 66 of the 481 compared corpus sources move; the rest equal v12 | The layout invariant (no label across the spine) |
| Causes indented less than the first cause were read as top-level causes, silently | The same reading, with one `ISHIKAWA_INDENT_CLAMPED` warning listing every clamped cause (`related`); the editor reports each one as information | D496 |
| An empty body (no effect) drew an empty SVG, silently | The same, with one `ISHIKAWA_EMPTY` warning | D496 |
| The `viewBox` was `getBBox()` of the drawing plus `diagramPadding`, strokes left out | Computed from the layout, half of each stroke included (≤ 1 px larger), plus `diagramPadding` | D224 |
| `ishikawa.useMaxWidth` was documented with default `false`, but the runtime config gave `true` | Default `true`, the value v12 drew with ([Changed defaults](#changed-defaults)) | P2 |
| An `ishikawa.diagramPadding` that was not a number reached the renderer as it was | A number of 0 or more, or a numeric string as its number; anything else lays out with the default 20, with no warning | No `NaN` in the output |
| `format: 'ascii'`: no text output | Throws `UnsupportedFormatError` | R-ASCII-5, D320 |

## Ishikawa SVG structure

What changed in the ishikawa diagram's SVG compared with v12 (spec #519). v12's classes and draw
order are kept: `g.ishikawa` holds `line.ishikawa-spine`, `g.ishikawa-head-group`
(`path.ishikawa-head`, `text.ishikawa-head-label`) and a `g.ishikawa-pair` per pair of causes,
each with its `line.ishikawa-branch`, `g.ishikawa-label-group` (`rect.ishikawa-label-box`,
`text.ishikawa-label.cause`) and a `g.ishikawa-sub-group` per sub-cause
(`line.ishikawa-sub-branch`, `text.ishikawa-label` with `align`, `up` or `down`).

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="ishikawa"`, a `<style>` scoped by the id for strokes, fills and fonts | No root `id`; `class="mermaid mermaid-ishikawa"`, `role="img"`, `aria-roledescription="ishikawa"` (kept), `data-mermaid-version`, and `<title id="<id>-title">` (D492). No `<style>` (except `theme: 'auto'`'s variables-only sheet): `stroke`, `fill`, `stroke-width`, `font-size` and `font-weight` are attributes on each element, colours reading `var(--_x)` aliases (`lineColor`, `mainBkg`, `textColor`) on the root `style`, and `font-family` on the root | R-SEC-2, R-A11Y-1, D133, R-THEME-3 |
| Arrowheads: `marker#ishikawa-arrow-<id>` in `g.ishikawa > defs`, `marker-start` on every branch and sub-branch, scaled by the stroke width (12 px and 6 px) | No `<marker>` and no `<defs>`: a filled `path.ishikawa-arrow` after each branch and sub-branch, the same 12 px and 6 px triangle with its tip at the bone's start | R-SEC-2 (no ids but `-title`), D302 |
| The head group was translated to the spine (`transform="translate(0, spineY)"`), its label by a `translate` from `getBBox()` | Every element at absolute coordinates: no `transform` anywhere | Layout before render |
| Sub-cause labels: `text-anchor: end` at the bone's end, `tspan` lines | `text-anchor="start"` at measured per-line indents, so each line ends at the bone's end (right-aligned, as v12's); head and cause labels centred, as v12's style sheet | `w.label` has no end anchor |
| The spine was drawn first and its length set after the pairs (hand-drawn: drawn last) | The spine first in both looks: its length is known before drawing | Layout before render |
| No source mapping | `data-ast` on the head group, each cause's label group and each sub-cause's sub-group; `data-id` (the AST id: `effect`, `cause:<i>.<j>…`) on bones, arrowheads and text, the spine carrying `effect` | D497, R-PARSE-8 |
| An empty body: an `<svg>` with no `viewBox` and nothing in it | The root only (with a `<title>` when the front matter has a `title`), no `g.ishikawa`, and a `viewBox` of the padding about the origin | D496 |
| `look: neo` and the redux and neo themes: the same shapes as the classic themes | The same: ishikawa differs between families by colour and font size only | D227 |

Hand-drawn (`@mermaid-js/plugin-hand-drawn`): v12 sketched the head and label boxes at roughness
1.5 with a hachure of `mainBkg` (fill weight 2.5, gap 5, stroke 2), the spine and bones at
roughness 1.5, and the arrowheads as rough solid triangles. v13 sketches the head and label boxes
as `node` outlines and the spine and bones as `edge` outlines, at the drawer's defaults for those
roles (node roughness 0.7, hachure fill weight 1.5, gap 1.5; edge roughness 0.3): the outline
hook takes no per-call options, and D304 keeps roughness below 1. Arrowheads are drawn plain, as
without the look (D302). Text is never sketched, as in v12 (D494).
