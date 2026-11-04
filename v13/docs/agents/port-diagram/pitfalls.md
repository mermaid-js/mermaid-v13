# Pitfalls from the flowchart port

Rules learned the hard way while reviewing and fixing the flowchart port (review PRs #111–#121). Each one is a mistake that shipped in flowchart, or that cost a CI round. Follow them in every ticket; the README's ticket steps say what to build, this file says what not to get wrong.

## Lexer (T1)

1. **Lex the text v12 lexed, and map offsets back.** Build a copy of the source with every span v12's preprocessing removed (comments, directives, dropped characters) cut out, lex that, and map each token to its source range through a run table. A token that runs over a removed span is one token whose range covers it; each comment and directive is its own trivia token, in source order. Do not step around removed spans while scanning: that needed caps (8 spans, 4,096 characters) and rejected valid input. Model: flowchart `source.ts` (`cut`, `SourceOffsets`, `localOffset`) and `lexer.ts`.
2. **Reproduce each v12 regex's notion of a line.** JS `.` stops at LF, CR, U+2028 and U+2029, and multiline `^` matches after all four; `[^\n]` stops at LF only. Use `isLineEnd` where the code emulates `.` or `^`, and LF/CR only where v12 had `\n`.
3. **Gate parity on generated input, not just the corpus.** The lexer-parity gate also lexes every corpus source with nine comment lines between its lines (past any small cap), one comment through the middle of a line, and line-separator cases. Copy `commented()` and `LINE_SEPARATORS` from `packages/conformance/src/flowchart/lexer-parity.spec.ts`.
4. **Normalisation hides splits.** The parity gate merges runs of text tokens, so a token wrongly split at a comment still passes it. Assert one token per v12 token in a unit spec, as `parser/removed-spans.spec.ts` does.
5. **Every scan is linear on long blank runs.** After a failed match that starts with `\s*`, skip the whole blank run instead of retrying from each blank. Add a stress case per free-text state: blanks before a closer, a string split by comment lines, runs of link-like characters.

## Parser and model (T2)

6. **A parser is a class with a method per grammar rule, not one closure.** Rules return what they produce; nothing travels through side-channel variables (flowchart had `pendingData`), and statement-level collections are arguments.
7. **Use the parser kit.** `significantTokens()` and `skipTo()` over a `TokenView` give the trivia-free arrays and statement recovery (R-PARSE-2). Do not re-implement them per diagram.
8. **One error, one diagnostic.** A failed block header still opens the block, so its `end` closes it instead of raising a second error. Test N errors in, N diagnostics out.
9. **Each opening of a reopened block gets its own AST id** (`s:A`, then `s:A@2`); the model keeps the first. The AST round-trip catches duplicates.
10. **More than four parameters take a parts object** (`VertexParts`). Validate typed `@{…}` data in the model, with a warning code, before it reaches layout.
11. **Fan-out uses a map, not a scan per edge.** `A & B & …` with thousands of members was quadratic; add a fan-out shape to the stress spec.

## Renderer (T4)

12. **Exactly one `data-ast` element per AST node (R-PARSE-8).** Labels and other parts carry `data-id` only. The conformance round-trip enforces it; adding `data-ast` to a label broke CI.
13. **No length literals in the graph builder.** Every length comes from the unit profile (#43); CSS unit conversions live in core (`fontSizePx`). Copy `packages/conformance/src/flowchart-prepare-literals.spec.ts` for each new builder.
14. **Image URLs follow image rules, not link rules.** `checkImageUrl`: raster `data:` and http(s) are allowed, `mailto:` and `javascript:` are not.
15. **Style scopes come from `styleScope(id)`, never the raw render id.** React ids such as `:r1:` made `theme: 'auto'` throw.
16. **Measure labels in the font they are drawn in,** styled `font-size` with units and keywords included.
17. **Check v12's computed styles before calling a visual change a fix.** Read what v12's CSS actually drew (dotted edges used butt caps) and compare rasterised before/after images.
18. **Split the renderer by section from the start:** paints, root, clusters, edges, edge labels and nodes as named functions; image and icon drawing in `assets.ts`; shape variants from factories; no one-letter paint bags.
19. **No per-node rework.** Reuse `prepare`'s views, share one empty label, memoise depths, and avoid O(k²) child lookups. This is a complexity rule, not size work: it is not covered by "measure and report, don't optimise".

## ASCII

20. **Keep edge labels and arrowheads off group frames.** Fuzz subgraph diagrams; about 3% broke frames before the fix.
21. **Use core's glyph helpers (`armOf`, `sideOf`)**, never a copy of the bit packing.
22. **Warn whenever an option cannot be honoured,** including one set in config rather than in the diagram (a curve kind).

## API and integration (T5)

23. **Key caches on content, never on object identity.** Config objects are mutated in place. Hash `measurer.id`, never the measurer object; copy caller arrays before freezing.
24. **One analysis path:** detect → load → analyse, used by `parse`, `prepare` and `renderSync` alike.
25. **Third-party detectors get the cleaned text and the config,** as v12 gave them; validate eager plugins at registration.

## Verification, every PR

26. **Run `packages/conformance` before every push**, not just the package's own specs. Both CI failures in the review round were conformance checks that a package-only run skipped.
27. **See the new test fail on the base first.** Twice a first spec passed on the base without capturing the bug. Re-run a reviewer's repro yourself before relying on it: some were wrong.
28. **Prove a refactor changes nothing.** Before: snapshot models, diagnostics, ASTs, tokens and SVG/ASCII output over the corpus plus generated variants (comments, CRLF, directives, mid-line splits). After: byte-identical, or every difference classified in the PR body.
29. **Ask the oracle, don't reason about v12.** Run new edge cases through the jison lexer oracle before deciding what is correct; it found bugs no reviewer did.
30. **Benchmarks:** build the base from the same commit with the change set aside; run the A/B in both orders plus an A/A control (the harness favours whichever runs first by 2–4%); report the geomean and the total.
31. **Report the size cost of a change in code shape.** Class method names survive minification where closure locals do not: the parser class cost +330 B gzipped.

## Escalate, don't decide

32. **A recorded decision changes only with the maintainer.** If a fix makes v13 match v12 where `fuzz/decided.ts` or DECISIONS.md records a deliberate divergence, update the record in the same PR and flag it as a behaviour change.
33. **Contradicting decisions are open questions, not code choices.** Example: D77 and D84 disagree on when an LR ASCII drawing turns TB.

## PR hygiene

34. **One concern per PR.** When a PR must build on unmerged ones, say so at the top of its body and list the merge order. Keep stacks shallow: get a PR reviewed before starting another on the same files.
