---
'@mermaid-js/core': patch
'mermaid': patch
'@mermaid-js/diagram-eventmodeling': patch
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-mindmap': patch
---

fix: a label that loses HTML now says so. Tags outside `<br>`, `<b>`, `<strong>`, `<i>` and `<em>` are still dropped with their text kept, and the render gives one `HTML_DROPPED` warning that names them, in SVG and in text output. When `<a>` is among them the warning points to `click id "url"`. A `<script>` or `<style>` element is dropped with its content, as in v12, where its text was drawn; one with no end tag loses only the tag, and the text after it stays. A requirement title and the text of a mindmap `::icon()` report their tags too.
