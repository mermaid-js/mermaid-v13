# Gaps (spec #427)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #492 T0 core gradients and blend mode
- **Choice:** user-space gradients take no `stop-opacity` (sankey puts opacity on the element), so the inert shape stays exact.
- **Choice:** user-space gradients are written whether or not a hook removed every reference to them (writer-owned and deterministic); D182's stays "only when referred to".
- **For the maintainer:** D392's allow-list change reaches every type: author `style`/`classDef` keep `mix-blend-mode: normal|multiply` where they used to drop it with a warning. Output is unchanged for inputs without it. `SvgWriter` gains a required `linearGradient` member, so third-party writer wrappers must forward it.
- **For the maintainer:** core +823 B gz (CDN closure 92,988 → 93,811 on 0a472e044), 397 B under the 94,208 B gate. About 320 B is the `assertInert` re-check of the new shapes.
- Exploration: a `var()` in `stop-color` resolves in Chromium (D182 already ships it); Firefox and Safari were not checked locally (CI covers WebKit).

## #494 T1 lexer and corpus
- Closed: the harvest's `run` method gains `identity` (`prepareTextForParsing`, `cleanupComments` stubbed as the identity, since the oracle runs v12's preprocessing again) and `readsFiles` (`energy.csv` read from git): `sankey-v12-specs.json` holds the 6 spec sources (energy with its `%%` lines) and 8 docs examples.
- Closed (exclusion in `conformance/src/sankey/lexer-parity.spec.ts`): v12's `{TEXTDATA}*` / `ESCAPED_TEXT` stall on characters outside printable ASCII (tabs, `é`, U+2028, NBSP, entities, whose placeholders are non-ASCII). v13 writes one `Kind.Error` per run; the gate cuts v12 at the first empty text token and asserts each stall runs to the oracle's cap and is rejected by v12. Blanks after the header (`sankey   ⏎`) are `Text` (v12 rejects), in `sankey-cases.json`.
- Closed: `lexedText` needed no oracle change.
- Note: the corpus does use `prefix`/`suffix` and `width`/`height` (the financial-flow file: 800×500, `$`, `B`; the four align files: width 410), unlike the spec's coverage list.
- Note for #496: v12 rejects entities (`#9829;`) and an empty quoted field `""`; a mid-line `%%` is field text; a bare `%%` line is a row.

## #496 T2 parser
- **Choice:** D394's "listing every such row in `related`": the parse diagnostic keeps `related`; core's render `Warning` has no `related` (`toWarning` drops it), so the render warning lists the rows through `astIds` (each row's `link:` id). Core's `Diagnostic` has no `astIds`: the package types the warning as `SankeyWarning` (`model.ts`), and `toWarning` copies the field. No core change.
- **Choice:** D397 ids: node names can contain `->` and `@`, and core's `AstIds` escape is not exported. The package escapes names with the same rules as core's escape (copied, not imported) so `node:`/`link:` ids are unambiguous; `parse.spec.ts` checks names with `->`, `>`, `@`, `#` and `%` give distinct ids (the T4 round-trip proves it over the corpus).
- **Choice:** an infinite value (`Infinity`, `1e999`) counts as 0 with `SANKEY_INVALID_VALUE`, like NaN and negative values: D394 names only those, but d3-sankey would draw that node and its links with NaN, against D394's "never draw NaN"; the message says "is not a finite number". v12's value (Infinity) stays in the model for parity.
- **Choice:** D393 gives one error per group of nodes that reach each other (strongly connected component), at the group's first row, naming that row's source; two separate cycles are two errors (N errors, N diagnostics).
- **Choice:** `SANKEY_VALUE_TRAILING_TEXT` is one warning per value with text after its number, at that text (D394 says "one … warning" for "a value field").
- Closed: 35 parity divergences, all D393 cycles (`reject`: v12 parses a cycle, v13 rejects it); v12's two `__proto__` spec tests parse a cycle and are skipped in `v12-specs/` with that reason.
- Note for #499: links carry `flow` (the value to draw, 0 for invalid ones); `value` is v12's for parity and T6's hover.

## #499 T3 layout
- Closed: `packages/diagram-sankey/THIRD_PARTY_NOTICES` in treemap's form (from `feature/428_treemap`): d3-sankey 0.12.3, d3-array 2.12.1 (`sum`/`min`/`max`) and d3-shape 1.3.7 (`linkHorizontal`), each **BSD 3-Clause** (read from the installed `LICENSE`s), and in the package's `files`.
- **Choice:** where d3-sankey writes NaN, v13 does not (D394): when every flow is 0 (`values-nan`, `values-infinity`, `values-overflow`, `values-negative-zero-sign`) `ky` is 0, so nodes are 0 high and spread as d3 spreads them; flows are scaled by a power of two first, so sums never overflow (bit-identical to d3 elsewhere); a 0-high extent with one node per column pads by `nodePadding` (d3: `0 / 0`).
- **Choice (amended by #502):** `nodeColors`: a node's own entry takes it out of the Tableau10 slots (v12's `??`) only when it is a string that passes `checkColor`; any other entry counts as absent (see #502). Inherited members (`constructor`, `__proto__`) do not count: v12's `nodeColors[id]` found `Object.prototype` members there.
- **Choice (divergence):** `sankeyLayoutConfig` reads a length as a finite number of 0 or more, or a numeric string as its number; anything else (negative, `NaN`, `"wide"`) falls back to the default. v12 passed `+value` to d3: a negative `nodePadding` overlapped nodes and a negative `nodeWidth` drew boxes inside out, and a string `nodePadding` was concatenated with `+ 15` (`"12"` → 1215). Kept so boxes are never broken or NaN.
- **Choice:** the bounds hold what is drawn (D224): nodes, label boxes (advance width, ascent to descent about the baseline) grown by half the 4 px outline under `outlined`, and each link's stroke (at least 1 px, so zero links and 0-high nodes count).
- **Choice:** node depths and heights come from one topological pass instead of d3's repeated whole-set sweeps (quadratic on a long chain): the same values, linear (`conformance/src/sankey/layout-stress.spec.ts`). A node with n links stays quadratic, as in d3 (`reorderNodeLinks`).
- Note for #503: the layout's length defaults are in `layout/metrics.ts` until `sankey` joins `SECTION_OWNERS`. `sankeyLayoutConfig` drops wrong types, negative lengths, unknown enums and `nodeColors` entries that fail `checkColor` silently: warn on each there (`SANKEY_COLOR_INVALID` and a config code).
- Note for #502: every renderer constant is in `layout/metrics.ts` (`outlineWidth` 4 and `outlineJoin` round, `minLinkWidth` 1, `linkOpacity` 0.5, `labelShiftEm` 0.35 × `fontSize`); node `fill`, link `sourceFill`/`targetFill`.

## #502 T4 renderer
- **For the maintainer:** D396 says the front-matter title becomes the `<title>` fallback "as D133 allows", but D133 says the front-matter title does not feed the accessible name, and no v13 type does this yet. Followed D396 as decided: a front-matter `title` gives `<title id="<prefix>-title">` and `aria-labelledby` (sankey has no `accTitle`); MIGRATION.md notes it.
- v12 12.2.0's sankey `useMaxWidth` is `true` (mermaid@12.2.0's dist bakes `sankey.useMaxWidth: true`, `mermaid.js:6330`; `getConfig().sankey` and every sankey without the key drew `width="100%"` with a `max-width`). The renderer reads `useMaxWidth !== false`. The schema default is #503's (below).
- Closed (**Choice**): v12's `.node rect { shape-rendering: crispEdges }` is not in the spec and v13's allow-list has no `shape-rendering`. Not added to core (not covered by D391/D392); listed in MIGRATION.md.
- Closed (**Choice**): `dy` takes numbers only: v12's `0.35em` is `0.35 × 14 = 4.9` px through the metrics table.
- **Choice:** labels take `fill` (`textColor`) on `g.node-labels`, as v12's root rule gave every label (checked in 12.2.0's computed styles: legacy, `.sankey-label-bg` and `.sankey-label-fg` all fill `textColor`); the background text adds `stroke` `mainBkg`, 4 px, round joins, and no `paint-order` (the foreground drawn over it gives the same picture). `mainBkg` is read only under `outlined`.
- **Choice:** a colour that fails core's colour check never leaves a node or link unpainted (spec #427 §Integration: dropped, and the default used). A `nodeColors` entry that is not a string passing `checkColor` counts as absent: the node takes the next Tableau10 slot (so later nodes take other slots than in v12) and its links its colour; v12 drew such a node black, and links stroked from it black or not at all. A `linkColor` that is none of the modes and fails the check draws the default `gradient`. The renderer draws the layout's `fill`/`sourceFill`/`targetFill` as they are (one source of truth). #503 adds the one `SANKEY_COLOR_INVALID` warning.
- **Choice:** `src/plugin.ts` (`sankey`) lands here, as kanban's T4: `formats: ['svg']`, `detector`, `parse`, `layout`, `render`; no `labels` hook (labels are plain text, D395, not core label layout), no `theme` table (D152), no `configDefaults` (T5).
- Note: the renderer raises no warning. The parse's `SANKEY_INVALID_VALUE` / `SANKEY_VALUE_TRAILING_TEXT` reach `render()` once through `analyse`'s `toWarning` (tickets/496.md); the conformance spec asserts no `SANKEY_*` render warning.

## #504 T6 language facet
- Exploration: D398's rename (add quotes for `,`, `"` or a line break; double `"`) has no facet hook today, and `quoteAround` misses names written with `""`. T6 adds an additive hook in `@mermaid-js/language-service` (default: today's behaviour for every other type).

## #503 T5 integration
- **For the maintainer:** the generated `sankey.useMaxWidth` default must be `true` (P2): mermaid@12.2.0's dist bakes `sankey.useMaxWidth: true` (`mermaid.js:6330`), so every v12 sankey without the key drew `width="100%"` with a `max-width`, and the T4 renderer reads `useMaxWidth !== false`. This contradicts the spec's "`useMaxWidth` (`false`)" and v12's (and v13's) `config.schema.yaml`; set the schema default to `true` or record the change.
- Note: the D396 MIGRATION row (front-matter title as `<title>`) is already in T4's `## Sankey SVG structure` section; `## Sankey` must not write it twice (link to it instead).
- Exploration: `checkColor('gradient')` passes as a named colour, so `linkColor`'s modes (`gradient`, `source`, `target`) are matched before the colour check. The registry row is at `registry.gen.ts:122` (spec says `:90`).
- **Choice (coordinator):** the wave-2 brief asks for a `src/theme/vocabulary.ts` with `THEME_VARIABLE_TABLE`; the spec says sankey adds no theme table (D152: Tableau10 is a package constant; text reads only `textColor`, `mainBkg`, `fontFamily`). Follow the spec: no table unless a gate requires one, in which case an empty one.
