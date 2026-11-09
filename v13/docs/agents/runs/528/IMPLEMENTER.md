# Implementer brief (spec #528, M5b swimlane layout engine)

- **Ticket:** `gh -R mermaid-js/mermaid-v13 issue view <N>`. **Spec:** #528 (its "Maintainer decisions" D531–D538 are decided; read the issue's comments for D537's amendments). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (D318, D327, D502, D531–D538, D546; D179, D226, D285, D301 also apply). **Recipe:** `v13/docs/agents/port-diagram/` (README, pitfalls, theming).
- **Notes:** this folder. Read `INDEX.md`, `01-v12-engine.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **This is a layout-track spec, not a diagram port (D318).** No parser work: `swimlane-beta` is flowchart's syntax.
- **Port shape (T0a/T0b):** keep v12's engine files close to verbatim (same file names and function names, under `packages/core/src/layout/swimlane/`), so later upstream fixes come over by hand against `c9b12739f` (D66, D532). Adapt at the edges: one adapter builds the engine's internal mutable data from `LayoutGraph` and one writes `LayoutModel` back. Drop pools and anchored nodes (D531) and v12's logger (warnings belong to T2, D536). No dependencies. Specs: v12's spec files rewritten to build `LayoutGraph` inputs (or the internal graph through the adapter) and assert the same things; keep each v12 spec file's name.
- **Shared files (#637):** read `v13/docs/agents/port-diagram/shared-files.md`. Never add a line to a shared list; run `pnpm regen` after changing an input and on any generated-file conflict (take theirs, then regen). MIGRATION text for swimlane goes in `v13/docs/migration/flowchart-swimlane.md`. `LAZY_LAYOUTS`, `PEER_LAYOUTS`, flowchart's registration and the schema's `swimlane`/`lineHops` keys are shared code: edit them as code.
- **Repo rules:** pnpm; no TS enums; no console in shipped packages. Test sources are `.mmd` fixtures, never TS corpus arrays. Never hand-edit generated files beyond what `gen:*` produces; regenerate on conflict. Never edit `.github/workflows/*`. Never loosen a gate. Never `--no-verify`. No AI attribution in commits or files (no Co-Authored-By, no "Generated with").
- **Worktree:** `/Users/ashishj/repos/mermaid-v13/.claude/worktrees/t<N>` on the ticket's branch (`INDEX.md`). Work only there with absolute paths. Run `pnpm install` first (and again after adding a package; then delete `.eslintcache`).
- **Base:** T0a, T0b and T0c branch off `mermaid-v13` (T0b off T0a's branch) and become their own PRs. T1+ branch off the integration branch `feature/528_swimlane` (checked out at `/Users/ashishj/repos/mermaid-v13/.claude/worktrees/w4-swimlane`; read only, never write there).
- **Environment:** Node and pnpm from Volta (`~/.volta/bin`). Run checks with `env -u PARSE_FIXTURE_PATH VITEST_MAX_WORKERS=4`.
- **Core size (R-PERF-8, D546):** `packages/bench/src/core-size.spec.ts` (`measureCoreSize`) and `packages/mermaid/src/cdn-build.spec.ts`, limit 98,304 B gz. Baseline on `mermaid-v13` at e1e953abc (after T0a #628 and compass #630) is 94,412 B. Measure before and after anything that touches core or the registry; report both. Over the limit: stop and report; never touch the gate.
- **Decisions:** not covered by the spec or a D-id? Choose the option most consistent with the spec and the D-ids, implement it, and say so under "Deviations" in your reply. Don't wait for an answer.
- **Stress and timing specs:** pie's ratio pattern (`tLarge / Math.max(tSmall, 2)`, best of N), never absolute times.

## Steps

1. Confirm the base (see **Base**): `git merge-base --is-ancestor <base> HEAD`.
2. Work test first. Test through `createMermaid().render()` / `renderSync()`, except where the ticket names its own seam (T0: `swimlane(graph, ctx)` and the engine's internals).
3. Stay within the ticket's scope. Touch shared files minimally and additively.
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit. Don't push, open PRs, or comment on or close issues.
5. Before reporting, merge the base again and rerun the checks.
6. Write `v13/docs/agents/runs/528/tickets/<N>.md` (≤ 40 lines) in your own worktree, committed on your branch: exports, how to use them, test helpers, gz size, core size before/after, decisions, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (wave 4 sessions share this machine)

- Every full `pnpm check`: `lockf /Users/ashishj/repos/mermaid-v13/.tmp/m3-check.lock pnpm check` (with `VITEST_MAX_WORKERS=4`). Same lock for `pnpm e2e`.
- A timing test that fails under load is not a regression: rerun it under the lock. Known flakes (don't edit): R-LANG-4 `language-budget*.spec.ts`, `packages/dev/src/explorer.spec.ts` "/node-render over 1 MiB is a 413", a timeout in `packages/core/src/preprocess/stress.spec.ts`.
- `generated/` folders are gitignored: every new generated file must be added with `git add -f`.
