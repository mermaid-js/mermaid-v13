## Gantt chart

The gantt parser accepts the v12 language (oracle parity over every e2e fixture and the v12 spec
strings; the schedule is compared with v12's DB at a fixed instant). The differences:

### Time and now

- **Host local time (D270):** dates, `today` and the time axis use the host time zone, with
  daylight saving handled as d3-time does, as in v12. There is no dayjs or d3 any more: the date
  code is a port of Pele's (D271), with v12's dayjs quirks kept.
- **`now` is a render option (D270, D275):** the instant the chart treats as today is
  `render(id, text, { now })` (a number or a `Date`); `mermaid` defaults it to `Date.now()` at
  each call, in the browser, Node and the CLI. Diagram text cannot set it. The today line is
  drawn only when `now` lies in the chart's time domain.
- **Schedule errors (D274):** an invalid date, a first task with no start, more than three
  fields in a task, or excludes that leave no day reject the render as `SEMANTIC` at the task's
  position (`GANTT_INVALID_DATE`, `GANTT_NO_START`, `GANTT_TOO_MANY_FIELDS`,
  `GANTT_EXCLUDED_ALL`), with v12's messages. v12 threw from its renderer. Parsing no longer
  depends on `now`, so a cached parse stays valid.
- **Scheduling work limit (D542, R-SEC-5):** a chart whose schedule walks more than
  `maxLayoutWork` days (default 1,500,000; every day a task spans is walked for its excluded
  days, on each pass) is refused with a `LIMIT` error. v12 rendered it, after minutes: about
  2,000 tasks of `9000y` with any `excludes` fit in the source limit. The largest corpus chart
  walks 689 days. Raise it with `initialize({ limits: { maxLayoutWork } })` or a per-call
  `config.limits`.
- **Warnings (D276, D727):** unknown `after`/`until`/`click` ids (`GANTT_UNKNOWN_TASK`; a click
  names only a task written before it, as v12 bound it while reading the line) and data that
  is neither a date nor a duration (`GANTT_BAD_DURATION`), one each per render, where v12 only
  logged. The unknown-id text has one clause for each statement involved and says only what
  that statement did (`after` starts and `until` ends at midnight today, a click does nothing);
  `__proto__` is reported as a reserved id; the milestone hint appears for a milestone's own `after`/`until`, and when an unknown id is the one a milestone wrote where its duration goes. Also new: `GANTT_TICK_INTERVAL_IGNORED` (a `tickInterval` that would draw more than
  10,000 ticks: automatic ticks instead), `GANTT_EXCLUDES_NOT_DRAWN` (a chart over five years
  draws no excluded days, as v12) and `GANTT_CONFIG_IGNORED`.
- **Nothing at NaN (D277, R-LAYOUT-3):** a chart with nothing to schedule draws its title and
  an empty plot with no ticks; a task in a cycle of `after`/`until` keeps its row but draws no
  bar; an `x`/`X` timestamp past the `Date` range is an invalid date; a bar whose `until` is
  before its start is 0 wide. v12 drew NaN coordinates in each case.

### Syntax

- **`topAxis` works (D273):** v12's grammar called a DB function that does not exist, so any
  text with the `topAxis` statement failed. v13 accepts it and draws the top axis, as
  `gantt.topAxis` does. A listed parity divergence; nothing that rendered in v12 changes.

### Text

- **Entity codes are decoded (D563):** `#35;`, `#quot;`, `#lt;` and `#9829;` in the title, a
  section name or a task label draw `#`, `"`, `<` and `♥`, as in v12. Markup and `\n` are still
  shown as written, as v12 drew them with `.text()`. A reference typed with `&` (`&amp;`) is
  decoded too; v12 showed it as written. A `#name;` Mermaid does not know stays as written
  (D561).
- **A label wider than its bar goes outside it (D729, provisional):** with `excludes`, a task's
  bar is drawn shorter than its span. v12 chose the label's side from the whole span and placed
  it from the drawn bar, so a label wider than the drawn bar but not than the span was centred on
  the bar's end, across the bar. v13 chooses the side from the drawn bar: such a label goes right
  of the bar, or left near the chart's edge. Labels that fit are unchanged.

### Config

- **Honoured:** `titleTopMargin`, `barHeight`, `barGap`, `topPadding`, `rightPadding`,
  `leftPadding`, `gridLineStartPadding`, `fontSize`, `sectionFontSize`, `numberSectionStyles`,
  `axisFormat`, `tickInterval`, `topAxis`, `displayMode`, `useWidth`, `useMaxWidth` and
  `weekday`. Unset, each takes v12 12.2.0's merged default. `look` is ignored (D153).
- **Width (D272):** the chart is laid out `gantt.useWidth` px wide, else to the
  `availableWidth` render option, else 1200 px. v12 laid out to its container's
  `offsetWidth`; v13 has no DOM in core, so it fills the container only with
  `mount(…, { availableWidth: true })`. Otherwise `useMaxWidth` (on by default) scales the
  1200 px chart down to the container, so a narrow page shows smaller text than v12 did.
- **`gantt.weekday` (D279):** the day a `week` tick interval starts on, the `weekday`
  statement winning. v12 never read the config key.
- **Checked values:** a length that is not a number of at least 0, a `numberSectionStyles`
  below 1 or a font size that is no CSS size keeps the default, with one `GANTT_CONFIG_IGNORED`
  warning per key. `fontSize` and `sectionFontSize` take a number (px) or a CSS size such as
  `14px`, as v12 wrote them into `font-size`.
- **Text output:** `format: 'ascii'` is not available for gantt charts; it throws
  `UnsupportedFormatError` (D216).

### Themes

- The gantt variables keep v12's names (`sectionBkgColor`, `altSectionBkgColor`,
  `sectionBkgColor2`, `excludeBkgColor`, `gridColor`, `todayLineColor`, `vertLineColor`,
  `taskBkgColor`, `taskBorderColor`, `activeTaskBkgColor`, `activeTaskBorderColor`,
  `doneTaskBkgColor`, `doneTaskBorderColor`, `critBkgColor`, `critBorderColor`,
  `taskTextColor`, `taskTextOutsideColor`, `taskTextDarkColor`), and `themeVariables`
  override each one in every theme ([theme-variables.md](./theme-variables.md)).
- **Derived in every theme (D331):** each is derived from the shared variables as v12's
  `theme-base.js` derives it (`vertLineColor` from `primaryBorderColor`, as v12's redux and neo
  themes do; dark themes fill done tasks with `mainBkg` lightened, v12's `secondBkg`). v12's
  classic themes set their own gantt colours, and `redux-color` and `redux-dark-color` took
  the bands from `cScale0`/`cScale1`; those are not carried, so gantt colours differ from v12
  most in `default`, `dark`, `forest` and `neutral` (bars are the theme's `primaryColor`, text
  `textColor`). Set the variables in `themeVariables` for v12's look.
- **Under a `themeVariables` override (D656, D657):** in the classic family the task bars,
  the active bar and the section bands (`taskBkgColor`, `activeTaskBkgColor`, and through
  `sectionBkgColor`, `sectionBkgColor2`) read `mainBkg`, and the active bar's outline and the `vert` marker read
  `guideLineColor`. `default`, `dark`, `forest` and `neutral` pin both to their own primary and
  line colours, so an author's `primaryColor` or `lineColor` leaves the bars and the outline
  alone there, as in v12. In `base` they derive from `primaryColor` and `lineColor`, so they
  follow them, as in v12, except that the active outline and the `vert` marker follow
  `lineColor` where v12's followed `primaryColor` and stayed navy (D574). Set
  `guideLineColor` in `themeVariables` to move the outline and the marker.
- **The first section band is visible in every classic theme (D726, #1249):** `sectionBkgColor`
  is the theme's `mainBkg` darkened (to black under `dark`). Bands are drawn at opacity 0.2,
  as in v12, and the band as drawn reads at least 1.1:1 against the page, the grid lines and
  the done bars at least 1.2:1 against it, and the text written on it at AA. v12's `default` drew a lavender `rgba(102, 102, 255, 0.49)`; v13's is
  `#9898d1` (v13 used the near-white `#f9ffec` before). `neutral` is `#aeaeae` (v12 `#bdbdbd`),
  `forest` `#98b25c` (v12 `#6eaa49`), `base` `#d1bb8b` (v12 `#f6f9ff`) and `dark` `#000000`
  (v12 `#b4ac76`). An author's `sectionBkgColor` wins in
  every theme; an author's `mainBkg` also moves the band, and `base`'s band no longer follows
  `tertiaryColor`. The v13-only `bandBkg` variable is removed (it never existed in v12): a
  `themeVariables.bandBkg` is ignored without a warning, like any unknown name; set
  `sectionBkgColor`.
- **Zebra section bands (D730):** the third band (`sectionBkgColor2`) repeats the first, so the
  tinted rows alternate with `altSectionBkgColor` like zebra rows, in every classic theme. v12
  gave the third band its own colour (`default` `#fff400`, `neutral` and `forest` the first
  band's, `dark` `#eae8d9`, `base` `#fff4dd`); in v13 it was `mainBkg`, which at opacity 0.2 was
  barely apart from the page. An author's `sectionBkgColor` moves both tinted bands; set
  `sectionBkgColor2` as well to colour the third band on its own.
- **A `mainBkg` override moves the bars (D657):** an author's `mainBkg` recolours the task
  bars, the active bar and the third band in every classic theme, where v12's `default`,
  `forest` and `neutral` kept their own; under `dark` the text on the active bar follows that
  fill. To darken the bars in the named themes, set `mainBkg`: a dark `primaryColor` with
  light `textColor` leaves their pale bars alone, so the light text sits on pale bars (v12
  kept its bars there too, with fixed white text).
- **Three responses stay v13's (D667):** under `neutral` the done bar's outline stays grey
  where v12's followed `lineColor`; under `dark` the alternate band stays white where v12's
  followed `background`, and done bars follow `mainBkg` where v12's stayed light grey. Set
  `doneTaskBorderColor`, `altSectionBkgColor` or `doneTaskBkgColor` for v12's colours.
- **Contrast in the classic themes (D574):** with bars in the pale `primaryColor`, the classic
  family (`default`, `dark`, `forest`, `neutral`, `base`) draws the `vert` marker and its label
  and the active bar's outline in `lineColor`. Text on a critical bar has its own variable,
  `critTextColor` (new in v13; `taskTextColor` in every theme), which the classic family turns
  black where `taskTextColor` misses WCAG AA on red; text on the other bars stays
  `taskTextColor`. Under `dark`, the critical fill is `#990000`, so the light text reads on it,
  and text on active and done bars is white where `textColor` misses AA (R-THEME-9).
- **`taskTextClickableColor` is gone:** a clickable label is v12's `#003163` in every theme, a
  constant. The variable is ignored (R-CONF-5).
- **No gradient or shadow (D278):** `neo` and `neo-dark` take neo colours only, as v12.
