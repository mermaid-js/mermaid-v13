## Wardley map

The Wardley parser accepts the v12 language (oracle parity over every e2e fixture, the v12 spec
strings and the syntax page; grammar in [syntax/wardley.md](./syntax/wardley.md)). What changes
in config and drawing (spec #430):

| v12 | v13 | Why |
| --- | --- | --- |
| `wardley-beta` settings were read from `initialize()` only: the section is not in v12's `defaultConfig`, so its sanitiser dropped it from front matter and `%%{init}` (`width` stayed 900) | `wardley-beta` is honoured from every source: `initialize()`, front matter (`config: wardley-beta: …`), `%%{init: {"wardley-beta": …}}` and an init `config` key. Documents that set it today get what they asked for | D421 |
| A `wardley-beta` value below its minimum or of the wrong type was used as it was: `width: 0`, `nodeRadius: 0` or `padding` of half the canvas drew nothing, `"wide"` drew `NaN` | A number, or a numeric string as its number, at or above the key's schema minimum (`nodeRadius` above 0); anything else draws with the default and one `WARDLEY_CONFIG_INVALID` warning per key. A padding that leaves no chart falls back to 48, or to 0 where 48 leaves none either | D424, D226 |
| `size [0, 0]` (or any dimension below 1) drew a 0 × 0 view box | The dimension falls back to the config's `width` or `height`, with one `WARDLEY_CONFIG_INVALID` warning | D424 |
| `evolution` boundaries outside [0, 1] (`B@40.0`) drew stages off the chart | Clamped to [0, 1] when drawn, with one `WARDLEY_STAGE_CLAMPED` warning; decreasing boundaries still draw backwards, as in v12 | D424 |
| No codes: v12 dropped what it could not draw without a word (a link to an unknown name or to itself, an `evolve` naming no node, a second `pipeline` for a parent), read `1.5` as 1.5 % silently, and threw a plain `Error` at the first coordinate above 100 or `pipeline` naming no node | New codes. Warnings, in `RenderResult.warnings` (each with the `astIds` of the statements involved) and in the language service (one per kind, the other places in `related`): `WARDLEY_CONFIG_INVALID` and `WARDLEY_STAGE_CLAMPED` (the rows above), `WARDLEY_LINK_DROPPED`, `WARDLEY_UNKNOWN_TARGET`, `WARDLEY_PIPELINE_REPLACED` and `WARDLEY_COORDINATE_AMBIGUOUS` (a coordinate in (1, 2)). Errors, with v12's message, every one reported (`render()` rejects with a `SYNTAX` `MermaidError` whose `diagnostics` carry the codes): `WARDLEY_OUT_OF_RANGE` and `WARDLEY_UNKNOWN_PARENT` | D424, D425, D428, R-PARSE-4 |

### Wardley theme colours

v12 read `themeVariables.wardley` (`backgroundColor` … `annotationFill`) and the flat
`wardleyEvolutionColor`, and only the five classic themes set them. v13 keeps the nested object
and adds a flat name for each key (`wardleyBackgroundColor` … `wardleyAnnotationFill`, CSS
`--mermaid-wardleyAxisColor`, …); the flat name wins when both are set (D335, D540). The colours
in `default`, `forest`, `base` and `dark`, and in `neutral` but its grid, are v12's. What changed
(`packages/conformance/src/wardley/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `redux` | No `wardley` block: the renderer's fallbacks, the theme's own `background` and text, black strokes, white fills, `#dc3545` trends and a translucent grey grid (`rgba(100, 100, 100, 0.2)`) | The same colours, but the grid in `lightgrey` | D333(b) |
| `redux-color` | No `wardley` block: as `redux` | The same colours, but the grid in `lightgrey` | D333(b) |
| `neo` | No `wardley` block: as `redux` | The same colours, but the grid in `lightgrey` | D333(b) |
| `redux-dark` | No `wardley` block: black axes, strokes and links, white component fills and `#dc3545` trends on the dark page; the annotation markers and box white, as in every theme (D426) | Axes, strokes and links in the theme's `lineColor` (`#cccccc`), component and annotation fills `mainBkg` (`#111113`), trends `#ff6b6b`, the grid `lightgrey`; anchor labels, stage dividers and annotation markers follow (D426) | D333(b), D426 |
| `redux-dark-color` | No `wardley` block: as `redux-dark` | As `redux-dark`: `#cccccc` lines, `#111113` fills, `#ff6b6b` trends | D333(b), D426 |
| `neo-dark` | No `wardley` block: as `redux-dark` | As `redux-dark`, with fills `#2a2020` | D333(b), D426 |
| `neutral` | The grid in the theme's `gridColor`, `hsl(0, 0%, 90%)` | The grid in `lightgrey`, as in the other themes (`wardleyGridColor` is a literal, gantt's) | #430 |
| `base` | Anchor labels and stage dividers `#000`, annotation markers and box white | Anchor labels `#333333`, dividers `#0b0b0b` (the axis colours), markers and box `#f4f4f4` (`wardleyAnnotationFill`, the background) | D426 |
| `dark` | Anchor labels and stage dividers `#000` on the `#333` page, annotation markers and box white | Anchor labels `#e0dfdf`, dividers `lightgrey`, markers and box `#1f2020` (`mainBkg`) | D426 |
| `base` with `darkMode: true` | Labels and annotation text `#eeeeee` | The theme's `primaryTextColor`, `#333333` (core keeps text colours under `darkMode`) | Core |
| `dark` with an author `primaryColor` | Component and annotation fills stayed `#1f2020` | They follow `mainBkg`, which follows `primaryColor` | Core |
| `default` with an author `background` or `wardleyEvolutionColor` | Ignored: `default` built its `wardley` block before the author's values were applied | The background, fills and trends follow them, as in the other themes | R-THEME-4 |
