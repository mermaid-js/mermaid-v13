# Gaps (spec #294)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #380 T0 tree engine
- **Choice:** D284 names the field `DiagramPlugin.layout?: { default, aliases }`, but `layout` is already the plugin's layout method (`packages/core/src/pipeline/types.ts:160`, DESIGN §12.1). The field is `layoutEngine?: { default: string; aliases?: Record<string, string> }` instead; same semantics. DESIGN §12.1 and D284's wording follow in T0.
- **Choice:** the plugin default is applied as the plugin-defaults config layer (`packages/mermaid/src/config-snapshot.ts`, as `flowchart-elk` sets `layout: 'elk'`), above core defaults and below `initialize`, front matter and directives: that is "no layer sets `layout`" without a new registry field.
- Done in T0: DESIGN §6.1 (`tree` paragraph) and §12.1 (`layoutEngine`, manifests may not claim `tree`), D284's wording, the schema's `layout` text, and `mindmap.layoutAlgorithm` → `ignored` (status only; no warning, like every `ignored` key).
- **Choice:** "plugins that declare `tree`" (D285) means plugins whose `layoutEngine.default` is `tree`; for any other diagram `layout: tree` is `LAYOUT_UNKNOWN` (drawn with `layered`), even after another diagram loaded it. A `tree` loader the integrator registers replaces the first-party one for every diagram. Layout manifests may not claim `tree`.
- **Choice:** split ties (D283) take the earlier cut, as Pele does: three equal branches put one right and two left.
- **Choice:** `spacing.rank` is the gap out at every level, root included, and `spacing.node` between siblings and between the trees of a forest; there is no extra gap between branches (Pele has `BRANCH_GAP_*`, `GROUP_GAP`). T3 picks the numbers through `fromPx`. A level's gap widens to fit its widest edge label; end labels sit a quarter of the way along and are not kept clear of anything.
- **Choice:** a tree edge is two `axis: 'h'` points (parent's facing side → child's near side at their centres); the renderer curves it. Other edges are straight, border to border; a self-loop goes out and back off the right side.
- **Choice:** an empty group is stacked below the trees; a group's box can cover nodes that are not its members (members need not be contiguous in the tree). No M4 diagram has groups.
- **Choice:** the linear-time ratio test is `packages/conformance/src/tree-linear.spec.ts` (core has no Node types, so no CPU clock there); 2k vs 16k nodes, best of 5, ratio < 24, as `stress.spec.ts`.
- **Not done:** a diagram with `layoutEngine.default: 'tree'` and an `ascii` hook would warn `ASCII_DROPPED` (layout `tree`) on every text render; no M4 diagram has both.

## #383 T1 lexer

## #386 T2 parser

## #387 T3 layout

## #388 T4 renderer

## #389 T6 language facet

## #390 T5 integration

## #328 icons I5

## #344 hand-drawn H4
