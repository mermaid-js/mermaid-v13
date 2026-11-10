# Final whole-branch review fixes (#525)

Branch `feature/525_final_review` (worktree `arch-final`), on `feature/525_architecture` @ 9a75cc4e2 (unchanged since). Head 2fc16c2ee. Not pushed.

## Fixes (specs in `packages/diagram-architecture/src/final-review.spec.ts`; 1, 2, 3 and 8 each failed at 9a75cc4e2)
1. `parser.ts` `edge()`: the accessibility-name check runs only when the next token is neither `ArrowGroup` nor `Colon`. `accTitle{group}:R -- L:b` now parses (oracle: v12 accepts it). `accDescr{group}…` is rejected by both (v12 reads `accDescr{` as a block); `accTitle:R…` is an accTitle line in both. Corpus: `acc-title-edge-id`, `acc-title-edge-id-colon`.
2. `edges.ts`: a straight edge's label point is `route.label` when the engine gives one, else the midpoint. **One-bend edges keep v12's corner** (D507's 45° label in the corner's quarter): under `compass` the corner and `route.label` differ (5 of 23 labelled ≤ 1-bend edges in the e2e fixtures), so the brief's "they coincide" holds only for straight edges. The 37 e2e fixtures × 4 themes render byte-identical before and after under `compass`.
3. `ARCHITECTURE_EDGE_NOT_DRAWN` lists ids through `listNames()` (`render/assets.ts`, `WARNING_NAMES` caps), shared with `ICON_NOT_RENDERED`.
4. Removed `ArchitectureSizes.groupEdge`/`junctionEnd`, `ARCHITECTURE_METRICS.groupEdgeExtra`/`groupEdgeBottom`, `ArchitectureNodeView.width`/`height`, with their spec lines.
5. `codes.ts`: `CONFIG_IGNORED` says 0 to 10000 (0 taken); `ARROW_SHRUNK` says each head is capped to its own end segment, on any edge.
6. `config-length.ts` imports `ARCHITECTURE_CONFIG_IGNORED`; `conformance/src/architecture/config-length.spec.ts` (copy pinned to class's) allows that import.
7. `cdn-build.spec.ts`: every registered diagram is in the `./language` walk and ships a `-language.mjs` chunk.
8. `prepare.ts`: `spacing` is `pxProfile.builder.spacing` (core's 50/50/20), not `padding`. Compass output unchanged.

## Checks
- Scoped (`VITEST_MAX_WORKERS=2`): the package, conformance architecture + compass, parity, language-service, mermaid architecture + cdn-build: 57 files, 2,226 passed (one fail, the config-length copy spec, fixed and re-run).
- prettier, eslint, tsc (architecture, conformance, mermaid) clean. cspell: only the corpus JSON's existing `archi`/`tecture` split-word hits (13, also at 9a75cc4e2).
- `pnpm check` under the lock at 2fc16c2ee: green, 1,330 files, 25,081 passed.

## Left
GAPS § Integration: compass spacing input (needs a D-id), the seven `configLengths` copies, one-bend labels under `layered`/ELK.
