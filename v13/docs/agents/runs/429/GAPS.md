# Gaps (spec #429)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #486 T1 lexer
- Exploration: v12's token names are `HEXCOLOR`, `RGBCOLOR`, `RGBACOLOR`, `COMMA`, `COLON` (the spec's HEX/RGB/RGBA are short names). The registry row is at `registry.gen.ts:148`, not `:103`.
- Exploration: the `yy` feedback runs both ways: the lexer itself calls `yy.setIndentMode(false)` (`venn.jison` L19), and `text` returns no token after `INDENT_TEXT` while `consumeIndentText` is set (L30). The jison oracle calls the `yy` builder once per run with no per-token hook, and its `defaultYy` would hand over v12's shared plain-object DB. **Choice (planned):** extend `loadJisonLexerOracle` additively so a descriptor's `yy` builder gets a fresh stateful object per run (emulating the parser's `setIndentMode(true)` after a `SET`/`UNION`/`INDENT_TEXT` line), and add a capture of the tokens the parser pulls during `oracle.parse` (wrapping `parser.lexer.lex`) for the emulation check. Other jison descriptors unchanged.

## #488 T2 parser

## #491 T3 layout
- Exploration: venn.js's Nelder–Mead, conjugate gradient and bisect (`venn.esm.js:270–622`) are bundled from `fmin@0.0.4` (benfred/fmin, **BSD-3-Clause** on npm), not venn.js's own MIT code. D411 names only venn.js's MIT. **Choice (planned):** the ported files carry both notices (venn.js MIT and fmin BSD-3-Clause, holder Ben Frederickson), `THIRD_PARTY_NOTICES` has a section for each, and `UPSTREAMS` gains both, extending `tools/release/src/licenses.ts` additively (BSD-3-Clause as an accepted licence, a second holder) without loosening any check. **For the maintainer.**
- Exploration: `Upstream` takes one `holder` and one `copyright` (`licenses.ts:22–29`); venn.js has two holders (Ben Frederickson 2013, Samuel Gratzl 2021). T3 extends the shape additively (a list) rather than dropping one.
- Exploration: venn.js `wrapText` does not cap at three lines and wraps to the first set's radius; core `layoutLabel` has no max-lines option. The three-line cap (D414) is package code.
- Exploration: v12's two solves differ: `VennDiagram` (drawn circles) drops zero-size sets, `venn.layout()` (text nodes, hand-drawn) does not and rounds to 2 decimals. D412's one solve is the drawn one (unrounded, zero sets dropped); parity compares against that path.
- Exploration: venn.js 2.0.0 runs in plain Node (no DOM); the solver parity spec may import it directly. It is not yet a direct conformance dependency (`@upsetjs/venn.js@2.0.0` as a dev dependency, pinned).

## #495 T4 renderer
- Exploration: `w.outline` takes no sketch options; settings are fixed per role in `plugin-hand-drawn/src/roles.ts` and `fillStyle` is solid or hachure only (`sketch.ts:128`). v12's venn values (fill weight 2, gap 8, angle −41 + 60i, cross-hatch for a styled overlap) are not expressible. **Choice (planned):** use the closest existing role with no hand-drawn plugin change, and list v12's parameters as a MIGRATION.md row. **For the maintainer:** an additive per-call option on `w.outline` is the alternative.
- Exploration: "palette on when `borderColorArray` is non-empty" cannot be a theme rule (slots past the end read `currentColor`; `inline()` rejects palette slots). **Choice (planned):** the renderer reads `theme.palette('borderColorArray')` (flowchart's `paletteSlots` precedent; a palette, not a theme name) and, when non-empty, slot i is `borderColorArray[i mod len]`; else `venn<i mod 8 + 1>` when written; else `primaryColor`. The table's `venn1`–`venn8` rows hold the classic formulas only.
- Exploration: v12's set-label colour uses `isDark(background)` (luminance of the resolved background, `vennRenderer.ts:120`), not a theme trait. **Choice (planned):** follow the spec and v12: luminance of the resolved `background` value, so an author's dark background in a light theme behaves as in v12.
- Exploration: core has `rgbToHsl`/`shiftHsl`/`hslToRgb` but does not export them; lightening an author's `style.fill` by 30 needs either a core subpath export (only if the CDN core closure does not grow) or package code. T4 measures and picks.
- Exploration: v12's `VennDiagramConfig` defaults `venn.theme` to `'redux-color'` and `venn.look` to `'neo'` (`config.schema.yaml:3070–3100`, docs page L13–19). **Ask the oracle** whether a plain `venn-beta` in 12.2.0 draws with redux-color's palette by default; T4's palette and T5's config row follow the answer.

## #498 T6 language facet

## #501 T5 integration
- Exploration: `venn.theme` is `pending` in the schema and undecided by the spec (see #495's oracle question). **Choice (planned):** if 12.2.0 applies it, `honoured` with v12's default, as `pie.theme`/`kanban.theme`; if not, `ignored`. A MIGRATION.md row either way.
