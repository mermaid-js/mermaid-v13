# Gaps, spec #855

Unmet acceptance criteria and announced shared contracts, under the ticket that owns each one. Empty until a handoff leaves something open.

## X1 (#856)

- Unmet: no `eslint-suppressions.json` entry freed (the grid branches were not what kept `layOut`, `position`, `compoundLayout` over their limits; X2 and X3 free the counts). Grid branch sites 40 -> 33, not about 8.
- Announced contract for X2/X3: `LayeredOptions.grid` is `GridHooks | undefined` (`tickets/856.md`). Core headroom after X1 is 78 B.

## X4 (#859)

- The registry does not call `invalidate()` itself: `createMermaid` and the discovery queue call `analyser.invalidate()` after each registration. Moving the call into `Registry` belongs with its split (#706).
- `pnpm e2e` was not run locally; hosted CI is the gate for it.

## X5 (#860)

- For the final fix pass: `RE_LEADING_CTRL` in `core/src/svg/inert.ts` was rewritten as `/^[\u0000- ]+/`. It is equivalent, but put the range end back as `\u0020`.
