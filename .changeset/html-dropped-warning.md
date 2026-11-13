---
'@mermaid-js/core': patch
'mermaid': patch
'@mermaid-js/diagram-eventmodeling': patch
'@mermaid-js/diagram-agentflow': patch
---

fix: a label that loses HTML now says so. Tags outside `<br>`, `<b>`, `<strong>`, `<i>` and `<em>` are still dropped with their text kept, and the render gives one `HTML_DROPPED` warning that names them, in SVG and in text output. When `<a>` is among them the warning points to `click id "url"`. `<script>` and `<style>` are dropped with their content, as in v12, where their text was drawn.
