# Class and state fixes: examples for spec #919

One or more example diagrams per bug in spec [#919](https://github.com/mermaid-js/mermaid-v13/issues/919), for checking a fix by eye in the dev explorer (`pnpm dev`). Files are named `<issue>-<what>.mmd`. Each file's front-matter `description` says what the diagram looks like once the bug is fixed.

| Issue | Files |
| --- | --- |
| #363 class relations with a label and cardinalities | `363-a-*`, `363-b-*` |
| #416 transitions between a composite state and its own members (already fixed, kept for confirmation) | `416-a-*`, `416-b-*` |
| #362 `state X: description` warnings | `362-*` (look at the warnings, not the drawing) |
| #836 emphasis next to a code span | `836-a-*` (state), `836-b-*` (class), `836-c-*` (mindmap), `836-d-*` (requirement) |

#747 and #748 (`limits.maxNodes`, `limits.maxEdges`) have no example here. Only the page that renders a diagram can set limits, so diagram text cannot show them. Their specs check them.

These are not part of the test corpus. A fix still adds its fixture under `e2e/diagrams/`.
