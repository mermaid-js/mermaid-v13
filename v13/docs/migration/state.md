## State diagram

- **Label text** (D562, #763): state text, composite titles, transition text and notes read
  bold and italic, as in v12. A label that starts with `- `, `* ` or `+ ` or holds backticks is
  drawn as written: no bullet, no monospace. The title and rows of a state with several
  description lines are plain text, as v12 drew them: `**x**` stays as written there and a
  written `\n` breaks the line.
- **A transition written inside a composite that names the composite** (D555):
  `state Boot { Running; Boot --> Running }`, the reverse, and `Outer --> Inner` written inside
  `Inner`. v12 filed the composite under itself (or under a state inside it) and then never
  returned under the ELK layouts, or threw. v13 keeps the composite where it was declared and
  draws the transition, with every layout.
