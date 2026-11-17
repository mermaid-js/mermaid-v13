# Gaps, spec #855

Unmet acceptance criteria and announced shared contracts, under the ticket that owns each one. Empty until a handoff leaves something open.

## X1 (#856)

- Unmet: no `eslint-suppressions.json` entry freed (the grid branches were not what kept `layOut`, `position`, `compoundLayout` over their limits; X2 and X3 free the counts). Grid branch sites 40 -> 33, not about 8.
- Announced contract for X2/X3: `LayeredOptions.grid` is `GridHooks | undefined` (`tickets/856.md`). Core headroom after X1 is 78 B.
- `gridHooks()` is called once, in `index.ts`, and `endLabels`/`endLabelAt` in `index.ts` still take `grid: number` (allowed: the criterion names `layered.ts` and `compound.ts`).

## X2 (#857)

- Built on `feature/857_layered-phases`, not merged here by maintainer decision (2026-11-17): it ships as a second, optional PR. With it in, the CDN core closure is 102,690 B and core 102,440 B against the 102,400 B limit, after a trim pass that found about 80 B. It needs a further core budget decision.

## X4 (#859)

- The registry does not call `invalidate()` itself: `createMermaid` and the discovery queue call `analyser.invalidate()` after each registration. Moving the call into `Registry` belongs with its split (#706).
- `pnpm e2e` was not run locally; hosted CI is the gate for it.

## X9 (#864)

- `pnpm release:rehearse` was not run for the `rehearse-cli.ts` split (it needs Verdaccio). Run it once before the next release.

## X3 (#858)

- `straightPortRoute` (`core/src/layout/layered/compound-place.ts`), the route of a port on a side the flow does not run through, is executed by no test: not by the specs, not by the 42,768 fixture renders, and not by about 90,000 random compound graphs (mixed group directions, nesting, group-to-member edges, grid). Group ports always lie on the flow axis (`inheritCrossedDirections`), so it looks unreachable. Inside `place` it was hidden in the baseline; as a function of its own it failed CI's Structural audit (CRAP 272), so it is split into helpers of at most four branches. Whether it is dead code from the Pele port is open; removing it would be an algorithm change and is not part of this spec.
