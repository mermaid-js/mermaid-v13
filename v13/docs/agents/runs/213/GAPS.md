# Gaps — spec #213

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Contracts

- **Gradient vocabulary (owner #223).** #223 adds `useGradient`, `gradientStart`, `gradientStop` to `vocabulary.ts`, the schema and every shipped spec (off). #225 and #227 do not define them; once #223 is merged, the neo specs set `useGradient: true`, `gradientStart #0042eb`, `gradientStop #eb0042` (whichever of #225/#227 merges after #223 does it, or the coordinator).
- **`theme.outline(name)` (owner #223).** T3–T7 call it where v12 neo strokes with the gradient; nothing else.

## #223 T0 core gradient

- [x] Merged (PR #258) with the neo gradient turned on. Default path +1,348 B gz; reported in #248 for the size-budget spec.
- [x] Browser test (e) ran in local Chromium; it runs again in the Playwright image at the close (#236).
- [ ] Follow-up, not this spec: `styleScope` maps an invalid idPrefix to `p-<hash>`, which a valid prefix can equal, so two renders can share a gradient id (and `data-p`). Pre-existing.
- [ ] Known limit: under `theme: 'auto'` the gradient stops take the light theme's values (pairing auto with neo is out of scope, #213).
- Stream and tree backings agree; a postRender hook can point a fill/stroke at the SVG's own gradient only (D182 allows it).

## #225 T1 neo

- [x] Merged (PR #253). Size: default path +12 B gz (name and loader in `registry.ts`); the spec is its own 451 B gz chunk. Accepted as the cost of registering a theme; reported in #248.
- [x] Gradient values in `neo.ts` (integration merge of #223).

## #227 T2 neo-dark

- [x] Merged (PR #259). Gradient values in `neo-dark.ts` (integration merge).
- [ ] `altBackground #f0f0f0` kept from v12 (D126) on a dark theme; not a text pair. #234 (state) judges it side by side with v12; escalate if it reads badly.

## #229 T3 flowchart

## #231 T4 sequence

## #233 T5 class

## #234 T6 state

## #235 T7 ER

## #236 T8 close
