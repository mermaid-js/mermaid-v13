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
- ~~**#29 → owner #31: `isValidId` checks lexing only.**~~ Closed by #31: `rename` refuses a clash in the symbol's namespace.
- **#31 → owner: flowchart parser (after #27): `click A …` records the node symbol with the range of `click A`.** The service narrows a range to the name's last occurrence in it (and drops a symbol whose range does not hold its name), so rename is right; fix the range in `parser.ts` (`refs` gets the statement range when the text is not exact).
- **#31 → owner: flowchart parser: the `accDescr { … }` statement span starts after `{`,** so its fold starts on the first body line, not on `accDescr {`. Golden: goldens/flowchart/folding/blocks.out.
- **#31 → owner #28 follow-up: the `click` keyword has no token** (the Click token covers only the id), so it gets no keyword semantic token or highlight.
- **#31 → owners #35/#36/#38: facets load asynchronously.** `update` returns at once; while a first-party facet loads, `doc.pending` resolves to the full snapshot. Adapters await it (or re-query) on first use of a type.
