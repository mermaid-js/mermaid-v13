# Implementer brief (spec #430, M5a Wardley map port)

- **Ticket:** `gh -R mermaid-js/mermaid-v13 issue view <N>`. **Spec:** #430 (its "Maintainer decisions" D421–D428 are decided). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (D314–D339, D341–D428, D540–D543; D213, D215, D217, D218, D220, D224–D227 from pie apply). **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language).
- **Notes:** this folder. Read `INDEX.md`, `01-v12-wardley.md`, `02-v13-seams.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Worked examples:** radar (`packages/diagram-radar`, conformance `packages/conformance/src/radar/`, run notes `../422/`): Langium in v12, `layoutKind: 'custom'`, package theme table. Quadrant (`packages/diagram-quadrant`) for a coordinate plane. Pie's run notes `../288/tickets/304.md` document `loadLangiumLexerOracle` (D220). Copy, never import another diagram package.
- **v12 source:** `git show fa796a943:packages/mermaid/src/diagrams/wardley/<file>`, `git show fa796a943:packages/parser/src/language/wardley/<file>` and `…/language/common/`. The oracle is the `mermaid-v12` (12.2.0) and `mermaid-parser-v12` (2.0.1) dev dependencies in `packages/conformance`. The code is the oracle, not the docs page (pitfall 29: ask the oracle, don't reason about v12). The reference implementation is not on this machine.
- **Repo rules:** pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-wardley` imports only `@mermaid-js/core` subpaths, zero dependencies. Test sources are `.mmd` fixtures under `e2e/diagrams/wardley/`, never hand-written TS arrays; failing or lexer-only inputs go in `packages/conformance/corpus/wardley-cases.json`. Never hand-edit generated files (registry, config, facets, grammars, theme tables); run the `gen:*` script. Never edit `.github/workflows/*`. Never loosen a gate. Never `--no-verify`.
- **Harvest:** the shared harvester `packages/conformance/src/cli/harvest-v12.ts` (`HARVESTS` row + `harvest:wardley` script). No new harvester.
- **Theme (D322, D331, D335, D540):** wardley adds nothing to core. Its rows live in `packages/diagram-wardley/src/theme/vocabulary.ts` (`THEME_VARIABLES`, `usedBy: ['wardley']`, `nested` keys) → `pnpm gen:theme` → `src/theme/generated/variables.ts` (`THEME_VARIABLE_TABLE`) → the table in `src/theme/table.ts` (`section: 'wardley'`), on `DiagramPlugin.theme`. Contract: `v13/docs/agents/runs/414/CONTRACT.md`. Keyed by family and dark, never a theme name; `inline(v)` reads only what the theme wrote. Don't depend on draft #482 (core `cScale`/git fallback). Hand-drawn stays plain (D301). No ascii hook (D320).
- **Core size (R-PERF-8):** core is near its limit (`packages/bench/src/core-size.spec.ts`, `packages/mermaid/src/cdn-build.spec.ts`). Measure before and after anything touching core or the registry; report both. Over: stop and report; never touch the gate.
- **Stress specs:** pie's pattern (`tLarge / Math.max(tSmall, 2)`, best of N), never packet's `repeatsFor`/`MIN_MS`.
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Work only there with absolute paths. Run `pnpm install` first (again after adding a package, then delete `.eslintcache`).
- **Integration branch:** `feature/430_wardley`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/430-wardley-3fdfd3`. Read only from it; never write there.
- **Environment:** every check with `PATH=$HOME/.volta/tools/image/node/24.16.0/bin:$PATH`, `PARSE_FIXTURE_PATH` unset (`env -u PARSE_FIXTURE_PATH`) and `VITEST_MAX_WORKERS=4`.
- **Decisions:** not covered by the spec or a D-id? Pick the option most consistent with P1/P2, the spec and the D-ids, implement it, and list it under "Deviations". Don't wait for an answer.
- **No AI attribution** in commits or files (no Co-Authored-By, no "Generated with").

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/430_wardley HEAD`. If that fails, `git reset --hard feature/430_wardley`.
2. Use the Skill tool with `tdd` (and `ddlt` for layout). Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, model parity, layout invariants). Before T5's manifest lands, render through the package's own test harness as radar's T4 did.
3. Stay within the ticket's scope. Touch shared files minimally and additively.
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit. Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/430_wardley` and run the checks again.
6. Write `v13/docs/agents/runs/430/tickets/<N>.md` (≤ 40 lines) in your own worktree, committed on your branch: exports, how to use them, test helpers, gz size, core size before/after, decisions, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide lock (five sessions share this machine)

- Every full `pnpm check` and every `pnpm e2e`: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock env VITEST_MAX_WORKERS=4 pnpm check`.
- A timing test that fails under load is not a regression: rerun it under the lock. Known flakes: R-LANG-4 (`language-budget*.spec.ts`) and packet's `stress.spec.ts`.
- `generated/` folders are gitignored: every new generated file (grammar highlighters, `config-defaults.ts`, theme `variables.ts`, …) must be added with `git add -f`, or CI's clean checkout fails `check:*` while local runs pass. Timing numbers from this machine are "not measured on a steady machine"; report gz sizes.
