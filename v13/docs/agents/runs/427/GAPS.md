# Gaps (spec #427)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #492 T0 core gradients and blend mode

## #494 T1 lexer and corpus
- Exploration: `sankey.spec.ts` has 6 `parse` calls (not ~20), all through `prepareTextForParsing`; the `run` harvest stubs that import and records 0 strings. T1 extends the harvest (record the argument of the real `prepareTextForParsing`, or the parser's input) so `sankey-v12-specs.json` holds them, `energy.csv` included.
- Exploration (oracle): non-ASCII characters and tabs are not lexer errors in v12: `{TEXTDATA}*` matches the empty string forever, so the oracle yields empty `NON_ESCAPED_TEXT` tokens (until its cap) and no `LEXICAL_ERROR`; the parser rejects. The gate needs a justified exclusion for that loop (compare up to the first empty token, then assert v13 rejects). Also unlisted in the spec: blanks after the header (`sankey   ⏎…`) are rejected.
- Exploration: `lexedText` needs no oracle change (the dist sets `parser.parser = parser`, so the wrapped `setInput` sees the text after `prepareTextForParsing`, which has no trailing `\n`).
- Exploration: the corpus does use `prefix`/`suffix` and `width`/`height` (the financial-flow file: 800×500, `$`, `B`; the four align files: width 410), unlike the spec's coverage list.

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
