---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: `mermaid` renders railroad diagrams (`railroad-beta`, `railroad-ebnf-beta`, `railroad-abnf-beta`, `railroad-peg-beta`) as SVG through `createMermaid()`, `render()` and `mermaid/slim` with the `railroad` diagram. The `railroad` config section is honoured: the lengths (`padding`, `verticalSeparation`, `horizontalSeparation`, `arcRadius`, `markerRadius`, `strokeWidth`), `useMaxWidth`, `theme`, and the colour and font keys, which have no default any more so the theme's are drawn (a colour, font or length core cannot use, or a length or font size of 10000 or more, is dropped with one `RAILROAD_CONFIG_INVALID` warning); `compactMode`, `showMarkers` and the `comment*` keys are ignored, as v12 drew nothing with them. The `railroadTerminalFill` … `railroadRuleNameColor` theme variables (nested as `themeVariables.railroad.*`) colour it. MIGRATION.md lists what differs from v12.
