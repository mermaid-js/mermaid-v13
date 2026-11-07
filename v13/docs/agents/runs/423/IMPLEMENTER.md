# Implementer brief (spec #423, M5a cynefin port)

- **Ticket:** `gh issue view -R mermaid-js/mermaid-v13 <N>`. **Spec:** #423 (its "Maintainer decisions" are decided: D361–D367). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md`. **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language). Worked examples: `packages/diagram-pie` and `packages/diagram-quadrant` (`layoutKind: 'custom'`, Langium oracle for pie).
- **Notes:** this folder. Read `INDEX.md`, `01-v12-cynefin.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **v12 source:** not in this repo. Read it with `git -C /Users/knsv/repos/mermaid show mermaid@12.2.0:<path>` (e.g. `packages/mermaid/src/diagrams/cynefin/cynefinRenderer.ts`, `packages/parser/src/language/cynefin/`). The runtime oracle is `packages/conformance` (`mermaid-v12` 12.2.0, `mermaid-parser-v12` 2.0.1). Pele is not on this machine; it is only a reference (D325).
- **Repo rules:** pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-cynefin` imports only `@mermaid-js/core` subpaths, zero dependencies, never another diagram package. Test sources go in `.mmd` fixtures under `e2e/diagrams/cynefin/`, not hand-written TS arrays; failing or lexer-only inputs go in `packages/conformance/corpus/cynefin-cases.json`.
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Work only there with absolute paths; stay out of other worktrees. Run `pnpm install` first, and again after merging a base that adds a package (then delete `.eslintcache`).
- **Integration branch:** `feature/423_cynefin`, at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/423-cynefin-6600fe`. Read only from it; never write there.
- **Env:** run every check with `export PATH=$HOME/.volta/tools/image/node/24.16.0/bin:$PATH; unset PARSE_FIXTURE_PATH` (Node 26 and the external corpus both break `pnpm check`).
- **Parallel sessions** (Theme T0 #414, info, packet, radar, kanban ports) edit shared files: the conformance registry and `langium-lexer.ts`, the generated registry and config, the theme vocabulary. Never hand-edit generated files (D112); run the `gen:*` script. Keep shared edits small and additive. Never edit `.github/workflows/*`. Never loosen a gate.
- **Theme:** cynefin's theme rows belong in a package `DiagramPlugin.theme` table (#414 T0a, D322, D331, D335, D540). Until T0a is merged into the integration branch, read colours and lengths through one stand-in module; don't add cynefin rows to core.
- **No AI attribution** in commits (no Co-Authored-By, no "Generated with").
- **Timing** on this machine is not trusted: timing tests assert ratios (best of N); report gz sizes.

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/423_cynefin HEAD`. If that fails, `git reset --hard feature/423_cynefin`.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, parser/model, layout invariants).
3. Stay within the ticket's scope. If a choice is not covered by the spec, a D-id, DESIGN or REQUIREMENTS, pick the option most consistent with P1/P2 and the D-ids, implement it, and list it under "Deviations" in your reply and handoff (the orchestrator records it in GAPS.md).
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit with no AI attribution. Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/423_cynefin` and run the checks again.
6. Write `tickets/<N>.md` (≤ 40 lines) in **your own worktree** at `v13/docs/agents/runs/423/tickets/<N>.md`, committed on your branch: exports, how to use them, test helpers, gz size, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (many sessions share one machine)

- Every full `pnpm check`: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check`.
- Every Playwright e2e run: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock <command>`.
- A timing test that fails under load is not a regression: rerun it under the lock before acting on it.
