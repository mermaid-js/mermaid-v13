# Implementer brief (spec #426, M5a XY chart port)

- **Ticket:** `gh -R mermaid-js/mermaid-v13 issue view <N>`. **Spec:** #426 (its "Maintainer decisions" D381–D389 are decided). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (D314–D339, D341–D428, D540–D543; D224–D227 from pie and D232 from quadrant also apply). **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language).
- **Notes:** this folder. Read `INDEX.md`, `01-v12-xychart.md`, `02-v13-core.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Closest ports:** `packages/diagram-quadrant` (a `custom` chart with axes, jison in v12), `packages/diagram-radar` and `packages/diagram-kanban` (the newest; their `src/theme/vocabulary.ts` is the theme-table layout to copy). Copy, never import another diagram package.
- **Repo rules:** pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-xychart` imports only `@mermaid-js/core` subpaths and has zero dependencies (R-PERF-2; d3 is re-implemented). Test sources are `.mmd` fixtures under `e2e/diagrams/xychart/`, not TS arrays; failing or lexer-only inputs go in `packages/conformance/corpus/xychart-cases.json`. Never hand-edit generated files (registry, config, facets, grammars, theme tables) beyond what `gen:*` produces; regenerate on conflict. Every new file under a `generated/` folder needs `git add -f` (gitignored; CI's clean checkout fails otherwise). Never edit `.github/workflows/*`. Never loosen a gate. Never `--no-verify`. No AI attribution in commits or files (no Co-Authored-By, no "Generated with").
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/x<N>` on `feature/<N>_<short>`. Work only there with absolute paths. Run `pnpm install` first (and again after adding a package; then delete `.eslintcache`).
- **Integration branch:** `feature/426_xychart`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/426-xychart-325760`. Read only from it; never write there.
- **Environment:** run every check with `PATH=$HOME/.volta/tools/image/node/24.16.0/bin:$PATH`, `PARSE_FIXTURE_PATH` unset (`env -u PARSE_FIXTURE_PATH`) and `VITEST_MAX_WORKERS=4`.
- **Theme (D322, D331, D335, D540, D541, D381):** xychart's thirteen `xyChart*` variables go in the package's `DiagramPlugin.theme` table, rows in `src/theme/vocabulary.ts`, `THEME_VARIABLE_TABLE` from `pnpm gen:theme`. Contract: `v13/docs/agents/runs/414/CONTRACT.md`. Keyed by `ThemeSpec.family` and `dark`, never a theme name; section `xyChart` with nested keys (D335), the flat name wins (D540). `inline(v)` reads only what the theme wrote. The plot palette reads core's generic shared palette `plotColorArray` (D381, filled by #506); no core or theme file names xychart. Don't depend on draft #482 (core fallback for themes without `cScale`/git palettes). Test with `createTheme(spec, { diagram: table })`; direction check `tools/gen-config/src/theme-direction.spec.ts`; identity tool `pnpm --filter @mermaid-js/bench theme-identity --out f.json [--compare base.json]`.
- **Core size (R-PERF-8):** `packages/bench/src/core-size.spec.ts` and `packages/mermaid/src/cdn-build.spec.ts` (CDN ≤ 94,208 B gz, little room). Measure before and after anything that touches core or the registry; report both. Over the limit: stop and report the bytes; never touch the gate.
- **Stress specs:** copy pie's pattern (`tLarge / Math.max(tSmall, 2)`), not packet's `repeatsFor`/`MIN_MS`.
- **Decisions:** not covered by the spec or a D-id? Choose the option most consistent with P1/P2, the spec and the D-ids, implement it, and say so under "Deviations" in your reply. Don't wait for an answer. Ask the oracle, don't reason about v12 (pitfall 29).

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/426_xychart HEAD`. If that fails, `git reset --hard feature/426_xychart`.
2. Use the Skill tool with `tdd` (and `ddlt` for layout). Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, model parity, layout invariants). Before T5's manifest lands, render through the package's own test harness as kanban's T4 did.
3. Stay within the ticket's scope. Touch shared files minimally and additively.
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit. Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/426_xychart` and run the checks again.
6. Write `v13/docs/agents/runs/426/tickets/<N>.md` (≤ 40 lines) in your own worktree, committed on your branch: exports, how to use them, test helpers, gz size, core size before/after, decisions, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (five sessions share this machine)

- Every full `pnpm check` and every `pnpm e2e`/Playwright run: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock <command>`, with `VITEST_MAX_WORKERS=4`.
- A timing test that fails under load is not a regression: rerun it under the lock. Known flakes: R-LANG-4 (`language-budget*.spec.ts`) and packet's `stress.spec.ts` ratio of Infinity.
- Timing numbers from this machine are "not measured on a steady machine"; report gz sizes.
