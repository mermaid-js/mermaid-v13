---
'@mermaid-js/core': patch
'@mermaid-js/diagram-c4': patch
'mermaid': patch
---

feat: c4-beta gets three config keys. `showStereotypes` (default true) and `hideStereotypes` (a list of element kinds, default none) hide the type line (`[Person]`, `[Software System]`, `[Container: Rust]`) on every element or on the kinds named, so `hideStereotypes: [person]` hides people's line only; a hidden line takes no room, and a technology stays as `[Rust]`. `personWrappingWidth` (unset by default, so a person wraps at the width of every other element, 176 px) sets the width a person's name and description wrap at. Lists from `initialize()`, front matter and directives are joined, so an empty list changes nothing. Legacy C4 is unchanged.
