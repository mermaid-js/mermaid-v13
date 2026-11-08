# Gaps (spec #427)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #492 T0 core gradients and blend mode

## #494 T1 lexer and corpus
- Closed: the harvest's `run` method gains `identity` (`prepareTextForParsing`, `cleanupComments` stubbed as the identity, since the oracle runs v12's preprocessing again) and `readsFiles` (`energy.csv` read from git): `sankey-v12-specs.json` holds the 6 spec sources (energy with its `%%` lines) and 8 docs examples.
- Closed (exclusion in `conformance/src/sankey/lexer-parity.spec.ts`): v12's `{TEXTDATA}*` / `ESCAPED_TEXT` stall on characters outside printable ASCII (tabs, `é`, U+2028, NBSP, entities, whose placeholders are non-ASCII). v13 writes one `Kind.Error` per run; the gate cuts v12 at the first empty text token and asserts each stall runs to the oracle's cap and is rejected by v12. Blanks after the header (`sankey   ⏎`) are `Text` (v12 rejects), in `sankey-cases.json`.
- Closed: `lexedText` needed no oracle change.
- Note: the corpus does use `prefix`/`suffix` and `width`/`height` (the financial-flow file: 800×500, `$`, `B`; the four align files: width 410), unlike the spec's coverage list.
- Note for #496: v12 rejects entities (`#9829;`) and an empty quoted field `""`; a mid-line `%%` is field text; a bare `%%` line is a row.

## #496 T2 parser
- **Choice:** D394's "listing every such row in `related`": the parse diagnostic keeps `related`; core's render `Warning` has no `related` (`toWarning` drops it), so the render warning lists the rows through `astIds` (each row's `link:` id). No core change.
- **Choice:** D397 ids: node names can contain `->` and `@`, and core's `AstIds` escape is not exported. The package escapes names with the same rules as core's escape (copied, not imported) so `node:`/`link:` ids are unambiguous; the round-trip proves it.

## #499 T3 layout

## #502 T4 renderer
- **For the maintainer:** D396 says the front-matter title becomes the `<title>` fallback "as D133 allows", but D133 says the front-matter title does not feed the accessible name, and no v13 type does this yet. Follow D396 as decided; sankey is the first such type.
- **Choice:** v12's `.node rect { shape-rendering: crispEdges }` is not in the spec and v13's allow-list has no `shape-rendering`. Not added to core (not covered by D391/D392); listed in MIGRATION.md.
- **Choice:** `dy` takes numbers only: v12's `0.35em` becomes `0.35 × 14 = 4.9` px through the metrics table.

## #504 T6 language facet
- Exploration: D398's rename (add quotes for `,`, `"` or a line break; double `"`) has no facet hook today, and `quoteAround` misses names written with `""`. T6 adds an additive hook in `@mermaid-js/language-service` (default: today's behaviour for every other type).

## #503 T5 integration
- Exploration: `checkColor('gradient')` passes as a named colour, so `linkColor`'s modes (`gradient`, `source`, `target`) are matched before the colour check. The registry row is at `registry.gen.ts:122` (spec says `:90`).
- **Choice (coordinator):** the wave-2 brief asks for a `src/theme/vocabulary.ts` with `THEME_VARIABLE_TABLE`; the spec says sankey adds no theme table (D152: Tableau10 is a package constant; text reads only `textColor`, `mainBkg`, `fontFamily`). Follow the spec: no table unless a gate requires one, in which case an empty one.
