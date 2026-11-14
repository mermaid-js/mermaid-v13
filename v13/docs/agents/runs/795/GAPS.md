# Gaps (spec #795)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #796 (T0)

- **Choice:** the difference list names #798 (T2) for v12 constructor values other than `mainBkg` (T2 pins them: its ticket scope covers every constructor value T0 lists).
- Base error colours and base note literals are filed as #825 (T8, blocked by T1 and T2, core: merges after them).
- **For the maintainer:** under `darkMode`, v12 turns base's `primaryTextColor` (and `textColor`, `nodeTextColor`, `scaleLabelColor`) to `#eee`, and dark's and neutral's `scaleLabelColor` to black; v13's `darkMode` switches only the derivation rules (also noted in #338 T4a). No D-id covers it. Listed under `#795 (maintainer question)` until decided: match v12, or record v13's behaviour as a D-id (T7).
- **Choice:** base's border and text-ink approximations are listed under D71, and dark's sub-AA literals under D29, as permanent differences.

## #797 (T1)

- **For the maintainer:** v12 base derives `arrowheadColor` from `background`, not from `lineColor` (the spec assumed it followed `lineColor`). base now has `rules.arrowheadColor: invert(background)`, so under `base` an author's or host's `lineColor` no longer recolours arrowheads; `background` does (v12 parity).
- Derived values now start from the rule's unrounded channels: three base cells in `theme-variables.md` move by one unit (`railroadSpecialStroke`, `usecaseBoundaryBorder`, `activationBorderColor`).
- Argos holds the screenshot baselines: the `base` screenshots and the four new #761 fixtures are approved in CI, not in the repo.

## #799 (T3)

- **Choice:** ER relationship label text stays `textColor`; an author's `tertiaryColor` can take it below AA (as v12). Only the row inks are new (spec scope).
- **For T7:** `config.schema.yaml` (core) still lists the classic `erEdgeLabelBackground` as `edgeLabelBackground` and lacks `erRowOddTextColor` / `erRowEvenTextColor`; regenerate `config-reference.md` after. D-id for restoring the `tertiaryColor` label fill (decision 3).
- **For T5's merge:** ER contrast rows are in `packages/conformance/src/er-contrast.spec.ts` in `[ink, fill, min]` shape; move `PAIRS.er` into `theme-contrast.spec.ts`, with `PROBED` (override probes) as its own loop.

## #800 (T4)

- **Settled (orchestrator):** the composite label keeps `nodeTextColor`, v12's actual colour (its `g.label` is outside `rect.cluster`, so `.cluster text` misses it); the ticket's `titleColor` came from a misread of v12's CSS. T7 notes it.
- Argos holds the block screenshots: the new fixture and the classic themes' composites move; redux, neo and the palette themes do not.
