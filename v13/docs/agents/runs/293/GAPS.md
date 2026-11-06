# Gaps (spec #293)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## Setup
- **Choice:** the package skeleton (`packages/diagram-gantt`: package.json without the `mermaid` manifest, tsconfigs, README, an empty `src/index.ts`) is on the integration branch before any ticket, so D1 (`src/dates/`) and T1 (`src/parser/`) do not collide on it. `tools/release/src/publish.spec.ts` lists the package.
