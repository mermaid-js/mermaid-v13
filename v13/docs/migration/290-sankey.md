## Sankey

- **Detection:** `sankey` and `sankey-beta` are detected by v12's case-sensitive detector with
  no word boundary, between `quadrantChart` and `packet` as in v12. So `sankeyx` is detected as
  a sankey diagram and then rejected as a syntax error (`SYNTAX`), and `Sankey` is not detected
  at all (`UNSUPPORTED_DIAGRAM`), as in v12. The language service, CodeMirror and Monaco know it.
- **Syntax** is v12's CSV: a differential test runs v12 and v13 over every e2e fixture and the
  v12 spec and docs examples, and the grammar is in [syntax/sankey.md](./syntax/sankey.md).
  Every error is reported, not only the first, with messages in words and a range at the field
  (R-PARSE-4). Names stay printable ASCII, quotes and `""` as in v12.
- **Cycles** (D393): a self-link or any cycle parsed in v12 and then threw d3-sankey's bare
  `circular link` at render. It is now a parse error at the cycle's first row,
  `Sankey diagrams cannot have circular links, and "<node>" is part of one.`, one per group of
  nodes that reach each other; the diagram is still rejected (`SYNTAX`), and the language
  service reports it.
- **Values** (D394): a value that is not a number, negative or infinite counts as 0, where d3
  drew `NaN` or negative boxes, with one `SANKEY_INVALID_VALUE` warning per render naming every
  such row. Zero links are still drawn 1 px wide, as in v12. A value with text after its number
  (`1 2`, `1;`) is still read by `parseFloat`, with one `SANKEY_VALUE_TRAILING_TEXT` warning
  per such value.
- **Labels** (D395) read as v12 drew them, one line `<name> <value>`, and the front-matter
  `title` is the accessible name, never drawn (D396): see
  [Sankey SVG structure](#sankey-svg-structure).
- **Config.** The `sankey` section is honoured with v12's defaults: `width` (600), `height`
  (400), `linkColor` (`gradient`), `nodeAlignment` (`justify`), `nodeWidth` (10), `nodePadding`
  (12), `showValues` (true), `prefix` and `suffix` (empty), `labelStyle` (`legacy`),
  `nodeColors` (none) and `useMaxWidth`, whose default is `true`: v12's schema documented
  `false`, but its bundled defaults held `true`, so every sankey without the key drew
  `width="100%"` with a `max-width`, and v13 keeps that. A length is a number of 0 or more or a
  numeric string as its number; a negative or non-numeric length, an unknown `nodeAlignment` or
  `labelStyle` and a value of the wrong type lay out with the default and warn
  `SANKEY_CONFIG_INVALID`, once per key (v12 passed them to d3 as they were: a negative
  `nodePadding` overlapped nodes, and a string one was concatenated with 15). A `linkColor` or
  `nodeColors` value that fails the colour check, a misspelt colour included (D690), is dropped,
  the default drawn (the gradient, or the node's next Tableau10 colour), with one
  `SANKEY_COLOR_INVALID` warning per render naming each. `useWidth` is ignored (v12's
  sankey never read it), and `look` as everywhere (D153).
- **Text output** (`format: 'ascii'`) throws `UnsupportedFormatError` (D320), and sankey is not
  sketched under `look: handDrawn`, as v12 never sketched it (D301).
- **Limits** (R-SEC-5): a diagram may have up to `limits.maxNodes` nodes (10,000) and
  `limits.maxEdges` links (5,000); over either, render rejects with a `LIMIT` `MermaidError`.
  v12 had no such limit. Only the integrator can raise them ([Limits](#limits)).
