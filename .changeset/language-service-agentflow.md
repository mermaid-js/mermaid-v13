---
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: the language service loads the agentflow facet from `@mermaid-js/diagram-agentflow` (an optional peer), so `agentflow-beta` documents get diagnostics with v12's shape and containment codes at their ranges, definition, references and rename of node, connector, flow and class ids, hover with a node's kind, shape, flow and metadata and a link's semantic, completion of keywords, links, shapes, metadata keys and used ids, folding of flows, `global` blocks and multi-line metadata, and semantic tokens; CodeMirror and Monaco get first-paint highlighting for agentflow diagrams, each a lazily loaded file of its own.
