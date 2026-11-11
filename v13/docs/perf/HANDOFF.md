# Flowchart performance, round 2: handoff

Historical handoff: its P18/3a production cache-removal interpretation is superseded by
[P28 in DECISIONS.md](DECISIONS.md). Cache reset is required only in the measurement harness;
production caching stays unchanged. Original handoff text is retained below for provenance.


This file hands a grilling session (2026-11-09, with Knut) to the session that carries the work out. It is a temporary file. It is replaced by `DECISIONS.md` and `LOOP.md` in this folder, and deleted in the same docs PR.

All source references are against the tip of `mermaid-v13` at `f71e9a58b` (2026-11-09). Pele is at 1.13.0 (`3a2f075`). The findings come from reading the source only. Nothing was run or measured in that session.

## What the next session does

1. Write the docs PR from this file, into `mermaid-v13`, marked ready (not draft) when it is finished. It contains:
   - `v13/docs/perf/DECISIONS.md`: the P-decisions below, as a log numbered P1, P2, ….
   - `v13/docs/perf/LOOP.md`: the operating manual that the generator, implementers and evaluator read. It covers roles, the round cycle, the two lanes, the contents of a log entry, the bar for fit, and the rules for deferral.
   - `v13/docs/perf/runs/1/HYPOTHESES.md`: the round-1 list below. Each entry adds a kill condition.
   - One row in `v13/docs/DECISIONS.md` that points to `v13/docs/perf/`.
   - The deletion of this file.
2. Open the spec issue for this effort ("Flowchart performance, round 2"), linking the PR.
3. Comment on #281: its encoding items (one style sheet instead of `var()` presentation attributes, flat theme aliases, no redundant `fill="none"`) move here. Its look items stay there.
4. Open a bug issue: some ids lack the render prefix, for example subgraph `id="checkout"`. That can clash when several diagrams share a page. The lab noticed it but did not check it.
5. Do not implement anything else. The harness and round 0 come next, in a session on AI-Max (P5, P20).

## Decisions (P-log draft)

Scope and target

- **P1. Scope.** Flowcharts only, in a minimal build: `mermaid/slim` (`packages/mermaid/src/slim.ts`) plus `@mermaid-js/diagram-flowchart`, with no other plugin. The baseline is the tip of `mermaid-v13`. The integration PR #297 is ignored. The #265 tickets come back only as ports onto the tip (round 1).
- **P2. Target and stop.** The target is 0.95× of Pele, summed over the sample. The automated loop also stops after two rounds in a row keep nothing. R-PERF-10's ratchet still holds. Earlier work found that byte-identical changes reach about 1.15× on large diagrams and 1.36× on tiny ones (#281), so the target needs the output lane.
- **P3. Output may change, toward the leanest markup for the same picture.** Byte-identity (D200) is not required. "Optimal" means the same pixels with the fewest bytes, elements and style resolutions. Changes to how a diagram looks stay in #281 as Knut's decisions: word breaking, wrap width or font size, shadows, invisible edges, `fa:` icons. #281's encoding items move here.
- **P4. The public surface stays fixed:**
  - the class names (`node`, `edge`, `cluster`, `flowchart-link`, `edge-pattern-*`, `edge-thickness-*`, user `classDef` classes);
  - element ids with the render prefix;
  - the `data-ast` key and its values;
  - the `--mermaid-*` custom properties.

  Changing any of these is a look-type decision (P3). Everything else is free: internal alias names, where paint attributes sit, nesting, redundant attributes, the root style's fallbacks.

Measurement

- **P5. One machine.** All of the work runs on AI-Max: implementation, building, checks and measurement. AI-Max is the reference machine for this effort, and Knut runs no other jobs there. Implementing and measuring never overlap: no agent session, `pnpm` command, build, test or browser runs during a measurement window (P14). This replaces D208's M1 Max for this effort only.
- **P6. Sample.** The sample is 5,000 random flowcharts from the 834,276-diagram set. Reuse the lab's 5,000-diagram random sample if it holds only flowcharts. Otherwise redraw with a recorded seed. The hash of the list goes in the log header, and size buckets are reported from it. If the set is user data, the diagrams stay out of the repo and the log records only aggregates.
- **P7. Metric.** Node only. Node warm render time, interleaved head and base on the same diagram, decides. Instruction counts (`perf stat`, if AI-Max has the counters) and the named counters are diagnostics. These counters are always reported: measurer calls, output bytes, elements, attributes, bytes allocated, scavenge time.
  - Why not Chrome: in Node, `selectMeasurer` (`packages/mermaid/src/measurer.ts:154`) uses the table measurer, so the canvas path never runs. The lab's Chrome-only cost comes from the default font string, which is a look change (P3). Without that change, the only way to cut the cost is fewer measurer calls, and Node counts those.
- **P8. Pele, and the browser.** Pele is measured in each round's baseline, not for every hypothesis. Once per round, the merged result gets one Chromium run (render, insert and `getBBox`, the D204 split) with Pele, so the log shows what the browser side gained.
- **P9. No text mutation to defeat caches.** The harness defeats v13's caches with a reset hook, not by appending `%% run N` the way `packages/bench/src/runner/harness.ts:43` and the old `.tmp/perf-lab` harness do. That comment sends v13 down the source-view hole/copy path (`packages/core/src/parser-kit/source-view.ts:125`) and the token-array copy (`view.ts:22-35`). It also makes detection run v12's comment fallback. Real diagrams without comments pay none of these. Each non-public function the harness relies on, such as the fresh text measurer and the cache reset, is pinned and checked at startup, so a rename fails loudly.
- **P10. Round 0 is measurement only, on the tip:**
  - an A/A run, to get the noise spread;
  - the Pele ratio;
  - the trailing comment against the reset hook;
  - the cache on and off (P18);
  - a stage split of an empty `graph TD`, to locate the 57 µs fixed cost;
  - feature counts over the 5,000: front matter, `%%{init}`, `themeVariables`, `@{…}` shape data, subgraphs, comments, labels wider than the wrap width, labelled edges.

  The results go at the top of the log and weight the hypotheses.

Gates and the bar for fit

- **P11. Two lanes.** The evaluator classifies each hypothesis automatically.
  - *Byte-identical lane:* the SVG is identical to the base on all 5,000.
  - *Output lane:* the result is pixel-identical in a pinned Chromium on a fixed 500 of the 5,000, with no tolerance. The R-SEC spec suite is green. The snapshot updates (`pnpm check`, e2e) are in the hypothesis's own branch.

  Any pixel difference fails the hypothesis. The Chromium version goes in the log header.
- **P12. Fit.** A script decides, not a model. A hypothesis is fit when all of these hold:
  - the Node geomean gain is above max(0.5%, 3× the A/A spread), *or* output bytes drop by at least 5% with Node time flat;
  - no size bucket is more than 1% worse;
  - its lane gate passes;
  - `pnpm check` is green;
  - the size budget holds.

  The thresholds go in the log header and do not change from round to round.
- **P13. Browser-only ideas are deferred.** Anything whose gain or risk shows only in a browser is logged as `browser-only, deferred`: the canvas measurer (T2 #273), font-check caching, DOM insertion. One Chromium check, base against the final head, runs at the end of the effort.

Process

- **P14. Rounds.**
  - Each round has two phases on AI-Max. In the implement phase, the round's hypothesis sessions run in parallel worktrees, each building and checking its own branch. The measure phase starts only once every branch is pushed and built. Nothing else runs while it lasts: the serial queue measures each hypothesis, then the merged result, then the round's Chromium run.
  - Each hypothesis is implemented in its own worktree and measured on its own against the round's base.
  - When all hypotheses in the round are measured, the fit ones are merged in order of gain, and the combination is measured once.
  - If the combination gains less than the best single hypothesis, members are dropped one at a time until the clash is found.
  - The combination becomes the next round's base.
  - Unfit hypotheses are discarded. Each leaves a log entry and no diff.
- **P15. Roles.**
  - *Hypothesis generator:* Opus at high effort. It reads the log, the latest profile and counters, and the source.
  - *Implementers:* Sonnet, one per hypothesis, each in its own worktree on AI-Max, during the implement phase only.
  - *Measurement:* one serial queue on AI-Max that builds each branch and measures it while nothing else runs.
  - *Fit:* the evaluator script decides.

  Every hypothesis names the counter it expects to move and a kill condition. The log records whether that counter moved, as well as the total.
- **P16. Round 1 is manual.** It is the set agreed in the grilling (below). The automated loop takes over later, for trimming, with up to 6 hypotheses per round.
- **P17. Delivery.** Each round becomes one PR into `mermaid-v13`. It carries the kept hypotheses, their snapshot updates, the round's log entries, and a D-row for any requirement it amends. It is marked ready when the evaluator has finished, and Knut merges it. A hypothesis that needs a requirement amendment can be fit and still wait for Knut's approval in that PR.
- **P18. No cache between renders.** `AnalysisCache` (`packages/mermaid/src/api.ts:240-275`, `CACHE_SIZE = 32` at `:245`) is disabled. No decision ever set 32. The only rationale is DESIGN §3 step 5: `renderSync` right after `prepare` should not parse twice. A one-slot hand-off from `prepare` to `renderSync` keeps that. Knut decided this in the grilling. It is round-1 hypothesis 3a.
- **P19. Where things live.** Everything is in `v13/docs/perf/`, not in the main decision log. That log has diagram sessions adding rows all the time, so perf rows would compete with them for D-numbers. The folder holds:
  - `DECISIONS.md` (P-numbers, with one pointer row in `v13/docs/DECISIONS.md`);
  - `LOOP.md`;
  - `runs/<n>/hypotheses.jsonl`, append-only, with one entry per hypothesis: id, round, claim, named counter and how it moved, numbers per bucket, lane, verdict and reason, branch, and for a discard a short description of the change;
  - `runs/<n>/LEDGER.md`, generated from the JSONL.

  A requirement amendment also gets a D-row in the main log, in the round's PR.
- **P20. The harness.** The lab's harness (on the M5, at `~/repos/mermaid-perf-lab`) moves to AI-Max and is the only measurement function for this effort. `packages/bench` stays the PR and CI gate. One session on AI-Max ports the harness and adds the reset hook (P9), the counters (P7), the pixel check (P11), the feature counts (P10) and the A/A run. The harness also guards the measure phase. It refuses to start while other `node`, `pnpm`, `claude` or Chromium processes are using CPU, and it logs the machine's load next to each result. Pinning measurements to spare cores is not a substitute, because memory bandwidth, caches and boost clocks are shared. The harness then runs round 0. Implementers start only after round 0 is in the log. The M5 is needed once, to copy the lab harness and the 834k set to AI-Max. Open fact: from the dev Mac, `ssh AI-Max` did not resolve on 2026-11-09 (the tailnet looked down).

## Findings from reading the tip source

The lab measured the tip. The source reading changes several of its claims.

- **None of #265 is on the tip.** T2 #299, T3 #393, T4 #413, T5 #419, T6 #425, T7 #359 and T8 #431 are merged only into `feature/265_render-speed`, which has 28 commits the tip lacks. Only T0 and T1 landed. That branch's own ledger put the 14 largest diagrams at about 1.15× of Pele.
- **SVG writer** (`packages/core/src/svg/`):
  - Per attribute: 3 allow-list lookups (`encode.ts:13-37`, `allowlist.ts:168`), and for strings, 2 regex tests, one of them with the `u` flag (`escape.ts:23-38`).
  - Numbers and undefined values already skip escaping. The value-level allow-list (`inert.ts:286-345`) runs only with `postRender` hooks or an outline drawer, never in a plain render.
  - About 5 object spreads per node: `diagram-flowchart/src/render/render.ts:411,437`, `shapes.ts:130-166`, `writer.ts:378`.
  - The one-line label path builds an attrs object and goes through `open`, `text` and `close` (`writer.ts:377-386`).
  - The root style is memoised (`theme.ts:998-1006`) but goes through `escAttr` again on every render.
  - Where the extra bytes come from: paint attributes repeated on every shape, `data-ast`, the long edge class, a redundant `fill="none"` (`render.ts:342`), `stroke="none"` on markers, and the root style's `var()` fallbacks.
  - Pele writes template strings and escapes only user text.
  - R-SEC-1..4 and ADR-3 (DESIGN §7.1): user values must stay escaped and checked. Tag and attribute names come from code, never from diagram text.
- **Parsing:**
  - The path is `api.ts:830` → `prepareWith :528` → `detect :437` → `analyse :400` → `parseFlowchart` (`diagram-flowchart/src/parser.ts:379`).
  - The `FlowParser` constructor (`:426-462`) builds the source view, the lexer's typed arrays, and copies them (`tokens.ts:66-75`, `view.ts:22-35`).
  - `cook` (`source-view.ts:393-405`) slices twice and creates a RegExp for every token.
  - Each node allocates a tuple, ranges, an `Opener` used only for errors, rest arrays, symbols, and duplicated id work (`parser.ts:748-1147`).
  - A plain render reads only `parse.model` (`api.ts:792-794`). The AST, symbols and statement spans are read only by ASCII (`ctx.ast`), `plugin-interactions` (`postParse`) and the public `prepare().parse`. The language service runs its own parse (`language-service/src/service.ts:163`).
  - `data-ast` needs only model fields (`parser.ts:888-941, 1127, 1481`).
  - The AST is not thrown away: it stays in `AnalysisCache` for 32 renders.
  - The YAML reader is 947 lines against Pele's 470. It runs for front matter (only when present) and for every `@{…}`.
- **Fixed cost:**
  - Everything before the parser and after the SVG is estimated at 4–10 µs, not 57 µs.
  - Detection lower-cases the body twice (`registry.ts:486,494`) and runs `includes('%%')` on all 14 detector rows that fail before flowchart (`core/src/detect-text.ts:58`). The C4 regex scans the whole text. Together these are about 19 whole-text passes against Pele's 6–8, about 1–3 µs.
  - Config is merged only when front matter or a directive is present (`resolve.ts:199-247`).
  - `createTheme` runs on every render (`theme.ts:890`). Any `themeVariables`, set by `%%{init}`, by front matter, or by `initialize({fontFamily})` (`config-snapshot.ts:151`), rebuilds the whole theme on every render (`theme.ts:836+`). The estimate is 10–40 µs.
  - Some calls repeat: `missingFor` twice, `registry.layout` three times, `checkFormat` and `cache.get` twice.
- **Layout:**
  - It is the same engine as Pele's, with the same triggers. A second `place()` runs when crossings exceed 1.5 × the flat ordering's count plus 4, and is kept only if it has fewer crossings (`core/src/layout/layered/compound.ts:1239-1256`; Pele `873-885`).
  - Port-order refinement fires on a strict inversion, with no epsilon (`compound.ts:1291`). Graphs without subgraphs call `place()` exactly once.
  - `sweep` matches Pele line for line.
  - v13's default `curve: "rounded"` routes as stepped and turns on track assignment (`render/prepare.ts:85-88,444`, `layered/index.ts:564`). Pele routes curved by default. This matters only when comparing the engines, not in the loop.
- **Conversions:**
  - There are 4 hops against Pele's 1: model → views (`prepare.ts:214-356`), views → LayoutGraph (`:359-449`), LayoutGraph → CNode (`layered/index.ts:102-146, 465-570`), CNode → LayoutModel (`:572-625`). Then `points.slice()` copies again (`render.ts:321`).
  - The LayoutGraph-in, LayoutModel-out interface (DESIGN §6.1) is what ELK plugs into.
- **Labels:**
  - Blank labels, which most edges have, pay for `metrics()`, the placeholder test and two feature finders before the blank check (`core/src/text/label.ts:99-120`, `inline.ts:237-281`). Pele returns first (`pele label.ts:319`).
  - A plain label wider than 120 px takes the full markup path: text built one character at a time (`label.ts:354`), 3 replaces in `tidy` (`:371-378`), `smallWidths` Maps, and `finish` copying and re-measuring every piece (`:508-531`).

## Round 1: the agreed hypotheses

Each hypothesis is measured on its own against the tip. A new idea is implemented on the tip, not on top of its #265 port. Ports are rewritten from the ticket's description where 800 commits of drift make a cherry-pick impractical. In the docs PR, each entry adds a kill condition, for example "1a is killed if regex tests drop and Node time does not move."

| Id | Hypothesis | Lane | Needs | Named counter |
| --- | --- | --- | --- | --- |
| 1a | Cheaper escaping and checks: T4's single plain-ASCII regex, one `Map` lookup per attribute, a last-value memo | identical | — | regex tests, allow-list lookups |
| 1b | Name checks at test time for first-party plugins; user values escaped as now | identical | R-SEC-2 amendment | runtime allow-list lookups |
| 1c | Fewer objects per node: T4's direct label write, no attribute spreads when a node has no style | identical | — | objects per node and edge |
| 1d | Paint into one style rule per class instead of attributes repeated on every shape | output | — | bytes, attributes |
| 1e | Internal trimming: shorter alias names, trimmed root-style fallbacks, no redundant `fill`/`stroke="none"` | output | — | bytes |
| 2a | The parser writes to a sink: by default only the model and diagnostics; an AST sink when the language service, interactions or ASCII is registered; `prepare().parse.ast` as a lazy getter | identical | R-PARSE-3, DESIGN §4.2 amendment | objects per node, bytes allocated |
| 2b | Cheaper lexer and source view: no slicing or RegExp per token in `cook`, no token-array copies without `keepTokens`, error-only ranges built lazily | identical | — | RegExp objects, arrays per parse |
| 2c | Flat shape-data reader (T6 port) | identical | — | YAML calls per `@{…}` |
| 2d | Front-matter fast path, with the full reader as fallback; priority from the round-0 counts | identical | — | time in the YAML reader |
| 3a | Cache disabled, with a one-slot `prepare` → `renderSync` hand-off (P18) | identical | decided | retained bytes, scavenge time |
| 3b | Theme override cache keyed by value (T5 port); `createTheme`'s closures built once per theme | identical | — | theme rebuilds |
| 3c | No repeated work in render: render reuses prepare's analysis, repeated lookups run once, detection without lower-casing (T5 part) | identical | — | whole-text passes, repeated calls |
| 4a | The flowchart plugin builds the LayoutGraph straight from the model (hops 1 and 2 merged) | identical | — | objects per node in `prepare` |
| 4b | The layered engine works on LayoutGraph arrays without copying into CNodes; includes T7's port (one pass without groups, an Int32Array track set) | identical | — | wrapper objects, Set clears |
| 4c | Measure only: what hop 4 (CNode → LayoutModel) costs on the large diagrams, for a later DESIGN §6.1 decision | — | — | µs in hop 4 |
| 5a | Blank labels return first; the regex finders run only when `$` or `:` is present (T3 plus new) | identical | — | regex execs per label |
| 5b | Fast wrap for plain text (as Pele does), text built by slicing, `metrics()` once per font | identical | — | strings per wrap, measurer calls |

Memory is not a hypothesis of its own. Bytes allocated and scavenge time are counters on all of the above.

## Deliberately out of round 1

- An epsilon on port-order refinement: a look change (#281).
- The `curve` default and track assignment: a comparison setting (D205), not a loop item.
- Detection order and the C4 pattern: about 1 µs, and outside scope.
- The lean canvas measurer (T2): browser-only (P13).
- The look items in #281: word breaking, wrap width and font size, shadows, invisible edges, `fa:` icons.
- Changing the LayoutEngine interface (hop 4): decided after 4c is measured.
