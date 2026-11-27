## Timeline config

- **SVG only:** `timeline`, `timeline LR` and `timeline TD` are detected by v12's case-sensitive
  `timeline` detector, after `flowchart-v2` and before `gitGraph`. `format: 'ascii'` throws
  `UnsupportedFormatError` (D216).
- **Honoured** in the `timeline` section, with v12's effective values when unset (v12's renderer
  with its default config merged): `leftMargin` (150), `padding` (no schema default; 50, v12's
  fallback), `useMaxWidth` (true) and `disableMulticolor` (false). The top-level `fontSize` (no
  schema default since D620; 16 when unset, as in v12) is read as v12's timeline read it: each box is `0.55 × fontSize` taller than its text, and the
  TD axis starts `2 × fontSize` above the content and ends `0.5 × fontSize + 20` below it. The
  text itself is drawn at `themeVariables.fontSize`, as in v12. A `leftMargin`, `padding` or
  `fontSize` that is not a number of at least 0 is replaced by its default, with a
  `TIMELINE_CONFIG_IGNORED` warning naming the key.
- **Ignored**, as v12's timeline never read them (keys copied from the sequence config):
  `diagramMarginX`, `diagramMarginY`, `width`, `height`, `boxMargin`, `boxTextMargin`,
  `noteMargin`, `messageMargin`, `messageAlign`, `bottomMarginAdj`, `rightAngles`,
  `taskFontSize`, `taskFontFamily`, `taskMargin`, `activationWidth`, `textPlacement`,
  `actorColours`, `sectionColours` and `useWidth`. Box colours come from the `cScale`,
  `cScaleInv` and `cScaleLabel` palettes or `mainBkg` / `nodeBorder` (D258).
- **Removed**, with a `CONFIG_REMOVED_KEY` warning: `sectionFills` (D708). v12's timeline never
  read it either. Box fills come from the `cScale<n>` theme variables in the classic themes,
  otherwise from `mainBkg` or the `borderColorArray` palette (D227, D257).
- **`cScale<n>`, `cScaleLabel<n>` and `cScaleInv<n>` overrides** recolour a timeline only in the
  classic themes (`default`, `base`, `dark`, `forest`, `neutral`). They change nothing in the
  redux themes, the default `redux-color` included, or under `theme: 'auto'` (which is
  `redux-color` and `dark`); in `neo` and `neo-dark` only `cScaleLabel` counts (box text, and
  slot 11 for the axis and connectors). This follows v12's redux and neo timeline paint (D227,
  D257), but v12's default theme was `default`, so a v12 diagram that set them without a `theme`
  needs `theme: 'default'` to keep its colours.
