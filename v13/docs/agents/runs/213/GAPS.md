# Gaps — spec #213

Unmet acceptance criteria and shared contracts, filed under the ticket that owns each one.

## Contracts

- **Gradient vocabulary (owner #223).** #223 adds `useGradient`, `gradientStart`, `gradientStop` to `vocabulary.ts`, the schema and every shipped spec (off). #225 and #227 do not define them; once #223 is merged, the neo specs set `useGradient: true`, `gradientStart #0042eb`, `gradientStop #eb0042` (whichever of #225/#227 merges after #223 does it, or the coordinator).
- **`theme.outline(name)` (owner #223).** T3–T7 call it where v12 neo strokes with the gradient; nothing else.

## #223 T0 core gradient

## #225 T1 neo

- [x] Merged (PR #253). Size: default path +12 B gz (name and loader in `registry.ts`); the spec is its own 451 B gz chunk. Accepted as the cost of registering a theme; reported in #248.
- [ ] Gradient values in `neo.ts` once #223 merges (Contracts).

## #227 T2 neo-dark

## #229 T3 flowchart

## #231 T4 sequence

## #233 T5 class

## #234 T6 state

## #235 T7 ER

## #236 T8 close
