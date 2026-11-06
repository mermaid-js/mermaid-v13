# Gaps (spec #421)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0.** Packet needs no new core primitive; its theme contract comes from #414's T0a.
- **T4 before the theme table.** T4 reads the ten packet variables by their flat names with stand-in fallbacks equal to v12's light values (`black`, `#efefef`, 10/12/14 px, stroke 1); T5 deletes them once packet's `DiagramPlugin.theme` table lands on top of #414's T0a.
- **Git remote.** This checkout's remote for `mermaid-js/mermaid-v13` is `origin` (no `mermaid-js` remote); pushes go there.
- **v12 source ref.** The `mermaid@12.2.0` tag is not in this repo (only in the separate v12 checkout). `fa796a943` has the same packet, parser and schema files (only the syntax page differs), and the pie and jison harvesters already read it; packet harvests from `fa796a943` too (D316's pin is met by content, not by the tag name).
- **Spec counts corrected by the exploration (`01-v12-packet.md`).** `packet.spec.ts` has 7 rejections among its 16 strings (one string twice), not six; the syntax page has one real `+N` example (the other is a template) and a fourth example inside an HTML comment; `renderer.spec.ts` has 3 distinct texts over 11 cases; the e2e fixtures do not all end fields on row boundaries (`0-10`, `0`, `1`), though none splits a field; `1e3` is a lexer error at `e` in 2.0.1, not `1`, `3`. The oracle decides; the gate pins what 2.0.1 does.
- **No Pele packet source** on this machine; Pele is not used as a reference.
- **Theme T0a merged** (`feature/414_theme-t0` at `462aef4e9`, contract `v13/docs/agents/runs/414/CONTRACT.md`). Packet's table is declared inline on the plugin (`theme: DiagramThemeTable`, section `packet`, per-variable `nested`) until T0b's per-package `src/theme/vocabulary.ts` convention lands; adopt it then.

## #462 T5 integration (open)

- **Orchestrator choice (for the maintainer): forest is a family-rule approximation (D541), not a new shared input.** v12 forest packet reads its own `primaryTextColor` (#321b67) and `mainBkg` (#cde498); default uses literals. A new generic shared input ("strong text ink", "muted surface") would grow core's vocabulary and every theme spec for one diagram, with core at R-PERF-8's limit, and no second wave-1 port needs it yet. So forest takes the light entry (`black`, `#efefef`): six forest `DIFFERENCES` entries in the theme oracle spec, and one MIGRATION.md row. A later spec that needs a strong ink can promote it.
