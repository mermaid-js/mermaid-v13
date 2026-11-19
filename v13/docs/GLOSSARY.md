# Glossary: Mermaid v13

The words the requirements, the design, the decisions and the code use for Mermaid v13's concepts. Use these terms in issues, specs, PRs and code, and do not use the ones listed under _Avoid_.

## Language

**Core**:
The `packages/core` pipeline.

**Diagram package**:
One diagram type, such as `@mermaid-js/diagram-flowchart`.

**Oracle**:
`mermaid@12`, used in tests to decide what is correct (syntax, and theme values) until 13.0 is released; from then on v13's own output is the reference.
_Avoid_: v12 baseline

**Corpus**:
The test diagrams (REQUIREMENTS §21).

**Integrator**:
An app embedding Mermaid.

**Author**:
A person writing diagram text.

## Theming

**Base colour**:
One of the base variables of R-THEME-5 (primary, secondary, tertiary, background, text, line) that an author sets in `themeVariables`.
_Avoid_: base variable, seed colour

**Shared variable**:
A theme variable in core's vocabulary, which any diagram type may read.
_Avoid_: core variable, global variable

**Diagram variable**:
A theme variable that one diagram type owns in its theme table (D331).
_Avoid_: diagram-only variable, local variable

**Pinned**:
Said of a value a theme writes as a literal, so overriding a base colour does not move it (D570).
_Avoid_: fixed, frozen

**Theme family**:
The group a theme belongs to (`classic`, `redux`, `neo`), which diagram theme tables key their entries by instead of the theme's name (D331).

**Dark trait**:
A theme's own declaration that it is dark, which selects the dark derivation rules; an author's `darkMode` selects them too (DESIGN §8.1).

## Text output

**Cell**:
One character position in text output; the unit of ASCII layout (one column wide, one row high; wide characters take two).

**Unit profile** (`UnitProfile`):
The injected table of every length constant layout uses (paddings, spacing, label patch, head room, track pitches, turn threshold). `px` for SVG, `cell` for ASCII. Layout depends on the measurer and the unit profile, never on a backend (R-ARCH-3).

**Grid quantum**:
`LayoutGraph.grid`; when set, the engine places boxes, ports and tracks on whole multiples of it (1 for ASCII).

**Text-grid kit**:
`@mermaid-js/core/ascii`: the character canvas, glyph sets, junction merging, cell measurer and repair router that diagram `ascii` hooks draw with.

**Glyph set**:
The characters one charset uses for lines, corners, junctions and arrowheads (`unicode` or `ascii`).

**Repair router**:
The cell-space A\* that re-routes only edge segments that collide after snapping.

**Upstream golden**:
A mermaid-ascii fixture's expected output, kept beside v13's own golden and checked structurally only.

## Language tooling

**Language service**:
`@mermaid-js/language-service`, the pure, editor-agnostic engine behind the editor adapters and the LSP server (REQUIREMENTS §20).

**Language facet**:
What a diagram package exports from its `./language` subpath so the language service can support that type: parser entry, token kind → category table, completion table, hover docs and symbol namespace rules (R-LANG-8).

**Probe**:
A parse run with `probe: offset`, which records the token kinds the parser would accept at that offset, the lexer mode and the typed prefix; it drives completion (R-LANG-7).
