# Implementer brief (spec #428, M5a treemap port)

- **Ticket:** `gh issue view -R mermaid-js/mermaid-v13 <N>`. **Spec:** #428 (its "Maintainer decisions" D401–D409 are decided). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (D314–D339, D540–D543 for M5 and the theme T0; D213, D220–D229 from pie apply here). **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language).
- **Worked examples:** `packages/diagram-pie` (Langium in v12, `layoutKind: 'custom'`) and `packages/diagram-radar` / `packages/diagram-packet` (the other Langium M5a ports), their conformance suites `packages/conformance/src/{pie,radar,packet}/`, and run notes `v13/docs/agents/runs/{288,422,421}/` (`288/tickets/304.md` is the Langium lexer oracle API, D220).
- **v12 source:** `git show fa796a943:packages/mermaid/src/diagrams/treemap/<file>` (`db.ts`, `renderer.ts`, `styles.ts`, `utils.ts`, specs), `git show fa796a943:packages/parser/src/language/treemap/<file>` (grammar, `tokenBuilder.ts`, `valueConverter.ts`), `git show fa796a943:packages/parser/tests/treemap.test.ts`, `…/mermaid/src/config/defaultConfig.ts` (`treemap`), themes in `…/mermaid/src/themes/theme-*.js` (`cScalePeer`). The tag itself is in `/Users/knsv/repos/mermaid` (`git -C /Users/knsv/repos/mermaid show mermaid@12.2.0:<path>`). The oracle is the `mermaid-v12` (12.2.0) and `mermaid-parser-v12` (2.0.1) dev dependencies in `packages/conformance`; d3-hierarchy and d3-format as 12.2.0 resolves them are reachable from there. The code is the oracle, not the docs page. Pele is not on this machine; the spec quotes what is needed from it.
- **Notes:** this folder. Read `INDEX.md`, `01-v12-treemap.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Repo rules:** pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-treemap` imports only `@mermaid-js/core` subpaths, zero dependencies, never another diagram package. Never edit `.github/workflows/*`. Never loosen a gate. Never use `--no-verify`. Test sources go in `.mmd` fixtures under `e2e/diagrams/treemap/`, not hand-written TS arrays; failing or lexer-only inputs go in `packages/conformance/corpus/treemap-cases.json`. Generated grammar files under `generated/` are gitignored: `git add -f` them. After adding a package, run `pnpm install`.
- **Harvest:** a `treemap` row in `HARVESTS` (`packages/conformance/src/cli/harvest-v12.ts`) and a `harvest:treemap` script. No new harvester.
- **Theme:** the type's rows go in the package's `DiagramPlugin.theme` table per `v13/docs/agents/runs/414/CONTRACT.md`: `src/theme/vocabulary.ts`, `pnpm gen:theme` → `THEME_VARIABLE_TABLE`; keyed by family and `dark`, never a theme name (D331); nested `treemap` section (D335, D540, D541); `inline(v)` reads only what the theme wrote. `cScalePeer` is treemap's own (D406), never core's. Do not depend on #482 (a core fallback for themes without `cScale`). Core is near its gz limit (R-PERF-8): no treemap code or row in core.
- **Stress specs** use pie's pattern (`tLarge / Math.max(tSmall, 2)`, best of N), not packet's `repeatsFor`/`MIN_MS`.
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Work only there with absolute paths; stay out of other worktrees. Run `pnpm install` first.
- **Integration branch:** `feature/428_treemap`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/428-treemap-637b22`. Read only from it; never write there.
- **Parallel wave-2 sessions** (xychart, sankey, venn, wardley) edit shared files: the conformance registry, `LANGIUM_LEXERS`, `HARVESTS`, the generated registry and config, knip entries, theme vocabulary lists, adapter regexes, MIGRATION.md. Never hand-edit generated files (D112); run the `gen:*` script. Keep shared edits small and additive.
- **No AI attribution** in commits or files (no Co-Authored-By, no "Generated with").
- **Environment:** run every check as `PATH=$HOME/.volta/tools/image/node/24.16.0/bin:$PATH` with `PARSE_FIXTURE_PATH` unset (`env -u PARSE_FIXTURE_PATH`) and `VITEST_MAX_WORKERS=4`. After `pnpm install` on a branch that adds a package, delete `.eslintcache`.
- **Timing** on this machine is not trusted: timing tests assert ratios (best of N); report gz sizes, and mark any timing "not measured on a steady machine".
- **Undecided points:** the maintainer is not available. Pick the option most consistent with P1/P2, the spec and the D-ids, implement it, and list it under "Deviations" in your reply and handoff.

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/428_treemap HEAD`. If that fails, `git reset --hard feature/428_treemap`.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, parser/model, layout invariants).
3. Stay within the ticket's scope.
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit with no AI attribution. Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/428_treemap` and run the checks again.
6. Write `tickets/<N>.md` (≤ 40 lines) in **your own worktree** at `v13/docs/agents/runs/428/tickets/<N>.md`, committed on your branch: exports, how to use them, test helpers, gz size, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (five sessions share this machine)

- Every full `pnpm check`: `VITEST_MAX_WORKERS=4 lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check`.
- Every `pnpm e2e` / Playwright run: under the same lock, `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock <command>`.
- A timing test that fails under load is not a regression: rerun it under the lock before acting on it. `language-budget*.spec.ts` (R-LANG-4) and packet's `stress.spec.ts` are known timing flakes.
