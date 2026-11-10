## Venn diagram

The venn parser accepts the v12 language (`venn-beta`; oracle parity over the corpus, grammar
in [syntax/venn.md](./syntax/venn.md)), and the layout is a port of venn.js 2.0.0, the solver
v12 drew with (D411): two- and three-set circles equal v12's. What changes (spec #429):

| v12 | v13 | Why |
| --- | --- | --- |
| The layout was solved twice per render: circles with venn.js's padding 15, text nodes and hand-drawn circles with `venn.padding` (8), so text sat on circles of another size (two sets: radius 210 against 217) | One solve, at an author's `venn.padding`, else 15: the circles are v12's, and text nodes and the hand-drawn sketch sit on them. `venn.padding`'s documented default is now 15 | D412 |
| Four or more sets: venn.js started from `Math.random`, so a diagram could change between renders | A fixed-seed start: the same diagram draws the same way every time. Four or more sets are not laid out as v12 laid them out | D413, R-ARCH-6 |
| Text nodes were HTML spans in a `foreignObject` that the browser wrapped; set and overlap labels were `tspan` lines measured with `getComputedTextLength()`, as many as venn.js's wrapping made | Both are SVG text laid out by core ([Labels and text](#labels-and-text)): `<br>`, entities, markdown, math and icons work. Labels wrap to the first set's radius and stop at three lines, the rest of the text joined into the third; text nodes wrap to their cell | D414, D225 |
| Labels that the layout put on top of one another were drawn there | A label that would lie on an earlier area's label moves down below it, in v12's area order, and a repeated area's copies share one label. Measured on the corpus at four canvases: no label moves at the default 800 × 450, at 500 × 600 or at 300 × 300; at 1600 × 200 v12's labels collided and v13's move | #491 (kept because the layout invariant needs it) |
| Text nodes sat on the circles of a second solve (padding 8), labels on the drawn ones (padding 15); a text node could lie under an area's label, its own overlap's when it wraps to several lines, or a neighbouring one's | Text nodes sit on the drawn circles (D412), so they move by a few px (0 to 6 in the baselines: 0 for a centred overlap, 3.8 for `Terraform` under the triple overlap's label in `themes/*`). A text node can still lie under an area's label, as in v12: only labels are kept apart | D412, v12's positions |
| `title "Team overlap"` (the syntax page's own example) drew its quotes | One pair of surrounding quotes is removed, as labels already lost theirs | D416 |
| `venn-beta` with no sets: the render threw | Draws only the title, with one `VENN_EMPTY` warning | D417 |
| A negative size was passed to venn.js; a size too large to square drew `NaN` | Laid out as 0, with one `VENN_INVALID_SIZE` warning naming them | D417 |
| A set of size 0, and the overlaps touching it, were dropped silently | Still dropped, with one `VENN_ZERO_SET` warning | D417 |
| A `text` or `style` naming an undeclared set or overlap was stored and silently not drawn | The same, with one `VENN_UNKNOWN_TARGET` warning | D417 |
| A repeated `set` or `union` was kept as a second subset | The same drawing (the last size wins, each copy takes a slot), with one `VENN_DUPLICATE` warning | D417 |
| A `venn` config value of the wrong type (`width: "wide"`, `padding: -4`) reached venn.js as it was | A number, or a numeric string, in the key's schema range; anything else lays out with the default, with no warning. A padding that leaves no room lays out at 0 | D417 |
| `venn.theme` (default `redux-color`) chose venn's theme when no other layer set one | The same: honoured with v12's default, and a `theme` from `initialize()` or the diagram text wins over it, as in v12 | P2 |
| `format: 'ascii'`: no text output | Throws `UnsupportedFormatError` | D320 |
