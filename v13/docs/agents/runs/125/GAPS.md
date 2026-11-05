# Gaps (spec #125)

Unmet acceptance criteria, filed under the ticket that owns each one.

## #141 T3 layout
- [x] Invariants on fixtures produced by the v13 parser: `packages/conformance/src/sequence/layout-corpus.spec.ts` (#139), green in px and cells, default and changed config.
- [x] Messages after a participant is destroyed: v12 accepts them (oracle), so #139 accepts with a `SEQUENCE_AFTER_DESTROY` warning; the span invariant reports them (pinned in the same spec).
- [x] **D132: honour per-key sequence font sizes.** A set `sequence.messageFontSize`, `noteFontSize`, `actorFontSize` (and the other per-key size/weight keys) takes effect; unset, they inherit the theme `fontSize` (v12's effective 16). v12 overwrote them all with the global `fontSize`. #141 already behaves this way. Done in #145: the keys are `honoured` with the default change in their reason, no generated section defaults (the layout's metrics table holds v12's lengths), MIGRATION.md "Config behaviour". Recorded as D132 (docs PR #209); MIGRATION.md cites it.

## #139 T2 parser

- [x] **D114: switch to the core source view.** Done in #139: `parser/source.ts` deleted; the lexer derives its own read text (CRLF, entities) from the core view.

- [x] **Core `sourceView` mid-line directive fix (#186):** merged; six sequence forms added to the lexer-parity gate (`MID_LINE_DIRECTIVES`), parity 100%.

## #149 T6 language facet
- [x] **Goldens run from conformance until the manifest lands (#145).** Done in #145: moved to `packages/language-service/goldens/sequence/` (outputs unchanged; the two no-offer cases renamed `not-code-*`), the temporary spec deleted. `firstPartyFacets` gets a `load` only from a manifest `language` entry, so `packages/conformance/src/sequence/language-goldens.spec.ts` passes the facet as an eager row over `packages/conformance/language-goldens/sequence/`. Its last test fails once the manifest has `language`: then `git mv` the folder to `packages/language-service/goldens/sequence/` and delete the spec (#145).
- [x] **Property and rename round-trip specs (recipe step 7) pick sequence up only with the manifest.** #145: both green over the corpus with sequence registered, no new known entry. Run by hand over the 193 sequence corpus files with the eager row: no throw, no completion range off the cursor's line, every participant rename keeps the model. Re-check when #145 registers the facet.
- [x] **Closed by #210** (TextMate form for pop-then-push mode rules; the sequence agreement spec has no TextMate exemption any more). Was: **Accepted by the maintainer (2026-11-04), follow-up #210: TextMate has no mode switch (pop-then-push rules).** The generator cannot add one without changing flowchart's TextMate grammar (its `callbackname` `pop push`). So in TextMate only: the data `@{ … }`, `as` and the alias text of a declaration may be miscoloured, and when the rest of a declaration line is not a plain id (it holds `@{`, `<`, `,` or `:`), the id mode's catch-all `INVALID` end wins and the line from the id on, a `;`-separated statement after it included, has no colour. Everything else agrees (statements after `;` behind an alias, multi-line data, entities in ids and text). Spelled out and checked token by token in `tools/gen-grammar/src/sequence-categories.spec.ts`; fixing it needs switch support (and end-pattern order) in `tools/gen-grammar/src/highlight.ts` (cross-type, owner gen-grammar). Needs a follow-up ticket or maintainer acceptance.
- [x] **Section folds one line short when a section ends with a nested block:** fixed in language-service `lines.ts` (a closer line of a nested block stays in the enclosing fold), spec in `lines.spec.ts`.
- [x] **Accepted (D119): first-paint colours via #190.** The CodeMirror and Monaco adapters colour first paint with flowchart's grammar for every type; picking the highlighter per type is cross-type ticket #190, after the M3 facets. #149 does not change the adapters.
- [x] **Accepted with D119: no `./monarch.json` export yet.** It only feeds the Monaco adapter's first paint; it comes with #190.

## Shared contracts

- **`SequenceModel`** (`packages/diagram-sequence/src/model.ts`): #141 (T3) landed the type, shaped from the spec's model list (§Parser), as the layout's input; #139 (T2, merged) produces it. It also holds the one participant-kind list (`PARTICIPANT_KINDS`) and arrow-head table (`ARROW_HEADS`) the parser, facet, layout and renderers share.
- **Package** (`packages/diagram-sequence`): on the integration branch, registered by its manifest (#145).

## Follow-ups from the #137 review (outside the ticket's scope)

- **Flowchart oracle `\n` clipping.** `packages/conformance/src/flowchart/jison-lexer.ts` strips v12's appended `\n` from the last non-empty token; #137 found that wrong when a skipped `\s+` run swallowed it, and fixed it only in the sequence oracle. Flowchart's gate may compare a wrong expectation on sources ending in blanks.
- **Cross-type duplication.** The source view is decided (D114, see #139 above). The jison lexer oracle and the harvest CLI in conformance are near copies of flowchart's too; one parameterised oracle and harvest CLI would serve every type.

## #143 T4 renderer
- [x] **Neo symbol geometry**: ported by #194 (`tickets/194.md`): redux themes draw v12 neo geometry, classic themes v12 classic, from four geometry theme variables.
- [x] **Registry**: the swapped-header registration is gone (#145); the specs use `createMermaid()` and the generated registry.

## Resolved by the maintainer

- [x] **D130 — ascii-size gate: per-type max (2026-11-04).** #145 changed the bench ascii-size gate to measure each type's text path (core/ascii + that type's ascii entry) and gate on the largest (sequence 9.9 KB gz). Maintainer: keep it and amend R-ASCII-9's wording to "each type's text path". Recorded as D130 (R-ASCII-9 reworded to "each type's text path") by the docs session. Cited in the bench gate title and comments (`gates.ts`, `ascii-size.ts`, `report.ts`) and ascii.md "Size" by the final fix pass.

- [x] **Neo geometry: port it (2026-11-04).** v12's default sequence look was `neo`; #143 draws classic geometry everywhere. Ported as geometry theme variables in follow-up ticket #194 (blocked by #143; #145 waits on it).
- [x] **D131 — accepted (2026-11-04):** async/half/stick arrowheads in `signalColor` (v12: black); classic rect/box grey shadows dropped (shadow only where `dropShadow` is set). Listed in MIGRATION.md "Sequence SVG structure" by #143, citing D131 (final fix pass).

- [x] **D123: keep the fix.** The 3 create/destroy divergences (#139: `create-after-note`, `destroy-then-create`, `destroy-before-loop`) stand: v13 attaches `create`/`destroy` to the right message. Cited in `packages/conformance/divergences.json` and MIGRATION.md "Sequence syntax".

## Final review

- [x] **#145 reviewed and merged** (review findings fixed: entry closure back to 6 files, per-type ascii sizes, c4 note, baselines generated in the Playwright image).
- [x] **#145 open items:** the ASCII note over a box border is fixed (below); the accessible name is D133 (below); the per-key fonts are D132.
- [x] **Sequence menu wiring (done in #145):** `menu?: AstMenu` on `SequenceMenuStmt`; `forceMenus` from pending to honoured.

- [x] **Flaky margin: `packages/bench/src/language-budget-sequence.spec.ts` "a cycle costs at most four bare parses".** It does use best-of-25 CPU time, alternated, like flowchart's. `isValidId` now validates in one parse and accepts every id the parser reads back (`A # c`, `Alice Smith`), but it was never the cost (about 0.03 ms either way): a cycle holds three structural parses (update, the rename's read-back, the completions probe) plus semantic tokens, so its best runs sit at 3.6–3.85 bare parses under vitest and reach 4.05–4.2 under load. The bound is 4.5, with that reasoning in the spec (final fix pass). Under tsx the same cycle is about 5 bare parses (a bare parse is about 3 times faster there).
- [x] **Final review fixes:** wrapped message labels keep off their lifelines in cells (corpus property in `layout-corpus.spec.ts`); a redeclaration drops the earlier actor menus from the AST, as from the model; one arrow-head table and one participant-kind list; the renderer reads its metrics in `ctx.units`; unused layout exports, `SequenceParticipant.alias` and the redundant knip entry removed; MIGRATION.md documents the `data-ast` id encoding.

## #145 T5 integration

- [x] **ASCII: a note over participants on both sides of a box border covers the border.** Fixed in the final fix pass: the box side is drawn through the note, the note's text keeps clear of it (the note grows when it must), and the theme baselines are back to `note over W,A`. `note over W,A` where `A` is in a `box` and `W` is not: the note's interior blanks the box side (rows of the note, the box's left column). Found with the theme baselines; the corpus property (`sequence-corpus.spec.ts` "draws nothing but lines over the sides of a box") checks it.
- [x] **Front-matter `title` in SVG (decided in #145 under D122; D133).** Not drawn, as flowchart and state; the `title` statement is drawn; text output prints the front-matter title. v12 drew both. MIGRATION.md "Sequence SVG structure". D133 corrects D122: the front-matter title does not feed the accessible name; `accTitle` alone does, and that stays so for M3. No code change.
