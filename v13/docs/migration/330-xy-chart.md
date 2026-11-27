## XY chart

The XY chart parser accepts the v12 language for `xychart` and `xychart-beta` (oracle parity over
every e2e fixture, the v12 spec strings and the syntax page; grammar in
[syntax/xychart.md](./syntax/xychart.md)), and the layout is v12's orchestrator, checked against
v12's chart builder to 0.01 px. What changes in config and drawing (spec #426):

| v12 | v13 | Why |
| --- | --- | --- |
| Unquoted text lost the blanks between its words: `title Sales Report` drew `SalesReport`, `x-axis [jan feb, mar]` a first category `janfeb` | One space wherever blanks separate the words (`Sales Report`, `jan feb`); the ends are trimmed and quoted text is kept as written. A line break after a blank is one of the blanks; without one it still ends the statement | #683, as v12's fix mermaid-js/mermaid#8575 |
| `xyChart.useMaxWidth: false` was ignored: the chart always scaled to its container | Honoured: `false` writes the canvas's `width` and `height`; the default (`true`) is unchanged | D387 |
| A `%%{init: {"config": …}}` key went under the detected type, `xychart`, which nothing read | It goes to the `xyChart` section, as `initialize()`, front matter and `%%{init: {"xyChart": …}}` do (the plugin's `configSection`) | Choice, for the maintainer (#513) |
| A config value of the wrong type was used as it was: `width: "wide"` drew `NaN` sizes, `showDataLabel: "no"` counted as true | A number, or a numeric string as its number, for a number key, and a boolean for a boolean key; anything else draws with the default and one `XYCHART_CONFIG_INVALID` warning per key. Numbers outside the schema's range are still taken, as v12 took them (`plotReservedSpacePercent: 20`, a negative padding) | Choice, for the maintainer (#513), as radar's config row (D356) |
| A `chartOrientation` other than `horizontal` (`diagonal`, `HORIZONTAL`) drew a vertical chart, silently | The same vertical chart, with one `XYCHART_CONFIG_INVALID` warning | Choice, for the maintainer (#513) |
| 12.2.0's default config holds a `$ref` key in `xyChart.xAxis` and `yAxis` | Accepted and ignored, with no warning, so a copy of that config still works; the axes' defaults are their keys' own | Choice, for the maintainer (#513) |
| With `showDataLabel`, every bar plot was labelled with the values of the first plot, so a second bar plot (or a bar plot after a line) showed another plot's numbers; legend swatches got labels too | Each bar plot is labelled with its own values; legend swatches get none | D382 |
| A band axis with more categories than values wrote `NaN` bars and points | Those bars and points are not drawn, with one `XYCHART_MISSING_VALUE` warning | D383 |
| A line plot with a missing band value wrote `NaN` into the line's path | The line breaks there (d3's `defined` gap): the parts on either side are drawn, nothing joins them | Choice (#509) |
| Values past ±1e300 (a 309-digit number reads as `Infinity`) wrote `Infinity` or `NaN` coordinates | Drawn at ±1e300 | D383 |
| A range with `min = max` (given or inferred) mapped values to the middle of the axis | The same, with one `XYCHART_EMPTY_RANGE` warning | D383 |
| Data labels with no room in any bar wrote `font-size="Infinitypx"` | None are drawn, with one `XYCHART_LABEL_TOO_SMALL` warning | D383 |
| Data labels took the smallest size over every bar, so one bar with no room (the lowest bar of an automatic y range is a few px high) gave every label a size of 0 or less, which browsers drew at the inherited size | A bar with no room gets no label; the others are drawn at the smallest size that fits them. `XYCHART_LABEL_TOO_SMALL` only when no bar of a plot has room | D611, #537 |
| A plot written before its `x-axis` kept the x values of the axis it saw, silently; on a linear axis a category x had no position | The same, with one `XYCHART_PLOT_BEFORE_AXIS` warning naming the plots; a value with no x on the axis is drawn at the axis start, on a band and a linear axis alike | D386 |
| An unclosed `accDescr {` ended in an empty description, silently | The same, with one `XYCHART_UNCLOSED_DESCRIPTION` warning | #508 |
| `mermaid.parse()` accepted a chart with no plot (`xychart` alone); the render then failed with `No Plot to render, please provide a plot with some data` | Rejected at parse, with v12's message (`XYCHART_NO_PLOT`) | Choice, for the maintainer (#508) |
| A bar whose value is below the range minimum drew with a negative height, one above the maximum past the plot | The bar is held inside the plot box, its end at the box edge | Choice, for the maintainer (#509) |
| The title, axis titles, categories, legend names and line point labels were set with d3 `.text()`: `<br>` and tags printed as written | Core's label layout: `<br>` breaks the line (a legend name of several lines takes as many rows), math and icons work, entities decode; tick numbers and data labels stay plain text. Point labels are author text like the others (a choice, #509; D385 names the rest) | D385 |
| A quoted markdown string (`` "`**bold** text`" ``) in the title, an axis title, a category, a plot name or a point label was drawn as written, backticks and `**` included; a written `\n` was shown as written | Markdown, without its backticks, in every one of those label kinds: the parser marks the text (`XyChartModel.markdownStrings`; the text keeps its backticks, as v12's DB did). Any other text is plain: `**x**`, `_x_` and a code span are drawn as written, and a written `\n` breaks the line like `<br>`. A bare backtick outside quotes stays a lexical error, as in v12. `legacyMarkdown` changes nothing: v12 read markdown in no XY chart label | #1368 |
| Line point labels in the line's colour | The same (near-white on the redux and base palettes, as in v12) | D384 |
| `format: 'ascii'`: no text output | Throws `UnsupportedFormatError` | D320 |

### XY chart theme colours

v12 read `themeVariables.xyChart` (`backgroundColor` … `plotColorPalette`), merged over
theme-default's block. v13 keeps that nested object and adds a flat name for each key
(`xyChartBackgroundColor` … `xyChartPlotColorPalette`, CSS `--mermaid-xyChartTitleColor`, …); the
flat name wins when both are set (D335, D540). `plotColorPalette` takes a comma-separated string, as
in v12, or an array; each theme's ten colours are v12's (D381). Every other value is v12's in all
eleven themes, but (`packages/conformance/src/xychart/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `redux` | No `dataLabelColor`: theme-default's `#131300` | The theme's `primaryTextColor`, `#28253d` | D333(b) |
| `redux-color` | No `dataLabelColor`: theme-default's `#131300` | The theme's `primaryTextColor`, `#28253d` | D333(b) |
| `redux-dark` | No `dataLabelColor`: theme-default's `#131300`. Inside a bar (the default) it reads well on the light plot palette (5.5–18.6:1); outside a bar (`showDataLabelOutsideBar`) it is barely visible on the `#333333` background (1.5:1) | The theme's `primaryTextColor`, `#e0dfdf`: readable outside a bar (9.5:1), but inside one it is about as light as the bar (1.0–1.5:1, 2.5:1 on the ninth colour), so labels inside bars are effectively invisible unless `xyChart.dataLabelColor` or `plotColorPalette` is set | D333(b) |
| `redux-dark-color` | No `dataLabelColor`: theme-default's `#131300`. Inside a bar (the default) it reads well on the light plot palette (5.5–18.6:1); outside a bar (`showDataLabelOutsideBar`) it is barely visible on the `#333333` background (1.5:1) | The theme's `primaryTextColor`, `#e0dfdf`: readable outside a bar (9.5:1), but inside one it is about as light as the bar (1.0–1.5:1, 2.5:1 on the ninth colour), so labels inside bars are effectively invisible unless `xyChart.dataLabelColor` or `plotColorPalette` is set | D333(b) |
| `neo` | No `dataLabelColor`: theme-default's `#131300` | The theme's `primaryTextColor`, `#333333` | D333(b) |
| `neo-dark` | No `dataLabelColor`: theme-default's `#131300`. Inside a bar (the default) it reads well on the light plot palette (5.5–18.6:1); outside a bar (`showDataLabelOutsideBar`) it is barely visible on the `#333333` background (1.5:1) | The theme's `primaryTextColor`, `#e0dfdf`: readable outside a bar (9.5:1), but inside one it is about as light as the bar (1.0–1.5:1, 2.5:1 on the ninth colour), so labels inside bars are effectively invisible unless `xyChart.dataLabelColor` or `plotColorPalette` is set | D333(b) |
