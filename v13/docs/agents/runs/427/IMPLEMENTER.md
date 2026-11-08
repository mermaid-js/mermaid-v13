# Implementer brief (spec #427, M5a sankey port)

- **Ticket:** `gh -R mermaid-js/mermaid-v13 issue view <N>`. **Spec:** #427 (its "Maintainer decisions" D391–D398 are decided). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (D314–D339, D341–D428, D540–D543; D224–D227 from pie also apply). **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language).
- **Notes:** this folder. Read `INDEX.md`, `01-v12-sankey.md`, `02-v13-core.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Closest ports (copy, never import):** kanban (`packages/diagram-kanban`, jison, merged; run notes `v13/docs/agents/runs/424/`) for the jison gate, parser, facet and integration; pie (`packages/diagram-pie`) and radar for `layoutKind: 'custom'`.
- **Repo rules:** pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-sankey` imports only `@mermaid-js/core` subpaths and has zero dependencies (d3-sankey is re-implemented). Test sources are `.mmd` fixtures under `e2e/diagrams/sankey/`, not TS arrays; failing or lexer-only inputs go in `packages/conformance/corpus/sankey-cases.json`. Never hand-edit generated files (registry, config, facets, grammars, theme tables) beyond what `gen:*` produces; regenerate on conflict. Never edit `.github/workflows/*`. Never loosen a gate. Never `--no-verify`. No AI attribution in commits or files (no Co-Authored-By, no "Generated with").
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Work only there with absolute paths. Run `pnpm install` first (and again after adding a package; then delete `.eslintcache`).
- **Integration branch:** `feature/427_sankey`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/427-sankey-bb8fa5`. Read only from it; never write there. T0 (#492) is the exception: it branches off `mermaid-v13` (see its brief).
- **Environment:** run every check with `PATH=$HOME/.volta/tools/image/node/24.16.0/bin:$PATH`, `PARSE_FIXTURE_PATH` unset (`env -u PARSE_FIXTURE_PATH`) and `VITEST_MAX_WORKERS=4`.
- **Theme (D322, D331, D335, D540, D541):** sankey adds no theme variables (spec; D152: Tableau10 is a package constant). The renderer reads only shared names (`textColor`, `mainBkg`, `fontFamily`) and never a theme name or `look`. Contract: `v13/docs/agents/runs/414/CONTRACT.md`. Don't depend on draft #482.
- **Core size (R-PERF-8):** `packages/bench/src/core-size.spec.ts` and `packages/mermaid/src/cdn-build.spec.ts` (CDN ≤ 94,208 B gz, little room). Measure before and after anything that touches core or the registry; report both. Over the limit: stop and report the bytes; never touch the gate.
- **Decisions:** not covered by the spec or a D-id? Choose the option most consistent with P1/P2, the spec and the D-ids, implement it, and say so under "Deviations" in your reply. Don't wait for an answer. Ask the oracle, don't reason about v12 (pitfall 29).
- **Stress specs:** pie's pattern (`tLarge / Math.max(tSmall, 2)`, best of N), never packet's `repeatsFor`/`MIN_MS`.

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/427_sankey HEAD`. If that fails, `git reset --hard feature/427_sankey`.
2. Use the Skill tool with `tdd` (and `ddlt` for layout). Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, model parity, layout invariants, T0's writer). Before T5's manifest lands, render through the package's own test harness as kanban's T4 did.
3. Stay within the ticket's scope. Touch shared files minimally and additively.
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit. Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/427_sankey` and run the checks again.
6. Write `v13/docs/agents/runs/427/tickets/<N>.md` (≤ 40 lines) in your own worktree, committed on your branch: exports, how to use them, test helpers, gz size, core size before/after, decisions, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (five sessions share this machine)

- Every full `pnpm check`: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check` (with `VITEST_MAX_WORKERS=4`). Same lock for `pnpm e2e`.
- A timing test that fails under load is not a regression: rerun it under the lock.
- `generated/` folders are gitignored: every new generated file (grammar highlighters, `config-defaults.ts`, …) must be added with `git add -f`, or CI's clean checkout fails `check:*` while local runs pass. Timing numbers from this machine are "not measured on a steady machine"; report gz sizes.
