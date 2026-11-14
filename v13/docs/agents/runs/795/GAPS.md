# Gaps (spec #795)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #796 (T0)

- **Choice:** the difference list names #798 (T2) for v12 constructor values other than `mainBkg` (T2 pins them: its ticket scope covers every constructor value T0 lists).
- Base error colours and base note literals are filed as #825 (T8, blocked by T1 and T2, core: merges after them).
- **Decided (Knut, 2026-11-14): keep v13's `darkMode` text inks** (v12 turns base's text to `#eee` and dark/neutral `scaleLabelColor` to black; v13's `darkMode` only switches the derivation rules). T7: a D-id and MIGRATION row; the oracle's `#795 (maintainer question)` entries move under that D-id.
- **Choice:** base's border and text-ink approximations are listed under D71, and dark's sub-AA literals under D29, as permanent differences.

## #797 (T1)

- **Reversed by the review (D575):** T1 gave base `rules.arrowheadColor: invert(background)`, v12's `getThemeVariables()` value; v12 drew markers in `lineColor`, so base (and default, dark) now leave `arrowheadColor` to `lineColor`.
- Derived values now start from the rule's unrounded channels: three base cells in `theme-variables.md` move by one unit (`railroadSpecialStroke`, `usecaseBoundaryBorder`, `activationBorderColor`).
- Argos holds the screenshot baselines: the `base` screenshots and the four new #761 fixtures are approved in CI, not in the repo.

## #801 (T5)

- **Choice:** the contrast rules sit in gantt's `families.classic` entry, not the shared `rules.light`, so redux and neo are unchanged (spec "Out of Scope"). **For the maintainer:** redux and neo crit text still misses AA (3.69:1, 3.16:1), and neo's active outline is #cccccc on white.
- **Choice:** `activeTaskBorderColor` is `contrast(activeTaskBkgColor, primaryBorderColor, lineColor)`: `primaryBorderColor` alone is 1.6:1 under default (T2's pinned #c7c7f1 too), short of the ticket's 3:1, so every classic theme draws `lineColor`.
- **Choice:** under `dark`, the critical fill is #990000 and text on active and done bars is white where `textColor` misses AA: `taskTextColor` is the text on both the dark bars and red, and no single ink reads on both. Approved by the maintainer (T7 records the D-id).
- **Decided (Knut, 2026-11-14): accept** dark's critical fill `#990000` with light text (v12: red; light text failed AA). T7: a D-id and MIGRATION row.
- Redux and neo gantt critical-bar text still misses AA (3.69:1, 3.16:1); out of this spec's scope (redux/neo unchanged). Follow-up after the spec.

## #799 (T3)

- **Choice:** ER relationship label text stays `textColor`; an author's `tertiaryColor` can take it below AA (as v12). Only the row inks are new (spec scope).
- **For T7:** `config.schema.yaml` (core) still lists the classic `erEdgeLabelBackground` as `edgeLabelBackground` and lacks `erRowOddTextColor` / `erRowEvenTextColor`; regenerate `config-reference.md` after. D-id for restoring the `tertiaryColor` label fill (decision 3).
- ER's contrast rows and `PROBED` override probes moved into `packages/conformance/src/theme-contrast.spec.ts` at T5's merge (`er-contrast.spec.ts` is gone).

## #798 (T2)

- **Choice:** `gradientStart`, `gradientStop` and `actorBkg` are not pinned: their rules already give v12's values, but an author's `primaryBorderColor` still moves the gradient where v12 kept the constructor value.
- **Choice:** under a dark `background` override, error text in default/forest/neutral is v12's pinned `#552222` (was `#ffdddd` by contrast); R-THEME-9 checks only the themes' own values.
- ~~`lineColor` no longer recolours arrowheads under `default` and `dark`~~: reversed by the review (D575); it does again, as v12 drew them. Default renders move where the pinned borders/inks differ from the old derivation (gantt outlines and `vert`, quadrant borders, railroad strokes and terminal text, agentflow separator): Argos.
- Missed `tools/gen-config` theme-inventory spec (the `primaryBorderColor` row); fixed on the integration branch.

## #800 (T4)

- **Decided (orchestrator, v12 parity):** the composite label stays `nodeTextColor`, as v12 draws it (its `g.label` sits beside `rect.cluster`, so `.cluster text` never reaches it); the ticket's `titleColor` came from a misread. T7 notes it.
- Redux and neo stay byte-identical: block's table carries `blockCompositeClusterPaint` (`families.classic` true, redux/neo false). Argos: the new fixture and the classic themes' composites move; redux, neo and the palette themes do not.

## #825 (T8)

- **Choice (accepted):** base `errorTextColor` follows `tertiaryTextColor` (ticket), so it still differs from v12 (`invert(tertiaryColor)`); the 14 entries sit in the oracle's D71 group with the other text-ink approximations.
- **Found, outside scope (follow-up):** default, forest and neutral draw the error image as `#552222` text on a `#552222` rect (1:1): `packages/core/src/pipeline/error-svg.ts` fills a rect with `errorBkgColor` where v12 drew the text on the background. Predates this spec.

## #802 (T6)

- #407: fixed by T1; comment posted. #434: split; comment posted; the classic state inks filed as #827 (needs state theme variables or a D-id; out of this spec's scope). Not filed: `redux-color` state start-dot stroke `#000` vs v12 `#28253d` (minor).

## #803 (T7)

- D568–D574 record the spec (block D568–D577, decision 5; D575–D577 unused): D568 oracle and its rule, D569 `base` rules (T1 `arrowheadColor` from `background`, T8 errors and notes, decision 4), D570 pins (decision 1, R-THEME-3 effect, T2's unpinned gradient), D571 `darkMode` text inks (Knut), D572 ER (decision 3, row inks, label text choice), D573 block (flag, `nodeTextColor` label), D574 gantt (decision 2, dark `#990000`, T5's choices). The oracle's `#795` group is now D571, and its test requires a D-id per group.
- **Not done (no code change allowed):** `theme-variables.md` shows a base colour as "set by all" and does not say that `base` writes three of them as rules; that prose lives in `tools/gen-config/src/theme-inventory.ts`. The pinned `mainBkg` already shows in its "Set by themes" column. The config reference (`themeVariables` notes in `config.schema.yaml`) says both.

## Whole-branch review

- **Choice:** ER row ink is `contrast(rowX, contrast(rowX, ifSet(nodeTextColor, textColor), textColor), background)`, not the review's `contrast(rowX, ifSet(nodeTextColor, textColor), background)`: the latter moved 31 JS values under an author's `nodeTextColor` that misses on the row (base + `#ffffff` gave `#f4f4f4` on white). This one keeps every old JS value (classic themes × all probes) and stays live in CSS.
- **Choice:** gantt's crit-bar ink is a new variable `critTextColor` (alias `gct`, D574). Redux/neo values are unchanged, but their crit labels now read `var(--_gct)` (bytes move, colours do not).
- **For the maintainer:** `mainBkg` in the oracle found forest's `actorBorder` (pinned `softBorder`, v12 recomputes `darken(mainBkg, 20)`): listed as D576, not fixed. `forest`/`neutral` keep their pre-spec `arrowheadColor` pins (`neutral` heads `#333333` on `#666666` lines, v12 drew `#666`).

## Follow-ups after the spec

- #827 (state inks, filed). Error image contrast (T8 finding). Redux/neo gantt critical-bar text below AA (T5 finding).
