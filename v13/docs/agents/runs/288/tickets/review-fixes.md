# Review fixes: final whole-branch review of the pie port (#288)

Branch `feature/288_review-fixes`, cut from `feature/288_pie` at a514fbb10.

**1. Multi-line labels (D225, D224).** `layout.ts`: a legend row is v12's 22 px plus its label's extra lines (`height - lineHeight`, 0 for one line); `legendPlace` takes the rows' total height in px instead of a row count, so centring and the top/bottom shifts follow. A title of several lines grows up: its last line's baseline stays at v12's y = 25, so it never reaches the pie or a top legend; the bounds grow up to cover it. One-line output is byte-identical: every e2e pie fixture rendered in all five legend positions before and after differs only in `text/line-breaks-and-unicode.mmd` (its 2-line title and 2-line row).
- **Invariants** (`invariants.ts`, `labelViolations`): legend labels must not overlap each other; the title must not overlap a legend label, a percentage, or the pie's outer disc. Spec fixture `breaks` fails all ten position/config cases before the fix.

**2. Markdown strings (D225).** A section label written `` "`…`" `` (the label comes without its quotes, so wrapped in backticks) or a title wrapped in backticks, with or without the double quotes, is laid out with `markdown: true`, backticks stripped. `showData`'s ` [value]` is appended as plain text. Plain labels unchanged. Specs: `layout.spec.ts` and `packages/mermaid/src/pie.spec.ts` (bold/italic tspans through `render()`).

**3. Changesets.** `.changeset/language-service-pie.md` (service, patch); `.changeset/language-service-adapters-pie.md` (CodeMirror + Monaco pie highlighters; both packages are public).

**4. Infinity (D226).** Parser: a value that is not finite (309+ digits) is a `PIE_VALUE_TOO_LARGE` **warning** and no section (range = the value). New `src/shares.ts` `pieSum(values)` → `{ unit, sum }`; share = `value / unit / sum`, `unit` 1 unless the plain sum overflows, then the largest value (bit-identical for normal inputs). Used by the layout (shares and angles), the invariants and hover. Hover says a too-large value is left out, and drops `of <total>` when the total is not finite. `render.spec.ts` accepts the new code for a dropped section; MIGRATION.md pie section notes it.

**5. `isValidId`.** Required on `LanguageFacet` (and checked by `isFacet`), so kept as `() => undefined` with a comment: the service only asks for bare names and pie labels are always quoted; the quoted-name check and the read-back decide. Its spec block is removed. Rename goldens unchanged and green.

**Baseline added:** `e2e/diagrams/pie/baseline/text/markdown-and-tall-labels.mmd` (legend top, 3-line markdown title, a 2-line markdown row). The e2e count in `lexer-parity.spec.ts` and `layout-corpus.spec.ts` is now 47; the `yaml-tree` digest snapshot's pie row updated. Its screenshots need generating (e2e not run here).

**Deviations**
- The title/legend overlap check skips a `center` legend (rows straddle the pie centre both ways): v12 draws it over the pie, and with ~18+ rows (`data/many-slices.mmd`) it reaches the one-line title. Fixing that would change one-line output.
- Title grows up rather than moving the pie and legend down (both options allowed by the brief).
- `PIE_VALUE_TOO_LARGE` is a warning, not an error like `PIE_NEGATIVE_VALUE`: v12 accepted such values (D226: accept what v12 accepts), so accept/reject parity is kept.
- A title counts as a markdown string with or without the surrounding double quotes (the title is not a quoted string in pie).

**Size:** not measured (no bundle run allowed here); the additions are a few dozen lines in diagram-pie, nothing in core.
