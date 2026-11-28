## State diagram

- **A comma inside a `style` or `classDef` value** (D706, #1312): `fill:rgb(255, 200, 200)`,
  `stroke:hsl(210, 60%, 40%)` and `font-family:Georgia, "Times New Roman", serif` keep the
  whole value. v12 split the statement at every comma, so the colour was lost and the font list
  kept only its first name, without a warning.
- **Markdown only in a markdown string** (#1368): every state label (state text,
  descriptions, the lines of a state with several descriptions, transition text, notes and
  composite titles) reads markdown only in a markdown string (`` "`…`" ``), as in every type.
  v12 read `**bold**` and `_italic_` in most of them without one; v13 draws those markers as
  written and the render gives one `MARKDOWN_NOT_READ` warning. Write the label as
  `` "`…`" ``, or set `markdownAlwaysOn: true` (globally or as `state.markdownAlwaysOn`) to
  draw every label as markdown. A markdown string, which v12 drew with its backticks, now
  draws as markdown in every label, `state "`…`" as X` and composite titles included. Bare
  backticks (`` A --> B : `code` ``) and a code span in plain text are drawn as written. Tags
  (`<b>`, `<br>`, …) draw in every label, as before.
- **A written `\n` breaks the line** (#1368, #1330): in every state label, `\n` written as two
  characters breaks the line, as `<br>` does (`S1 --> S4: long line using \nshould work`). v12
  drew it as text everywhere but in a composite title and in the lines of a state with several
  descriptions.
- **`markdownAlwaysOn: true` draws every label as markdown** (#1368): every state label, the
  composite title included, is read as a markdown string is: bold, italic, inline code (a code
  span draws in monospace without its backticks) and list items (a label that starts with
  `- `, `* ` or `+ `). v12 drew list markers and code spans as written, and never read
  markdown in a composite title or in the lines of a state with several descriptions. Tags
  and a written `\n` draw as without the setting.
- **A described state is not wrapped** (D731, #1214): the title and the description rows of a
  state with several description lines break only at a written `\n`, never at
  `state.wrappingWidth`, and the box grows to the longest line. This holds in cells too. v12 built
  these labels with an infinite width. A state with one description wraps as before.
- **Room below a composite's title** (D732, #1301, #1307): the first state or start dot in a
  titled composite sits 20 px below the line under the title, the same room as on the other
  three sides, at every nesting level. v12 left about 8 to 12 px there. The concurrency regions
  of a composite start at that line, so their dividers run from it to the bottom border. Titled
  composites are 16 px taller than before; the title keeps its place in the strip.
- **Transition curves** (D733, #1324, #1325): `state.curve` sets how transitions and note
  connectors are drawn, then the top-level `curve`, then `curved`, today's look, so a diagram
  that sets neither draws as before. `flowchart.curve` no longer changes state diagrams: v12's
  shared edge renderer fell back to it, v13 does not, so a v12 author who set it for state
  edges sets `state.curve` or `curve` instead. A self-transition stays `rounded`, and text
  output stays stepped. A name outside the list is drawn `rounded` and warns `CURVE_UNKNOWN`
  once per render.
- **A transition written inside a composite that names the composite** (D555):
  `state Boot { Running; Boot --> Running }`, the reverse, and `Outer --> Inner` written inside
  `Inner`. v12 filed the composite under itself (or under a state inside it) and then never
  returned under the ELK layouts, or threw. v13 keeps the composite where it was declared and
  draws the transition, with every layout.
- **Limits** (R-SEC-5, D608): a state diagram may have up to `limits.maxNodes` states (10,000)
  and `limits.maxEdges` transitions (5,000). Start and end dots, forks, joins, choices and
  composite states count as states; concurrency regions and notes do not. Over either, render
  rejects with a `LIMIT` `MermaidError`. v12 had no such limit. Only the integrator can raise
  them ([Limits](#limits)).
- **Transition labels are tags** (D626–D630): a rounded box (`rx` 6) with 8 px of room each
  side and 4 px above and below, filled opaque with `edgeLabelBackground` (the theme background
  unless set) and bordered 1 px solid in the transitions' line colour. v12 drew the label on a
  half-transparent fill with no border. Transitions reserve the matching room, so diagrams with
  labels grow a little. Under `look: handDrawn` the border is sketched.
