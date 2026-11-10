# Final whole-branch review: handoff

Branch `feature/522_c4-final-review` (from `feature/522_c4` 835c779ed). Choices and findings are in `GAPS.md` under "Final whole-branch review".

## Spec
- **Labels off other lines:** `layout.ts` `routeAll` hands every relation's routed line to the label search (`Lines`, its own excluded); `clearest` charges each other stretch through the box (Liang–Barsky) `lineCover` (half the label's area) against the router budget; a clear on-line spot still wins; each beside step past the first costs half a crossing. A spot still over a line is `crowded`. `c4LayoutViolations` checks that no uncrowded label covers another relation's line.
- Exceptions (`layout.spec.ts` `CROWDED_EXCEPTIONS`): `rows-and-fixed-width` `c -> d` (table and grid measurers), `docs/2-container` `backend_api -> banking_system` (table). SVG changed only in `themes/{neo,neo-dark,redux}`, `handdrawn/*`, `docs/2-container`, `large-diagram`; e2e captured and looked at by eye.
- **ASCII wrap rule:** `C4Layout.labelsWrap` (root `wrap` and `c4.wrap`); `placeLabel` wraps narrower only then, else keeps one line and cuts with `…` as the last resort. Test in `ascii.spec.ts`.
- MIGRATION wrap row names the self-loop room (`pnpm regen`).

## Standards
- Parts objects: `clearest` (`ClearestInput` → `Clearest`), `forbidden` (`Box`), `stepCost` (`Step`), `nameItems` (`NameAt`), `rest` (`SlotRange`).
- `workspace.yaml` `languageBundle.renderer` + `ascii/`, `ascii.ts`.
- ASCII budget `min(ROUTE_BUDGET, limits.maxLayoutWork)` from the hook; `RouteBudget.charge` for label places. `conformance/src/c4/ascii-stress.spec.ts`; layout stress gains hub, self-loops, reverse pairs; `language-budget-c4.spec.ts` gains the 4× size ratio (≤ 6, measured 3.9).
- `model.ts`: `C4_BASE_KINDS`, `C4_ELEMENT_KINDS`, `C4_NODE_KINDS`, `C4_RELATION_KINDS` (types derived), `isExternal`, `baseKind`, `kindParts`, `kindWords`; builder, config, renderer, shapes, stereotype and hover read them.
- Layout emits `labelBox`; renderer and invariants read it (`c4LabelBox` gone). `C4_RENDER_METRICS.arrow*` = `C4_METRICS.arrow`.
- Parser element macros take tables from `SLOT_TABLES`; `nameRoute` (slots.ts) routes `$name`s for builder and hover; slots.ts header rewritten.
- Dead exports removed (root: `C4_METRICS`, `shapeOf`, `stereotypeText`, `c4RelationPath`, `c4Fonts`, `c4LayoutConfig`, `renderC4` and their types; `./testing`: `c4RelationCrossings`, `c4TestConfig`, `TEST_VERSION`); `cellsAlong`, `C4_HEADER`, `TYPED_BOUNDARY` local.
- `conformance/src/c4/timing.ts` shared by the five c4 stress specs. Parser fields `cursor`, `builder`.

## Sizes (gzip)
- Core (`measureCoreSize`): 94,564 → 94,564 B. C4 load path (core closure + c4 chunk): 126,410 → 126,863 B (chunk +453).

## Not done / for the maintainer
- `TEST_VERSION` stays a private harness constant (the built `./testing` cannot import `package.json`).
- ASCII budget: 1,000,000 steps ≈ 1.3 s CPU here (97-element hub); bounded, linear past it.
- Visible: default-config ASCII labels no longer wrap (cut or crowded instead).
