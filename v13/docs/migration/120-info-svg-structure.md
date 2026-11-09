## Info SVG structure

What changed in the info diagram's SVG compared with v12 (#420, DESIGN §7.2). The v12 class name
`version` is kept.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="info"`, `width="100%"` and `style="max-width: 400px;"`, no `viewBox` | No root `id`; `class="mermaid mermaid-info"`, `role="img"`, `aria-roledescription="info"`, `data-mermaid-version`; `viewBox="0 0 400 100"`, grown to hold the version text, and `max-width` its width | Inert output (R-SEC-2), no colliding ids (R-A11Y-1). Without a `viewBox` v12's SVG was 150 px high whatever its width, and a version longer than `v12.2.0` ran past its left edge |
| `<g><text x="100" y="40" class="version" font-size="32" style="text-anchor: middle;">` | `<text class="version" data-ast="info" x="100" y="40" font-size="32" text-anchor="middle" fill>`, no `<g>` | Presentation attributes (no style sheet); `data-ast` maps the line to the `info` statement (R-PARSE-8) |
| The text colour from the root `<style>` (`textColor`) | `fill` reads the `textColor` alias on the root `style` | Host re-theming with `--mermaid-*` (R-THEME-3) |
| No `<title>` or `<desc>`: `accTitle` and `accDescr` were parsed and dropped | `<title>` and `<desc>` from `accTitle` and `accDescr` | D133 |
