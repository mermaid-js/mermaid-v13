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

## T0b (#439)

- **Names from the vocabulary, rules from the plugin.** The direction check takes a type's names from `src/theme/vocabulary.ts` and its table's `vars`, and its rules and family entries from the plugin `src/index.ts` exports (a vocabulary holds no rules). A new rule 4 fails when both exist and differ. A plugin table with no vocabulary is still allowed ("if both exist").
- **`fallback: 'redux'` is a family, not a theme.** The direction check's rule 2 and the three conformance theme-names scans (`er-`, `timeline-`, `quadrant/theme-names`) skip a `fallback: '<family>'` literal; every other `'redux'` or `'neo'` still fails.
- **Twelfth theme in gen-config, not `themes.spec.ts`.** Core can't import the packages, so `tools/gen-config/src/theme-tables.spec.ts` resolves every table (packages, the bench themed stub, the gen-config fixture) in the eleven themes and in a twelfth theme of base colours, the shared tokens `ThemeSpec` requires, a family and the dark trait. With no palettes a slot read is `currentColor` (D332); that counts as resolved only where the built-in theme with the same traits gives a colour.
- **Package `usedBy`** is `[<own type>]` when the package's sources read the row, else `[]`; any other type reading it fails (`packageReadErrors`).
- **The oracle specs read every table.** `packages/conformance/src/diagram-themes.ts` holds each plugin's `theme`, `VOCABULARY` (core's rows and every table's vars) and `everyTable(spec)`, a theme that answers each name from the table owning it; the neo and neo-dark specs enumerate `VOCABULARY`.
- **`dev/src/gallery.ts` is unchanged**: it reads only core's `background`, never a diagram variable.
- **`gen:theme` runs with `--conditions=mermaid-source`**, so it can import a package's plugin for its table.

## T1 (#440)

- Fill `seriesColorArray` in each theme spec and migrate pie, journey and gitGraph slots onto it; decide whether seed rows are needed (see T0a).
- gitGraph's `gitBranchLabel` reads `scaleLabelColor` (D334) once #404 merges.

## T2 (#441)

- **Eight sequence rows stay in core; maintainer decision needed.** `actorBorder`, `actorTextColor`, `signalColor`, `signalTextColor`, `labelBoxBorderColor`, `activationBkgColor`, `activationBorderColor` and `sequenceNumberColor` differ between themes with the same traits (classic, light): default, forest and neutral pin v12's literals (`#f4f4f4`, `#666666`, `#ffffff`; forest's `#a6cf47` and `#326932`, neutral's `#d4d4d4`, `#333333` signals), while base derives them (`secondaryColor`, `invert(lineColor)`, `nodeBorder`). Byte identity (D339) needs the CSS shape too, not just the colour: default writes `--_acb:var(--mermaid-activationBkgColor,#f4f4f4)`, base `--_acb:var(--mermaid-activationBkgColor,var(--_s))` plus `--_s`. A family entry gives one shape to all four themes, a rule over a new shared input adds an alias of its own (`var(--_x)`), and `literal()` turns base's references into literals, so no family entry, shared input or DSL form in the contract keeps all four identical. A new shared row also adds a v13-only name to the neo and neo-dark `DIFFERENCES`, which the spec allows only for D333. The dark, redux-dark and neo values of these rows could be family entries (each cell holds one theme, or two with the same values); they stay with their rows. Options:
  1. A DSL form that reads a shared input as the theme wrote it (value or rule, CSS included), as `seriesColorArray<n>` reads, plus generic shared inputs for the classic literals (D332's "muted surface", "strong text ink"), each a `DIFFERENCES` entry. `actorTextColor` needs no new input: in all eleven themes it is written exactly as `scaleLabelColor` is.
  2. A D333-style exception: the classic light family takes one set of values (base's derivation or default's literals), and the other themes' sequence colours change.
  3. Keep the eight rows in core as shared inputs (amends "What stays in core"; T5's closure scan would list them).
- **Shared rows' `usedBy` gains the table's reads.** The used-by scan counts a table's rule as a read, so `class` joins `primaryTextColor` and `textColor` (`classText`'s rules). The sequence table reads only rows that already list `sequence`.
- **`labelTextColor` moved**: after T0a nothing shared reads it (`cScaleLabel` reads `scaleLabelColor`). `actorTextColor` stays, as one of the eight.
- **`TEXT_SIZES` keeps the pie sizes only.** `classTerminalFontSize` (11 in every theme) is a token in each family of the class table. `CLASS_MARKER_VARIABLES` and its type are gone from core.
- **A first `gen:theme` needs a stub.** The plugin imports `src/theme/generated/variables.ts`, which `gen:theme` writes by importing the plugin, so a new package needs a placeholder file (`export const THEME_VARIABLE_TABLE = {};`) before the first run.
- **`theme-inventory.spec.ts`**: T0b's "leaves the inventory as it is while no package has a vocabulary" now checks that the packages' rows are added after core's inventory, which is otherwise unchanged.
- **`.gitignore` let no package's generated table in.** `generated/` is ignored and only `packages/diagram-*/src/generated/` was re-included, so T2 adds `!packages/diagram-*/src/theme/generated/`. Without it a clean checkout has no `THEME_VARIABLE_TABLE` for the plugin to import.
