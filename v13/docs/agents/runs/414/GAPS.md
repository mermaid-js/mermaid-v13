# Gaps and choices (#414)

Choices the spec and D-ids did not settle, made the way most consistent with them. Each is also under "For the maintainer" in the PR body.

## T0a (#438)

- **Seed pair not added as rows.** D332's seed pair would have been two v13-only variables, and every v13-only variable is an oracle `DIFFERENCES` entry in the neo and neo-dark specs, which the spec says grow only by D333's entries. T0a adds `seriesColorArray` (whose slot reads keep the entry's CSS) and `literal()`; with them a theme writes its seeds inside its own series entries (`literal(darkenHsl(#ececfe, 10%))`). **T1** adds seed rows only if it finds it needs them.
- **`nodeTextColor` stays the row `ink()` reads.** Three diagram types read it (flowchart, state, ER), so by the spec's own rule it stays in core; it now lists `core` in `usedBy`. D334's "a shared row instead of `nodeTextColor`" is met by `nodeTextColor` being that shared row.
- **`scaleLabelColor` is the shared label ink (D334).** v12's own name, so an author's `scaleLabelColor` recolours `cScaleLabel` as in v12. An author's `labelTextColor` or `actorTextColor` no longer reaches `cScaleLabel` (v12 let it): MIGRATION.md D258 row, and `theme-palettes.spec.ts` now checks `scaleLabelColor` parity. `default` writes its labels as the literals v12 resolves (v12 default ignores `scaleLabelColor`).
- **`plotColorArray` (D381) is a palette with no entries yet.** xychart's port fills it in each theme spec.
- **Identity in all eleven themes** is checked by a new Node tool (`pnpm --filter @mermaid-js/bench theme-identity`), not the browser bench, whose `--identity` covers only its flowchart, sequence and class fixtures in their own themes. It renders 2,626 sources × 12 themes × 4 variants.
- **Direction rule 2 and ordinary words.** `default`, `base`, `dark` and `neutral` are also ordinary words (`classDef default`, `securityLevel: 'default'`), so they count only when compared with an expression that mentions a theme. Files under `src/generated/` (config defaults, whose `theme` key is the config default) are left out.
- **Family `dark` entries follow the spec's `dark` trait**, as spec values do, while a table's `rules.dark` follows `darkMode` like `DARK_RULES`.

- **Decided for T2's eight rows (option 1 of "T2" below):** `inline(v)` joins the DSL, and themes of one family that write a value differently get a D332 generic shared input read with `inline()`. D332 itself names "a muted surface" and "a strong text ink" as examples. The oracle specs leave the D332 inputs out of the v12 comparison (one list, `D332_INPUTS` in `packages/conformance/src/diagram-themes.ts`) rather than adding `DIFFERENCES` entries: v12 has no such names, and the diagram variables that read them are still compared with v12. So `DIFFERENCES` grows only by D333's entries.

## T0b (#439)

- **Names from the vocabulary, rules from the plugin.** The direction check takes a type's names from `src/theme/vocabulary.ts` and its table's `vars`, and its rules and family entries from the plugin `src/index.ts` exports (a vocabulary holds no rules). A new rule 4 fails when both exist and differ. A plugin table with no vocabulary is still allowed ("if both exist").
- **`fallback: 'redux'` is a family, not a theme.** The direction check's rule 2 and the three conformance theme-names scans (`er-`, `timeline-`, `quadrant/theme-names`) skip a `fallback: '<family>'` literal; every other `'redux'` or `'neo'` still fails.
- **Twelfth theme in gen-config, not `themes.spec.ts`.** Core can't import the packages, so `tools/gen-config/src/theme-tables.spec.ts` resolves every table (packages, the bench themed stub, the gen-config fixture) in the eleven themes and in a twelfth theme of base colours, the shared tokens `ThemeSpec` requires, a family and the dark trait. With no palettes a slot read is `currentColor` (D332); that counts as resolved only where the built-in theme with the same traits gives a colour.
- **Package `usedBy`** is `[<own type>]` when the package's sources read the row, else `[]`; any other type reading it fails (`packageReadErrors`).
- **The oracle specs read every table.** `packages/conformance/src/diagram-themes.ts` holds each plugin's `theme`, `VOCABULARY` (core's rows and every table's vars) and `everyTable(spec)`, a theme that answers each name from the table owning it; the neo and neo-dark specs enumerate `VOCABULARY`.
- **`dev/src/gallery.ts` is unchanged**: it reads only core's `background`, never a diagram variable.
- **`gen:theme` runs with `--conditions=mermaid-source`**, so it can import a package's plugin for its table.

## T1 (#440)

- Fill `seriesColorArray` in each theme spec and migrate pie, journey and gitGraph slots onto it; decide whether seed rows are needed (see T0a). **T1a: done for pie and journey; gitGraph is T1b.**
- gitGraph's `gitBranchLabel` reads `scaleLabelColor` (D334) once #404 merges.

### T1a (pie, quadrant, journey, timeline)

- **`seriesColorArray` layout: 0–11 series colours, 12–19 series tints.** The pie slots are 0–11 (`pie<n>` reads slot `n − 1`); journey's `fillType0`–`7` read 12–19, the paler fills (redux-color's are its Tailwind-50 `bkgColorArray`, redux-dark-color's v12's 900 shades). A separate palette for the tints would have one reader, so per the D332 rule they share the series palette. Entries are v12's resolved values as each theme pinned them, rules kept as written (`darkenHsl(secondaryColor,30%)`), so CSS is byte-identical. A whole-list reader should take 0–11.
- **Two D332 inputs read with `inline()`: `headingTextColor` and `seriesTextColor`** (shared rule `textColor`). Pie's titles and legends (v12 `taskTextDarkColor`, which gantt reads too) are pinned in default (`black`), dark (`lightgrey`) and neutral (`#333333`); its slice labels in redux-dark-color (`#28253d`). No family entry separates those themes. They are in `D332_INPUTS` (`packages/conformance/src/diagram-themes.ts`, with `seriesColorArray` and `plotColorArray`), which the neo and neo-dark specs leave out of the v12 comparison; `DIFFERENCES` is unchanged. Reconcile with T2's list at merge.
- **No seed pair.** The series entries carry v12's resolved values (redux's `#ececfe`, `#e9e9f1` and their turns), so no diagram needs seeds to derive from; adding them would only add rows.
- **No D333(a) fix taken, no `literal()` hue turns.** Default `pie3`/`pie6`, forest `pie6` and the dark `pie5` stay v12's pinned values: nothing was re-derived, so nothing "fell out", and identity is 0 differing with no `--allow`. Deriving the hue turns with `literal(adjustHue(…))` would give the same bytes in a longer source; left as is.
- **`theme: 'auto'`**: the dark spec's resolver now gets its own palettes (`paletteSource(options.dark, …)`); before, a `seriesColorArray` read in the dark half was `currentColor`. No render changed (nothing read a slot there before).
- **Quadrant's redux and neo `#ececfe`** is a `redux` family *rule*, with a `dark` rule back to `primaryColor`: a family value would also apply to redux-dark and neo-dark, and a dark entry cannot unset a value.
- **Used-by.** Table rules count as reads, so `quadrant` joins `primaryColor`, `primaryTextColor`, `primaryBorderColor` and `textColor`; the scan also counts `inline(name)` in a rule, so `pie` reads the two inks.
- **Journey's `actor0`–`actor5`** have no rule in any theme (D249); `theme-tables.spec.ts` lists them as author-only, as `themes.spec.ts` did in core.
- **Core opacity test.** No core row has kind `opacity` now, so `theme.spec.ts` tests the kind on a local table var.

## T2 (#441)

- **Eight sequence rows: option 1 taken (`inline()`, 13efc0b61).** default, forest and neutral pin v12 literals where base derives, so byte identity (D339) needs each theme's CSS shape (`--_acb:var(--mermaid-activationBkgColor,#f4f4f4)` against `…,var(--_s))`). The table reads a D332 input with `inline()`, and each theme spec writes the input exactly as it wrote the old row:
  - `actorTextColor`: `inline(scaleLabelColor)`, no new input (every theme writes the two alike).
  - `mutedBkg` (`activationBkgColor`): a quiet fill for a highlighted span or band, beside `mainBkg`; base derives `secondaryColor`, the classic print themes v12's `#f4f4f4`. Any diagram that shades a span (activations, gantt-style bars, timeline periods) can take it.
  - `mutedBorder` (`activationBorderColor`): that fill's outline, the muted counterpart of `nodeBorder`. dark writes `#cccccc`, neo-dark `#2e3030`.
  - `linkInkColor` (`signalColor`, `signalTextColor`): the ink of links between items and of the text along them, which forest, neutral (`#333333`) and dark (`#d3d3d3`) draw apart from their text ink; any diagram with labelled connectors.
  - `lineTextColor` (`sequenceNumberColor`): text on a `lineColor` fill, as `secondaryTextColor` is text on `secondaryColor`; any badge or marker filled with the line colour.
  - Family entries where the traits express it: redux's dark themes draw `signalColor` white (`redux.dark`), so `neo` no longer falls back to `redux` and carries the geometry itself.
  - The oracle leaves `D332_INPUTS` (`packages/conformance/src/diagram-themes.ts`) out of the v12 comparison; `DIFFERENCES` is unchanged.
- **`actorBorder` and `labelBoxBorderColor`: option (a) taken, `inline(v, b)`.** Forest pins `labelBoxBorderColor` to `#326932`, while every other theme writes `var(--_ar)`, a reference to `actorBorder`, which no shared input can name. The table rule `inline(frameBorder, actorBorder)` gives the theme's frame border where one is written (forest `#326932`, redux-dark and redux-dark-color `#bdbccc`), else `actorBorder`. `actorBorder` is `inline(softBorder)`. Two inputs:
  - `softBorder`: a softer outline than `nodeBorder`, for boxes that frame or head a region rather than hold content (participants; lanes, actors and group heads in other diagrams). Forest `#a6cf47`, neutral `#d4d4d4`, neo `#b3b3b3`; the shared rule is `nodeBorder`.
  - `frameBorder`: the outline of a frame's label tab or box (sequence fragments; group and legend frames elsewhere). redux-dark's equals its `clusterBorder`. The shared rule is `softBorder`, so the row resolves in every theme (the resolution checks need that). `inline(frameBorder, b)` ignores that rule, as the decision defined "set".
- **The used-by scan reads `inline(name)` and `inline(name, …)`**, so the six inputs and `scaleLabelColor` list `sequence`.
- **`gen:theme` runs twice when new core rows are read by a package table**: the first run writes core's table after it has already imported the old one, so the inventory step fails (`inline needs a variable`); the second run passes.
- **Shared rows' `usedBy` gains the table's reads.** The used-by scan counts a table's rule as a read, so `class` joins `primaryTextColor` and `textColor` (`classText`'s rules). The sequence table reads only rows that already list `sequence`.
- **`labelTextColor` moved**: after T0a nothing shared reads it (`cScaleLabel` reads `scaleLabelColor`).
- **`TEXT_SIZES` keeps the pie sizes only.** `classTerminalFontSize` (11 in every theme) is a token in each family of the class table. `CLASS_MARKER_VARIABLES` and its type are gone from core.
- **A first `gen:theme` needs a stub.** The plugin imports `src/theme/generated/variables.ts`, which `gen:theme` writes by importing the plugin, so a new package needs a placeholder file (`export const THEME_VARIABLE_TABLE = {};`) before the first run.
- **`theme-inventory.spec.ts`**: T0b's "leaves the inventory as it is while no package has a vocabulary" now checks that the packages' rows are added after core's inventory, which is otherwise unchanged.
- **`.gitignore` let no package's generated table in.** `generated/` is ignored and only `packages/diagram-*/src/generated/` was re-included, so T2 adds `!packages/diagram-*/src/theme/generated/`. Without it a clean checkout has no `THEME_VARIABLE_TABLE` for the plugin to import.
