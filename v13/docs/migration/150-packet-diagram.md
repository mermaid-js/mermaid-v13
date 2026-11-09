## Packet diagram

The packet parser accepts the v12 language, `packet` and `packet-beta` (oracle parity over every
e2e fixture, the v12 spec strings and the syntax page; grammar in
[syntax/packet.md](./syntax/packet.md)). The differences:

- **Error messages** for syntax errors are new, as for flowchart, and every error is reported,
  not only the first.
- **Misplaced fields (D341).** A field that ends before it starts, leaves a gap or overlaps the
  previous one, or a `+0` field, gives v12's message as an error diagnostic on its bits, and
  parsing goes on: the count resumes from that field's own end (a reversed field from its
  start), so one misplaced field gives one error, not one per later field. The diagram is still
  rejected, as in v12, which stopped at the first.
- **Invalid config (D342).** A `rowHeight`, `bitWidth` or `bitsPerRow` below 1, a negative
  padding, a fractional `bitsPerRow` or a value that is not a number falls back to the default,
  with one `PACKET_CONFIG_INVALID` warning per key, where v12 drew fractional bit numbers,
  negative widths or nothing. A numeric string (`"8"`) counts as its number, as v12 drew it.
- **The 10,000-row cap (D342)** stays, now with one `PACKET_TRUNCATED` warning
  ([Packet SVG structure](#packet-svg-structure) gives its size at the default limits).
- **Labels and the title (D343, D344)** go through core's label layout and shrink to fit, and the
  bounding box covers them ([Packet SVG structure](#packet-svg-structure)).
- **Source mapping (D345).** Each field is the AST node `field:<start>-<end>`, from the range it
  resolves to, so its id survives a label edit; a `+N` field's id moves when an earlier field
  changes width.
- **`format: 'ascii'`** is new (v12 had no text output): the rows as one table of boxes, two
  columns a bit, labels cut to their field with `…`, the bit numbers above each row and the
  title below (D347; [ASCII output](ascii.md#packet-diagrams)).

### Packet theme colours

v12 read `themeVariables.packet` (`startByteColor` … `blockFillColor`). v13 keeps that nested
object and adds a flat name for each key (`packetStartByteColor` … `packetBlockStrokeWidth`, CSS
`--mermaid-packetStartByteColor`, …); the flat name wins when both are set (D335, D540). An
author's value wins in every theme, as in v12, and a nested key leaves the others on the
theme's values. The lengths (10, 12 and 14 px, stroke 1) and the colours in `default`,
`neutral`, `base`, `dark`, `neo`, `redux` and `redux-color` are v12's. What changed
(`packages/conformance/src/packet/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `neo-dark` | No packet block: `styles.ts`'s literals, black bit numbers, labels, title and outlines on `#efefef` blocks, on a dark page | The dark entry, as `dark` draws: neo-dark's own `primaryTextColor` (`#e0dfdf`) for the five inks and its `background` (`#333333`) for the blocks; an override of either moves them | D333(b), R-THEME-11 |
| `redux-dark` | No packet block: `styles.ts`'s literals, black bit numbers, labels, title and outlines on `#efefef` blocks, on a dark page | The dark entry, as `dark` draws: redux-dark's own `primaryTextColor` (`#e0dfdf`) for the five inks and its `background` (`#333333`) for the blocks; an override of either moves them | D333(b), R-THEME-11 |
| `redux-dark-color` | No packet block: `styles.ts`'s literals, black bit numbers, labels, title and outlines on `#efefef` blocks, on a dark page | The dark entry, as `dark` draws: redux-dark-color's own `primaryTextColor` (`#e0dfdf`) for the five inks and its `background` (`#333333`) for the blocks; an override of either moves them | D333(b), R-THEME-11 |
| `forest` | Its own block: the five inks in `primaryTextColor` (`#321b67`), the blocks in `mainBkg` (`#cde498`), following an override of either | `default`'s black on `#efefef`, whatever forest's `primaryTextColor` and `mainBkg`. Set `themeVariables.packet` to draw v12 forest's | D541 |
