# Gaps (spec #125)

Unmet acceptance criteria, filed under the ticket that owns each one.

## #141 T3 layout
- [ ] Invariants on fixtures produced by the v13 parser: waits for #139 (T2), which waits for #27/#28 (D107).

## Shared contracts

- **`SequenceModel`** (`packages/diagram-sequence/src/model.ts`): owned by #139 (T2), which is held. #141 (T3) lands the type first, shaped from the spec's model list (§Parser), as the layout's input; #139 adopts it and may extend it additively. A change that breaks #141's fixtures goes through the orchestrator.
- **Package skeleton** (`packages/diagram-sequence`): on the integration branch. #137 adds the conformance devDependency on it.

## Follow-ups from the #137 review (outside the ticket's scope)

- **Flowchart oracle `\n` clipping.** `packages/conformance/src/flowchart/jison-lexer.ts` strips v12's appended `\n` from the last non-empty token; #137 found that wrong when a skipped `\s+` run swallowed it, and fixed it only in the sequence oracle. Flowchart's gate may compare a wrong expectation on sources ending in blanks.
- **Cross-type duplication (maintainer call, would be a core change).** `diagram-sequence/src/parser/source.ts` is a near copy of flowchart's (v12's global preprocessing: cleanupText quotes, comment and directive removal, encodeEntities). The jison lexer oracle and the harvest CLI are near copies too. With four M3 ports this becomes five copies; a shared home in `@mermaid-js/core/parser-kit` (source view) and in conformance (oracle, harvest) is the fix, but the first is a shared-core edit.
