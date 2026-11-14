# Gaps (spec #795)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #796 (T0)

- **Choice:** the difference list names #798 (T2) for v12 constructor values other than `mainBkg` (T2 pins them: its ticket scope covers every constructor value T0 lists).
- Base error colours and base note literals are filed as #825 (T8, blocked by T1 and T2, core: merges after them).
- **For the maintainer:** under `darkMode`, v12 turns base's `primaryTextColor` (and `textColor`, `nodeTextColor`, `scaleLabelColor`) to `#eee`, and dark's and neutral's `scaleLabelColor` to black; v13's `darkMode` switches only the derivation rules (also noted in #338 T4a). No D-id covers it. Listed under `#795 (maintainer question)` until decided: match v12, or record v13's behaviour as a D-id (T7).
- **Choice:** base's border and text-ink approximations are listed under D71, and dark's sub-AA literals under D29, as permanent differences.
