# Gaps (cross-ticket)

- **Highlighters ignore front matter** (found by #28). The generated TextMate/Monarch/Lezer
  grammars read a leading `---` … `---` block as flowchart text (a `'` or `(` in the YAML can
  leave a mode open into the diagram). Fix in gen-grammar (a front-matter state at the start
  of the document; TextMate `\A---`, Lezer at offset 0, Monarch via a start state). The #28
  agreement test blanks front matter until then (exception 1 in
  tools/gen-grammar/src/categories.spec.ts). Owner: whoever picks up the CodeMirror/Monaco
  adapters (#35/#36), since first paint shows it.
