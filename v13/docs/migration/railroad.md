## Railroad diagram

The four railroad parsers accept v12's four languages (`railroad-beta`, `railroad-ebnf-beta`,
`railroad-abnf-beta`, `railroad-peg-beta`; oracle parity per notation over the corpus, grammars
in [syntax/railroad.md](./syntax/railroad.md), [syntax/railroad-ebnf.md](./syntax/railroad-ebnf.md),
[syntax/railroad-abnf.md](./syntax/railroad-abnf.md) and
[syntax/railroad-peg.md](./syntax/railroad-peg.md)), v12's lexer quirks included (D513), and
the layout is v12's (D514). One package draws all four, with one `railroad` config section
(D511). What changes (spec #526):

| v12 | v13 | Why |
| --- | --- | --- |
| A rule name was measured at normal weight and drawn bold, so a long bold name ran into its start marker | The name is measured bold: the start marker, the definition and the end marker move right by the difference between the bold and normal widths (a few px for a short name), and the diagram widens by as much | D514 |
| A choice branch closer than `2 × arcRadius` to the main line (a small font, or a large `arcRadius`) was drawn with arcs that overshot it, the vertical piece running backwards | That branch, and every branch beyond it on the same side, moves out to `2 × arcRadius` from the main line, so the arcs meet it; the main line is then no longer at half the choice's height. An optional's bypass and a repetition's loop sit `max(2 × arcRadius, verticalSeparation)` from the element (v12: `2 × arcRadius`). With v12's defaults, only choices v12 overshot change | D514 |
| The schema documented defaults for `railroad.fontSize` (14), `railroad.fontFamily` (`monospace`) and the colour keys, which v12's runtime config reset, so the theme's were drawn | No documented default: unset, the theme's font and the theme's railroad variables are drawn, as v12 drew them. Set, each wins over the theme, as in v12 | D515 |
| The `railroad` keys `compactMode`, `showMarkers`, `commentFill`, `commentStroke` and `commentTextColor` were read and drew nothing different | Ignored (listed under [Config](#config)) | D515 |
| `themeVariables.railroad.<key>` reached v12's style sheet; the terminal fill was `secondBkg ?? secondaryColor` | Railroad's own theme variables (`railroadTerminalFill` … `railroadRuleNameColor`), each also read as `themeVariables.railroad.<v12 key>`; every theme draws 12.2.0's colours (see [Railroad SVG structure](#railroad-svg-structure)) | D516 |
| A rule defined twice: both drawn, with a `log.warn` | Both drawn, with one `RAILROAD_DUPLICATE_RULE` warning | D517 |
| `format: 'ascii'`: no text output | Text output from the lazily loaded `@mermaid-js/diagram-railroad/ascii` entry: the SVG geometry at cell scale (`─` track, `╭╮╰╯` corners, `┬┴├┤` where branches leave and join, rounded terminals, square nonterminals, dotted specials, `●` markers; `/` `\` terminal corners, `+` and `o` in the `ascii` charset), choices centred, the bypass above and the loop below, no repeat count and no title, as in SVG. A diagram wider than `ascii.maxWidth` is drawn whole with `ASCII_TOO_WIDE`. The `railroad` colours, font and px lengths are not read: one `ASCII_DROPPED` each for the colours and font, and for the lengths, set; one for `accTitle`/`accDescr` | D320, D518 |
| Entity codes in a terminal, nonterminal or special (`"#lt;tag#gt; #35;"`) drew their characters (`<tag> #`) | The same, in the SVG and in text output, in all four notations; the box is sized for the characters. A reference typed with `&` (`&amp;`) is decoded too, where v12 showed it as written, and a `#name;` Mermaid does not know stays as written (D561) | D563, #656 |

## Railroad SVG structure

What changed in the railroad diagram's SVG compared with v12 (spec #526, DESIGN §7.2), for all
four notations (`railroad-beta`, `railroad-ebnf-beta`, `railroad-abnf-beta`,
`railroad-peg-beta`). v12's structure, class names and order are kept: per rule a
`g.railroad-rule` translated to its place, holding the definition's `g` (translated to where the
definition starts) with the expression groups `g.railroad-terminal`, `g.railroad-nonterminal`,
`g.railroad-special`, `g.railroad-sequence`, `g.railroad-choice`, `g.railroad-optional` and
`g.railroad-repetition` nested inside it (each child translated within its parent, written in
v12's order: a sequence's elements each followed by the connector to the next, a choice's
branches each followed by its left and right `path.railroad-line`, an optional's or a
repetition's element followed by its paths), then `g.railroad-rule-name-group >
text.railroad-rule-name`, `g.railroad-start > circle`, `g.railroad-end > circle` and the lead-in
and lead-out `path.railroad-line`, so selectors that use them keep working. Every position is
v12's, apart from the two layout fixes of D514.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `class="railroad-diagram"`, `role="graphics-document document"`, a `<style>` scoped by the id that coloured and sized `.railroad-terminal`, `.railroad-nonterminal`, `.railroad-special`, `.railroad-line`, `.railroad-start`/`.railroad-end` and `.railroad-rule-name` | No root `id`; `class="mermaid mermaid-railroad railroad-diagram"`, `role="img"`, `aria-roledescription` the diagram type (`railroad`, `railroadEbnf`, `railroadAbnf`, `railroadPeg`), `data-mermaid-version`. Paints are presentation attributes: each `rect` carries its `fill` and `stroke` (and a special's `stroke-dasharray="5,3"`, a terminal's `rx`/`ry`), each `text` its `fill`, each `circle` its `fill`, each `path.railroad-line` `fill="none"` and its `stroke`; a colour the `railroad` config sets is written as it is, any other reads a `var(--_x)` alias on the root `style`, which a host can re-theme with `--mermaid-railroadTerminalFill` and the other ten railroad variables. What every element shares is written once on the root and inherited: `font-family`, `font-size` and `stroke-width`; the font family and size are the theme's `var(--_x)` aliases (so `--mermaid-fontFamily` and `--mermaid-fontSize` reach them) unless the `railroad` config sets them. No `<style>`, except under `theme: 'auto'`: core's light/dark sheet, scoped by `data-p` on the root, as for every type | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3) |
| A box's text centred by the CSS (`text-anchor: middle`, `dominant-baseline: middle`); the rule name bold by the CSS (`font-weight: bold`) | The same values as attributes on each `text`: `text-anchor="middle"` and `dominant-baseline="middle"` on a box's text, `font-weight="bold"` on `text.railroad-rule-name` | No style sheet (R-SEC-2) |
| The CSS rules `.railroad-comment` and `.railroad-group` (which matched nothing: v12 drew no comment or group element) | Gone | Nothing drawn |
| No source mapping | Each `g.railroad-rule` carries `data-id` and `data-ast` `"rule:<name>"` (`rule:<name>@2` for a rule defined again) and each expression `g` both as `"<rule id>/<path>"` (the definition is `rule:a/0`, its second child `rule:a/0/1`); each `text` carries only the `data-id` of the rule or expression it labels (`text.railroad-rule-name` its rule's, `rule:<name>`). The definition's wrapping `g`, `g.railroad-rule-name-group`, the markers and the lines carry nothing | One `data-ast` element per AST node (R-PARSE-8, D517, pitfall 12) |
| Path data and transforms as v12's `PathBuilder` and d3 wrote them: `M 0 40 A 10 10 0 0 0 10 30 L 10 28`, `translate(74, 0)`, numbers in full | The same commands and points in core's writer format: `M0,40A10,10 0 0,0 10,30L10,28`, `translate(74,0)`, numbers rounded to two decimals; the root `style` as `max-width:<w>px` | Core's SVG writer (R-SEC-2) |
| `viewBox="0 0 <width> <height>"`: v12's canvas, which clipped a rule name in a font taller than its rule | The same unless something runs past it: the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) grows to cover everything drawn, half the stroke included, and may start above 0 | D224 |
| The `title` statement and front-matter `title` stored, never drawn; `accTitle`/`accDescr` as `<title>`/`<desc>` with ids from the render id | The `title` still not drawn (D218); `accTitle` and `accDescr` as `<title id="<id>-title">` and `<desc id="<id>-desc">`, the only ids in the SVG, named by `aria-labelledby`/`aria-describedby` | R-A11Y-1 |
| A `railroad` colour, font family or font size that failed v12's checks fell back to the theme's silently; a length that was no number of 0 or more fell back to its default silently; a length or font size of any finite size was drawn (`1e308` broke the drawing) | The same fallbacks, and a length or font size of 10000 or more falls back too, with one `RAILROAD_CONFIG_INVALID` warning naming every dropped key. A string length is still read with `parseFloat`, as v12 read it (`"12px"` is 12) | D515 |
| Colours from `buildThemeDefaults`: each from a shared theme variable, the terminal fill from `secondBkg` over theme-default's variables (`#ffffde` in base, neo, redux and redux-color, which have none) | The same sources through railroad's own variables (`railroadTerminalFill` … `railroadRuleNameColor`, nested as `themeVariables.railroad.<v12 key>`, which now reach the drawing too); the terminal fill is 12.2.0's in all eleven themes. Where v13 core resolves a shared variable (`secondaryBorderColor`, `secondaryTextColor`, `primaryBorderColor`, `tertiaryBorderColor`, `titleColor`) differently from v12, railroad follows core's value, as v12 followed its own | D516, D541 |
| `neo` and the redux themes: the same railroad as the classic themes | The same: railroad differs between families by colour and font only, with no gradient, shadow or hand-drawn outline | D227, D301 |
