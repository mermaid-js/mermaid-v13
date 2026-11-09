# Gaps and choices, spec #519 (ishikawa)

Unmet criteria and choices not covered by the spec or a D-id, per owning ticket. A ticket closes the items listed under it.

## T1 (#580)

- Harvest: the jison harvester (`packages/conformance/src/jison/harvest.ts`) reads only spec files under `dir` and the docs page, so `examples/ishikawa.ts` (2 sources) and `multi-diagram-id-uniqueness.spec.ts:126` (1) are not harvested and there is no `id: 'ishikawa'` literal to drop. Choice: carry those 3 sources as `.mmd` fixtures (accepted ones) or `ishikawa-cases.json` entries, checked against the oracle; do not extend the shared harvester.
- Closed: the shared harvester is unchanged and `harvest ishikawa` writes 4 sources (3 spec literals, 1 docs fence); there is nothing to drop. The 3 other sources are carried, all oracle-accepted: example 1 (the docs fence after a leading `\n`) as `ishikawa-cases/example-blurry-photo`, example 2 as `e2e/diagrams/ishikawa/nightly-check/example-late-food-delivery.mmd`, the id-uniqueness source as `nightly-check/unindented-effect.mmd`. These are hand copies, so a change to v12's originals would go unnoticed; acceptable, since v12 is frozen at 12.2.0 (D316).
- Oracle finding: no input makes v12's lexer throw (every character matches `[\n]+` or `[^\n]+`), so the gate has no `LEXICAL_ERROR` and v13 no `Kind.Error`. `[\n]+` only ever takes one LF (`[\s]+[\n]` takes longer runs), so `NL` is one line break.
- Oracle finding: `ishikawa-beta %% c\u2028P` is rejected by v12: the header comment ends at U+2028 (`.`), which is then a `SPACELIST` before `TEXT` on the header line. A whole-line comment after a U+2028 is removed with it (`^` after U+2028, `\s*` takes it).
- Exclusions: none beyond trivia (comments, directives, a dropped `;`) and the sources v12 does not detect (`ishikawas`, and commented copies of one-line bodies whose header `%% cut` splits).
- For T2: `SPACELINE` is two kinds, `T.CommentLine` (`\s*%%.*`) and `T.SpaceLine` (a blank run through its last LF); both keywords are `T.Ishikawa` (the text tells them apart). Leading blanks before the header are no token (v12 trimmed them).

## T2 (#581)

## T3 (#582)

- v12 details the spec words loosely (see `01-v12-ishikawa.md`): when every cause is a leaf both sides stay 250 instead of splitting the 500 pool; sub-cause slots spread over all of a cause's descendants on the cause bone, not per parent bone; cause labels (depth 1) are never wrapped by character count. Follow v12.
- `w.label` only centres or left-aligns; v12's sub-cause labels are end-anchored, so the layout computes the centre point itself.

## T4 (#583)

- D494's parameters (roughness 1.5, hachure fill weight 2.5, gap 5, stroke 2) cannot be passed: `w.outline` takes no per-call options and the drawer picks roughness by role (`packages/plugin-hand-drawn/src/roles.ts`), and D304 keeps roughness below 1. No core change is allowed (D491). Choice: venn's precedent (MIGRATION.md venn hand-drawn row), the role defaults (`node` for head and boxes, `edge` for spine and bones); MIGRATION.md row; **for the maintainer** (D499 if it needs a decision).
- v12's marker has no `markerUnits`, so arrowheads scale with stroke width: 12 px on cause bones, 6 px on sub-bones. Reproduce both sizes.

## T5 (#585)

- The spec's line references are stale: the registry row is at `registry.gen.ts:154`, the schema block at `config.schema.yaml:2320` (`useMaxWidth` :2334). No spec lists ishikawa as unsupported; add the "now renders" spec fresh.

## T6 (#584)

## T7 (#586)

- No tree(1)-style printer exists in the repo (kanban is the only custom-layout ASCII); ishikawa writes its own (D498).
