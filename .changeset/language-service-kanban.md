---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the kanban facet from `@mermaid-js/diagram-kanban` (an optional peer), so `kanban` documents get diagnostics, definition and references for item ids (rename changes one item), `:::` classes and assignees (renamed across cards), hover, completion of the `@{ … }` keys, priorities and assignees, folding per column and semantic tokens; CodeMirror and Monaco get first-paint highlighting for kanban boards, each a lazily loaded file of its own.
