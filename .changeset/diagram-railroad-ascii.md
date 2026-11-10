---
'@mermaid-js/diagram-railroad': patch
'mermaid': patch
---

feat: railroad diagrams render as text (`format: 'ascii'`, both charsets, all four notations) from the lazily loaded `@mermaid-js/diagram-railroad/ascii` entry: the SVG layout at cell scale, with `─` track, `╭╮╰╯` corners, `┬┴├┤` where branches leave and join, rounded terminals, square nonterminals, dotted specials and `●` markers, choices centred, the bypass above and the loop below (D518). The `railroad` colours, font and px lengths are not read in text, with one `ASCII_DROPPED` warning each when set.
