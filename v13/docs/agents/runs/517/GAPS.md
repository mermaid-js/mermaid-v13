# Gaps and choices, spec #517

Unmet criteria and choices not covered by the spec or a D-id, per ticket. Items marked **For the maintainer** go into the PR body.

## From exploration (01/02 notes)

- **T1:** `actor A %% x` and `&lt;&lt;…` lex with no lexer error in 12.2.0; the parser rejects them. Lexer parity sees clean streams there; accept/reject is T2's gate. *Closed (#562):* both are gated cases (`comments-inline`, `entity-stereotype-rejected`); the oracle rejects the latter at `&`.
- **T1/T4:** D471's decode also turns two files' `Hostile("&lt;img onerror…&gt;")` into a raw `<img …>` label. Keep it: it is a sanitisation case, and T4's render properties (`assertInert`) must hold on it. *T1 part closed (#562):* decoded and kept; T4 still owes `assertInert` on it.
- **T3:** `compass` is not in code yet (architecture spec, D500 block), so `layout: compass` gives core's `LAYOUT_UNKNOWN` until it lands; usecase only passes the name through. `ELK_NOT_INSTALLED` is raised by core (`packages/mermaid/src/api.ts`), not the plugin. No core helper clips an edge to an ellipse: T3 writes a local one.
- **T4/T5, for the maintainer:** in `redux-color` and `redux-dark-color` v12 gives every boundary a palette slot under both `role` and `rotate` (`styles.ts:110–124`, `usecaseRoleColors.spec.ts:69`), which overrides `usecaseBoundary*`. So D474's boundary-grey family-rule approximation targets values v12 never paints. T4 draws what v12 shows (the boundary's slot) and lists the greys in `DIFFERENCES` only as unpainted.
- **T4, note:** v12 colours by palette only when the theme is named `redux-color`/`redux-dark-color` (`colorThemeGate.ts:37`); `slot()` also follows an author's palette in other themes, as D474 decided.
- **T1 (#562):** Pele was not on this machine, so its lexer was not consulted. v13 mirrors Chevrotain after a line break in stereotype mode (error, mode kept): T2 may prefer to recover at the line end.
- **T2, from #562's review:**
  - The `directive-unclosed` lexer exclusion hides a real accept/reject divergence: 12.2.0 accepts `usecase-beta\n%%{init\nactor A`, v13 rejects it with core's `UNCLOSED_DIRECTIVE`. T2 lists it as a divergence; T5 adds a MIGRATION row.
  - The `--` quadratic the spec names is v12's labelled-arrow lookahead (`hasLabeledRight`), parser behaviour: the lexer's "runs of --" shape is linear, and T2 repeats that shape (and labelled arrows) on the parser.
  - `LexText.start`/`end` share one forward cursor (no-rewrite path): call them in non-decreasing order, or the total cost turns quadratic on texts cut by many comment lines (documented on the interface).
- **T4:** remove `usecase` from `NOT_DRAWN_YET` and its `LISTED_AHEAD` entry in `tools/gen-config/src/theme-used-by.spec.ts` once the renderer reads `actorBkg`/`actorBorder` (through the table's `slot()` rules).
