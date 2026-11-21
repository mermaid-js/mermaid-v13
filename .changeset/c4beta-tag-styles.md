---
'@mermaid-js/diagram-c4': patch
---

feat: c4-beta draws what a `style` says. A style for a tag paints every element, boundary and relation carrying that tag, and a style for an element kind paints that kind, over the default palette. `fill` and `stroke` colour an element's body and outline (`stroke` is the `fill` when only a `fill` is given), `color` its text; a boundary takes the same for its frame, fill and header; a relation takes `stroke` for its line and arrowheads, `color` for its label and `line` (`dashed`, `dotted`, `solid`) for its dash. A tag style wins over a kind style, and where an element lists several tags the last one wins each key. A colour the colour check refuses is dropped with `C4_COLOR_INVALID` and the default drawn. The legend's tag swatches now show colours the diagram draws. Legacy C4 is unchanged.
