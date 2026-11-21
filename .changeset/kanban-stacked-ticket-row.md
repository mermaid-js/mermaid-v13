---
'@mermaid-js/diagram-kanban': patch
---

fix: a kanban card whose ticket and assignee do not fit side by side now draws the assignee on the row below the ticket, and the card grows to hold both. Before, long ones were drawn over each other and ran past the card's edge.
