## State diagram

- **Label text** (D564, D610, #763, #836): state text, composite titles, transition text and
  notes read bold and italic, as in v12. A label that starts with `- `, `* ` or `+ ` is drawn
  as written: no bullet. A code span is drawn as written, backticks included and no monospace,
  and bold and italic outside it are still read. The title and rows of a state with several
  description lines are plain text, as v12 drew them: `**x**` stays as written there and a
  written `\n` breaks the line.
- **A transition written inside a composite that names the composite** (D555):
  `state Boot { Running; Boot --> Running }`, the reverse, and `Outer --> Inner` written inside
  `Inner`. v12 filed the composite under itself (or under a state inside it) and then never
  returned under the ELK layouts, or threw. v13 keeps the composite where it was declared and
  draws the transition, with every layout.
