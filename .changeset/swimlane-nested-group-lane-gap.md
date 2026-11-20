---
'@mermaid-js/core': patch
---

fix: in a top-to-bottom or bottom-to-top swimlane diagram, a group nested at a lane's edge no longer pushes its lane over the neighbouring lane. The gap between lanes now includes the padding of the deepest nested group.
