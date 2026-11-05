---
'@mermaid-js/language-service-monaco': patch
---

feat: first release of `@mermaid-js/language-service-monaco`, the Mermaid language service in Monaco: `await registerMermaid(monaco)` registers the `mermaid` language id, first-paint Monarch tokens per diagram type (flowchart, sequence, class, state, ER; each type's tokens a lazily loaded file of their own), markers, and the completion, hover, definition, references, rename, folding and semantic-token providers. `monaco-editor` and `@mermaid-js/language-service` are peers (the service at the exact version the adapter names); nothing imports Monaco at run time.
