## Radar chart

The radar parser accepts the v12 language (oracle parity over every e2e fixture and the v12 spec
strings; grammar in [syntax/radar.md](./syntax/radar.md)). What changes in the drawing
(spec #422):

| v12 | v13 | Why |
| --- | --- | --- |
| `radar.axisColor` was each classic theme's `lineColor`, but an author's `lineColor` override moved the axes only in `forest`, `neutral` and `base`: `default` kept `#333333`, and `dark`'s `updateColors()` resets `lineColor` to `mainContrastColor` (`lightgrey`) before it builds the `radar` block, so the axes stayed `lightgrey` | `radarAxisColor` is the rule `lineColor` in every theme, so the axes follow an author's `lineColor` (an explicit `radarAxisColor` or `themeVariables.radar.axisColor` still wins) | D351 |
| `redux`: no `radar` block, so the axes took theme-default's `#333333` | The axes take the theme's `lineColor`, `#000000` | D333(b) |
| `redux-color`: no `radar` block, so the axes took theme-default's `#333333` | The axes take the theme's `lineColor`, `#000000` | D333(b) |
| `redux-dark`: no `radar` block, so the axes took theme-default's `#333333`, barely visible on the `#333333` background | The axes take the theme's `lineColor`, `#cccccc` | D333(b) |
| `redux-dark-color`: no `radar` block, so the axes took theme-default's `#333333`, barely visible on the `#333333` background | The axes take the theme's `lineColor`, `#cccccc` | D333(b) |
| `neo`: no `radar` block, so the axes took theme-default's `#333333` | The axes take the theme's `lineColor`, `#000000` | D333(b) |
| `neo-dark`: no `radar` block, so the axes took theme-default's `#333333`, barely visible on the `#333333` background | The axes take the theme's `lineColor`, `#cccccc` | D333(b) |
| `themeVariables.radar.*` (nested only) | Each key is also the flat variable `radar<Key>` (`radarAxisColor`, … `radarLegendFontSize`); the nested key still works, and the flat name wins when both are set | D335, D540 |
| A `radar` config value of the wrong type or outside its range (`width: "wide"`, `curveTension: 3`) was used as it was (a value that is not a number drew `NaN`) | A number, or a numeric string as its number, inside the key's schema range; anything else draws with the default and one `RADAR_CONFIG_INVALID` warning per key | D356 |
| `.radarTitle` and `.radarAxisLabel` set CSS `color` (`titleColor`, `axisColor`), which paints no SVG text, so all text filled with the root `textColor` | All radar text is drawn in `textColor`, as v12 drew it; radar does not read `titleColor` | D352 |
| Curves past the twelfth (`radarCurve-12`, …) had no rule and filled opaque black with no stroke | Curve *i* takes slot *i* mod 12 (`radarCurve-0` again for the thirteenth), as pie's slices | D353 |
| `max` equal to `min` wrote `NaN` paths; a curve whose entry count is not the axis count was skipped silently; `ticks` over 32 was only logged | Curves drawn at the centre with one `RADAR_EMPTY_RANGE` warning; the curve is still left out, with one `RADAR_CURVE_SKIPPED` warning naming every such curve; `RADAR_TICKS_CLAMPED`. A detailed entry naming no axis is still ignored, with `RADAR_UNKNOWN_AXIS` | D356 |
| `radar.legendBoxSize` (12) was declared and never read: the swatch was always 12 px | `radarLegendBoxSize` sizes the swatch, and the legend text stays 4 px right of it; with the default, nothing changes | D359 |
| `format: 'ascii'`: no text output | Throws `UnsupportedFormatError` | D320 |
