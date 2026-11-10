---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the usecase facet from `@mermaid-js/diagram-usecase` (an optional peer), so `usecase-beta` documents get every error as a diagnostic, definition, references and rename of actors, use cases, boundaries, JSON tables and relation ids (a quoted name and its bare id are one symbol), hover, completion of keywords, ids, arrows, metadata keys and values and class names, folding and semantic tokens; CodeMirror and Monaco get first-paint highlighting for it, each a lazily loaded file of its own.
