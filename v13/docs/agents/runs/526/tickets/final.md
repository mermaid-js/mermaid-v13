# Final whole-branch review fixes (spec #526)

Branch `feature/526_final-review`, from the integration tip (merged with mermaid-v13).

## Fixed

1. Hover and rule-name completion read the same definitions as the facet's symbols:
   `ruleDefinitions(text, result)` (`facet/tables.ts`) lists every rule `def` symbol, so a rule
   that fails to parse (`keepFailedRules`) counts. Hover on a failed rule shows its first line
   and "This rule does not parse yet: the diagram draws it once it does."; the rule being
   written is offered by completion. `rulesByName` is gone. Railroad completion goldens
   (`packages/language-service/goldens/railroad/completions/*-positions.out`) now list those rules.
2. Rule-name completion docs use `block()` (moved from `hover.ts` to `tables.ts`): a terminal
   holding ``` gets a longer fence.
3. `v13/docs/migration/railroad.md`: `text.railroad-rule-name` carries `data-id="rule:<name>"`;
   its group, the markers and lines carry nothing (`pnpm regen`; render.spec pins it).
4. `layout/layout.ts` header: a choice's nearest branch on each side moves to `2r` (and the
   branches beyond it with it); bypass and loop at `max(2r, verticalSeparation)`.
5. `irReferenceItems` skips trivia with `isTrivia` (`RAILROAD_TRIVIA`: directives, YAML too).
6. One `atLineStart` (`tables.ts`, isSpace blanks), shared by `parse.ts` and `completions.ts`.
7. `RAILROAD_COLOUR_KEYS` is derived from `theme/vocabulary.ts`'s `nested` keys (literal types
   kept via `as const satisfies`).
8. `RailroadLayout.options` dropped: readers use `config.lengths`.

## Decisions

- 8: in cells, `layoutRailroad` sets `config.lengths` to the cell preset's lengths (what
  `options` held), so `config.lengths` is always the lengths the layout used.

## Checks

Scoped vitest (`env -u PARSE_FIXTURE_PATH VITEST_MAX_WORKERS=2`): diagram-railroad,
conformance/src/railroad, mermaid/src/railroad.spec.ts, language-service: all pass. tsc
(diagram-railroad), eslint and prettier on changed files: clean. No full `pnpm check`.

## Not fixed

The editor first-paint highlighter per notation (shared-code gap, already recorded).
