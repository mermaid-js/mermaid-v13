# Gaps — spec #296

Unmet criteria and open choices, filed under the ticket that owns each one. Each choice not covered by the spec or a D-id is also listed under "For the maintainer" in the integration PR body.

## T0 (#339)

- Choice: only the first registered drawer is asked. If its `active` returns false, nothing draws and a later drawer is not tried. This is the literal reading of "first registered drawer wins".
- Choice: with an active drawer, the stream output is re-checked against the allow-list (`inertProblem`, values included), as after `postRender`. On its own the sink checks only tags; the writer checks attribute names. The cost is one linear scan, and only when a drawer is active.
- Choice: `draw` returning `false` after writing keeps what it wrote, followed by the plain leaf. This allows an underlay (ER, D308).
- Choice: `active` or `draw` returning a non-boolean is `INTERNAL`, as is using the sink after `draw` returns.
- Size: core +546 B gz. The core closure is 89,604 of 90,112 B (508 B left); H2 and the other M4 sessions will press this budget.

## T1 (#340)

- D308(a) finding: no v13 ER edge or end marker is drawn under an entity, so v12's solid underlay is dropped. Over the 218 ER corpus files that render (446 edges, 1,157 marker pieces), no sampled point of an edge path, crow's foot, bar or circle lies even 0.01 px inside an entity's box. Grow the boxes by 0.5 px and 445 edges and 452 marker pieces touch them, so the check does see the geometry: lines and markers stop at the outline. Entities are drawn after the edges, but nothing overlaps. One thing still shows through a hachured entity: a subgraph's fill, as for a flowchart node on a subgraph.
- Choice: paint that an edge takes from its `edgePaths` group stays on the group. Flowchart, class and state edges get `stroke`, `stroke-width` and `fill: none` from it; ER edges carry their own stroke. T0's rule says to put all paint on the call, but here that would change the corpus bytes. H2's edge drawer must write one `<path>` that keeps inheriting this paint, as H1 already plans.
- Choice: invisible shapes go through the hook too. That covers flowchart's `text` and brace hit boxes (`fill` and `stroke` `none`, role `node`) and state's concurrency region frame (role `group`, the only `group` state has). The drawer sees `none` paints.
- Choice, flowchart roles beyond the ticket's list: the collapsed card is a `node`, with its separator as a `divider` and its three dots as `mark`; `browser`'s dots are `mark`; `fr-circ`'s inner disc is a `part`; braces and icon frames are `node`. `fork`, `choice`, `f-circ` and `sm-circ` are `node` in flowchart: v12 drew them with node options, and only `stateStart` used `solidStateFill`.
- Choice, state: the start, the end's ring and dot, choice, fork and join are all `mark`. Composite `outer` and `inner` are `part`, and the dashed lines between regions are `divider`. ER subgraphs are `group` (the ticket doesn't list them).
- The identity spec's base writes each outline as a plain leaf in the same process, so it can't see a changed attribute. That was checked once by hand instead: the 1,201 corpus files of the four types (1,142 render), in six themes (default, neo, neo-dark, redux, dark, forest), are byte-identical before and after adoption (7,206 SHA-256 digests).

## H1 (#341)

## H2 (#342)

## H3 (#343)

## H4 (#344)

- Waits for the mindmap port's T5 (#294). Left open when the integration PR is marked ready.
