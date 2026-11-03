# GAPS — spec #37

Unmet acceptance criteria and announced shared contracts, grouped by the ticket that owns them.

## Contracts and ownership (set by the orchestrator, from 01-explore.md open questions)

- **Manifest `ascii` key:** #46 adds `"formats": ["svg","ascii"]`, `"ascii": "./dist/ascii.js"` and the `./ascii` exports entry in diagram-flowchart's package.json. #47 extends `DiagramManifest`/`readManifest` (core/src/pipeline/manifest.ts) and the registry codegen with a second lazy import for the ascii entry, and wires `api.ts` (`ctx.units` is currently hard-coded to `pxProfile` at api.ts:539).
- **Warning codes:** #46 defines `ASCII_DROPPED { feature, astIds }` and `ASCII_SHAPE`; #47 defines `ASCII_TOO_WIDE`. Add them wherever the existing warning-code union lives, additively.
- **Entry location:** the flowchart ascii hook lives at `packages/diagram-flowchart/src/ascii.ts` or `src/ascii/` (import-boundaries rule only allows `ascii`-named paths to import `@mermaid-js/core/ascii`).
- **Junction merging** is `junction()` in core/ascii `glyphs.ts`; there is no separate junction module.
