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

- Discover tables from `packages/diagram-*/src/theme/vocabulary.ts` (spec) — the direction check finds them from the exported plugin today; switch it to the vocabulary files.

## T1 (#440)

- Fill `seriesColorArray` in each theme spec and migrate pie, journey and gitGraph slots onto it; decide whether seed rows are needed (see T0a).
- gitGraph's `gitBranchLabel` reads `scaleLabelColor` (D334) once #404 merges.
