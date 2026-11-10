---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the requirement facet from `@mermaid-js/diagram-requirement` (an optional peer), so `requirementDiagram` documents get diagnostics, definition, references and rename of requirement, element and class names (quoting a new name that needs it), hover, completion of kinds, fields, values, relationships and names, folding and semantic tokens; CodeMirror and Monaco get first-paint highlighting for it, each a lazily loaded file of its own.
