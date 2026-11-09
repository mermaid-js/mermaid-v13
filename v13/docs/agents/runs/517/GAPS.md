# Gaps and choices, spec #517

Unmet criteria and choices not covered by the spec or a D-id, per ticket. Items marked **For the maintainer** go into the PR body.

## From exploration (01/02 notes)

- **T1:** `actor A %% x` and `&lt;&lt;…` lex with no lexer error in 12.2.0; the parser rejects them. Lexer parity sees clean streams there; accept/reject is T2's gate.
- **T1/T4:** D471's decode also turns two files' `Hostile("&lt;img onerror…&gt;")` into a raw `<img …>` label. Keep it: it is a sanitisation case, and T4's render properties (`assertInert`) must hold on it.
- **T3:** `compass` is not in code yet (architecture spec, D500 block), so `layout: compass` gives core's `LAYOUT_UNKNOWN` until it lands; usecase only passes the name through. `ELK_NOT_INSTALLED` is raised by core (`packages/mermaid/src/api.ts`), not the plugin. No core helper clips an edge to an ellipse: T3 writes a local one.
- **T4/T5, for the maintainer:** in `redux-color` and `redux-dark-color` v12 gives every boundary a palette slot under both `role` and `rotate` (`styles.ts:110–124`, `usecaseRoleColors.spec.ts:69`), which overrides `usecaseBoundary*`. So D474's boundary-grey family-rule approximation targets values v12 never paints. T4 draws what v12 shows (the boundary's slot) and lists the greys in `DIFFERENCES` only as unpainted.
- **T4, note:** v12 colours by palette only when the theme is named `redux-color`/`redux-dark-color` (`colorThemeGate.ts:37`); `slot()` also follows an author's palette in other themes, as D474 decided.
