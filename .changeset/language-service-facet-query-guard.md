---
'@mermaid-js/language-service': patch
---

fix: a third-party diagram facet whose `hover`, `completions` or `isValidId` throws no longer fails the query: hover gives nothing, completion gives no items and rename a refusal that names the failure (#809).
