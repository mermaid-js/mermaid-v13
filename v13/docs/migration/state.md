## State diagram

- **Label text** (D564, #763): state text, composite titles, transition text and notes read
  bold and italic, as in v12. A label that starts with `- `, `* ` or `+ ` or holds backticks is
  drawn as written: no bullet, no monospace. The title and rows of a state with several
  description lines are plain text, as v12 drew them: `**x**` stays as written there and a
  written `\n` breaks the line.
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
