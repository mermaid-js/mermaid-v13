# Gaps — spec #296

Unmet criteria and open choices, filed under the ticket that owns each one. Each choice not covered by the spec or a D-id is also listed under "For the maintainer" in the integration PR body.

## T0 (#339)

- Choice: only the first registered drawer is asked. If its `active` returns false, nothing draws and a later drawer is not tried. This is the literal reading of "first registered drawer wins".
- Choice: with an active drawer, the stream output is re-checked against the allow-list (`inertProblem`, values included), as after `postRender`. On its own the sink checks only tags; the writer checks attribute names. The cost is one linear scan, and only when a drawer is active.
- Choice: `draw` returning `false` after writing keeps what it wrote, followed by the plain leaf. This allows an underlay (ER, D308).
- Choice: `active` or `draw` returning a non-boolean is `INTERNAL`, as is using the sink after `draw` returns.
- Size: core +546 B gz. The core closure is 89,604 of 90,112 B (508 B left); H2 and the other M4 sessions will press this budget.

## T1 (#340)

## H1 (#341)

## H2 (#342)

## H3 (#343)

## H4 (#344)

- Waits for the mindmap port's T5 (#294). Left open when the integration PR is marked ready.
