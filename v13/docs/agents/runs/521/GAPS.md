# Gaps: block port (#521)

Unmet criteria and choices the spec and D-ids leave open, by owning ticket.

## All tickets

- Pele (`/Users/knsv/repos/pele`) is not on AI-Max, so its block reference (spec "Further Notes", D442, D443, D445) cannot be read. Tickets follow the spec's description of Pele's behaviour and v12 everywhere else.

- Follow-up (programme level, not this port): the lexer's source-mapping helpers (`v12Text`, `adjacent`, `placeholders`, `view`, `trivia`, `emit`, `dropAt`, `spaces`) are a third copy of venn's and kanban's (review of #553). A parser-kit home for them is a separate change.

- #637 move (2026-11-10): block's shared-file rows now live in its own files (`packages/diagram-block/workspace.yaml`, `packages/conformance/src/block/{tables,suite}.ts`, `packages/conformance/divergences/block.json`, `v13/docs/migration/block.md`). `tools/workspace/sync.spec.ts` "take a new diagram package from its own folder alone" fails while block is pre-manifest (its copy drops pre-manifest packages, so it does not expect `@mermaid-js/diagram-block` in conformance's devDependencies): fixed by #640 (open). Take #640's `sync.spec.ts` when it merges; until then the integration branch is not pushed (coordinator, 2026-11-10), at the latest T5 adds the manifest. `e2e/diagrams/block/hand-drawn.txt` (`sketched`, D447) lands with T4, when block draws.

## T0 #552

- Done in its own PR into `mermaid-v13`. Rows get `usedBy` `['flowchart']`; T4 adds `'block'` to each row it reads.

## T1 #553

- v12's entity placeholders (`#name;` → `ﬂ°name¶ß`) are not emulated in the lexed text: no `block.jison` rule stops at a `#` or `;` where it would not stop at the placeholder's characters (both are id, string and rest-of-line characters, neither is `\w` or `\s`), and `cook` decodes entities in token text. Tag-attribute quotes (`="x"` → `='x'`) are emulated, as venn does.
- `columns auto` sets jison's image to the number `-1`; v13's token text is the string `-1`, and the gate compares `String(image)`.
- Edge rule `\s*\~\~[\~]+\s*` is dead in v12 (the id rule comes first and takes `~`), so the lexer has no rule for it; `~~~` is a `NODE_ID` (cases `id-tildes`).
- Blanks and line breaks are no token (block has no `NL`; `[\s]+` skips them). T2 reads statement boundaries from the grammar, not from line breaks, as v12 does.
- No probe/mode output yet (`lex` has no `modeAt`): T6 adds it when the facet needs the start condition.
- Gate exclusion: `block-cases/unclosed-directive-1` (core's directive reading, as cynefin, pie and venn).
- Gate skips (v12 lexes no block, asserted in the spec): `block-cases/header-upper-case` and its six variants (`Block` fails the case-sensitive detector `/^\s*block(-beta)?/`; T2 rejects it the same way). No other source is skipped: the commented variant (`blockCommented`) cuts a short body after its header instead of through it, so those copies are compared too.
- No plugin object exists yet (`src/index.ts` exports the lexer only), so `layoutKind: 'custom'` is not declared anywhere: it lands with the plugin object, when T2/T3 first add one and at the latest in T5 with the manifest.

## T2 #554

Choices the D-ids leave open (each a `divergences.json` entry where it changes v12's model); the first two change what is drawn and are **pending a D-id (D440)**:

- **A composite opened twice** (pending a D-id, D440) (`block:g … end` then `block:g … end`) appends the second body to the first, as D442's fix 5 does for a leaf (same v12 mechanism: the children go onto an object it never stored).
- **A chain as a composite header** (pending a D-id, D440) (`block:a --> b … end`): the composite is `a`, and the edge and `b` stand at the level around it, in the model and the AST alike (the grammar marks them `HeaderEdge`/`HeaderBlock`, which the differential projects there). v12 spread the chain into a composite with no id and lost the edge.
- `space:0` stays zero cells (v12; it neither throws nor draws NaN, so D445's `:0` → `:1` is read as the span only).
- AST ids: a later mention of a block is `block:a@2`, `@3` (pitfall 9, flowchart's `n:A@2`); `columns` statements are `columns:<n>` (D448 names neither). The composite's AST node is its header block (no separate child).
- Kept v12 quirks (accept/reject and model unchanged): `a:2 --> b` drops the span; `classDef DEFAULT …` is rejected; a labelled edge's arrowheads come from its closing link (`x-- "l" --> b` has an open start); a later mention may change a composite's type (`block:g … end` then `g["x"]` makes it a square that keeps its children); classes are one string per `class` statement (`class a x y` gives `x y`); `style` splits at `,` without trimming.
- D445's spacer cap changes accept/reject as well as the model: 12.2.0 accepts `space:n` up to 16,777,214 cells (its block map holds 2^24 entries, the top level and the spacer included) and rejects larger ones with `Map maximum size exceeded`; v13 accepts every one and cuts it to 100,000. The fixture `space-over-the-cap-is-cut.mmd` (100,001 cells) is the model divergence; T3 and T5 lay out and draw 100,000 cells for it.
- Limits: `parseBlock` takes `maxNodes` (blocks, spaces, composites; a space counts once), `maxEdges` and `maxDepth`, core's defaults; T5 passes `ctx.limits`.
- Recovery resumes at the first statement start (or `end`) on a later line than the error; line breaks mean nothing to the grammar, so two errors on one line are one diagnostic.
- No probe mode yet (T6, with the lexer's `modeAt`); no plugin object (the parse seam is `parseBlock`; T5 adds the plugin with `layoutKind: 'custom'`).
- New fixtures under `e2e/diagrams/block/nightly-check/` (16: D442's fixes, D443, D445 and the corpus gaps: cylinder, double circle, `columns auto`, a composite label, edges between composites, a self-loop, parallel edges) have no baselines yet: T5 adds them with the others.

## T3 #555

- **v12's repeated sizing: replayed, capped at 16 sizings a block** (past the cap pending a D-id, D440). v12's `setBlockSizes` calls itself on each child twice, so a block at depth d (the root's children at 1) is sized 2^d times, and the repeats are not idempotent: a child spanning s columns grows by `padding · (s − 1) / s` each time its container is re-sized, and a container stretched after its children's last sizing keeps them at the older size. The grid replays v12's calls one for one with an explicit stack, but a block with children takes at most `BLOCK_METRICS.maxSizings` (16) of them, so the cost is at most 16 times the children's, linear in blocks and depth. That is v12's numbers exactly wherever composites nest at most 4 deep: conformance `block/layout-parity.spec.ts` checks every corpus source v12's code can run and seeded generated trees with spans, columns, `auto`, spaces, empty composites and composites wider than their children (1,000 each at one, two and three levels, 1,000 two-level ones without spans, 300 at four). Five levels down v12 sizes the innermost block 32 times: on 300 five-level trees, 97 differ, by a median of 544 px and at most 27,405 px; at six levels 32 of 100, median 2,496 px, max 53,192 px. That is v12's growth compounding (2^d steps), which no linear algorithm reproduces at every depth. A closed form was not found: each sizing reads the parent's state and the parent's next one reads the result, with v12's strict `<` deciding between three branches each time. The reviewer's measurement of the earlier two-pass grid (two-level trees with spans: about 25 % differed, median about 110 px, max about 1,000 px) no longer applies: those trees are now exact.
- **v12's even stretch kept, so a child can pass its composite** (pending a D-id, D440). A stretched composite gives every child the same width, spans ignored (`(siblingWidth − (xSize + 1) · padding) / xSize`), so a composite spanning several columns comes out one column wide while its own children were sized for its span. Fixtures `nightly-check/nested-spanning-composite-stretched-by-a-sibling` (`e` ends 58 px past `i`, default theme and measurer) and `…-under-a-wider-row` (1 px). Kept as v12 draws it.
- **Overflow, for the invariant**, read off the boxes, not the grid's rules: a composite's children form rows (one centre line each); a row overflows when its cells and the `padding` gaps before, between and after them are wider than the composite, or when it ends below it (label band, then the rows above and their gaps). That covers v12's block wider than the rest of its row, a grid v12 sized one column per child though its children span more (`columns` unset or at least the total span), and the even stretch above. Children in rows that fit must be inside.
- **D444 band**: a labelled composite's band is `padding + label height` above its grid, the label `padding` below the top, centred. Its width follows v12 (the label width, composite padding 0). The band takes the `padding` above the label, so the label does not touch the composite's border (the grid's own inset is below it); an empty labelled composite is the band and one `padding` below. Parity leaves the one labelled fixture out (asserted).
- **D445 clamp**: when a composite is stretched to its sibling height, its children's height `(siblingHeight − band − (ySize + 1) · padding) / ySize` is clamped at 0 (`finish` in `grid.ts`): a band taller than the sibling height would otherwise make it negative. Without a band it never is.
- **Drawn box**: the shapes that fill their cell draw at least their natural size (v12's `rect` took `max(natural, cell)`; a spanning child v12's even stretch narrowed below its span keeps its size). Circle, double circle and diamond keep their natural size, centred (spec), where v12's double circle grew with its cell. The block arrow is as wide as its cell only when it spans and the cell is wider, at its natural height (v12); its polygon reaches `padding` past that box on the pointing sides, into the grid gap.
- **Round** is sized as the square and drawn with `rx` 5 (v12 drew it as `rect`), not as flowchart's rounded rectangle; the other thirteen sizes are flowchart's copy (D446), whose rect is at least 12 px of label wide.
- **Edges** (D441): `[start, middle, end]`, the middle at the centres' midpoint (v12's label point), or at the clipped ends' midpoint when an end's block holds the other and the centres' midpoint falls outside them; two blocks with one centre are joined straight down from it. The clip is the outermost crossing of the ray from the centre (v12's `intersectPolygon` took the crossing nearest the far point). v12's two-way block arrows (`right, down` …) are triangles with the centre on a side, so an edge from some directions ends at the centre, which is on the outline.
- **Self-loop: invented here, needs a check against Pele (D441)**. Pele is not on this machine, so its arc could not be read. The loop is one cubic Bézier from the outline on the ray 30° right of straight up to the ray 30° above straight right, control points 24 px out along those rays (`BLOCK_METRICS.loopAngle`, `loopReach`); its label at the curve's middle, its arrowhead along the ray into the block.
- **Bounds** cover every outline, label, edge point (a loop's control points bound its curve) and edge label, plus 5 px; not spaces (v12's `getBBox` saw none) and not the origin (v12's `findBounds` started from 0). An empty model is 10 × 10.
- `block.padding` that is not a finite number of 0 or more lays out at 8, with no warning (T5 marks the key `honoured` and may add one).
- Labels are measured as written (entities not decoded, T2) with `layoutLabel`, in the theme's font and size plus a class's or `style`'s `font-size`, `font-weight` and `font-style`; `checkStyle` warnings are left to #556, which checks the style again to draw it.
- The plugin object (`src/plugin.ts`, `block`) has `layoutKind: 'custom'`, `detector`, `parse` (with `ctx.limits`) and `layout`; no `render` (#556) or manifest (#558) yet, so it is typed `Omit<DiagramPlugin, 'render'>`.
- Theme: block reads `fontFamily`, `fontSize` and the nineteen shape-padding rows; core's users come from the source scan (#637), so no `usedBy` edit.

## T4 #556

## T5 #558

- The plugin object exists (`src/plugin.ts`, `layoutKind: 'custom'`, T3); add `render` (T4), `configDefaults` and the manifest.

## T6 #557

## T7 #559
