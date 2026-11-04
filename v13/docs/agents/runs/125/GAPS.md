# Gaps (spec #125)

Unmet acceptance criteria, filed under the ticket that owns each one.

## #141 T3 layout
- [x] Invariants on fixtures produced by the v13 parser: `packages/conformance/src/sequence/layout-corpus.spec.ts` (#139), green in px and cells, default and changed config.
- [x] Messages after a participant is destroyed: v12 accepts them (oracle), so #139 accepts with a `SEQUENCE_AFTER_DESTROY` warning; the span invariant reports them (pinned in the same spec).
- **Decided (maintainer, 2026-11-04): honour per-key sequence font sizes.** A set `sequence.messageFontSize`, `noteFontSize`, `actorFontSize` (and the other per-key size/weight keys) takes effect; unset, they inherit the theme `fontSize` (v12's effective 16). v12 overwrote them all with the global `fontSize`. #141 already behaves this way. Still to do: the D-id row (next free after D114 on `docs/m3-specs`; the M3 docs session owns DECISIONS.md), and in #145 (T5) move the keys to `honoured` and add a MIGRATION.md entry for the change.

## #139 T2 parser

- [x] **D114: switch to the core source view.** Done in #139: `parser/source.ts` deleted; the lexer derives its own read text (CRLF, entities) from the core view.

- [x] **Core `sourceView` mid-line directive fix (#186):** merged; six sequence forms added to the lexer-parity gate (`MID_LINE_DIRECTIVES`), parity 100%.

## #149 T6 language facet
- **Goldens run from conformance until the manifest lands (#145).** `firstPartyFacets` gets a `load` only from a manifest `language` entry, so `packages/conformance/src/sequence/language-goldens.spec.ts` passes the facet as an eager row over `packages/conformance/language-goldens/sequence/`. Its last test fails once the manifest has `language`: then `git mv` the folder to `packages/language-service/goldens/sequence/` and delete the spec (#145).
- **Property and rename round-trip specs (recipe step 7) pick sequence up only with the manifest.** Run by hand over the 193 sequence corpus files with the eager row: no throw, no completion range off the cursor's line, every participant rename keeps the model. Re-check when #145 registers the facet.
- **TextMate has no mode switch.** A `pop push(…)` lexer rule (participant id before `as` or `@{`, the `as`, the data's `}`) ends the TextMate scope, so TextMate colours a declaration's alias and data as statement text. Monarch and Lezer agree with the table. Documented exception in `tools/gen-grammar/src/sequence-categories.spec.ts`; the fix is in `tools/gen-grammar/src/highlight.ts` (cross-type, owner gen-grammar).
- **Adapters colour first paint with flowchart's grammar (D119, accepted).** Picking a highlighter per type is #190.
- No `./monarch.json` export yet (flowchart has one for the Monaco adapter); add it with #190 or #145.

## Shared contracts

- **`SequenceModel`** (`packages/diagram-sequence/src/model.ts`, landed with #141): owned by #139 (T2), which is held. #141 (T3) landed the type first, shaped from the spec's model list (§Parser), as the layout's input; #139 adopts it and may extend it additively. A change that breaks #141's fixtures goes through the orchestrator.
- **Package skeleton** (`packages/diagram-sequence`): on the integration branch. #137 adds the conformance devDependency on it.

## Follow-ups from the #137 review (outside the ticket's scope)

- **Flowchart oracle `\n` clipping.** `packages/conformance/src/flowchart/jison-lexer.ts` strips v12's appended `\n` from the last non-empty token; #137 found that wrong when a skipped `\s+` run swallowed it, and fixed it only in the sequence oracle. Flowchart's gate may compare a wrong expectation on sources ending in blanks.
- **Cross-type duplication.** The source view is decided (D114, see #139 above). The jison lexer oracle and the harvest CLI in conformance are near copies of flowchart's too; one parameterised oracle and harvest CLI would serve every type.

## #149 T6 language facet

- [x] **Accepted (D119): first-paint colours via #190.** The CodeMirror and Monaco adapters colour first paint with flowchart's grammar for every type; picking the highlighter per type is cross-type ticket #190, after the M3 facets. #149 does not change the adapters.

## Resolved by the maintainer

- [x] **D123: keep the fix.** The 3 create/destroy divergences (#139: `create-after-note`, `destroy-then-create`, `destroy-before-loop`) stand: v13 attaches `create`/`destroy` to the right message. Cited in `packages/conformance/divergences.json` and MIGRATION.md "Sequence syntax".
