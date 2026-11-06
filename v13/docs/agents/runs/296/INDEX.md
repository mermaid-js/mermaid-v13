# Run notes — spec #296 (hand-drawn plugin)

| Ticket | Issue | Blocked by | Branch |
| --- | --- | --- | --- |
| T0 core outline hook | #339 | — | `feature/339_outline-hook` |
| T1 adoption | #340 | #339 | `feature/340_outline-adopt` |
| H1 sketch adapter | #341 | — | `feature/341_sketch-adapter` |
| H2 plugin package | #342 | #339 #340 #341 | `feature/342_hand-drawn-plugin` |
| H3 integration | #343 | #342 | `feature/343_hand-drawn-integration` |
| H4 mindmap baselines | #344 | #343, mindmap T5 (#294) | — |

- `IMPLEMENTER.md` — the brief every ticket agent reads.
- `GAPS.md` — unmet criteria and choices not covered by the spec.
- `tickets/<n>.md` — handoffs. `tickets/339.md` documents the `w.outline` API (D302) for the mindmap port's T4 (D309).
- Core pointers: `packages/core/src/svg/writer.ts` (`SvgWriter`, both backings), `packages/core/src/pipeline/draw.ts` (builds the writer), `packages/core/src/pipeline/extensions.ts` (`ExtensionPlugin`, `HookRunner`, `checkFragment`), `packages/core/src/svg/path.ts` (`PathBuilder`), `packages/core/src/config/fragment.ts` (config fragments and aliases), `packages/core/src/config/resolve.ts` (alias then `lookStripper`).
