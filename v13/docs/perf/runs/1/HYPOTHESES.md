# Round 1 hypotheses

Status: prepared, not started. All candidates use the same frozen round base.
P28 withdraws 3a: cache reset is a measurement requirement already handled by the harness,
not a production cache-removal task. Do not dispatch 3a.
Read [the operating manual](../../LOOP.md) before implementation. Claimed lanes below are
expectations; the evaluator determines the actual lane. Every implementation must pass P12
in addition to its specific kill condition, except diagnostic-only 4c.


Each hypothesis is measured on its own against the tip. A new idea is implemented on the tip, not on top of its #265 port. Ports are rewritten from the ticket's description where 800 commits of drift make a cherry-pick impractical. Each entry includes a kill condition and an implementation effort assignment from [orchestration.json](../../orchestration.json).

| Id | Hypothesis | Lane | Needs | Named counter | Kill condition | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| 1a | Cheaper escaping and checks: T4's single plain-ASCII regex, one `Map` lookup per attribute, a last-value memo | identical | — | regex tests, allow-list lookups | Reject if regex tests and allow-list lookups do not fall, or the P12 fit gate fails. | high |
| 1b | Name checks at test time for first-party plugins; user values escaped as now | identical | R-SEC-2 amendment | runtime allow-list lookups | Reject if runtime name lookups do not fall or security checks fail. Delivery also requires the R-SEC-2 amendment; a timing gain does not approve that amendment. | high |
| 1c | Fewer objects per node: T4's direct label write, no attribute spreads when a node has no style | identical | — | objects per node and edge | Reject if per-node/per-edge object creation does not fall or the P12 fit gate fails. | medium |
| 1d | Paint into one style rule per class instead of attributes repeated on every shape | output | — | bytes, attributes | Reject on any pixel or protected-surface difference, or if neither the timing nor byte-reduction route in P12 passes. | high |
| 1e | Internal trimming: shorter alias names, trimmed root-style fallbacks, no redundant `fill`/`stroke="none"` | output | — | bytes | Reject on any pixel or protected-surface difference, or if neither the timing nor byte-reduction route in P12 passes. | medium |
| 2a | The parser writes to a sink: by default only the model and diagnostics; an AST sink when the language service, interactions or ASCII is registered; `prepare().parse.ast` as a lazy getter | identical | R-PARSE-3, DESIGN §4.2 amendment | objects per node, bytes allocated | Reject if allocations do not fall or lazy AST access, diagnostics, interactions, ASCII or public prepare behavior regresses. Delivery needs the named requirement amendments. | high |
| 2b | Cheaper lexer and source view: no slicing or RegExp per token in `cook`, no token-array copies without `keepTokens`, error-only ranges built lazily | identical | — | RegExp objects, arrays per parse | Reject if token cooking/array-copy allocations do not fall, source ranges or diagnostics regress, or P12 fails. | high |
| 2c | Flat shape-data reader (T6 port) | identical | — | YAML calls per `@{…}` | Reject if full YAML-reader calls for supported shape data do not fall, fallback behavior differs, or P12 fails. | high |
| 2d | Front-matter fast path, with the full reader as fallback; priority from the round-0 counts | identical | — | time in the YAML reader | Defer if round-0 feature counts do not justify it; otherwise reject on parsing differences or failure of P12. | high |
| 3a | Withdrawn by P28: harness-only cache reset, already implemented | — | — | — | Do not implement production cache removal or a one-slot replacement under this task. | — |
| 3b | Theme override cache keyed by value (T5 port); `createTheme`'s closures built once per theme | identical | — | theme rebuilds | Reject if theme rebuilds do not fall, value-equivalent keys are wrong, or P12 fails. | high |
| 3c | No repeated work in render: render reuses prepare's analysis, repeated lookups run once, detection without lower-casing (T5 part) | identical | — | whole-text passes, repeated calls | Reject if the named repeated work does not fall, detection/render behavior differs, or P12 fails. | high |
| 4a | The flowchart plugin builds the LayoutGraph straight from the model (hops 1 and 2 merged) | identical | — | objects per node in `prepare` | Reject if preparation object counts do not fall, LayoutGraph behavior differs, or P12 fails. | high |
| 4b | The layered engine works on LayoutGraph arrays without copying into CNodes; includes T7's port (one pass without groups, an Int32Array track set) | identical | — | wrapper objects, Set clears | Reject if wrapper allocations/Set clears do not fall, layout output differs, or P12 fails. | high |
| 4c | Measure only: what hop 4 (CNode → LayoutModel) costs on the large diagrams, for a later DESIGN §6.1 decision | — | — | µs in hop 4 | Measurement only: report hop-4 cost and uncertainty. No optimization diff, fit verdict or interface change follows automatically. | high |
| 5a | Blank labels return first; the regex finders run only when `$` or `:` is present (T3 plus new) | identical | — | regex execs per label | Reject if blank-label work and regex executions do not fall, labels differ, or P12 fails. | medium |
| 5b | Fast wrap for plain text (as Pele does), text built by slicing, `metrics()` once per font | identical | — | strings per wrap, measurer calls | Reject if strings or measurer calls do not fall, wrapping differs, or P12 fails. | high |

Memory is not a hypothesis of its own. Bytes allocated and scavenge time are counters on all of the above.


## Deliberately out of round 1


- An epsilon on port-order refinement: a look change (#281).
- The `curve` default and track assignment: a comparison setting (D205), not a loop item.
- Detection order and the C4 pattern: about 1 µs, and outside scope.
- The lean canvas measurer (T2): browser-only (P13).
- The look items in #281: word breaking, wrap width and font size, shadows, invisible edges, `fa:` icons.
- Changing the LayoutEngine interface (hop 4): decided after 4c is measured.
