# Implementer brief (spec #424, M5a kanban port)

- **Ticket:** `gh -R mermaid-js/mermaid-v13 issue view <N>`. **Spec:** #424 (its "Maintainer decisions" D371–D379 are decided). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (D314–D339, D341–D428, D540–D541; D224–D227 from pie and D283–D289 from mindmap also apply). **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language).
- **Notes:** this folder. Read `INDEX.md`, `01-v12-kanban.md`, `02-v13-core.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Closest port:** mindmap (jison, indent-based, the same lexer family), not yet merged: read it with `git show origin/feature/294_mindmap:<path>` (package `packages/diagram-mindmap`, run notes `v13/docs/agents/runs/294/`). Copy, never import. `layoutKind: 'custom'` model: `packages/diagram-journey`, `packages/diagram-timeline`.
- **Repo rules:** pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-kanban` imports only `@mermaid-js/core` subpaths. Test sources are `.mmd` fixtures under `e2e/diagrams/kanban/`, not TS arrays; failing or lexer-only inputs go in `packages/conformance/corpus/kanban-cases.json`. Never hand-edit generated files (registry, config, facets, grammars, theme tables) beyond what `gen:*` produces; regenerate on conflict. Never edit `.github/workflows/*`. No AI attribution in commits or files (no Co-Authored-By, no "Generated with").
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Work only there with absolute paths. Run `pnpm install` first (and again after adding a package; then delete `.eslintcache`).
- **Integration branch:** `feature/424_kanban`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/424-kanban-d932d4`. Read only from it; never write there.
- **Environment:** run every check with `PATH=$HOME/.volta/tools/image/node/24.16.0/bin:$PATH` and `PARSE_FIXTURE_PATH` unset (`env -u PARSE_FIXTURE_PATH`).
- **Theme (D322, D331, D335, D540):** kanban adds no rows to core. Its theme entries go in the package's `DiagramPlugin.theme` table (`import type { DiagramThemeTable } from '@mermaid-js/core/theme'`), declared inline on the plugin for now (T0b's per-package `src/theme/vocabulary.ts` convention is additive). The contract is merged here: `v13/docs/agents/runs/414/CONTRACT.md` (T0a, #438). Rules read only shared names, palette slots (`cScale<n>`) and the table's own vars; `rules.dark` applies under a dark theme or `darkMode`; families key on `ThemeSpec.family`, never a theme name. Test with `createTheme(spec, { diagram: table })`; direction check `tools/gen-config/src/theme-direction.spec.ts`; identity tool `pnpm --filter @mermaid-js/bench theme-identity --out f.json [--compare base.json]`.
- **Core size (R-PERF-8):** `packages/bench/src/core-size.spec.ts` and `packages/mermaid/src/cdn-build.spec.ts` (CDN ≤ 94,208 B gz, little room). Measure before and after anything that touches core or the registry; report both. Over the limit: stop and report the bytes; never touch the gate.
- **Decisions:** not covered by the spec or a D-id? Choose the option most consistent with P1/P2, the spec and the D-ids, implement it, and say so under "Deviations" in your reply. Don't wait for an answer. Ask the oracle, don't reason about v12 (pitfall 29).

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/424_kanban HEAD`. If that fails, `git reset --hard feature/424_kanban`.
2. Use the Skill tool with `tdd` (and `ddlt` for layout). Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, model parity, layout invariants). Before T5's manifest lands, render through the package's own test harness as mindmap's T4 did.
3. Stay within the ticket's scope. Touch shared files minimally and additively.
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit. Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/424_kanban` and run the checks again.
6. Write `v13/docs/agents/runs/424/tickets/<N>.md` (≤ 40 lines) in your own worktree, committed on your branch: exports, how to use them, test helpers, gz size, core size before/after, decisions, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (many sessions share this machine)

- Every full `pnpm check`: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check`.
- Every Playwright e2e run: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock <command>`.
- A timing test that fails under load is not a regression: rerun it under the lock. Timing numbers from this machine are "not measured on a steady machine"; report gz sizes.
