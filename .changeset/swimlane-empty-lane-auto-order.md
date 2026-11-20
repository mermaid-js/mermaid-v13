---
'@mermaid-js/core': patch
'mermaid': patch
---

fix: in a `swimlane` diagram with `swimlane.automaticLaneOrdering: true`, a lane with no nodes now stands beside the lanes it is declared between: right after the lane declared before it, or, when it is declared first, right before the first lane with nodes declared after it. It used to keep whatever place the automatic ordering left it, so an empty lane declared first stayed first, away from the lane that follows it in the source. Lanes with nodes keep their places, and without automatic ordering nothing changes.
