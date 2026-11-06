# Implementer brief (spec #422, M5a radar chart port)

- **Ticket:** `gh issue view -R mermaid-js/mermaid-v13 <N>`. **Spec:** #422 (its "Maintainer decisions" D351–D359 are decided). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (D314–D339, D540–D541 for M5 and the theme T0; D213, D220–D229 from pie apply here). **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language).
- **Worked example:** `packages/diagram-pie` (Langium in v12, `layoutKind: 'custom'`), its conformance suite `packages/conformance/src/pie/`, and its run notes `v13/docs/agents/runs/288/` (`tickets/304.md` is the Langium oracle API, D220).
- **v12 source:** in this repo, `git show fa796a943:packages/mermaid/src/diagrams/radar/<file>` (`db.ts`, `renderer.ts`, `styles.ts`, `radar.spec.ts`, `detector.ts`), `git show fa796a943:packages/parser/src/language/radar/<file>` and `…/language/common/`, `git show fa796a943:packages/parser/tests/radar.test.ts`, themes in `…/mermaid/src/themes/theme-*.js` (`/* radar */`). `fa796a943` equals `mermaid@12.2.0` for radar except the syntax page; the tag itself is in `/Users/knsv/repos/mermaid` (`git -C /Users/knsv/repos/mermaid show mermaid@12.2.0:<path>`). The oracle is the `mermaid-v12` (12.2.0) and `mermaid-parser-v12` (2.0.1) dev dependencies in `packages/conformance`. The code is the oracle, not the docs page. Pele is not on this machine; the spec quotes what is needed from it.
- **Notes:** this folder. Read `INDEX.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Repo rules:** pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-radar` imports only `@mermaid-js/core` subpaths, zero dependencies, never another diagram package. Never edit `.github/workflows/*`. Never loosen a gate. Test sources go in `.mmd` fixtures under `e2e/diagrams/radar/`, not hand-written TS arrays; failing or lexer-only inputs go in `packages/conformance/corpus/radar-cases.json`.
- **Theme:** radar's ten variables are not in core and never will be (D322, R-PERF-8: core is at its gz budget). Until T5 adds the package theme table from #414 T0a, read them through one stand-in module with v12's defaults (spec table). Shared theme code never names a radar variable; radar never names a theme (D331).
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Work only there with absolute paths; stay out of other worktrees. Run `pnpm install` first.
- **Integration branch:** `feature/422_radar`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/422-radar-0da684`. Read only from it; never write there.
- **Parallel M5a sessions** (info, packet, cynefin, kanban, the theme T0) edit shared files: the conformance registry, the generated registry and config, the harvest CLI. Never hand-edit generated files (D112); run the `gen:*` script. Keep shared edits small and additive.
- **No AI attribution** in commits (no Co-Authored-By, no "Generated with").
- **Environment:** run every check as `PATH=$HOME/.volta/tools/image/node/24.16.0/bin:$PATH` with `PARSE_FIXTURE_PATH` unset (`env -u PARSE_FIXTURE_PATH`). After `pnpm install` on a branch that adds a package, delete `.eslintcache`.
- **Timing** on this machine is not trusted: timing tests assert ratios (best of N); report gz sizes, and mark any timing "not measured on a steady machine".
- **Undecided points:** the maintainer is not available. Pick the option most consistent with P1/P2, the spec and the D-ids, implement it, and list it under "Deviations" in your reply and handoff.

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/422_radar HEAD`. If that fails, `git reset --hard feature/422_radar`.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, parser/model, layout invariants).
3. Stay within the ticket's scope.
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit with no AI attribution. Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/422_radar` and run the checks again.
6. Write `tickets/<N>.md` (≤ 40 lines) in **your own worktree** at `v13/docs/agents/runs/422/tickets/<N>.md`, committed on your branch: exports, how to use them, test helpers, gz size, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (many sessions share one machine)

- Every full `pnpm check`: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check`.
- Every Playwright e2e run: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock <command>`.
- A timing test that fails under load is not a regression: rerun it under the lock before acting on it. `language-budget-sequence.spec.ts` (R-LANG-4) is a known timing flake.
