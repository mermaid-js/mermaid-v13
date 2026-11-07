# Corpus cleanup ("Only real diagrams"): handoff

Branch `feature/294_corpus-cleanup`. GAPS.md "Corpus cleanup". Core, the registry and every package's code are untouched (core 0 B): test sources only.

## What was looked at (119 sources)
- `src/mindmap/corpus.ts`: `LINE_SEPARATORS` (12), `EDGE_CASES` (49), `MID_LINE_DIRECTIVES` (4); `layout.spec.ts`'s inline `edge id probe` (1); the 53 parser cases of `corpus/mindmap-cases.json`. The other specs in `src/mindmap/` (render, stress, service-symbols, messages, probe, grammar) hold no source list.

## Counts
- **To `.mmd`: 14**, all `e2e/diagrams/mindmap/baseline/` (gallery, no warnings): `config/init-directive`, `layout/labels-holding-edge-id-text`, `shapes/class-{bare-marker,at-a-shallower-indent,without-indent,marker-inside-an-id}`, `text/{front-matter-title,markdown-in-plain-labels}`, `syntax/{icon-replaced,icon-keyword-case,icon-empty,tab-indent,root-on-header-line,repeated-ids}`. 3 from TS (edge cases 44, 45, the edge-id probe), 11 parser cases. Labels are ordinary words; icons are D297 names the e2e page resolves; the edge-id probe is kept as written.
- **Dropped as covered: 23.** TS: edge cases 0, 5, 30, 47 (47 is `mindmap\n`, the same text as `mindmap-cases/empty-body-line-break`). JSON: 19 (class lines, icon forms, shapes, multi-line/string/`<br>` labels, indents, blank and comment lines, 13 branches, deep chain, front-matter title; `class-then-child` and `reject-root-in-wrong-place` are v12 spec strings #20 and #6 bar a trailing line break). Reasons per case in GAPS.
- **JSON: 82** = 59 moved from TS (12 line separators, 43 edge cases, 4 mid-line directives; ids `mindmap-cases/<old id>`, group comments as `note`, invisible characters as `\uXXXX`, the #471 convention) + 23 stayed (14 rejections, 9 lexer-only texts).
- **Stayed in TS:** generators only: the commented and CR-cut copies, `stress.spec.ts`'s 24 lexer and 10 parser shapes and the 10k-node mindmap, the message fuzz's fragments, and `service-symbols.spec.ts`'s inline `mindmap\n  root` (a facet-loading check, not a corpus).

## Pins and gates
- Mindmap e2e count 89 → 103 (`lexer-parity.spec.ts`, `render.spec.ts`); YAML digest regenerated with `-u`, only the mindmap row moved (`89 d6aabfd9…` → `103 c71fdd78…`).
- `layout.spec.ts` and `render.spec.ts` read e2e + cases (gaining the 4 mid-line directives); the gate corpus is e2e + v12 specs + cases, each commented and CR-cut (924 sources, 918 lexed by v12, 0 lexer diffs). Model parity: the cases are in the suite's `corpusFiles` directly. Message fuzz and generated sentences gain the 59 lexer cases as seeds; both pass unchanged.
- A before/after dump of every source: only the 14 moved and the 22 dropped texts that were not exact copies are gone; each is covered as above.

## Checks
- Found: the new `syntax/icon-keyword-case.mmd` (`::ICON(`) failed `tools/gen-grammar/src/mindmap-agreement.spec.ts`: the Monarch emulator in `highlight-testing.ts` ignored the definition's `ignoreCase`, which Monaco applies (the generated `mindmap.monarch.js` has it). Fixed there (test helper only); gitGraph's and gantt's agreement specs pass with it.
- After merging `feature/294_mindmap` at bf588c82a (clean merge; YAML snapshot rerun with `-u`, no change): mindmap gates + gen-grammar + language-service property/rename (34 files, 637 tests; lexer parity 918 of 924 lexed, 0 diffs; oracle parity 5,477 sources, 5,431 agree, 9 listed, 37 skipped) green; `pnpm check` green (14,078 tests). Before the merge: 12,402.
- E2E in `mcr.microsoft.com/playwright:v1.62.1-noble`, `mmd-snapshots -g mindmap` + `e2e/dev/diagram-tab.spec.ts`: `.tmp/tcorpus-e2e.sh` (seeded with #328's PNGs) 103/103 twice, the 14 new PNGs written and checked by eye (second icon wins, forest theme from the directive, markdown in a plain label, distinct edges in the edge-id fixture; the front-matter title is not drawn); after the merge `.tmp/tcorpus-e2e2.sh` 103/103 twice against them; dev 6/6. PNGs not committed (`.tmp/tcorpus-e2e2/e2e/__snapshots__/`).

## Deviations
- The brief listed line separators with the generated variants; they are a hand-written lexer-only list, so they moved to the JSON as timeline's and sequence's did (#471).
- The parser cases already in `mindmap-cases.json` were reviewed too (GAPS names "parser cases"); renderable ones became fixtures, as gitGraph's did (#404).

## Unmet
- None.
