## User journey

### Layout

- **Sizing (D242):** at the default config every element sits where v12 put it (bands at y 50,
  tasks at y 110, faces at `300 + (5 − score) × 30`, legend rows from y 60). The SVG is sized
  to what is drawn plus `diagramMarginX`/`diagramMarginY` on each side (D224). v12 counted
  `leftMargin` twice in the width, took `diagramMarginX` as a task's width in its bounds and
  as the gap between section bands, fixed the height at 450 px and the view box top at −25
  (+70 for a title), and ended the activity line at `width − leftMargin − 4`. Section bands
  are now `taskMargin` apart, as tasks are.
- **Legend margin (D242):** `leftMargin` widens by exactly what the widest legend line needs.
  v12 widened only once a legend line passed `leftMargin / 2`, jumping from 150 to about
  230 px.
- **Section fills (D241):** sections cycle over all eight `fillType0`–`fillType7`, so an
  eighth section takes `fillType7` and a ninth `fillType0`. v12 cycled over seven (the length
  of `sectionFills`, read once at module load), so `fillType7` never showed although the redux
  themes tune eight. `sectionFills` is ignored: v12's `fillType<n>` style rules hid it in
  every theme anyway.
- **The empty actor (D244):** a trailing comma (`Task: 5: Me,`) still adds the actor `''` to
  the model, but it is not drawn: no legend row, no dot, no colour. v12 drew a nameless row
  and dot, and as `''` sorts first it took the first colour and shifted every other actor's.
- **Legend order:** the legend lists actors in the model's order (sorted by code unit), and
  colours follow the same order. v12 gave colours in sorted order but walked the actor
  object's keys for the legend, so integer-like names (`1`, `42`) came first there.
- **Actor names with entities:** a name written with a `#…;` entity (`#lt;b#gt;`, held as
  `&lt;b&gt;`) sorts by that text, so before plain names. v12 sorted the placeholder its
  entity encoding left in the name, after plain names. Only such names' legend order and
  colour slots change (#302).
- **Legend wrapping (D225):** a legend name wider than `maxLabelWidth` wraps with core label
  layout, and a word too long for a line splits without the hyphen v12 added at each split.

### Config

- **Honoured:** `diagramMarginX`, `diagramMarginY`, `leftMargin`, `maxLabelWidth`, `width`,
  `height`, `taskMargin`, `boxTextMargin`, `taskFontSize`, `taskFontFamily`, `actorColours`,
  `titleColor`, `titleFontFamily`, `titleFontSize`, `useMaxWidth` and `sectionColours`.
  Unset, `taskFontSize`, `taskFontFamily` and `titleFontFamily` follow the theme font, as in
  every diagram type (D132, D248), and `sectionColours` leaves names in `textColor` (D225).
- **Ignored**, accepted without a warning: `noteMargin`, `messageMargin`, `messageAlign`,
  `bottomMarginAdj`, `rightAngles`, `activationWidth` and `useWidth` (v12's journey renderer
  never read them), `boxMargin` (read only in a loop over an empty list), `textPlacement`
  (every label is SVG text, D225) and `sectionFills` (D241).
- **`actorColours` replaces the defaults:** an author's list is the whole palette, cycling
  from the first actor. v12 appended the author's colours after its six defaults (`#8FBC8F`,
  `#7CFC00`, `#00FFFF`, `#20B2AA`, `#B0E0E6`, `#FFFFE0`), so they reached only the seventh
  actor on. Unset, the six defaults apply as before.
- **Lengths are checked:** a length key (`diagramMarginX`, `diagramMarginY`, `leftMargin`,
  `maxLabelWidth`, `width`, `height`, `taskMargin`, `boxTextMargin`) that is not a number from
  0 to 10000 px keeps its default, with one `JOURNEY_CONFIG` warning per key. v12 used any
  value as it was.
- **Per-diagram values now apply:** v12 read `sectionFills` and `sectionColours` once at
  module load, so a front-matter or directive value never reached the drawing; a
  `sectionColours` set there now colours the names.
- **Text output:** `format: 'ascii'` is not available for journeys; it throws
  `UnsupportedFormatError` and `supportsFormat('journey', 'ascii')` is `false` (D216).

### Themes

- `fillType0`–`fillType7` are each theme's v12 values, written into the theme. v12 derived
  them from `primaryColor` and `secondaryColor` with hue turns of ±64° and 128°, so a custom
  `primaryColor` recoloured every section. In v13 it does not, except on `base`, where
  `fillType0` and `fillType1` follow `primaryColor` and `secondaryColor` while
  `fillType2`–`fillType7` keep base's v12 values. Set `fillType<n>` to recolour a section.
- `faceColor` is `#FFF8DC` in every theme (v12's fallback; no v12 theme set it).
- `actor0`–`actor5` have no theme value: dots take `journey.actorColours` in every theme,
  redux included, and an author's `actor<n>` wins for n < 6 (D249).
