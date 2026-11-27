---
'@mermaid-js/core': patch
'mermaid': patch
---

fix: a tag that labels do not draw, such as `<img>`, `<span>`, `<a>` or `<script>…</script>`, is now shown as written text in every diagram type, with its attributes and content, instead of being dropped. A label is never emptied by a tag, and the `HTML_DROPPED` warning is gone. `<br>` and the style tags draw as before.
