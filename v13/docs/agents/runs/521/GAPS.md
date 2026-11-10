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

- **v12's sizing repeats, not kept** (pending a D-id, D440). v12's `setBlockSizes` calls itself on each child twice, so a block at depth d is sized 2^d times, and the repeats are not idempotent: a child spanning s columns grows by `padding · (s − 1) / s` each time its container is re-sized, and a container stretched after its children's last sizing keeps them at the older size. No linear algorithm can give those numbers at every depth (at depth 50 the growth is 2^50 steps). The grid sizes each block twice: once bottom up (v12's first call) and once top down at the point v12 makes its second. That is v12's result exactly while no composite holds a composite (conformance `block/layout-parity.spec.ts`: every corpus source v12's code can run, 4,000 generated trees), and on every corpus fixture, nested ones included; a level deeper, all 1,000 generated trees without spans still agree (v12's strict `<` can flip on float noise, so to 1e-6) and 772 of 1,000 with spans.
- **v12's span rules kept, so a child can pass its composite.** In a composite inside a composite, a spanning child's one growth step (above), and v12's even stretch (`(siblingWidth − …) / xSize` for every child, spans ignored), can leave a child up to a few px past its composite's edge, as v12 drew it. The invariant holds on every corpus source; `layout-stress.spec.ts` nests without spans. Fixing it changes v12's numbers one level down, so it waits for the D-id above.
- **Overflow, for the invariant**: a child overflows where v12's grid has no room for it, its columns past v12's `xSize` (`columns` when set and below the total span, else the child count). With `columns` unset or at least the total span, v12 sizes a composite for one column per child even when children span more (its own rule); those children count as overflowing.
- **D444 band**: a labelled composite is `padding + label height` taller, its grid below that; the label sits `padding` below the top, centred; the composite is at least `label width + 2 · padding` wide (v12: the label width, padding 0). An empty labelled composite is `label + 2 · padding` tall. Parity leaves the one labelled fixture out (asserted).
- **Drawn box**: the shapes that fill their cell draw at least their natural size (v12's `rect` took `max(natural, cell)`; a spanning child v12's even stretch narrowed below its span keeps its size). Circle, double circle and diamond keep their natural size, centred (spec), where v12's double circle grew with its cell. The block arrow is as wide as its cell only when it spans and the cell is wider, at its natural height (v12); its polygon reaches `padding` past that box on the pointing sides, into the grid gap.
- **Round** is sized as the square and drawn with `rx` 5 (v12 drew it as `rect`), not as flowchart's rounded rectangle; the other thirteen sizes are flowchart's copy (D446), whose rect is at least 12 px of label wide.
- **Edges** (D441): `[start, middle, end]`, the middle at the centres' midpoint (v12's label point), or at the clipped ends' midpoint when an end's block holds the other and the centres' midpoint falls outside them; two blocks with one centre are joined straight down from it. The clip is the outermost crossing of the ray from the centre (v12's `intersectPolygon` took the crossing nearest the far point). v12's two-way block arrows (`right, down` …) are triangles with the centre on a side, so an edge from some directions ends at the centre, which is on the outline.
- **Self-loop** (Pele not on this machine): one cubic Bézier from the outline on the ray 30° right of straight up to the ray 30° above straight right, control points 24 px out along those rays (`BLOCK_METRICS.loopAngle`, `loopReach`); its label at the curve's middle. Its arrowhead points along the ray into the block.
- **Bounds** cover every outline, label, edge point (a loop's control points bound its curve) and edge label, plus 5 px; not spaces (v12's `getBBox` saw none) and not the origin (v12's `findBounds` started from 0). An empty model is 10 × 10.
- `block.padding` that is not a finite number of 0 or more lays out at 8, with no warning (T5 marks the key `honoured` and may add one).
- Labels are measured as written (entities not decoded, T2) with `layoutLabel`, in the theme's font and size plus a class's or `style`'s `font-size`, `font-weight` and `font-style`; `checkStyle` warnings are left to #556, which checks the style again to draw it.
- The plugin object (`src/plugin.ts`, `block`) has `layoutKind: 'custom'`, `detector`, `parse` (with `ctx.limits`) and `layout`; no `render` (#556) or manifest (#558) yet, so it is typed `Omit<DiagramPlugin, 'render'>`.
- `block` is in `usedBy` of `fontFamily`, `fontSize` and the nineteen shape-padding rows, and out of `theme-used-by.spec.ts`'s `NOT_DRAWN_YET`.

## T4 #556

## T5 #558

- The plugin object exists (`src/plugin.ts`, `layoutKind: 'custom'`, T3); add `render` (T4), `configDefaults` and the manifest.

## T6 #557

## T7 #559
