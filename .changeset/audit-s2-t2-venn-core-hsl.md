---
'@mermaid-js/core': patch
'@mermaid-js/diagram-venn': patch
---

refactor: `@mermaid-js/core/theme` exports its khroma HSL steps (`rgbToHsl`, `shiftHsl`, `hslToRgb`, `Hsl`), and venn's set label colours use them instead of a copy. Output is unchanged.
