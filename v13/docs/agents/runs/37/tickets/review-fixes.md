# Final review fixes — spec #37

Branch `feature/37_review-fixes` on `feature/37_m2-ascii`. Fix list: tickets/review.md (items 1–12).

## What changed
1. Engine `placeTitles` (core/layout/layered/index.ts): a title run avoids route cells, the group's
   own top-side edge ends and a blank cell either side; when no run is free, own ends step aside on
   the row above (one-cell jog), else the frame grows by what the title lacks. Drawer: no tee where a
   group→member edge ends on the frame. Reader (`structure.ts`): ASCII titles with `- . I`, `vv` heads.
   corpus.spec: titles in the edge check; new property "every edge line connects box to box" (both charsets).
2. compound.ts: on the grid a frame wider than its content (title) grows a cell so content is centred.
3. `LayoutGraph.turnedSpacing` (types.ts): spacing for an LR/RL drawing turned to TB; the flowchart
   builder sets it when cell axes convert differently. px graphs never get it.
4. `RepairResult.expanded` (cells searched); repair.spec bounds it by `maxSearch` (no `Date.now`).
5. conformance `renderAscii` returns `{ ...TextRenderResult, layout }`, captured by a `postLayout`
   hook through the public API; `layoutCells` removed, `layoutAscii` no longer exported.
6. corpus columns check counts code points on ASCII/box/marker lines; cellWidth only for wide text.
7. `TextRenderOptions.ascii` (api.ts): explicit keys win over config, front matter and directives.
   CLI passes `--charset`/`--width` there. Precedence in `--help`, v13/docs/ascii.md, DESIGN §6.3.
8. `--format` other than ascii|svg → usage error, exit 1. Exit 2 = API `UNSUPPORTED_FORMAT`, not
   reachable with 13.0's types (documented).
9. ascii.md CLI table lists every flag (`-h`, `-v`, `--charset unicode|ascii`); ASCII_ROUTE documented.
10. bench `ascii-size` gate: level should, never enforced; ascii-size.spec keeps measuring + the hard
    "SVG path loads no ascii module" checks.
11. core/ascii `directions.ts`: `Dir`, `UP/RIGHT/DOWN/LEFT`, `DX/DY`, `INTO`, `opposite`.
12. core/ascii `asciiOptions(config, explicit?)`: the one resolver (api.ts and flowchart ascii.ts).

## Tests / helpers
- grid.fixtures `titleFixtures()` (66/62 corpus shapes); grid.spec `underTitles` checks own top ends.
- flow.fixtures `draw(src, { tweak })` stages a layout (ASCII_ROUTE spec).

## Goldens regenerated (both charsets each)
ascii/subgraph_mixed_nodes_td, v13/subgraph_empty (item 1); ascii/subgraph_explicit_title,
ascii/subgraph_td_multiple, ascii/subgraph_td_multiple_paddingy, ascii/subgraph_three_levels_nested
(item 2); ascii/cannot_fit, ascii/compact_fit, ascii/zwj_label_compact, v13/max_width (item 3).

## Byte identity / size
SHA-256 of every SVG over e2e/diagrams/flowchart + flowchart-v12-specs.json (856 items): identical
to mermaid-js/mermaid-v13 (7b15a4466) and to feature/37_m2-ascii. Size: GAPS.md (final review).
