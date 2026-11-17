---
'@mermaid-js/diagram-c4': patch
'mermaid': patch
---

feat: c4-beta draws as text. `render(id, text, { format: 'ascii' })` and `renderSync` draw a `c4-beta` diagram in the Unicode and the ASCII character sets: elements with their name, type line and description, nested boundaries as frames with their label in the top border, relations with their arrowheads, label and technology, the title and `dynamic` step numbers, in all four directions. A c4-beta block embedded in another diagram's text output draws as text instead of a stand-in frame. Text cannot show a `style` statement's colours, `accTitle` and `accDescr` or the legend, so each is left out with one `ASCII_DROPPED` warning; a diagram that says `legend off` and sets none of the others warns about nothing.
