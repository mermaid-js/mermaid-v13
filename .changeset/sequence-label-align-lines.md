---
'@mermaid-js/diagram-sequence': patch
---

fix: with `sequence.messageAlign` or `noteAlign` set to `left` or `right`, every line of a multi-line message or note now starts (or ends) at the same edge, as in v12, instead of being centred under the first.
