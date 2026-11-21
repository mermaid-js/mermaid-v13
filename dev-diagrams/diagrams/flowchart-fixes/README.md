# Flowchart fixes: examples for spec #913

One or more example diagrams per bug in spec [#913](https://github.com/mermaid-js/mermaid-v13/issues/913), for checking a fix by eye in the dev explorer (`pnpm dev`). Files are named `<issue>-<what>.mmd`. Each file's front-matter `description` says what the diagram looks like once the bug is fixed.

| Issue | Files |
| --- | --- |
| #355 pointer cursor on clickable nodes | `355-a-*`, `355-b-*` |
| #356 step curves, unknown curve names | `356-a-curve-*` (compare the four), `356-b-*` |
| #357 ignored-feature warnings, `markdownAutoWrap` | `357-a-*`, `357-b-*` |
| #395 tri and flip-tri | `395-*` |
| #399 node and rank spacing | `399-*-1` (the bug), `399-*-100` (reference) |
| #402 fork/join direction | `402-fork-{TB,BT,LR,RL}` |
| #403 stacked shapes | `403-a-*`, `403-b-*` |
| #417 ELK stress and radial | `417-a-*`, `417-b-*` |
| #675 edge through a subgraph title (#903) | `675-*` |

These are not part of the test corpus. A fix still adds its fixture under `e2e/diagrams/flowchart/`.
