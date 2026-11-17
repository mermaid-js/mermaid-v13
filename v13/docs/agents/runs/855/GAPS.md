# Gaps, spec #855

Unmet acceptance criteria and announced shared contracts, under the ticket that owns each one. Empty until a handoff leaves something open.

## X1 (#856)

- Unmet: no `eslint-suppressions.json` entry freed (the grid branches were not what kept `layOut`, `position`, `compoundLayout` over their limits; X2 and X3 free the counts). Grid branch sites 40 -> 33, not about 8.
- Announced contract for X2/X3: `LayeredOptions.grid` is `GridHooks | undefined` (`tickets/856.md`). Core headroom after X1 is 78 B.
