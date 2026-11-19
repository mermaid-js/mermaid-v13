## Treemap

The treemap parser accepts the v12 language, `treemap` and `treemap-beta` (oracle parity over
every e2e fixture, the v12 spec strings and the syntax page; grammar in
[syntax/treemap.md](./syntax/treemap.md)). Layout, value formatting and colours are v12's (spec
#428). What changes:

| v12 | v13 | Why |
| --- | --- | --- |
| Syntax errors: Langium's first message, naming tokens (`Expecting: one of these possible Token sequences: …`) | Every error, in words. The traps v12 has are kept, each with its own diagnostic: a blank at the end of a line before an indented row is an error that names it; a trailing blank or `%%` comment that indents the next row warns `TREEMAP_TRAILING_BLANK`; two rows on one line warn `TREEMAP_ROWS_ON_ONE_LINE`; a `classDef` with no styles that takes the next line warns `TREEMAP_CLASSDEF_NEXT_LINE`; a one-character class name is an error saying class names need two characters | D401 |
| A value `parseFloat` cut short (`1_000` as 1, `1,2,3` as 123) was drawn silently; `.` gave `NaN` and drew a `NaN` rectangle | The same numbers, with one `TREEMAP_INVALID_VALUE` warning per render listing them; a `NaN` leaf takes no area and prints no value | D402 |
| A leaf's group had the class `leaf<i> <class>x` (a stray `x`), so CSS written for the class never matched | `leaf<i> <class>`; inline styles apply as before | D403 |
| A leaf directly under the root drew with no fill and no stroke (the hidden root takes the scales' first slot, `transparent`) | The same: kept | D404 |
| Section colours wrapped round all 13 slots of the fill scale, so the 13th distinct section name (and the 26th, …) took the root's `transparent`: no fill, no outline, and its leaves floated on the canvas | Sections cycle through `cScale0`–`cScale11` and skip the root's slot: the 13th name takes `cScale0`, the 14th `cScale1`, and so on. Every section from the 13th distinct name on is one colour away from v12; diagrams with 12 or fewer section names are unchanged | D612 |
| Labels and values fitted with `getComputedTextLength()` in the browser and clipped to their box | The same fitting rules (shrink 1 px at a time, section headers truncated with `...`), measured by the injected measurer; text is kept inside its box instead of clipped: a section label or value that does not fit is left out, and the label of a treemap of more than 20 leaves that is still too wide at the smallest size is truncated with `...`. Entities decode and tags print as text | D405 |
| `valueFormat` passed to d3-format, with v12's own `$0,0`, `$…,…` and `$x` cases; a specifier d3 rejects fell back to `,`, and `$` with such a rest (`$abc`) threw | d3-format's specifier grammar re-implemented in the package, with v12's `$` cases: every specifier formats as in v12. `$abc` falls back to `,` too | D409 |
| A `treemap` config value of the wrong type or a negative length (`padding: -5`, `nodeWidth: "wide"`) was used as it was | A number, or a numeric string as its number, of 0 or more; anything else draws with the default and one `TREEMAP_CONFIG_INVALID` warning per key. `nodeWidth`/`nodeHeight` of 0 still draws v12's 960 × 500 canvas, and an empty `valueFormat` is `,` | D226 |
| The `treemap` section's `borderWidth`, `valueFontSize` and `labelFontSize` had defaults and were never read | Accepted and ignored, with no warning ([Config](#config)) | |
| `themeVariables.treemap.*`: of the twelve keys v12's styles read, only `titleColor` and `titleFontSize` took effect (the section and leaf rules never matched, the label and value rules lost to inline attributes) | `titleColor` and `titleFontSize` set `treemapTitleColor` and `treemapTitleFontSize` (also flat; the flat name wins when both are set). `sectionStrokeColor`, `sectionStrokeWidth`, `sectionFillColor`, `leafStrokeColor`, `leafStrokeWidth`, `leafFillColor`, `labelColor`, `labelFontSize`, `valueColor` and `valueFontSize` are accepted and change nothing, as in v12 | D407, D335, D540 |
| `look: handDrawn` (top level or `treemap.look`): v12 never sketched a treemap | Without `@mermaid-js/plugin-hand-drawn`, `look` is ignored with one `LOOK_REMOVED` warning, as in every section. With the plugin, `look: handDrawn` turns `handDrawn` on with no warning, and the treemap draws exactly as without it: not sketched | D301, D303 |
| `format: 'ascii'`: no text output | Throws `UnsupportedFormatError` | D320 |

### Treemap theme colours

Treemap reads the shared `cScale` and `cScaleLabel` palettes (v12's values in every theme, D258)
and owns `cScalePeer0`–`cScalePeer11`, the section outlines (CSS `--mermaid-cScalePeer0`, …; an
author's `cScalePeer<n>` is drawn as given, as in v12). v13 derives each peer from its `cScale`
slot by one rule, the theme's `dark` trait: `lighten(cScale<i>, 10)` in a dark theme or under
`darkMode`, `darken(cScale<i>, 10)` otherwise, and the same rule over an author's `cScale<n>`.
With each theme's own slots, that is what v12 drew in `base`, `neutral`, `neo`, `redux`,
`redux-color` and `dark`; v12 used another step in `default` (15 points) and `forest` (25), the
light branch in the three dark redux and neo themes, and another rule for an author's `cScale<n>`
in `redux`, `base` and `neo`. `treemapTitleFontSize` is 14 px, as v12's `.treemapTitle`, and
`treemapTitleColor` follows core's `titleColor`, which differs from v12's in `base`, `redux` and
`redux-color`. What changed (`packages/conformance/src/treemap/theme.spec.ts` lists each one);
only section outlines and the title change:

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `default` | Peers from `darken(cScale<i>, 25)` (15 HSL points under the drawn slot, as `updateColors()` darkens the slot again), slots 1 and 2 from `darken(secondaryColor, 45)` and `darken(tertiaryColor, 40)` | The light rule: 10 points under every slot, so the outlines are a little lighter | D406, D541 |
| `forest` | Peers from `darken(cScale<i>, 25)`, slots 1 and 2 from the secondary and tertiary colours | The light rule: 10 points under every slot | D406, D541 |
| `default`, `forest` with `darkMode` | The same peers: v12 derived them in the theme's constructor, before `darkMode` was applied | The dark rule: 10 points over every slot, as in `base` and `neutral`, where v12 switched too | D406, D571 |
| `redux-dark` | The light branch (the theme sets no `darkMode`): peers 10 points under the slot, so on its black slots the same black | The dark rule: 10 points over every slot, so the outlines show on the dark fills | D406 |
| `redux-dark-color` | The light branch: peers 10 points under the slot | The dark rule: 10 points over every slot | D406 |
| `neo-dark` | The light branch: peers 10 points under the slot, so on its black slots the same black | The dark rule: 10 points over every slot | D406 |
| `redux`, `base`, `neo` | An author's `cScale<n>` moved its peer by another rule: `redux` kept the theme's own peer, `base` and `neo` darkened the author's slot by 35 points | The theme's rule over the author's slot (10 points), as without the override | D406 |
| `base` (with or without `darkMode`), `redux`, `redux-color` | The title in v12's `titleColor` (`rgb(8.5, 5.75, 0)` in `base`, `#000000` in the redux themes) | Core's `titleColor` (`#333333`, `#28253d`), which every type's titles take | D407, R-THEME-9 |
