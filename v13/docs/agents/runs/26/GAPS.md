# Gaps (cross-ticket)

- **Highlighters ignore front matter** (found by #28). The generated TextMate/Monarch/Lezer
  grammars read a leading `---` … `---` block as flowchart text (a `'` or `(` in the YAML can
  leave a mode open into the diagram). Fix in gen-grammar (a front-matter state at the start
  of the document; TextMate `\A---`, Lezer at offset 0, Monarch via a start state). The #28
  agreement test blanks front matter until then (exception 1 in
  tools/gen-grammar/src/categories.spec.ts). Owner: whoever picks up the CodeMirror/Monaco
  adapters (#35/#36), since first paint shows it.
- **#30 → owner #33: a front matter that is one flow mapping does not recover.** In YAML tree mode an error anywhere in a root flow document (`{a: 1, a: 2}`) gives `root: null`, so no key in it gets a range. Block front matter recovers per entry. Fix in #33 only if a golden needs it (recover per flow entry in `Reader.flow`).
- **#29 → owner #31: `LanguageFacet` lives in `@mermaid-js/core/parser-kit`** (diagram packages may import only core). The language-service package re-exports it and owns the service-side types.
- **#29 → owner #32: `completions` and `hover` are not on `LanguageFacet` yet.** Add them, with `Probe`, `DocumentView`, `CompletionItem`, `HoverTarget` and `Hover`, as in DESIGN §4.5.
- **#29 → owner #27: `flowchartLanguage.parse` ignores `probe`.** Wire it in when the kit probe lands.
- **#29 → owner #31: `isValidId` checks lexing only.** Rename clash checks (D92) belong to the service.
