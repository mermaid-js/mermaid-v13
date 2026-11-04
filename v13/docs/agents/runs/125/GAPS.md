# Gaps (spec #125)

Unmet acceptance criteria, filed under the ticket that owns each one.

## #141 T3 layout
- [ ] Invariants on fixtures produced by the v13 parser: waits for #139 (T2), which waits for #27/#28 (D107).

## Shared contracts

- **`SequenceModel`** (`packages/diagram-sequence/src/model.ts`): owned by #139 (T2), which is held. #141 (T3) lands the type first, shaped from the spec's model list (§Parser), as the layout's input; #139 adopts it and may extend it additively. A change that breaks #141's fixtures goes through the orchestrator.
- **Package skeleton** (`packages/diagram-sequence`): on the integration branch. #137 adds the conformance devDependency on it.
