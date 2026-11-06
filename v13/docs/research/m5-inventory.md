# M5 inventory: the remaining v12 diagram types

Draft, 2026-11-06. Input for the M5 grilling, as D210–D219 were for M4. Nothing here is decided. Sources: `mermaid@12.2.0` (tag commit `1fb786986`, the oracle conformance pins), `@mermaid-js/parser@2.0.1`, and `mermaid-js/mermaid-v13` at `5bf4d29e9` (corpus counts, registry). Ids are cited, not restated (R-REL-5).

## 1. What "remaining" means

D34 defines M5 as "the rest". Against `mermaid@12.2.0` that is **21 diagram types**, plus zenuml, which is a separate v12 package. That is three times M4's seven. Every type already has a detector row in `packages/mermaid/src/generated/registry.gen.ts`, so today each one fails with `UNSUPPORTED_DIAGRAM`.

Already covered, so not in M5: `flowchart-elk` (registry id `flowchart`, M3.5), and every M1–M4 type.

## 2. Per-type inventory

*v12 LOC* counts non-spec `.ts`/`.js` in `packages/mermaid/src/diagrams/<type>/` at 12.2.0. *Corpus* counts `.mmd` files under `e2e/diagrams/<dir>/` in v13. *Beta* is the detector: **req** means `-beta` is required, *opt* means it is optional.

| Type | Detector | Beta | v12 parser | v12 layout | v12 LOC | Corpus | Runtime deps to replace (R-PERF-2) | Notes |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |
| requirement | `requirement(Diagram)?` | – | jison | unified `getData` → dagre | 604 | 172 | – | Closest to ER/class. Biggest corpus. |
| block | `block(-beta)?` | opt | jison | own grid `layout.ts` (dagre graphlib for edges) | 1,473 | 58 | graphlib | Custom column layout; edges between blocks. |
| c4 | `C4Context\|…Deployment` | – | jison | hand-rolled boundary packing in `c4Renderer.ts` | 2,408 | 32 | – | Five sub-keywords. `foreignObject` in v12. |
| xychart | `xychart(-beta)?` | opt | jison | custom (axes, bar, line) | 2,111 | 48 | d3 scales | Chart. |
| sankey | `sankey(-beta)?` | opt | jison | d3-sankey | 454 | 18 | d3-sankey | CSV-like body. |
| kanban | `kanban` | – | jison | custom columns, `getData` | 507 | 11 | js-yaml | Shape data `@{}`; v12 `htmlLabels` branch. |
| ishikawa | `ishikawa(-beta)?` | opt | jison | custom fishbone in renderer | 718 | 13 | roughjs | Tree-shaped; D280 names it as a `tree` engine user. |
| venn | `venn-beta` | req | jison | `@upsetjs/venn.js` | 676 | 21 | venn.js, roughjs | Numeric circle placement; `foreignObject`. |
| agentflow | `agentflow-beta` | req | jison | unified `getData` → dagre/ELK | 4,017 | 39 | js-yaml, dompurify | Flowchart-like containers; KaTeX. Own conformance fixtures in v12. |
| usecase | `usecase-beta` | req | **Chevrotain** (in tree) | unified `getData` → dagre | 5,378 | 32 | chevrotain | Largest v12 source. Lexer is not in `@mermaid-js/parser`. |
| swimlane | `swimlane-beta` | req | flowchart's | `rendering-util/layout-algorithms/swimlanes` | 63 | 50 | – | v12 says it is a layout variant: flowchart parser, DB and renderer with another engine. |
| architecture | `architecture` | – | Langium | cytoscape + fcose (force) | 2,034 | 20 | cytoscape, cytoscape-fcose | Icons (`getIconSVG`). D295 revisits gradient ids here. |
| treeView | `treeView-beta` | req | Langium | custom tree | 840 | 15 | – | Icons. D280 names it as a `tree` engine user. |
| treemap | `treemap` | – | Langium | d3-hierarchy treemap | 1,076 | 26 | d3-hierarchy | Chart; tree data, not the `tree` engine. |
| packet | `packet(-beta)?` | opt | Langium | fixed bit grid | 385 | 6 | – | Small. |
| radar | `radar-beta` | req | Langium | fixed polar | 564 | 6 | – | Small chart. |
| cynefin | `cynefin-beta` | req | Langium | fixed five domains | 884 | 12 | – | Small. |
| wardley | `wardley-beta` | req | Langium | author coordinates | 1,825 | 10 | – | Map with axes. |
| eventmodeling | `eventmodeling` | – | Langium | custom time × lane grid | 1,098 | 6 | – | `foreignObject`. |
| railroad | `railroad[-ebnf\|-abnf\|-peg]-beta` | req | Langium ×4 | custom railroad | 2,140 | 9 | – | Four grammars and four detector rows. |
| info | `info` | – | Langium | none (prints the version) | 93 | 2 | – | Trivial. |
| zenuml | (external) | – | `@zenuml/core` | `@zenuml/core` renders HTML | – | 1 | @zenuml/core | v12 ships it as `@mermaid-js/mermaid-zenuml` 1.0.1. |

Totals: 21 types in `mermaid`, about 29,000 v12 LOC, 606 corpus files.

## 3. What already exists for them

- **Parser oracles.** The shared jison lexer oracle (D212, #285) covers the nine jison types. Pie's `loadLangiumLexerOracle(type)` (D220) covers the ten Langium types: `@mermaid-js/parser@2.0.1` exports a `create…Services` for each one, including the four railroad dialects. **Usecase is the gap:** its Chevrotain lexer ships only inside `mermaid@12.2.0`'s bundle (Q4).
- **Layout.** `layered` covers requirement, agentflow and usecase, and maybe block's edges. M4's `tree` engine (D280, mindmap T0) is meant for treeView and ishikawa. Everything else is a custom layout (`layoutKind: 'custom'`), as pie, quadrant and journey are.
- **Plugins.** Icons (M4) is needed by architecture and treeView. Math (M3.5) is needed by agentflow. Hand-drawn (M4) is relevant to ishikawa and venn, which call roughjs directly in v12 (Q7).
- **Recipe.** `v13/docs/agents/port-diagram/` (T1–T6) applies as is.

## 4. Cross-cutting risks

1. **Core size.** D310 and D311 raised the budgets because each wave-1 M4 type adds a registry row and theme variables to core. The rows already exist, but 21 more sets of theme variables would hit the budget again several times. Fix the cause before M5 starts, by moving per-type theme variables out of the core chunk or fixing the chunk split, rather than raising the limit per wave (Q3).
2. **New engines.** Architecture needs a force or constraint layout that core does not have. fcose is a substantial numeric library on top of cytoscape, and its output defines what v12 architecture diagrams look like. It is the largest single item in M5 (Q5).
3. **`foreignObject` labels.** Architecture, c4, eventmodeling, venn and usecase use HTML labels in v12. v13 has none (out of scope), so each one moves to core label layout and gets a MIGRATION.md row, as D225 did for pie.
4. **Beta syntax.** Nine types require `-beta`, and their v12 syntax may still change. P2 protects documents, but porting a moving grammar means chasing the oracle (Q2).
5. **Swimlane is not a diagram package.** In v12 it is flowchart with another layout engine. In v13 that means a `swimlane` layout engine and a flowchart registration, which touches `diagram-flowchart` and core layout. It also overlaps with #78 (line hops) and with OSS swimlane fixes still landing upstream (mermaid-js/mermaid#8698).
6. **Scale of the spec work.** M4 was nine specs with blocks of ten D-ids. M5 as one programme would need about 22 specs. The next free id is D312.

## 5. Proposed grouping and waves

Grouped by what each type needs from core, smallest first. Within a wave, types run in parallel. "At most two tickets at a time" still applies per type.

| Wave | Types | Why together | Depends on |
| --- | --- | --- | --- |
| **0: programme** | Q3 size fix; Q4 usecase oracle; Q1, Q2 and Q8 answered | Unblocks every later wave | M4 closed |
| **1: small and fixed layouts** | info, packet, radar, cynefin, kanban | Small grammars, no layout engine, all on existing oracles | Wave 0 |
| **2: charts** | xychart, sankey, treemap, venn, wardley | Custom numeric layouts; each re-implements one library (d3 scales, d3-sankey, d3 treemap, venn.js) | Wave 0 |
| **3: graph and tree types** | requirement, block, c4, agentflow, usecase, treeView, ishikawa | `layered` or `tree` engines; the largest corpora | M4 `tree` engine (D280) and icons |
| **4: new engines** | architecture, railroad, eventmodeling, swimlane | Each needs a layout core does not have, or a flowchart change | Q5, Q6 |
| **Decision only** | zenuml | See Q8 | – |

If M5 is too large for one milestone, the natural cut is between waves 2 and 3: **M5a** (waves 1–2, ten types, no new engines) and **M5b** (waves 3–4).

## 6. Questions for the grilling

1. **Scope.** Are all 21 types Must for M5, or are the nine `-beta`-required types (agentflow, cynefin, radar, railroad, swimlane, treeView, usecase, venn, wardley) Should, so they can slip without blocking the milestone?
2. **Beta grammars.** Does a port track v12 `develop` or stay frozen at 12.2.0? If frozen, how is drift reported: a periodic oracle bump, or a skip list?
3. **Core size.** Fix the theme-variable and chunk-split cause as an M5 T0, or keep raising the budget per wave as D310 and D311 did?
4. **Usecase oracle.** Load the Chevrotain lexer from the `mermaid@12.2.0` bundle, vendor `usecase.lexer.ts` at the pinned commit into conformance, or rely on model parity only?
5. **Architecture layout.** Port fcose into core as a new engine, ship it as an optional layout plugin (like ELK, where D300's reasoning allows a runtime dependency), or write a simpler constraint layout and accept the visual change (P2 allows it)?
6. **Swimlane.** Is it in M5 as a flowchart layout option, or does it stay with the layout track (#78, DOMUS/DDLT) and leave M5?
7. **Hand-drawn.** Ishikawa and venn sketch with roughjs in v12. Do they adopt `w.outline` under D301 ("types v12 sketched"), or are they treated as drawing themselves and left plain?
8. **zenuml.** v12 is an external package wrapping `@zenuml/core`, which renders HTML. v13 has no HTML output (P4). Options: out of scope for v13; a third-party plugin built on the public plugin contract (D106) and maintained outside core; or a port of ZenUML's syntax onto v13's sequence renderer.
9. **ASCII.** Does D216 (no ASCII) carry over to M5? Block, requirement and kanban would be cheap candidates.
10. **D-id blocks.** Ten per type, as D211, or five for the small wave-1 types?

## 7. After M5

REQUIREMENTS §3 stops at M5. Nothing defines when v13 leaves alpha. A milestone after M5, or one that runs alongside M5b, should set the beta and 13.0.0 criteria:

- which R-PERF gates are enforced at release, given D150 and D207;
- the parity-corpus run (O-3) as a release check;
- MIGRATION.md complete for every type;
- the `v13-alpha` dist-tag giving way to `next`, then `latest` (D159).
