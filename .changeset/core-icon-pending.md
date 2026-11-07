---
'@mermaid-js/core': patch
'@mermaid-js/plugin-icons': patch
'@mermaid-js/diagram-flowchart': patch
---

feat: an icon placeholder and a missing glyph are told apart. A glyph provider may return `'pending'` for a glyph whose data is still loading (D299), as the icons extension now does. `RenderContext.icon(name, size, { pending: true })` returns `'pending'` for one, so `undefined` means only that no extension has the name (type `IconLookup`); without the option it returns what it did before. Flowchart icon shapes ask for it: one no extension has a glyph for now warns `ICON_NOT_RENDERED` (with `ICON_UNAVAILABLE`), and a placeholder still draws its frame quietly.
