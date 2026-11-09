# #427 final review: handoff

Branch `feature/427_sankey-final-review` (from `feature/427_sankey` c21bea92a).

## What changed
- **One config reader:** `sankeyLayoutConfig` resolves `linkColor` (mode or checked colour, default `gradient`) and `useMaxWidth` (boolean, default `true`, one `SANKEY_CONFIG_INVALID` otherwise); `SankeyLayout.linkColor`/`useMaxWidth` carry them as `labelStyle`; `render/options.ts` deleted. Pitfall 28: 2,354 renders (every `e2e/diagrams/sankey` file and `sankey-cases.json` source × 15 `sankey` configs, valid and invalid) give byte-identical SVG and warnings before and after.
- **Types:** `SankeyAlignment` aliases core's `SankeyNodeAlignment`, `SankeyLabelStyle` is core's; `ALIGNMENTS`/`LABEL_STYLES` are `Object.keys({...} satisfies Record<…, true>)`. `LinkPaint` lives in `layout/types.ts` and is exported. `slot` dropped (specs and invariants check `fill`); fields only invariants/specs read say "Not drawn".
- **Entry:** `sankeyLayoutConfig`/`SankeyLayoutConfig` no longer exported (no spec needed them). `nodeColours` → `readNodeColors`.
- **Values:** `readValue` and `trailingTextMessage` in `parser/values.ts`, used by the parser and `facet/hover.ts`; the hover shows the warning's wording (spec and golden updated).
- **Notices:** mermaid's `THIRD_PARTY_NOTICES` has d3-sankey, d3-array, d3-shape (BSD 3-Clause, diagram-sankey's text); `check:licenses` requires them through `BUNDLED_CREDITS` (spec +1). sanitize-url/mermaid-ascii left for the maintainer (GAPS).
- **Docs:** MIGRATION.md (D392 every type, `SvgWriter.linearGradient`, one trailing-text warning per value, D396 beside D492); grammar doc: an infinite value counts as 0 (`gen:grammar`). Stale T5 comments, the literals spec's `fixtures.ts` exclusion.

## Sizes (gzip -9)
Main entry (esbuild, minified, core external) 11,675 → 11,628 B; `./testing` 14,167 → 14,099. Core CDN ESM closure 94,103 → 94,103 B (no core or registry file touched).

## Unmet
None.
