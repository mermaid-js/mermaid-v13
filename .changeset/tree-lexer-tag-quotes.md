---
'@mermaid-js/shared': patch
---

fix: a quoted mindmap or kanban label that holds a tag with a double-quoted attribute, such as `root["<span style="color:red">red</span> text"]`, parses again, as in v12. As in flowchart, the tag and its attributes are dropped with one `HTML_DROPPED` warning and the text is drawn (#837).
