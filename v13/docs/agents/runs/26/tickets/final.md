# Final fix round (branch feature/26_final-fixes, from feature/26_language-service)

One commit per review item, in order. New exports of `@mermaid-js/language-service`:

- `lineFoldingRanges`, `lineSemanticTokens`, `encodeSemanticTokens` (+ `LineFoldingRange`, `LineSemanticToken`) and snapshot methods `lineFoldingRanges()`, `lineSemanticTokens()`, `lines()`: the one line shape Monaco, LSP and CodeMirror show. `packages/language-service-monaco/src/adapters-agree.spec.ts` checks the three agree on one document (in-process LSP server, fake Monaco, CodeMirror state).
- `diagnosticMessage` (message + `Expected: …`); Monaco keeps `relatedInformation`, CodeMirror adds `Note at line …` lines and a go-to action.
- `COMPLETION_TRIGGERS` (LSP `triggerCharacters`, Monaco, CodeMirror's activation while typing).
- `inlineMarkdown` (multi-backtick code spans; CodeMirror `renderMarkdown`, LSP plain text).
- `DocumentSnapshot` is a type only; context, cache and line table are private. Specs use the internal `contextOf` (snapshot.ts).
- Facet-author types (`DocumentView`, `HoverTarget`, `ProbeResult`, `ParseResult`, `SymbolOccurrence`, `StatementSpan`, `TokenKind`, `TokenStream`, `RelatedInfo`, …) and `./testing` (golden runner, built to dist by `tsconfig.testing.json`).

Service behaviour: a facet `parse` that throws → `LANGUAGE_FACET_FAILED` error + generic features (the server's try/catch is gone); preprocess diagnostics merged by the service, deduplicated on code + range (flowchart still shows each once); a facet's hover gets a frozen view (result, diagnostics deep; symbol/statement arrays, tokens, AST root, model shallow), with occurrences and folds copied out first.

Other: lint `isLanguageCode` covers `src/facet/`; flowchart `accDescr { … }` span runs from `accDescr` to `}` (parser tokStart/tokEnd + `attach-next`/`attach-prev` in the grammar; `blocks.out` changed); Monaco option `diagnosticsDelay` → `delay`; a second `registerMermaid` loads its `preload`; Monaco folds keep the `end` line (`{start:4,end:5}`).

Timing specs measure CPU time (`process.cpuUsage`), best of many, alternating sides (all language-service stress specs too, with a 60 s wall-clock limit): language budget ×4 text ≤ 6 (quadratic 16), front-matter stress ×8 lines < 20 (quadratic 64), probe sweep 60 s timeout, core preprocess stress up to 5 tries. Two full `pnpm test` runs beside 16 busy processes on 16 cores passed (before: 6 failures).

Docs: DESIGN §4.5, port checklist (`port-diagram/language.md`), READMEs for the service and server, four changesets (minor, `feat:`; adapters left out), GAPS cleaned (7 closed, 4 added).

Checks: `pnpm check` green (also at load average 38–80 beside other sessions, after the 60 s limits), `pnpm build` green, `e2e/language` 15/15 on macOS and 15/15 in `mcr.microsoft.com/playwright:v1.62.1-noble` under colima (`--ipc=host`, `--workers=2`: the 4 GiB VM is shared with other sessions' e2e runs).

Bench (`pnpm --filter @mermaid-js/bench language`, laptop under load avg 11–29 from other sessions): cycle median 15.9–16.6 ms (best 14.2–14.9), base branch alternated with this one on the same machine 15.4–16.1; hover 0.36–0.46 on both. Over the 15 ms line on this loaded machine, base included; not re-measured quiet.

Unmet / for a maintainer:

- Changesets: the `fixed` group with `mermaid@13.0.0-alpha.0` in pre mode makes `changeset status` show the group as major; the files say `minor` as asked.
- Hover can still change the AST below its root and the token typed arrays (GAPS, budget decision).
- `pnpm e2e` image runs need `--ipc=host` (Chromium crashes on Docker's 64 MB `/dev/shm`).
