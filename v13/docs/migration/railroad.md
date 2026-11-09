## Railroad SVG structure

What changed in the railroad diagram's SVG compared with v12 (spec #526, DESIGN §7.2), for all
four notations (`railroad-beta`, `railroad-ebnf-beta`, `railroad-abnf-beta`,
`railroad-peg-beta`). v12's structure, class names and order are kept: per rule a
`g.railroad-rule` translated to its place, holding the definition's `g` (translated to where the
definition starts) with the expression groups `g.railroad-terminal`, `g.railroad-nonterminal`,
`g.railroad-special`, `g.railroad-sequence`, `g.railroad-choice`, `g.railroad-optional` and
`g.railroad-repetition` nested inside it (each child translated within its parent, children
before the group's own `path.railroad-line`s), then `g.railroad-rule-name-group >
text.railroad-rule-name`, `g.railroad-start > circle`, `g.railroad-end > circle` and the lead-in
and lead-out `path.railroad-line`, so selectors that use them keep working. Every position is
v12's, apart from the two layout fixes of D514.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `class="railroad-diagram"`, `role="graphics-document document"`, a `<style>` scoped by the id that coloured and sized `.railroad-terminal`, `.railroad-nonterminal`, `.railroad-special`, `.railroad-line`, `.railroad-start`/`.railroad-end` and `.railroad-rule-name` | No root `id`; `class="mermaid mermaid-railroad railroad-diagram"`, `role="img"`, `aria-roledescription` the diagram type (`railroad`, `railroadEbnf`, `railroadAbnf`, `railroadPeg`), `data-mermaid-version`. Paints are presentation attributes: each `rect` carries its `fill` and `stroke` (and a special's `stroke-dasharray="5,3"`, a terminal's `rx`/`ry`), each `text` its `fill`, each `circle` its `fill`, each `path.railroad-line` `fill="none"` and its `stroke`; a colour the `railroad` config sets is written as it is, any other reads a `var(--_x)` alias on the root `style`, which a host can re-theme with `--mermaid-railroadTerminalFill` and the other ten railroad variables. What every element shares is written once on the root and inherited: `font-family`, `font-size` and `stroke-width`. No `<style>`, except under `theme: 'auto'`: core's light/dark sheet, scoped by `data-p` on the root, as for every type | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3) |
| A box's text centred by the CSS (`text-anchor: middle`, `dominant-baseline: middle`); the rule name bold by the CSS (`font-weight: bold`) | The same values as attributes on each `text`: `text-anchor="middle"` and `dominant-baseline="middle"` on a box's text, `font-weight="bold"` on `text.railroad-rule-name` | No style sheet (R-SEC-2) |
| The CSS rules `.railroad-comment` and `.railroad-group` (which matched nothing: v12 drew no comment or group element) | Gone | Nothing drawn |
| No source mapping | Each `g.railroad-rule` carries `data-ast="rule:<name>"` (`rule:<name>@2` for a rule defined again) and each expression `g` `data-ast="<rule id>/<path>"` (the definition is `rule:a/0`, its second child `rule:a/0/1`); each `text` carries the `data-id` of the rule or expression it labels. The definition's wrapping `g` and the name, marker and line elements carry nothing | One `data-ast` element per AST node (R-PARSE-8, D517, pitfall 12) |
| Path data and transforms as v12's `PathBuilder` and d3 wrote them: `M 0 40 A 10 10 0 0 0 10 30 L 10 28`, `translate(74, 0)`, numbers in full | The same commands and points in core's writer format: `M0,40A10,10 0 0,0 10,30L10,28`, `translate(74,0)`, numbers rounded to two decimals; the root `style` as `max-width:<w>px` | Core's SVG writer (R-SEC-2) |
| `viewBox="0 0 <width> <height>"`: v12's canvas, which clipped a rule name in a font taller than its rule | The same unless something runs past it: the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) grows to cover everything drawn, half the stroke included, and may start above 0 | D224 |
| The `title` statement and front-matter `title` stored, never drawn; `accTitle`/`accDescr` as `<title>`/`<desc>` with ids from the render id | The `title` still not drawn (D218); `accTitle` and `accDescr` as `<title id="<id>-title">` and `<desc id="<id>-desc">`, the only ids in the SVG, named by `aria-labelledby`/`aria-describedby` | R-A11Y-1 |
| A `railroad` colour, font family or font size that failed v12's checks fell back to the theme's silently | The same fallback, with one `RAILROAD_CONFIG_INVALID` warning naming every dropped key | D515 |
| `neo` and the redux themes: the same railroad as the classic themes | The same: railroad differs between families by colour and font only, with no gradient, shadow or hand-drawn outline | D227, D301 |
