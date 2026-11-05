# GAPS: spec #251

Unmet acceptance criteria, filed under the ticket that owns each one. Empty means none known.

## For the maintainer (differences from v12 with no D-id yet)

- **#208 item 4:** `? ` + blank as a YAML explicit key. js-yaml (v12) reads it as an explicit key; v13 reads it as text or rejects it. The value differs, but v13 never accepts what v12 rejects. Needs a D-id + MIGRATION row, or a ticket to match js-yaml (tickets/175.md).
- **#208 item 3:** `%%{`, a comment line, then `init…}%%` before the header. v12 fails at parse, v13 at detection (UNSUPPORTED_DIAGRAM). Both reject; only the error kind differs. Needs a D-id or an explicit "acceptable" (tickets/175.md).
- **#208 item 3:** directive names accept Unicode letters (`isWord`); v12's `\w` is ASCII only (tickets/175.md).

## #198

- In px, an unlabelled group→member edge still draws centre to centre, inside the member. Out of #198's scope (labels); candidate follow-up ticket.
- In cells, other lines that cross the label band aren't rerouted; the label moves past them.
