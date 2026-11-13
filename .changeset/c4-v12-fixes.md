---
'@mermaid-js/diagram-c4': patch
---

fix: a `#` in a C4 `title` or `accDescription` is text (`title Order #42`), where it was a syntax error. The root `wrap` option, when set, wins over `c4.wrap`: `wrap: false` keeps element text on one line (the box no longer stays 216 px wide and wraps), and `wrap: true` wraps element, relation and boundary text. A person keeps c4model.com's proportions: the head scales with the width and the body is at least 0.6 times as tall as it is wide, so a one-line person is no longer a small head on a flat box (the text output still draws it as a box).
