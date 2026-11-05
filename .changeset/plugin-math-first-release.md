---
'@mermaid-js/plugin-math': patch
'@mermaid-js/core': patch
'mermaid': patch
---

feat: first release of `@mermaid-js/plugin-math`. Register it with `mermaid.registerExternalDiagrams([math])` and TeX between `$$` delimiters in flowchart labels is typeset by MathJax into SVG paths. MathJax is loaded only by `prepare()`/`render()` for a diagram with math; `renderSync` before then throws `NotLoadedError` naming `math "tex"`, or draws the TeX as written with a `PLACEHOLDER` warning when placeholders are asked for, and `preload({ math: true })` loads it up front. TeX that does not parse is shown as written with a `MATH_ERROR` warning. Core: extension plugins can declare `resources` that `prepare()` loads, and inline providers get a `warn` sink.
