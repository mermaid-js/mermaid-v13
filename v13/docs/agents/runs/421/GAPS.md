# Gaps (spec #421)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0.** Packet needs no new core primitive; its theme contract comes from #414's T0a.
- **T4 owns packet's theme table.** #414's T0a landed before T4 started, so T4 declares the `DiagramPlugin.theme` table (section `packet`, the ten flat variables with `nested` keys, a light entry for every family and a dark entry) and reads it; no stand-ins. T5 adds the theme oracle spec over the eleven themes, the `DIFFERENCES` entries, baselines and MIGRATION.md rows.
- **Git remote.** This checkout's remote for `mermaid-js/mermaid-v13` is `origin` (no `mermaid-js` remote); pushes go there.
- **v12 source ref.** The `mermaid@12.2.0` tag is not in this repo (only in the separate v12 checkout). `fa796a943` has the same packet, parser and schema files (only the syntax page differs), and the pie and jison harvesters already read it; packet harvests from `fa796a943` too (D316's pin is met by content, not by the tag name).
- **Spec counts corrected by the exploration (`01-v12-packet.md`).** `packet.spec.ts` has 7 rejections among its 16 strings (one string twice), not six; the syntax page has one real `+N` example (the other is a template) and a fourth example inside an HTML comment; `renderer.spec.ts` has 3 distinct texts over 11 cases; the e2e fixtures do not all end fields on row boundaries (`0-10`, `0`, `1`), though none splits a field; `1e3` is a lexer error at `e` in 2.0.1, not `1`, `3`. The oracle decides; the gate pins what 2.0.1 does.
- **No Pele packet source** on this machine; Pele is not used as a reference.
- **Theme T0a merged** (`feature/414_theme-t0` at `462aef4e9`, contract `v13/docs/agents/runs/414/CONTRACT.md`). Packet's table is declared inline on the plugin (`theme: DiagramThemeTable`, section `packet`, per-variable `nested`) until T0b's per-package `src/theme/vocabulary.ts` convention lands; adopt it then.

- **Base merge goes through #414.** M4 wave 2 (#398, #404, #406) merged into `mermaid-v13` at `488a4bf5e`. Merging it here directly conflicts in 15 files, almost all core theme files where T0a and M4 wave 2 both edit (`theme.ts`, `vocabulary.ts`, `spec.ts`, `specs/*.ts`, generated variables). That resolution belongs to #414, so this branch takes the new base through `feature/414_theme-t0` once it has merged `mermaid-v13`, rather than resolving T0's conflicts twice. The wave coordinator made this the rule for every M5a port until the Theme T0 PR (#472) merges; the coordinator sends the new T0 tip. Packet-owned conflicts left for that merge: `langium-lexer.ts` (gitGraph's row and packet's: keep both), `conformance/package.json`, `theme-used-by.spec.ts`, `pnpm-lock.yaml` (regenerate).

## #462 T5 integration (open)

- **Orchestrator choice (for the maintainer): forest is a family-rule approximation (D541), not a new shared input.** v12 forest packet reads its own `primaryTextColor` (#321b67) and `mainBkg` (#cde498); default uses literals. A new generic shared input ("strong text ink", "muted surface") would grow core's vocabulary and every theme spec for one diagram, with core at R-PERF-8's limit, and no second wave-1 port needs it yet. So forest takes the light entry (`black`, `#efefef`): six forest `DIFFERENCES` entries in the theme oracle spec, and one MIGRATION.md row. A later spec that needs a strong ink can promote it.

## #452 T1 lexer (merged)

- Follow-up, not in this spec (for the maintainer): packet's `lexer.ts` shares about 75% of its lines with pie's (the `common.langium` rules: strings, YAML, directives, accessibility closers, blanks, memos), `packetTokens` mirrors `pieTokens`, `lexer-parity.spec.ts` mirrors pie's, and `stress.spec.ts` repeats `cpuMs`/`cost`. Diagram packages cannot share code with each other, so the home is core's parser kit (a Langium-common lexer helper) and a shared Langium parity runner in conformance. Radar, cynefin and the later Langium ports would be the third and further copies.
- Review findings fixed before the merge (`b1454682f`): a package lexer unit spec (pitfall 4), a harvest drift spec for the pie and packet corpora, the 15 sources v12 does not lex pinned by id, test names dropped from the harvest (pie unchanged), stress small runs sized past the 2 ms floor.
- [ ] **#460 or #462:** remove packet's `NOT_DRAWN_YET` skip in `tools/gen-config/src/theme-used-by.spec.ts` once the renderer reads theme variables.

## Shared contracts

- **`PacketModel`** (`packages/diagram-packet/src/model.ts`): landed by the orchestrator before #454 and #456 start in parallel, shaped from the spec's model list. #454 produces it; #456 and #464 read it. Change it only additively and note the change here.
