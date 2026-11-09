## Requirement diagram

- **Detection:** `requirementDiagram` and v12's bare `requirement` are detected by v12's
  case-sensitive detector with no word boundary (`/^\s*requirement(Diagram)?/`), between `pie`
  and `sequence` as in v12. So `requirementsx` is detected and then rejected as a syntax error
  (`SYNTAX`), and `RequirementDiagram` is not detected (`UNSUPPORTED_DIAGRAM`), as in v12. The
  language service, CodeMirror and Monaco know it.
- **Syntax** is v12's: a differential test runs v12 and v13 over every e2e fixture, the v12
  spec strings and docs examples, and the grammar is in
  [syntax/requirement.md](./syntax/requirement.md). Every error is reported, not only the first,
  with a range at the token (R-PARSE-4).
- **Trailing blanks** (D431): blanks before a line end are dropped, so the five places where
  v12 rejected them (after the header, after `{`, after a keyword value, after a quoted value)
  now accept. The six forms v12 accepted only because a blank swallowed the next line break
  (`requirement ⏎ a {`, `a - traces ⏎-> b`, …) keep v12's model.
- **`direction`** (D432) is a statement only at the start of a line, and the rest of the line
  is read as usual: `a - traces -> b direction LR` is a relation to `b direction LR`, which v12
  dropped silently. Text after a line-start direction (`direction LR;`,
  `direction LR a - traces -> b`) is now one syntax error, where v12 dropped the rest of the
  line.
- **Order-dependent styling** (D433) is kept: a `style`, `class` or `:::` before its box is
  defined is lost, `style` stops at its first unknown name and `classDef default` reaches the
  boxes defined before it only, as in v12. One `REQUIREMENT_STYLE_DROPPED` warning per render
  lists each lost statement (`related`, `astIds`). Style copies are capped at 1,000,000: past
  that the render fails with `MermaidError` `code: 'LIMIT'`, `limit: 'maxLayoutWork'`
  (R-SEC-5).
- **Unknown ends, duplicates and shared names** (D434): a relation to a name no box has stays
  in the model and is not drawn, with one `REQUIREMENT_UNKNOWN_NODE` warning; of duplicate
  definitions the first is kept, with one `REQUIREMENT_DUPLICATE` warning; a requirement and an
  element of one name are two boxes, relations and styles reaching the requirement first (v12's
  order), with one `REQUIREMENT_SHARED_NAME` warning. v12 warned about none of them.
- **Theme variables** (D435): `requirementBackground`, `requirementBorderColor`,
  `requirementBorderSize`, `requirementTextColor` and `relationLabelBackground`, which v12
  documented and never read, now take effect, with `relationColor` and `relationLabelColor`
  added; unset, they draw v12's colours. The redux themes' label chip is white (dark: `#16141f`),
  as v12 drew it. See [theme-variables.md](./theme-variables.md).
- **Boxes** (D436) keep v12's one-column `Key: value` text with no wrapping. A multi-line value
  (a quoted text spanning lines) is stacked line under line, where v12 overlapped it with the
  line above, and a font whose half line passes the 20px padding no longer draws text above
  the box (its top is clamped). Body lines are left-aligned 10px in under every engine, where
  v12 with dagre centred them.
- **Config.** The `requirement` section is honoured: `theme` (default `redux-color`, as v12),
  `layout` (no requirement default: the top-level `layout`, `layered`) and `useMaxWidth`. v12's
  renderer read `state.useMaxWidth`, `state.nodeSpacing`, `state.rankSpacing` and
  `state.titleTopMargin` instead (a v12 bug): v13 reads `requirement.useMaxWidth`, and the
  spacing (50 by 50) and title margin (25) are fixed, v12's defaults; a `state.*` key no longer
  changes a requirement diagram. `useWidth`, `rect_fill`, `text_color`, `rect_border_size`,
  `rect_border_color`, `rect_min_width`, `rect_min_height`, `fontSize`, `rect_padding` and
  `line_height` are accepted and ignored, as v12.2.0's renderer never read them (see the
  ignored-keys table); `look` as everywhere (D153).
- **Edges** follow `flowchart.curve` (class's precedent), a self-loop always `rounded`; the
  layout keeps room for each marker so it no longer overlaps the next box.
- **Text output** (`format: 'ascii'`) throws `UnsupportedFormatError` for now (D320; D438 is
  the planned shape). The diagram is sketched under `look: handDrawn` (the box outline and the
  divider; markers are never sketched, D301).

## Requirement SVG structure

What changed in the requirement diagram's SVG compared with v12 (DESIGN §7.2, spec #520 T4,
#574). The groups are v12's unified render's (`edgePaths`, `edgeLabels`, `nodes`), and v12's
class names are kept where the element still exists (`node default <classDef>`, `basic
label-container outer-path`, `divider`, `relationshipLine`, `edge-thickness-normal`,
`edge-pattern-solid`/`-dashed`, `edgeLabel`, `labelBkg`, `requirementDiagramTitleText`).

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `class="requirementDiagram"`, `aria-roledescription="requirement"`, a `<style>` element | No root `id`; `class="mermaid mermaid-requirement requirementDiagram"`, `role="img"`, `aria-roledescription="requirement"`, `data-mermaid-version`; no `<style>`, colours are presentation attributes reading `var(--_x)` aliases | Only `<id>-title` and `<id>-desc` ids, and the neo gradient's (D182, R-A11Y-1); inert output (R-SEC-2) |
| Box `<g class="node default …" id="<render id>-<name>" data-look>` | `<g class="node default …" data-id="<name>" data-ast="requirement:<name>"\|"element:<name>" data-color-id transform>` | `data-ast` maps the box to its definition (D437, R-PARSE-8); `look` is removed (D153) |
| Outline as rough.js paths in `<g class="basic label-container outer-path">` (a fill path and a stroke path) | One `<rect class="basic label-container outer-path">` (through the outline hook: a sketch under `look: handDrawn`) | One element per outline (D302) |
| Each line a `<g class="label">` holding a `<foreignObject>` (or `<text>`), `<<Kind>>` and the name centred, the body centred under dagre and left-aligned under ELK | One `<text class="label kind\|name\|id\|text\|risk\|verification\|type\|docRef">` per line; the body left-aligned 10px in under every engine, a multi-line value stacked line under line | Text labels only (D5); GAPS #570 |
| Divider `<g class="divider">` with a rough.js line (neo: a 0.001-tall polygon) | `<g class="divider">` with one `<path>`: the rule alone, its right end lifted 0.01 under the neo gradient so the gradient paints it | D185, as class's dividers; the outline is sketched once under `look: handDrawn` |
| Relation `<path class="edge-thickness-normal edge-pattern-dashed\|solid relationshipLine" id="<render id>-<src>-<dst>-<n>" data-id="<src>-<dst>-<n>" marker-start\|marker-end>`, `<marker>` elements in `<defs>` | `<path class="edge-thickness-normal edge-pattern-dashed\|solid relationshipLine" data-id="<src>-<dst>-<n>" data-ast="relation:<src>-><dst>">` and its marker beside it: `<path class="marker requirement_arrow">` (the chevron's two strokes) at the target, or `<g class="marker requirement_contains">` (a `<circle>` and the plus `<path>`) at the source | No `<defs>` or ids (D35); markers are never sketched (D301) |
| A relation to a name no box has: an edge with an undefined end | Not drawn; its `<n>` still counts it | D434 |
| `look: neo`: 2px lines, the chevron at 0.8 in user space, marker strokes and box outline at `strokeWidth`, the gradient on the outline and divider, the drop shadow on the outline | The same, by theme family: the redux and neo themes draw it, the classic themes draw v12 classic (1px lines, a 20 × 20 chevron and r 9 circle with 1px strokes, a 1.3px outline, no shadow). The geometry is `relationStrokeWidth` (lines and marker strokes), `relationArrowScale` and `requirementBorderSize` | D152, D153, D227 |
| Marker room: none (dagre); markers could overlap the next box | The layout keeps each marker's drawn extent clear, from the theme's marker geometry (21 × 21 classic, 20 × 20 redux and neo, more for a wider `strokeWidth`; marker strokes stop at 8px, the chevron scale at 2) | Spec #520 (marker room from the family tokens) |
| Edge label `<g class="edgeLabel">` with `<foreignObject>` (`div.labelBkg`, `span.edgeLabel`) | `<g class="edgeLabel" data-id>` with `<rect class="labelBkg">` 4px wider than the text each side and a `<text>` | Text labels; labels carry no `data-ast` (D437) |
| Edges drawn with `flowchart.curve` (`rounded` by default) | The same curves, through `flowchart.curve` (class's precedent) | |
| A self-loop drawn with `flowchart.curve` | A self-loop is always `rounded`, whatever the curve | Class's precedent: its legs are too short for the other curves |
| A `style` / `classDef` `fill` left the text in the theme's ink (`styles2String` sends only `color` and `font-*` to the labels) | A `fill` with no `color` gives the text `theme.ink(fill)`, an ink that reads on it | R-THEME-12, ER's precedent |
| Palette colours by CSS `[data-color-id].node path` rules | `data-color-id` kept; the colours are attributes on the outline and divider; an author `style` still wins | D152 |
| Front-matter `title` as `<text class="requirementDiagramTitleText" y="-25">` | `<text class="requirementDiagramTitleText">` centred over the drawing, its baseline 25px above the layout's top, in `textColor`; the viewBox grows to hold it | D218 |
| Five documented theme variables (`requirementBackground`, `…BorderColor`, `…BorderSize`, `…TextColor`, `relationLabelBackground`) drew nothing | They, `relationColor` and `relationLabelColor` paint the boxes, text, lines, markers and label chips, with v12's drawn values by default | D435 |
