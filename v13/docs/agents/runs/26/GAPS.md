# Gaps (cross-ticket)

- **Highlighters ignore front matter** (found by #28). The generated TextMate/Monarch/Lezer
  grammars read a leading `---` … `---` block as flowchart text (a `'` or `(` in the YAML can
  leave a mode open into the diagram). Fix in gen-grammar (a front-matter state at the start
  of the document; TextMate `\A---`, Lezer at offset 0, Monarch via a start state). The #28
  agreement test blanks front matter until then (exception 1 in
  tools/gen-grammar/src/categories.spec.ts). Owner: whoever picks up the CodeMirror/Monaco
  adapters (#35/#36), since first paint shows it.
- **#30 → owner #33: a front matter that is one flow mapping does not recover.** In YAML tree mode an error anywhere in a root flow document (`{a: 1, a: 2}`) gives `root: null`, so no key in it gets a range. Block front matter recovers per entry. Fix in #33 only if a golden needs it (recover per flow entry in `Reader.flow`).
- ~~**#29 → owner #31: `LanguageFacet` lives in `@mermaid-js/core/parser-kit`**~~ Closed by #31: `@mermaid-js/language-service` re-exports it.
- **#29 → owner #32: `completions` and `hover` are not on `LanguageFacet` yet.** Add them, with `Probe`, `DocumentView`, `CompletionItem`, `HoverTarget` and `Hover`, as in DESIGN §4.5.
- **#29 → owner #27: `flowchartLanguage.parse` ignores `probe`.** Wire it in when the kit probe lands.
- ~~**#29 → owner #31: `isValidId` checks lexing only.**~~ Closed by #31: `isValidId(name, kind)` checks class and edge names by their own rules, and `rename` refuses a clash and any rename that does not read back the same after a re-parse.
- ~~**#31: `click A …` recorded the node symbol with the range of `click A`.**~~ Fixed in the parser on feature/31_service-core (the Click token's own range); the service no longer narrows symbol ranges and leaves out one that does not hold its name.
- **#31 → owner: flowchart parser: the `accDescr { … }` statement span starts after `{`,** so its fold starts on the first body line, not on `accDescr {`. Golden: goldens/flowchart/folding/blocks.out.
- **#31 → owner #28 follow-up: the `click` keyword has no token** (the Click token covers only the id), so it gets no keyword semantic token or highlight.
- **#31 → owners #35/#36/#38: facets load before use (D155).** The adapter/server setup function awaits `service.preload()` (or `preload({ types })`) before the first `update`; a type not preloaded gets `LANGUAGE_NOT_LOADED` and generic features only. `doc.pending` is gone.
- **#31 → owners #35/#36: the first-party facet is a dynamic import of an optional peer** (`@mermaid-js/diagram-flowchart/language`). Bundlers resolve it at build time: a host without the package may get a build error rather than the `LANGUAGE_LOAD_FAILED` diagnostic. The example editors should install it or mark it external.
- **#31 → owner #38: semantic tokens can span lines** (multi-line labels, `accDescr { }` bodies, `@{ }` blocks). The LSP server splits them per line (unless the client has `multilineTokenSupport`) and delta-encodes them.
- **#31, parser-side quirks seen while reviewing rename (no change made):** `class A , AA foo` reads class `,` as in v12's grammar; `style A,B …` is one node `A,B`; a node named `😀` records no symbol. A rename touching these is refused by the read-back check rather than done wrong.
- **#34 → maintainer: R-LANG-4 is over budget locally (escalated, not optimised).** `pnpm --filter bench language` on the 50k-character fixture (Apple Silicon laptop, not the reference runner): cycle median 10.6–11.1 ms, best 9.3–9.7 ms. Median per stage: update (parse) 3.4, rename 3.7 (the read-back re-parse), semanticTokens 2.7, astAt 0.55, everything else < 0.2; a bare facet parse with tokens is 3.0. Options: drop the rename read-back to prepare-time or on-commit only, or make semantic tokens cheaper; either is a decision. PR CI asserts ratios only (cycle ≤ 4 bare parses, ×2 text ≤ ×2.6 time).
- **#34 → owner: flowchart parser/service rename: two renames change the model** (pinned in `rename-round-trip.spec.ts` `KNOWN_MODEL_CHANGES`): renaming node `D` renames the generated edge id `L_B_D_0`, so a written `L_B_D_0@{ … }` then names nothing; `class link …` for edge id `link` is recorded as a node mention, so renaming either leaves the other behind. Renaming the written `L_B_D_0` itself is refused (`KNOWN_REFUSALS`).
- **#34 → owner: flowchart parser: a quoted subgraph id (`subgraph "One"`) has no definition or references** in the service: the symbol range is the quoted token, which the service leaves out (13 corpus cases, pinned as `QUOTED_SUBGRAPH_IDS` in conformance `service-symbols.spec.ts`). Fix: record the range inside the quotes.
