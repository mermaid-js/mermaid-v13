# Gaps (spec #795)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #796 (T0)

- **Choice:** the difference list names #798 (T2) for v12 constructor values other than `mainBkg` (T2 pins them: its ticket scope covers every constructor value T0 lists).
- Base error colours and base note literals are filed as #825 (T8, blocked by T1 and T2, core: merges after them).
- **Decided (Knut, 2026-11-14): keep v13's `darkMode` text inks** (v12 turns base's text to `#eee` and dark/neutral `scaleLabelColor` to black; v13's `darkMode` only switches the derivation rules). T7: a D-id and MIGRATION row; the oracle's `#795 (maintainer question)` entries move under that D-id.
- **Choice:** base's border and text-ink approximations are listed under D71, and dark's sub-AA literals under D29, as permanent differences.

## #797 (T1)

- **For the maintainer:** v12 base derives `arrowheadColor` from `background`, not from `lineColor` (the spec assumed it followed `lineColor`). base now has `rules.arrowheadColor: invert(background)`, so under `base` an author's or host's `lineColor` no longer recolours arrowheads; `background` does (v12 parity).
- Derived values now start from the rule's unrounded channels: three base cells in `theme-variables.md` move by one unit (`railroadSpecialStroke`, `usecaseBoundaryBorder`, `activationBorderColor`).
- Argos holds the screenshot baselines: the `base` screenshots and the four new #761 fixtures are approved in CI, not in the repo.

## #799 (T3)

- **Choice:** ER relationship label text stays `textColor`; an author's `tertiaryColor` can take it below AA (as v12). Only the row inks are new (spec scope).
- **For T7:** `config.schema.yaml` (core) still lists the classic `erEdgeLabelBackground` as `edgeLabelBackground` and lacks `erRowOddTextColor` / `erRowEvenTextColor`; regenerate `config-reference.md` after. D-id for restoring the `tertiaryColor` label fill (decision 3).
- **For T5's merge:** ER contrast rows are in `packages/conformance/src/er-contrast.spec.ts` in `[ink, fill, min]` shape; move `PAIRS.er` into `theme-contrast.spec.ts`, with `PROBED` (override probes) as its own loop.

## #798 (T2)

- **Choice:** `gradientStart`, `gradientStop` and `actorBkg` are not pinned: their rules already give v12's values, but an author's `primaryBorderColor` still moves the gradient where v12 kept the constructor value.
- **Choice:** under a dark `background` override, error text in default/forest/neutral is v12's pinned `#552222` (was `#ffdddd` by contrast); R-THEME-9 checks only the themes' own values.
- `lineColor` no longer recolours arrowheads under `default` and `dark` (v12 parity). Default renders move where the pinned borders/inks differ from the old derivation (gantt outlines and `vert`, quadrant borders, railroad strokes and terminal text, agentflow separator): Argos.
- Missed `tools/gen-config` theme-inventory spec (the `primaryBorderColor` row); fixed on the integration branch.

## #800 (T4)

- **Decided (orchestrator, v12 parity):** the composite label stays `nodeTextColor`, as v12 draws it (its `g.label` sits beside `rect.cluster`, so `.cluster text` never reaches it); the ticket's `titleColor` came from a misread. T7 notes it.
- Sent back: redux and neo composites must stay byte-identical (spec scope); use a `families.classic` entry in block's table.

## #801 (T5)

- **Decided (Knut, 2026-11-14): accept** dark's critical fill `#990000` with light text (v12: red; light text failed AA). T7: a D-id and MIGRATION row.
- Redux and neo gantt critical-bar text still misses AA (3.69:1, 3.16:1); out of this spec's scope (redux/neo unchanged). Follow-up after the spec.
