# Gaps (spec #125)

Unmet acceptance criteria, filed under the ticket that owns each one.

## #141 T3 layout
- [ ] Invariants on fixtures produced by the v13 parser: waits for #139 (T2), which waits for #27/#28 (D107).

## #139 T2 parser

- [ ] **D114: switch to the core source view.** v12's input cleanup (`diagram-sequence/src/parser/source.ts`, a copy of flowchart's) moves into the core parser kit, owned by the state spec's T0. Keep the copy until that T0 merges into `mermaid-v13`; then switch diagram-sequence to the shared one and delete the copy.

## Shared contracts

- **`SequenceModel`** (`packages/diagram-sequence/src/model.ts`): owned by #139 (T2), which is held. #141 (T3) lands the type first, shaped from the spec's model list (§Parser), as the layout's input; #139 adopts it and may extend it additively. A change that breaks #141's fixtures goes through the orchestrator.
- **Package skeleton** (`packages/diagram-sequence`): on the integration branch. #137 adds the conformance devDependency on it.

## Follow-ups from the #137 review (outside the ticket's scope)

- **Flowchart oracle `\n` clipping.** `packages/conformance/src/flowchart/jison-lexer.ts` strips v12's appended `\n` from the last non-empty token; #137 found that wrong when a skipped `\s+` run swallowed it, and fixed it only in the sequence oracle. Flowchart's gate may compare a wrong expectation on sources ending in blanks.
- **Cross-type duplication.** The source view is decided (D114, see #139 above). The jison lexer oracle and the harvest CLI in conformance are near copies of flowchart's too; one parameterised oracle and harvest CLI would serve every type.
