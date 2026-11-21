---
'@mermaid-js/diagram-treemap': patch
---

fix: a treemap's 13th section is drawn with a fill, an outline and its title. Section colours now cycle through the twelve `cScale` colours; the 13th distinct section name (and the 26th, …) used to take the hidden root's `transparent`, so it had no fill or border and its leaves floated on the canvas (#844).
