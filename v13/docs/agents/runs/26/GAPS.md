# Gaps (cross-ticket)

- **Highlighters ignore front matter** (found by #28). The generated TextMate/Monarch/Lezer
  grammars read a leading `---` … `---` block as flowchart text (a `'` or `(` in the YAML can
  leave a mode open into the diagram). Fix in gen-grammar (a front-matter state at the start
  of the document; TextMate `\A---`, Lezer at offset 0, Monarch via a start state). The #28
  agreement test blanks front matter until then (exception 1 in
  tools/gen-grammar/src/categories.spec.ts). Owner: whoever picks up the CodeMirror/Monaco
  adapters (#35/#36), since first paint shows it.
- **#30 → owner: open (#33 did not need it): a front matter that is one flow mapping does not recover.** In YAML tree mode an error anywhere in a root flow document (`{a: 1, a: 2}`) gives `root: null`, so no key in it gets a range (no hover or config warnings there). Block front matter recovers per entry. No #33 golden needed it; fix in `Reader.flow` (recover per flow entry) if an editor case does.
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
- **#33 → open question (D91 vs D96): the service shows only the first YAML error of the front matter.** `diagnostics()` takes preprocess's default-mode YAML diagnostics as they are (D91), and that read stops at the first error, while the tree mode the service also runs reports one error per bad line (`config:\n  theme: dark: bad\n  layout: "x` → 1 shown, 2 in tree mode). Replacing the front matter's `YAML_*` diagnostics with the tree mode's would give N in, N out; not done without a decision.
- **#33 → owners of the class/state/xychart/wardley ports: section key = diagram id.** Front-matter completion scopes `config.<section>` by the detected `entry.id`, as the renderer's `sectionOf` does. Ids `classDiagram`, `stateDiagram`, `xychart`, `wardley` differ from their schema sections (`class`, `state`, `xyChart`, `wardley-beta`), so those types are offered no section today. Settle the mapping when the type is ported.
- **#33: front-matter completion is block-style only.** Flow mappings (`config: { the| }`) and quoted keys get no completion (hover and warnings work there, from the tree); an unclosed front matter gets none.
