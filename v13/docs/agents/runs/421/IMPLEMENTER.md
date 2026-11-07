# Implementer brief (spec #421, M5a packet port)

- **Ticket:** `gh issue view -R mermaid-js/mermaid-v13 <N>`. **Spec:** #421 (its "Maintainer decisions" are decided: D341–D347). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (D314–D339 and D540–D541 for M5 and the theme T0; D213, D215, D217, D218, D220, D224–D227 from M4). **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language). Worked example: `packages/diagram-pie` (Langium in v12, `layoutKind: 'custom'`) and its run notes `v13/docs/agents/runs/288/`.
- **Notes:** this folder. Read `INDEX.md`, `01-v12-packet.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Repo rules:** pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-packet` imports only `@mermaid-js/core` subpaths, zero dependencies, never another diagram package. Test sources go in `.mmd` fixtures under `e2e/diagrams/packet/`, failing or lexer-only inputs in `packages/conformance/corpus/packet-cases.json`, not in hand-written TS arrays.
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Work only there with absolute paths; stay out of other worktrees. Run `pnpm install` first (and again after merging a base that adds a package; then delete `.eslintcache`).
- **Integration branch:** `feature/421_packet`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/421-packet-849c7d`. Read only from it; never write there. Merge only `feature/421_packet` into your branch; the orchestrator merges `mermaid-v13` (the Theme T0 #472 is merged there, so the T0-branch rule is lifted).
- **Parallel sessions** (Theme T0 #414, info, radar, cynefin, kanban; M4 wave 2 finishing) edit shared files: the theme vocabulary, the conformance registry, the generated registry and config, `langium-lexer.ts`. Keep shared edits small and additive. Never hand-edit generated files (D112); run the `gen:*` script.
- **Theme:** packet's theme rows belong in the package's `DiagramPlugin.theme` table (T4 builds it on #414's T0a, merged here; API `v13/docs/agents/runs/414/CONTRACT.md`). Never add packet rows to core's vocabulary. A diagram never names a theme, and shared theme code never names a diagram-only variable (D331). Core size is near R-PERF-8's limit.
- **No AI attribution** in commits (no Co-Authored-By, no "Generated with"). Never edit `.github/workflows/*`. Never loosen a gate.
- **Environment:** run checks as `PATH=$HOME/.volta/tools/image/node/24.16.0/bin:$PATH` with `PARSE_FIXTURE_PATH` unset (Node 26 and the external corpus break `pnpm check`). Timing on this machine is not trusted: timing tests assert ratios (best of N); report gz sizes, mark timing "not measured on a steady machine".

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/421_packet HEAD`. If that fails, `git reset --hard feature/421_packet`.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, parser/model parity, layout invariants).
3. Stay within the ticket's scope. If a choice is not covered by the spec, a D-id, DESIGN or REQUIREMENTS, pick the option most consistent with P1/P2 and the D-ids, implement it, and list it under "Deviations" in your reply and handoff (the maintainer is not available; the orchestrator records it in GAPS.md).
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit with no AI attribution. Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/421_packet` and run the checks again.
6. Write `tickets/<N>.md` (≤ 40 lines) in **your own worktree** at `v13/docs/agents/runs/421/tickets/<N>.md`, committed on your branch: exports, how to use them, test helpers, gz size, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (many sessions share one machine)

- Every full `pnpm check`: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check`.
- Every Playwright e2e run: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock <command>`. While the wave coordinator's load rule is on (AI-Max overloaded), `pnpm e2e` and pushes take `m3-check.lock` too, so all heavy runs queue.
- A timing test that fails under load is not a regression: rerun it under the lock before acting on it. `language-budget-sequence.spec.ts` (R-LANG-4) is a known timing flake.
