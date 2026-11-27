## Mindmap

- **SVG only:** `mindmap` is detected by v12's case-sensitive `mindmap` detector, second after
  `flowchart-elk` as in v12, where it shipped only in the large-feature build. `format: 'ascii'`
  throws `UnsupportedFormatError` (D216). The language service, CodeMirror and Monaco know it.
  For `renderSync`, `preload({ types: ['mindmap'] })` (or `prepare()`) also loads the `tree`
  engine; `layouts` is needed only for another engine, such as an `elk.*` one.
- **Syntax** is v12's: a differential test runs v12 and v13 over every e2e fixture and the v12
  spec and docs examples, and the grammar is in [syntax/mindmap.md](./syntax/mindmap.md). Every
  error is reported, not only the first, with messages in words (R-PARSE-4). A second root
  (`There can be only one root …`) and an `::icon()` or `:::` line before any node are errors,
  as in v12 (the second was a `TypeError` there). v12 also rejects a node right after a blank
  line under the `mindmap` line (`mindmap`, a blank line, then `root`), and after some runs
  where a comment line sits between blank lines (a blank line, `%%`, a blank line, then the
  node); v13 rejects exactly the same texts, and the message says to remove a blank line. Other
  blank and comment lines, two or more in a row included, are accepted as in v12.
- **Layout.** v12 laid mindmaps out with `cose-bilkent`, force-directed and different on every
  render, or with `tidy-tree` when that plugin was registered. v13 uses `tree`, core's two-sided
  tidy tree, so positions differ from both and are the same on every render ([Layout](#layout)):
  the root sits in the middle, the first branches go right and the rest left, split where the
  two sides' heights are closest (D283), and each side keeps source order. Siblings are 20 px
  apart and each level 40 px further out, tidy-tree's gaps; the root's own extra clearance in
  tidy-tree is not reproduced. Cloud and bang nodes are laid out at the box their outline covers.
  With `layout: layered` (or `dagre`) or an installed `elk.*` the same tree is drawn top-down.
- **Config.** Honoured in the `mindmap` section, with v12's defaults: `colorBy` (`branch`; eleven
  sections, as v12), `padding` (10), `maxNodeWidth` (200) and `useMaxWidth` (true). `padding`
  reaches what v12's renderer let it reach (D287): the margin round the drawing and default,
  cloud and bang nodes in every theme, and in the classic themes circles too, and hexagons twice
  over. In the redux family, `neo` and `neo-dark` circles and hexagons take the theme's
  `circlePadding` and `hexagonPaddingX` / `hexagonPaddingY` instead
  ([Theme geometry](#theme-geometry)). Square and rounded nodes keep their own paddings (v12's
  fixed 10 and 15 in the classic themes). v12 meant circles to have a fixed 10, but its check
  never matched, so `padding` sized classic circles there too and does here. `maxNodeWidth` wraps every shape: v12 wrapped square, rounded
  and hexagon nodes at `flowchart.wrappingWidth` instead (both 200 by default, so nothing changes
  unless one of them is set). A `padding` below 0, a `maxNodeWidth` of 0 or less or a value that
  is not a number lays out with the default and warns `MINDMAP_CONFIG_IGNORED`; numeric strings
  (`"20"`, not `"20px"`) are read as numbers, as in v12. `useWidth` and `layoutAlgorithm` are ignored (v12 never
  read them), and `look` is ignored as everywhere (D153), except that `look: handDrawn` sketches
  the mindmap when `@mermaid-js/plugin-hand-drawn` is installed
  ([Hand-drawn look](#hand-drawn-look)). `mindmap.layout` picks the engine for mindmaps and wins
  over the top-level `layout`, with the same names and fallbacks.
- **Hand-drawn colours in the classic themes.** v12 sketched mindmap's shaped nodes (all but the
  plain one, D308) in its generic sketch paints: a `mainBkg` hachure and a `nodeBorder` outline.
  The section colour reached the sketch only through mindmap's `.section-<n>` fill rule, which
  also matched roughjs's paths, so how much of it showed depended on the shape: circles looked
  solid in the section colour, cloud and bang nodes showed it around their edge, and square,
  rounded and hexagon nodes did not show it at all. v13 hachures every shape in the section's
  `cScale` colour (the root's is `git0`, D307) and keeps v12's `nodeBorder` outline, which the
  hand-drawn plugin adds (D693); the plain node is sketched too, with its rule and no outline, as
  v12 drew it. Themes with outlined mindmap nodes (the redux and neo families) keep their own
  outline in the sketch (#1243, #1256).
- **Labels** are SVG text, measured in the theme's font, instead of HTML in `<foreignObject>`
  ([Mindmap SVG structure](#mindmap-svg-structure)). Markdown is read in a markdown string
  (`` "`…`" ``) only, as in every diagram type (#1368). v12 read bold and italic in every node
  label without backticks; v13 draws plain `**bold**` and `_italic_` as written, and the render
  gives one `MARKDOWN_NOT_READ` warning. Write the label as a markdown string, or set
  `legacyMarkdown: true` to read plain labels as v12 did: then bold and italic are read, a label
  that starts with `- `, `* ` or `+ ` is drawn as written (D564, #763), and a code span is
  drawn as written, backticks included, with bold and italic outside it read (D610, #836). A
  label wholly in backticks without quotes (``[`a **b**`]``) is drawn as written in both modes,
  as in v12. A markdown string written as a whole node line, with no shape
  (`` "`a **b**`" ``), is read as markdown too, where v12 drew its quotes and backticks; the
  node's id is still the line as written. Only a markdown string has bullet lists and inline
  code, which v12 did not draw (D56). `<br>`, `<b>`, `<i>`, `<u>`, `<s>`, `<sub>` and `<sup>`
  draw, and a written `\n` breaks the line in every label, markdown string or not, where v12
  showed it as text. A word wider than `maxNodeWidth` stays whole and the node grows to hold
  it, as v12's HTML labels did (#649).
- **The default shape per theme family** is a theme flag, not a theme-name check (D288): plain
  nodes are rounded in the redux family and drawn as v12's `defaultMindmapNode` elsewhere, flat
  at the bottom in `neo` and `neo-dark` ([Theme geometry](#theme-geometry)).
- **Edge widths** follow v12's `edge-depth-<d>` CSS, from the raw indent rather than the tree
  depth, so with two-space indents classic edges are 11, 5 and 3 px wide
  ([Mindmap SVG structure](#mindmap-svg-structure)).
- **Limits** (R-SEC-5): a mindmap may have up to `limits.maxNodes` nodes (10,000) and nest up to
  `limits.maxDepth` levels below the root (100); over either, render rejects with a `LIMIT`
  `MermaidError`. v12 had no such limit. Only the integrator can raise them
  ([Limits](#limits)).
