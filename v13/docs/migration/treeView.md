## Tree view

The tree view parser accepts the v12 language, `treeView-beta`, box-drawn input (`├──`, `└──`,
`│`, and the heavy `┣━━` set) included (oracle parity over every e2e fixture, the v12 spec
strings and the syntax page; grammar in [syntax/treeview.md](./syntax/treeview.md)). The rows,
indents, connectors, descriptions, highlights and v12's `/` root row are v12's (spec #518). What
changes:

| v12 | v13 | Why |
| --- | --- | --- |
| Syntax errors: Langium's first message, naming tokens; in box-drawn input at the line and column of v12's rewritten text | Every error, in words, at its source line and column, box-drawn lines included. The traps v12 has are kept, each with its own warning: two nodes on one line (`TREEVIEW_NODES_ON_ONE_LINE`), a trailing blank that indents the next node (`TREEVIEW_TRAILING_BLANK`), an annotation on the line after its node (`TREEVIEW_ANNOTATION_NEXT_LINE`), a first node read as a title (`TREEVIEW_NAME_READ_AS_TITLE`) | D486 |
| v12 drew a connector into the root row `/`, from `-rowIndent` to 0, outside its `viewBox` | The `/` row is kept; that connector is gone | D482 |
| The `viewBox` cut the right edge by half a line width, and a highlight could reach past it | The `viewBox` is v12's, grown wherever something drawn reaches past it | D224 |
| The diagram title (`title …` or front matter) was kept and not drawn | The same: kept in the model, not drawn. Names and descriptions are plain text with their blank runs: `<br>`, `$$` and `fa:` in a name print as written. Entity codes are decoded, as in v12: `#35;`, `#quot;` and `#9731;` draw `#`, `"` and `☃`, in the SVG and in text output. A reference typed with `&` (`&amp;`) is decoded too; v12 showed it as written | D484, D218, D560 |
| The built-in `file` and `folder` icons came from a `mermaid-treeview` Iconify pack that v12 registered | treeView draws them itself and registers no pack: `registerIconPacks` code that reads `mermaid-treeview` finds none. Other icons (`icon(pack:name)`, `defaultIconPack`, the icon maps) come from an icons extension (`@mermaid-js/plugin-icons`); one that is not drawn leaves its slot empty, with one `ICON_NOT_RENDERED` warning naming it, where v12 drew Iconify's unknown-icon glyph | D485, D290, D299 |
| Under `showIcons`, a file named `constructor`, `toString` or `a.constructor` (any name on `Object.prototype`) looked its icon up through the prototype and drew a broken icon; `icon(constructor)` with a `defaultIconPack` was `mermaid-treeview:constructor` | Own-property lookups: such a file draws its default icon, and `icon(constructor)` is `<defaultIconPack>:constructor` | D486 |
| A `treeView` config value of the wrong type or a negative length was used as given: `rowIndent: "20"` with `paddingX` 5 indented each level by `"205"`, 205 px | A length is a number, or a numeric string as its number, of 0 or more; a `defaultIconPack` a string; an icon map an object. Anything else draws with the default and one `TREEVIEW_CONFIG_INVALID` warning per key | D226 |
| Every `:::highlight` row widened the diagram by 10 px and made each later highlight box 10 px wider than the one before | The same: kept for parity | |
| `themeVariables.treeView.labelFontSize` in `em` or `pt` (`1em`, `12pt`) sized the labels through CSS | Only px or a bare number: another unit is dropped with `THEME_VARIABLE_DROPPED` (naming the flat `treeViewLabelFontSize`) and the labels stay 16 px | Core's theme `length` kind takes px only (`16px` or a bare number), and the layout measures in px; a unit-aware kind would change every diagram's size variables. Needs a D-id |
| `themeVariables.treeView.*`: v12's styles read seven keys | The same keys set `treeViewLabelFontSize`, `treeViewLabelColor`, `treeViewLineColor`, `treeViewIconColor`, `treeViewDescriptionColor`, `treeViewHighlightBg` and `treeViewHighlightStroke`, key by key; each is also a flat theme variable, and the flat name wins when both are set | D335, D540 |
| `look: handDrawn` (top level or `treeView.look`): v12 never sketched a tree view | Without `@mermaid-js/plugin-hand-drawn`, `look` is ignored with one `LOOK_REMOVED` warning, as in every section. With the plugin, `look: handDrawn` turns `handDrawn` on with no warning, and the tree view draws exactly as without it: not sketched | D301, D303 |
| `format: 'ascii'`: no text output | Text output from `@mermaid-js/diagram-treeview/ascii` (loaded only for a text render): `tree(1)` style from the first real row, no `/` row; `├── `, `└── `, `│   ` (`|-- `, `` `-- ``, `|   ` with `ascii.charset: 'ascii'`); directories keep their `/`; descriptions in one aligned column; icons dropped with one `ASCII_DROPPED`; a highlighted row marked `▶` (`>`) in a one-cell gutter; `ascii.padding: roomy` puts a line between rows | D488, D320 |

### Tree view theme colours

v12 drew its seven literals in every theme: black label ink and connectors, `#546e7a` icons,
`#6a9955` descriptions, a `rgba(255, 193, 7, 0.15)` highlight fill with a `#ffc107` stroke, at
16 px. v13 keeps them in every light theme and in `base` with `darkMode` (the colours follow the
theme's dark trait, as v12 never varied them by `darkMode`). In the four dark themes the label
ink and the connectors follow the theme, and the icons take blue grey 300, the dark counterpart
of `#546e7a`; the description green and the highlight read on both and stay
(`packages/conformance/src/treeView/theme.spec.ts` lists each difference):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `dark` | Black labels and connectors and `#546e7a` icons on the dark background | Labels in the theme's `textColor`, connectors in its `lineColor`, icons `#90a4ae` | D483 |
| `redux-dark` | Black labels and connectors and `#546e7a` icons on the dark background | Labels in the theme's `textColor`, connectors in its `lineColor`, icons `#90a4ae` | D483 |
| `redux-dark-color` | Black labels and connectors and `#546e7a` icons on the dark background | Labels in the theme's `textColor`, connectors in its `lineColor`, icons `#90a4ae` | D483 |
| `neo-dark` | Black labels and connectors and `#546e7a` icons on the dark background | Labels in the theme's `textColor`, connectors in its `lineColor`, icons `#90a4ae` | D483 |

### Tree view SVG structure

What changed in the tree view's SVG compared with v12 (spec #518, DESIGN §7.2). v12's class names
are kept (`tree-view`, `treeView-highlight-bg`, `treeView-node-icon`, `treeView-node-label`,
`treeView-node-dir`, the author's `:::class`, `treeView-node-description`, `treeView-node-line`),
and so are the rows, the connectors and the draw order.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="treeView"` | No root `id`; `class="mermaid mermaid-treeView"`, `role="img"`, `aria-roledescription="treeView"`, `data-mermaid-version`, `font-family`; `<title>` and `<desc>` (accTitle, accDescr) with ids `<id>-title`, `<id>-desc` | R-SEC-2, R-A11Y-1 |
| A `<style>` scoped by the id: the `.treeView-*` rules gave the fills, sizes, weights and strokes, and `white-space: pre` | No `<style>` (except under `theme: 'auto'`, core's light/dark sheet): presentation attributes on each element: `fill` and `font-size` on labels and descriptions, `font-weight="bold"` on directories, `font-style="italic"` on descriptions, `stroke` and `stroke-width` on connectors and highlight boxes, `color` on the icon group, `xml:space="preserve"` for the blank runs; colours read `var(--_x)` aliases on the root `style` | Inert output (R-SEC-2), host re-theming with `--mermaid-*` (R-THEME-3) |
| Each icon a nested `<svg>` from `getIconSVG` inside `g.treeView-node-icon` | `g.treeView-node-icon` (still `translate(x + paddingX, y + paddingY)`) holds a `<path>`: the built-in `file` or `folder` glyph, or the icons extension's glyph; no nested `<svg>`. An icon that is not drawn leaves the slot empty | D485, D293 |
| No source mapping | Each node's row `g` carries `data-ast` (`node:<dir>/<dir>/<name>`, `@2` for a repeat in one directory) and `data-id`; its highlight box, icon, label, description and connectors carry `data-id` only. The `/` root row carries neither | R-PARSE-8, D487 |
| The connector into the root row, outside the `viewBox` | Gone | D482 |
| Dark themes drew the light literals | The D483 colours ([above](#tree-view-theme-colours)) | D483 |
| `look: neo` and the redux themes: the same tree view as the classic themes | The same: the tree view differs between families by colour only | D227 |
