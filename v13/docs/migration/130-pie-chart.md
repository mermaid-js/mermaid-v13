## Pie chart

The pie parser accepts the v12 language (oracle parity over every e2e fixture and the v12 spec
strings; grammar in [syntax/pie.md](./syntax/pie.md)). The differences:

- **Error messages** are new, as for flowchart, and every error is reported, not only the
  first. A negative value is still an error, with v12's message.
- **A repeated label (D226)** keeps its first value, as v12 did silently; v13 adds one
  `PIE_DUPLICATE_SLICE` warning for it. Nothing is ever drawn at NaN: a pie with no sections, or
  whose values sum to 0, draws its outer circle and legend only. A value too large for a number
  (309 digits or more), which v12 drew as `Infinity` and NaN, leaves its section out with a
  `PIE_VALUE_TOO_LARGE` warning, and values whose sum is past the largest number still share
  the pie as smaller ones would.
- **The front-matter `title`** is drawn as the chart title when the text has none (D218), as
  v12 did.
- **Labels (D225)** go through core's label layout: `<br>` breaks the line, markdown strings and
  entities render ([Pie SVG structure](#pie-svg-structure)). A markdown string is written as in
  flowcharts, `` "`**bold** text`" ``, in a section label or the title. A legend row of several
  lines is as tall as its label, and a title of several lines grows up from where v12 drew its
  one line, so neither runs into the pie or the next row; one-line labels sit where v12 put them.
- **Theme variables.** `pie1`–`pie12`, `pieTitleTextSize`, `pieTitleTextColor`,
  `pieSectionTextSize`, `pieSectionTextColor`, `pieLegendTextSize`, `pieLegendTextColor`,
  `pieStrokeColor`, `pieStrokeWidth`, `pieOuterStrokeColor`, `pieOuterStrokeWidth` and
  `pieOpacity` keep v12's names and each theme's v12 12.2.0 values
  ([theme-variables.md](./theme-variables.md)). The classic themes respond to an override of
  a base colour as v12's do (D656): `default` keeps all twelve slots, as v12 computed them before
  the override; `forest` and `base` recompute all twelve, hue turns included; `dark` and
  `neutral` keep their `cScale` values. In the redux and neo themes, slots v12 derives by
  lightness alone follow the theme's base colours and hue-turned slots are fixed values; a
  `cScale<n>` override recolours the slot that reads it, as in v12 (D334).
  `pieOpacity` is a number from 0 to 1 (D221) or a percentage from `0%` to `100%`, read as
  N/100 as CSS reads it (D707); any other value is dropped with `THEME_VARIABLE_DROPPED`.
- **`dark` slot 12 (D228):** `dark` and `neutral` keep v12's `cScale` offset (slice *n* takes
  `cScale`*n*, so the first slice is `cScale1`). v12 `dark` left `pie12` unset, so a twelfth
  slice drew black; it is now `cScale0`, as in `neutral`, so under `dark` a `primaryColor`
  override (which sets `cScale0`) also recolours the twelfth slice.
- **Rounding artefacts (D333(a)).** Where v12 stepped a slot from its unrounded HSL base colour,
  which lands a few steps off the hex one, v13 derives the slot from the theme's hex base colour
  by v12's own formula (`default` writes the result as a fixed value, which v12 keeps under an
  override):

  | Theme | Variable | v12 12.2.0 | v13 | Why |
  | --- | --- | --- | --- | --- |
  | `default` | `pie3` | `#b5ff20` | `#b9ff20` (`tertiaryColor` darkened 40) | D333(a) |
  | `default` | `pie6` | `#d7ff86` | `#d9ff86` (`tertiaryColor` darkened 20) | D333(a) |
  | `forest` | `pie6` | `#33b42f` | `#33b52e` (`tertiaryColor` turned 40°, darkened 40) | D333(a) |
  | `redux-dark` | `pie5` | `#2e3030` | `#2e2f2f` (`secondaryColor` darkened 10) | D333(a) |
  | `neo-dark` | `pie5` | `#2e3030` | `#2e2f2f` (`secondaryColor` darkened 10) | D333(a) |

- **`format: 'ascii'`** throws `UnsupportedFormatError`: pie has no text output (D216).
