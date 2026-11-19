# Run notes, spec #855 (function complexity), exploration index

Base `ce2cb1b04` (worktree `.claude/worktrees/i855`, branch `feature/855_complexity`). Line numbers are today's, not the spec's. Paths are relative to the repo root; `core/` is `packages/core/src/`. Every vitest below ran green at base. Run them as `env -u PARSE_FIXTURE_PATH VITEST_MAX_WORKERS=2 volta run --node 24.16.0 npx vitest run <filters>`.

## Tickets

Integration branch `feature/855_complexity` (from `mermaid-v13` at ce2cb1b04), worktree `.claude/worktrees/i855`. Ticket worktrees are `.claude/worktrees/t<issue>`.

| Ticket | Issue | Branch | Blocked by | State |
| --- | --- | --- | --- | --- |
| X1 grid hooks | #856 | `feature/856_grid-hooks` | — | merged (0d7a74793); core +160 B; gaps: grid sites 40 to 33, no entry freed |
| X2 `layered.ts` phases | #857 | `feature/857_layered-phases` | #856 | built; second PR, not on this branch (see GAPS.md) |
| X3 `compound.ts` | #858 | `feature/858_compound-state` | #856 | merged (05e1f3c16) |
| X4 `createMermaid` | #859 | `feature/859_create-mermaid-split` | — | merged (05e1f3c16) |
| X5 allow-list checker | #860 | `feature/860_allow-list-checker` | — | merged (05e1f3c16) |
| X6 small core functions | #861 | `feature/861_core-small-functions` | — | merged (d1f2f4fe5); 4 entries; core +30 B |
| X7 flowchart functions | #862 | `feature/862_flowchart-functions` | — | merged (ff 85fc72c7a); 3 entries |
| X8 YAML reader | #863 | `feature/863_yaml-reader` | — | merged (ff 0b4d31158); stays whole (D597) |
| X9 private packages, tools | #864 | `feature/864_private-and-tools` | runs last | merged (ff dfe19af83); 4 entries; limits on `tools/*/src` (D598), 13 tool violations fixed in code |

Score: 59 entries at the start, 36 on this branch (layered.ts 29, yaml.ts 4, layered.fixtures.ts, yaml-text.ts and svg/path.ts 1 each; swimlane files left out, as in the one-liner under "Suppression score").

Maintainer decisions (Knut, 2026-11-17): 1 yes, `layered.ts` and `compound.ts` may leave Pele's file shape, each phase file recording the Pele commit it was split from (D596, amends D66); 2 the YAML reader stays whole and both files cite the decision (D597); 3 yes, the readability limits are extended to `tools/*/src` with today's violations entered as suppressions (D598). Decisions 4 and 5 are followed as the spec writes them. X8 records D596 and D597 in `DECISIONS.md`; X9 records D598. D591, D592 and D594 are left to other open PRs. Budgets (Knut, 2026-11-17): core rises to 102,400 B (D599) and `loaded` to 150,528 B (D600); the spec's "no budget change" rule is amended by both. A split costs bytes because locals minify to one letter and the fields of a state record keep their names. Core tickets merge one at a time, each measured after the merge.

## Pointers per ticket

Common gates for X1 to X8 (run all four, about 50 s together):

- `packages/core/src/layout` (82 files, 7 s), `packages/conformance/src/flowchart-grid.spec.ts packages/conformance/src/flowchart-layout.spec.ts packages/conformance/src/ascii` (20 files, 13 s), `packages/core/src/svg packages/core/src/preprocess packages/core/src/parser-kit packages/core/src/text` (37 files, 13 s), `packages/mermaid/src` (78 files, 17 s).
- SVG identity: the section "Byte identity" below.

| Ticket | Functions today (file:line) | Specs that gate it |
| --- | --- | --- |
| X1 #856 | grid sites in `core/layout/layered/layered.ts` (`floorTo` :998, `edgeOn` :1000, `midCell` :1001), `compound.ts` (`compoundLayout` :696), `index.ts` (imports :14-30; `edgeOn`/`floorTo` from layered); `grid-obstacles.ts`, `grid.fixtures.ts` already exist beside them | `core/layout/layered/grid.spec.ts`, `conformance/src/flowchart-grid.spec.ts`, `conformance/src/ascii/` (goldens.spec.ts, corpus.spec.ts, er-goldens, sequence-goldens, structure.spec.ts), `layered.spec.ts` + `__snapshots__/layered.spec.ts.snap` |
| X2 #857 | `layOut` :327 (`layered()` export :323 is its memo wrapper), `rank` :1169 (exported), `sideEnds` :1279, `settle` :1532, `assignTracks` :1787, `lay` :1846 (closure in assignTracks), `straighten` :2039, `reduceCrossings` :2262, `count` :2320 (closure in reduceCrossings), `position` :2583; all in `core/layout/layered/layered.ts` | `layered.spec.ts` (+ .snap), `sort-rows.spec.ts`, `scratch.spec.ts`, `scratch-sequence.spec.ts`, `inputs.spec.ts`, `sides.spec.ts`, `spacing.spec.ts`, `end-labels.spec.ts`; `conformance/src/{flowchart,class,er}-layout.spec.ts` + `conformance/src/__snapshots__/*.snap` (no state snap file; state goes through `corpus.spec.ts`). Filters: `packages/core/src/layout/layered`, `packages/conformance/src/flowchart-layout.spec.ts packages/conformance/src/class-layout.spec.ts packages/conformance/src/er-layout.spec.ts` |
| X3 #858 | `compoundLayout` :696, `place` :1056 (closure), `crossingsOf` :188, all `core/layout/layered/compound.ts` | `groups.spec.ts`, `group-loops.spec.ts`, `group-member-labels.spec.ts`, `layered.spec.ts.snap`, same conformance layout specs as X2 |
| X4 #859 | `createMermaid` `mermaid/src/api.ts:194`; `contextFor` :496 (called :666, :749); `cache.clear()` at :239 (callback to `seam.ts`), :914, :921, :931 | `packages/mermaid/src` whole (`api.spec.ts`, `api-caches.spec.ts`, `cdn-loader.spec.ts`, `cdn-build.spec.ts`, `cdn.spec.ts`, `render-*.spec.ts`, `ascii-api.spec.ts`); `pnpm e2e` is the Playwright side. `cdn-loader.spec.ts` checks the public method list. Importers of `api.ts`: index.ts, slim.ts, cdn.ts, seam.ts, discovery.ts, plugin-queue.ts, exports.ts (types mostly) |
| X5 #860 | `attrProblem` `core/svg/inert.ts:293`, `inertProblem` :386, `checkValue` `core/svg/style.ts:253` | `core/svg/security.spec.ts`, `clean-values.spec.ts`, `image-url.spec.ts`, `gradient.spec.ts`, `user-gradient.spec.ts`, `outline.spec.ts`, `style.spec.ts`, `backings.spec.ts`; inert corpus `core/svg/testing/index.ts` (`PAYLOADS`, `V12_XSS_CASES`; used by security/outline/backings specs and plugin-icons, plugin-hand-drawn, plugin-interactions, diagram-block specs); callers `core/pipeline/draw.ts:96`, `conformance/src/fuzz/run.ts:113`, `core/theme/auto.spec.ts`, `diagram-journey/src/render/render.spec.ts`. No linear-time spec exists for inert; X5 must add one (nearest pattern: `preprocess/stress.spec.ts`). Filter: `packages/core/src/svg packages/conformance/src/fuzz packages/plugin-icons packages/plugin-hand-drawn` |
| X6 #861 | `markDroppedSemicolons` `core/parser-kit/source-view.ts:246`, `cook` :395, `inline` `core/text/label.ts:343` (used :153), `validateLayout` `core/layout/validate.ts:50` | `parser-kit/source-view.spec.ts` (linear-time block :190), `core/text/label.spec.ts`, `inline.spec.ts`, `core/layout/validate.spec.ts`. Filters: `packages/core/src/parser-kit packages/core/src/text packages/core/src/layout/validate.spec.ts` |
| X7 #862 | `addVertex` `diagram-flowchart/src/parser/model.ts:246`, `drawNode` `render/render.ts:448`, `drawShape` `render/shapes.ts:140` | `packages/diagram-flowchart`, `packages/conformance/src/flowchart` (lexer-parity, v12, errors, grammar), `conformance/src/flowchart-*.spec.ts`, `corpus.spec.ts` |
| X8 #863 | `flow` `core/preprocess/yaml.ts:456`, `blockScalar` :556, `inlineValue` :611, `block` :699 (class methods), `splitKey` `yaml-text.ts:38` | `preprocess/yaml.spec.ts`, `yaml-tree.spec.ts`, `stress.spec.ts` (linear: :69, tree mode :125), `directives.spec.ts`, `__snapshots__/yaml-tree` |
| X9 #864 | `evaluateGates` `bench/src/gates.ts:148`; `#run` `dev/src/browser/explorer/tabs/profile.ts:331`; `explorerRoutes` `dev/src/explorer.ts:154`; gen-grammar: `tokenize` `ebnf.ts:91`, `parseGrammar` :193, `lex` `mode-lexer.ts:48`, `grammarTarget` `generate.ts:50`, `lezerTokens` `highlight.ts:497`, callback `highlight-testing.ts:~108` (inside the returned `(text) =>`); `main` `tools/release/src/rehearse-cli.ts:215` | `packages/bench/src/gates.spec.ts` (+ identity.spec.ts), `packages/dev/src/explorer.spec.ts`, `tools/gen-grammar` (36 spec files), `pnpm check:grammar` (`tools/gen-grammar/src/cli.ts --check`), `pnpm regen` leaves no diff |

## Suppression score

- Count per file (prints today's list; total 59, as in the spec): `node -e 'const s=require("./eslint-suppressions.json");const R=["complexity","max-depth","max-lines-per-function","max-params","max-lines"];let t=0;for(const[f,r]of Object.entries(s)){let n=0;for(const k of R)n+=r[k]?.count||0;if(n&&!/swimlane/.test(f)){console.log(n,f);t+=n}}console.log("total",t)'`
- Today: layered.ts 29; compound.ts 8; yaml.ts 4 + yaml-text.ts 1; inert.ts 2 + style.ts 1; source-view.ts 2; validate.ts 1; label.ts 1; api.ts 1; flowchart model.ts 1, render.ts 1, shapes.ts 1; bench gates.ts 1; dev profile.ts 2, explorer.ts 1. Not in any ticket: `core/svg/path.ts` 1, `core/layout/layered/layered.fixtures.ts` 1.
- Limits: `eslint.config.js:215-227` (complexity 25 :222, max-depth 4 :223, max-params 6 :224, max-lines-per-function 150 :225, max-lines 800 :226; `no-param-reassign` :221, off for parsers :237). Applies to `packages/*/src` only.
- Prune: `lint:fix` (package.json:15) uses `--prune-suppressions` over the whole repo and runs prettier. For given files only: `volta run --node 24.16.0 npx eslint --quiet --prune-suppressions <files>` (tested on svg/path.ts + inert.ts, 3 s). It touched no unrelated entry; the only diff was the trailing newline being dropped, so run `pnpm prettier --write eslint-suppressions.json` after. It removes only entries that no longer fire in the linted files; lint the changed files AND any file you split code into.
- Fallow: `.fallowrc.json` health `thresholdOverrides` lift `core/layout/layered/**` to cyclomatic 40, cognitive 60, unit size 200 (:184-190). Audit gate is `new-only` against `.fallow-baseline/{health,dead-code,dupes}.json`, keyed by file path (:197). Those baselines hold entries for `layered.ts`, `compound.ts`, `layered/index.ts`; code moved to a new file has no baseline entry and will read as new. CI: `.github/workflows/ci.yml:96-129`, `pnpm exec fallow audit --base HEAD^1 --quiet`.

## Byte identity

- Closest cheap gate, tested, no browser, no base checkout, 15 s: `packages/bench/src/cli/theme-identity.ts` (D200, D339). It renders every `e2e/diagrams/**/*.mmd` (3,393 files) plus the bench fixtures through `createMermaid().renderSync` in Node, `deterministic: true`, fixed `now`, and writes one digest per render. 3,556 sources; `--variants plain` is 12 themes, 42,672 renders (816 of them errors, compared by error text).
- Run from the worktree (one digest file per tree state): `cd packages/bench && env -u PARSE_FIXTURE_PATH volta run --node 24.16.0 npx tsx --conditions=mermaid-source src/cli/theme-identity.ts --variants plain --out <file> [--compare <base.json>]`. It prints `N differing` and exits 1 when any digest differs; `--svg <dir>` writes the differing SVGs.
- Base digests exist: `/private/tmp/claude-502/-Users-knsv-repos-mermaid-v13/3e3bcbfd-c595-448d-97b1-92da849dde4a/scratchpad/base-plain.json` (made at `ce2cb1b04`, 5.3 MB; re-run at head gave 0 differing, so it is deterministic). A ticket agent can also make its own before the first edit (15 s). Drop `--variants plain` for darkMode, literal and overrides too (4x).
- The bench `--identity` mode (`cli/bench.ts`, `driver.ts:439`, `identity.ts`) needs Chromium plus `esbuild` builds of head and of the base via `base.ts` `extractBase` (`git archive`, no install); it covers only the flowchart, sequence and class fixtures. Not cheap; theme-identity is the better gate. `cli/pr.ts` also needs Chromium and Linux `perf`.
- Text output is not in theme-identity. Cover it with `packages/conformance/src/ascii` (goldens.spec.ts, er-goldens, sequence-goldens, corpus.spec.ts, structure.spec.ts) and `conformance/src/flowchart-grid.spec.ts`. `conformance/src/corpus.spec.ts` and `__snapshots__/*-layout.spec.ts.snap` are the other SVG-sensitive specs.

## Size

- Core: `packages/bench/src/core-size.spec.ts` (`vitest run packages/bench/src/core-size.spec.ts`, 1.5 s) fails when core exceeds `packages/mermaid/size-budget.json` `core.gzipBytes`. Loaded (`size` gate, `bench/src/gates.ts:161-174`) has no cheap CLI; a scratch script calling `measureStaticClosure(readSizeBudget().core.entry)` and `flowchartClosureSize(bundle)` from `bench/src/size-budget.ts` works (name it `.mts`, run with `tsx --conditions=mermaid-source` from `packages/bench`). Script: `/private/tmp/claude-502/-Users-knsv-repos-mermaid-v13/3e3bcbfd-c595-448d-97b1-92da849dde4a/scratchpad/size-local.mts`: copy it into your worktree's `packages/bench/`, run it there, delete the copy. (The earlier `size.mts` imported from the i855 worktree by absolute path, so it measured the integration branch whatever tree it ran in; sizes in ticket notes written before 2026-11-17 12:30 that came from it are wrong.)
- Today: core 100,116 B gz of 100,352 (headroom 236 B); loaded 147,472 of 148,480 (headroom 1,008 B). A split adds function wrappers, so X1 to X3 can overrun. Limits since D599 and D600: core 102,400 B, loaded 150,528 B. A ticket that would exceed one stops and reports; never change a limit. Report the delta measured in your own tree.
- ASCII soft budget: `bench/src/ascii-size.ts`; the other size gates are in `bench/src/gates.ts`.

## Bench (steady runner only; no timings run here)

- X1 to X3 layout speed, X4 cached `renderSync`, X6 parse and label speed: `pnpm --filter @mermaid-js/bench bench --renderers v13,v13-base,v13-stages --set corpus --reps 10 --base <integration ref>` (Chromium, writes `dist/reports/<stamp>.md`; header in `cli/bench.ts:1-20`). `v13-stages` gives the per-stage split (parse, layout, render). `pnpm --filter @mermaid-js/bench pr --base <ref>` adds CPU instruction counts (Linux `perf` via `BENCH_PERF`), the steadiest numbers on a shared machine. R-PERF-3 and R-PERF-10 (REQUIREMENTS.md:124, :131).

## Pele attribution

- Header text: `core/layout/layered/layered.ts:1-6` ("Ported from Pele ... at 3a2f075", copyright, MIT, "Changes from Pele"); `compound.ts:1-6` (same shape); `layered/index.ts:1-3`; `core/preprocess/yaml.ts:6-7`; `core/svg/inert.ts:7` (follows Pele's test oracle); `core/svg/testing/index.ts:1-9`.
- A file split from a port needs the header and an entry in `packages/core/THIRD_PARTY_NOTICES` (list at :10-24: layered.ts, compound.ts, index.ts, yaml.ts, inert.ts ... are listed by path). `pnpm check:licenses` (tools/release/src/licenses.ts, 0.8 s) fails if a ported file is missing from that list; run it after any split of these files.
- R-REL-4: REQUIREMENTS.md:320 (MIT attribution in file headers and THIRD_PARTY_NOTICES; verified by the license check). D12 DECISIONS.md:22 (porting allowed with attribution). D66 DECISIONS.md:119 (ported and owned, upstream fixes by hand; the reason X2, X3, X8 need decision 1 and 2).
- Cited decisions: D140 :150 (port capacity in cells, grid), D179 :274 (text output keeps layered), D532 :810 (swimlane engine as upstream; ranking phases stay whole), D557 :836 (T0 tickets promote shared helpers to core), D583 :876 (core budget 100,352 B, loaded 148,480 B, scratch buffers).

## Things that would trip a split

- Private-symbol imports: `layered.ts` exports used outside it are `EDGE_INPUTS`, `NODE_INPUTS`, `ledge`, `lnode` (`inputs.spec.ts:2`), `groupArranger`, `sortLayer` (`sort-rows.spec.ts:2`), `LNode`/`LEdge` types (`scratch-sequence.spec.ts:9`), and `edgeOn`, `floorTo`, `LayeredOptions` (`index.ts:28`). `compound.ts` exports used by `index.ts:19-25`: `cnode`, `compoundLayout`, `inheritCrossedDirections`, `CEdge`, `CNode`. Keep these importable from the old paths (re-export or move the specs). `api.ts` is imported only for `createMermaid` and the `Mermaid` type. `inert.ts` is imported by `svg/index.ts:75`, `pipeline/draw.ts:9` and specs.
- knip (`knip.json`) and fallow flag unused exports: a new file's exports must be used by non-spec code (`ignoreExportsUsedInFile` is on). `pnpm lint:knip`.
- Import boundaries: new files stay in the same package; relative imports only inside it. `core` and `diagram-*` use no DOM, clock or `console`.
- `.fallow-baseline/*.json` are keyed by path (see Suppression score). They are generated; do not edit them by hand.
- No generated files sit beside the touched code. `generated/` folders matter only for X9: `tools/gen-grammar` outputs `packages/*/grammar/generated/**`, so run `pnpm check:grammar` and `pnpm regen`.
- cspell runs on `packages/**/*.ts` and `tools/**`; Pele-derived headers carry `// cspell:ignore kepano lnode ...` (layered.ts:7). Copy it to split files.
- `layOut` memo (`layered.ts:323`) and parallel arrays are #67's: leave them.
