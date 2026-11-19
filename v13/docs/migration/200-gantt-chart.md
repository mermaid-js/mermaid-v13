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
- **Warnings (D276):** unknown `after`/`until`/`click` ids (`GANTT_UNKNOWN_TASK`; a click names
  only a task written before it, as v12 bound it while reading the line) and data that
  is neither a date nor a duration (`GANTT_BAD_DURATION`), one each per render, where v12 only
  logged. Also new: `GANTT_TICK_INTERVAL_IGNORED` (a `tickInterval` that would draw more than
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
- **Under a `themeVariables` override (D657):** in the classic family the task bars, the
  active bar and the alternate section band (`taskBkgColor`, `activeTaskBkgColor`,
  `sectionBkgColor2`) read `mainBkg`. `default`, `dark`, `forest` and `neutral` pin `mainBkg`
  to their primary colour, so an author's `primaryColor` leaves the bars alone there, as in
  v12; in `base` it derives from `primaryColor`, so the bars follow it, as in v12. An author's
  `mainBkg` moves the bars in every classic theme, where v12's `default`, `forest` and
  `neutral` kept their own (and, under `dark`, the text on the active bar follows that fill).
  What else still responds differently from v12: under `default`, `dark`, `forest` and
  `neutral` the first section band (`sectionBkgColor`) follows `tertiaryColor`, and the
  active bar's outline and the `vert` marker follow `lineColor` (v12 kept its own); under
  `dark` the alternate band stays white where v12's followed `background`, and done bars
  follow `mainBkg`; under `neutral` the done bar's outline stays grey where v12's followed
  `lineColor`; in `base` the active outline and the `vert` marker follow `lineColor` (D574),
  where v12's followed `primaryColor` and stayed navy. Set the gantt variable itself in
  `themeVariables` to fix it.
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
