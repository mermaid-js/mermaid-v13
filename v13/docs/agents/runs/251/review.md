# Spec #251: final code-review findings

Branch `feature/251_review-fixes`, one commit per finding, then a merge of `feature/251_core-fixes`.

## 1. Class and sequence lexer-parity harnesses decode per token (not reproduced; cases added)

- The flowchart bug needed a merge step: jison split EDGE_TEXT one character a token, the harness merged the run, and a placeholder decoded per token came out wrong. Neither the class nor the sequence harness merges tokens, and v13 lexes the same text v12 lexed, so both sides split in the same places.
- Probe: `#y;` inserted at every position of the class and sequence corpus sources under 150 chars (28,496 v12-lexed sources), and again with comment lines added (11,884). No v12 token boundary falls inside a placeholder, and per-token decoding never differs from decoding the merged run. So no `#y;` case can fail first, and the decode is left as it is.
- Added as regression cases anyway: 3 class sources (`lexer-parity.spec.ts` LEXER_CASES: labels, members, generics, strings, cardinalities, accTitle, and `A #y; B`, which ends in a lexical error) and 2 sequence sources (a local `ENTITIES` list, plain and commented: actors, messages, `as`, loop, title, notes, links). All pass.

## 2. #198 F4 "known limit" bound (fixed; `< top + 0.5` restored)

- `layered/grid-obstacles.ts` (new) and `index.ts` `endLabels`/`endLabelAt`: on the grid, an end label now moves past a group border row it would cover when moving up or down, past a border column when moving sideways, and past every route's end cell.
- Treating borders as walls (the #198 attempt) leaves no side free, so the label falls back onto a middle label. Moving past border rows alone puts the F4 label on `C->g`'s arrowhead cell. Adding route end cells fixes that.
- `end-labels.spec.ts` F4 case: the bound is back to `y < top + 0.5`, and a new check says the label clears every route's end cell. Both fail on the pre-fix code (`expected 7 to be less than 7`; `C->g#1` on borders-only).
- Output: the e2e corpus (ascii + svg, 2,330 sources) is byte-identical before and after. No snapshot or golden changed: only F4-shaped graphs with end labels reach this, and class diagrams have no group↔member edges.

## 3. `compound.ts` refactor (no output change)

- `OwnEdge` (`ownEdgesOf`) works out group, member, `fromGroup`, `fromTop` and the px `offset` once. The routing loop reads them, so `depth[e.src]! < depth[e.dst]!` appears only once.
- Band sizing moved into `ownBandHeight`, `rightmostOwnLine`, `topBorderCrossings` and `widenedForOwnLabels`. The projection is one `boxX`, and `endpointBelow` is now a module function.
- Renames: `ownOf`→`ownByGroup`, `runsDown`→`fromTop`, `band`→`bandH`, `reach`→`rightmostOwnLine`/`rightmostLine`, `line`→`lineX`, `ownTop`→`bandTop`.

## 4. `directives.ts` refactor

- `nameAt` is the one name scan, shared by the no-name check and `read()`, and both stop at the directive's content end. The `}%%` and line-end searches are reused across openers, so the scan stays linear.
- One edge case changes with the shared limit: an unclosed `%%{` whose name is on the next line. The name lies outside the directive (which ends at its line), so it is no longer read as a nameless directive with UNCLOSED_DIRECTIVE. Pinned in `directives.spec.ts`. Oracle: before the header, v13 now gives v12's own error ("No diagram type detected"). In the body, v12 accepted (it dropped the rest of the text); v13 rejected before and still rejects, now with a grammar error. Corpus unaffected.

## 5. `yaml.ts` refactor

- `ValueSlot = 'after-key' | 'after-dash' | 'alone'` replaces the `mappingValue` boolean, and each `inlineValue` call names its slot.

## Proof of no output change (3–5)

- #175 corpus hash: `preprocess()` plus tree-mode `parseYaml` over all 2,330 `e2e/diagrams` sources, the same before and after (`1ebc84e8…`). The ascii and svg render hashes over the same corpus are also unchanged.
- Layout hash: `layered()` over 7,208 graphs, the same before and after (`af2a6858…`). The graphs are cell, review, title and random fixtures in 4 directions, plain and labelled, the grouped fixtures again in px, the hand-built px fixtures × 3 routings, and the #198 group-member shapes. Mutating `rightmostOwnLine` or the px offsets changes the hash, so the band code is covered.
- `pnpm check` green after the merge (8,263 passed, 97 skipped): every existing golden and snapshot unchanged. E2E not run, as asked.
