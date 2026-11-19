---
'@mermaid-js/core': patch
'mermaid': patch
'@mermaid-js/plugin-hand-drawn': patch
'@mermaid-js/plugin-math': patch
---

fix: extensions keep no state of one render in module scope (D655, #1027). `OutlineDrawer.draw` gets the render's hook context as a fifth argument, so the hand-drawn sketch always takes its own render's `handDrawnSeed`. `InlineRequest.standIns` lists what the render is drawn without (the resources its `PLACEHOLDER` warning names), so the math provider skips `MATH_NOT_RENDERED` only in a render that already warned `PLACEHOLDER` for `math "tex"`, not after an earlier render's `missing()`.
