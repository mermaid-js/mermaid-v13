---
'@mermaid-js/diagram-c4': patch
---

fix: a `#` in a C4 `title` or `accDescription` is text (`title Order #42`), where it was a syntax error. The root `wrap` option, when set, wins over `c4.wrap`: `wrap: false` keeps element text on one line (the box no longer stays 216 px wide and wraps), and `wrap: true` wraps element, relation and boundary text.
