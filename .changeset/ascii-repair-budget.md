---
'@mermaid-js/core': patch
---

fix: text output (`format: 'ascii'`) of a large, dense graph no longer takes seconds or hangs. The route repair now has a work budget for the whole diagram; edges past it keep their first route.
