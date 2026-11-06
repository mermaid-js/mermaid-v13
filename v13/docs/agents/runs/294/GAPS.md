# Gaps (spec #294)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #380 T0 tree engine
- **Choice:** D284 names the field `DiagramPlugin.layout?: { default, aliases }`, but `layout` is already the plugin's layout method (`packages/core/src/pipeline/types.ts:160`, DESIGN §12.1). The field is `layoutEngine?: { default: string; aliases?: Record<string, string> }` instead; same semantics. DESIGN §12.1 and D284's wording follow in T0.
- **Choice:** the plugin default is applied as the plugin-defaults config layer (`packages/mermaid/src/config-snapshot.ts`, as `flowchart-elk` sets `layout: 'elk'`), above core defaults and below `initialize`, front matter and directives: that is "no layer sets `layout`" without a new registry field.
- Done in T0: DESIGN §6.1 (`tree` paragraph) and §12.1 (`layoutEngine`, manifests may not claim `tree`), D284's wording, the schema's `layout` text, and `mindmap.layoutAlgorithm` → `ignored` (status only; no warning, like every `ignored` key).
- **Choice:** "plugins that declare `tree`" (D285) means plugins whose `layoutEngine.default` is `tree`; for any other diagram `layout: tree` is `LAYOUT_UNKNOWN` (drawn with `layered`), even after another diagram loaded it. A `tree` loader the integrator registers replaces the first-party one for every diagram. Layout manifests may not claim `tree`.
- **Choice:** split ties (D283) take the earlier cut, as Pele does: three equal branches put one right and two left.
- **Choice:** `spacing.rank` is the gap out at every level, root included, and `spacing.node` between siblings and between the trees of a forest; there is no extra gap between branches (Pele has `BRANCH_GAP_*`, `GROUP_GAP`). T3 picks the numbers through `fromPx`. A level's gap widens to fit its widest edge label, and each tree-edge label's height is reserved in its parent's band, so it clears every node. End labels sit a quarter of the way along, and labels on edges that are not tree edges halfway; neither is kept clear of anything.
- **Choice:** a tree edge is two `axis: 'h'` points (parent's facing side → child's near side at their centres); the renderer curves it. Other edges are straight, border to border; a self-loop goes out and back off the right side.
- **Choice (for the maintainer):** arbitrary groups can enclose non-members. Placement ignores groups, and a group gets its content's bounds plus padding (D285), so when its members sit on both sides of the root or are not next to each other in the tree, its box covers nodes (and other groups) that are not in it. Pinned by `tree.spec.ts` ("groups whose members are not next to each other"); the overlap invariant leaves group/non-member overlaps out there. No M4 caller sends groups; fixing it means placing a group's members as one block.
- **Choice:** a group with no nodes in it is stacked below the trees and every other group's box (padding included), and the groups around it grow to hold it.
- **Choice:** the linear-time ratio test is `packages/conformance/src/tree-linear.spec.ts` (core has no Node types, so no CPU clock there); 2k vs 16k nodes, best of 5, ratio < 24, as `stress.spec.ts`.
- **Not done:** a diagram with `layoutEngine.default: 'tree'` and an `ascii` hook would warn `ASCII_DROPPED` (layout `tree`) on every text render; no M4 diagram has both.

## #383 T1 lexer
- Exploration (`01-v12-mindmap.md` §9): `a:::b` lexes as one id and `a %% c` keeps the comment in its label in v12. Follow the oracle. **Closed** (#383): both are one `NODE_ID` in the gate (edge cases 1 and 19).

## #386 T2 parser
- Exploration: a node's level is its raw indent width (jison), not its tree depth; `edge-depth-<d>` comes from it (`mindmapDb.ts:326`). Keep the raw level in the model next to the depth. **Closed** (#386): `MindmapNode.level` and `.depth`.
- Exploration: a second `:::` line on the same node replaces its classes (one `:::a b` line sets two). Follow v12. **Closed** (#386): also `::: ` (blanks only) clears them, as in v12.
- The corpus has no `:::` classes: add hand-written fixtures. **Closed** (#386): `corpus/mindmap-cases.json`.
- Found: v12 rejects a node right after a blank line that follows `mindmap` (`mindmap\n\n  root`), and after two blank or comment runs in a row: `SPACELINE` is a statement and a separator in `mindmap.jison`. Followed (oracle); the message says to remove a blank line, and recovery still reads the node.
- **Choice:** AST ids use the id with blanks around it dropped (`a ` and `a` are `n:a`, `n:a@2`); the model keeps v12's id as written.
- **Choice:** a second root is in the AST but not in the model (v12 threw before adding it), and the parents of later nodes are found as if it were not there; a decoration after it lands on its AST node only.
- **Choice:** `icons(model)` strips the second word's prefix only when it is the pack (`mdi mdi-fire`) or `fa` after a Font Awesome pack (`fab fa-github`); any other reference is listed trimmed, as written (it resolves to nothing, so the icons plugin shows it as written). Review of #386.
- **Choice:** symbols (D289) are left to T6 (#389), as timeline's T2 left them to its T6.

## #387 T3 layout
- Exploration: v12's renderer checks `'circle'` but the shape is `'mindmapCircle'` (`mindmapRenderer.ts:65`), so its circle padding override never runs and `mindmap.padding` reaches circles too. **Choice:** D287 says "honour `padding` where v12 does": follow what v12 ran, so circles take `padding`. **Closed** (#387): `layout.spec.ts` "circle".
- **Choice:** spacing is tidy-tree's `gap 20` (`spacing.node`) and `bottomPadding 40` (`spacing.rank`) through `fromPx`. `tree` has one rank gap for every level (#380), so the root's own clearance (v12 `width/2 + 30`, plus the virtual root's 1 + 40: 71 px off the root's side) is not reproduced; the root's children sit 40 px out like every level. The same graph goes to `layered` and ELK (v12 handed them `nodeSpacing`/`rankSpacing` 50), direction `TB`.
- **Choice:** cloud and bang nodes are laid out at the box their v12 path covers (v12 sized them from `getBBox` of the bulging arcs, `updateNodeBounds`), not at the formula's `w` × `h`; the view keeps the formula frame and its offset in that box (`frame.dx/dy`), and the arcs (`outline`) for T4 to draw.
- **Choice:** the icon slot is a 50 px square beside the label (left of it; above it in a circle), the pair centred in the shape; the glyph is 40 px in the slot. "The margin is `mindmap.padding`" is read as the drawing's margin (`diagramPadding`, v12 `setupViewPortForSVG`).
- **Choice:** labels are measured in the theme's `fontFamily`/`fontSize` at weight 400, as flowchart and class do, so mindmap reads theme variables from T3 on: it joins `TEXT_USERS` (`vocabulary.ts`, +7 B core) and leaves `NOT_RENDERING_YET` (`theme-used-by.spec.ts`), ahead of #388.
- **Choice:** `mindmap.padding` and `maxNodeWidth` take numbers and numeric strings (`"20"`, as v12 and flowchart's `size()`); a non-numeric value, a padding below 0 or a width of 0 or less lays out with the default and warns `MINDMAP_CONFIG_IGNORED` (pitfall 22).
- **For #388:** sizes are v12's classic ones in every theme. The family geometry (D288 default drawn rounded in redux; neo's `squareRect` 16/12, circle 16, hexagon slant 3.5 and paddings 70/32) changes sizes, so the variables T4 adds must be read in `prepare.ts` (`frameOf`, `MINDMAP_METRICS.shapes`), not only in the renderer.

## #388 T4 renderer
- Exploration: `edge-depth-<d>` uses the raw indent level, so with 2-space indents classic widths run 11, 5, 3 (not the spec's 11, 8, 5). **Choice:** keep v12's class numbering and the widths its CSS gives (P2, author CSS keeps matching); MIGRATION.md notes it.
- Exploration: v12 has no neo edge taper (`node.taper` is set in `mindmapRenderer.ts:60–62` and never read; neo edges only get a dasharray, `edges.js:969–978`). **Choice:** no taper variable.
- Exploration: the `neutral` `cScaleLabel1` rule applies only under neo. Translate exactly that, as a variable.
- **Choice:** three theme flags, no colour variables (core size): `mindmapRoundedNodes` (D288's flag: plain nodes rounded; with the next flag v12's `includes('redux')` root rules, and where `borderColorArray` is empty v12's exact `redux`/`redux-dark` `mainBkg`/`nodeBorder` nodes, theming.md's per-item rule), `mindmapOutlinedNodes` (D288's geometry flag, standing for v12's `[data-look="neo"]` rules: outline at `strokeWidth`, `dropShadow`, flat bottom, neo edge widths, `cScaleLabel0` root text) and `mindmapBorderEdges` (v12's `includes('redux') || neo-dark` edge stroke). Values: redux family all on; `neo` outlined; `neo-dark` outlined + border edges; classic all off. Each derives from shared variables only (D331).
- **Choice:** the `neutral` rule has no variable: `neutral` is a classic theme in v13 and v12 applied the rule only under `look: neo`, so no built-in theme reaches it.
- **Choice:** `prepare.ts` reads the shared geometry: rect `nodePaddingX`/`nodePaddingY` at v12's fixed 10, circle `circlePadding` at `mindmap.padding`, hexagon `hexagonPaddingX`/`hexagonPaddingY` at `2 · padding` and `hexagonSlant`, `radius` for the rounded corner. The hexagon takes X across and Y down as the flowchart does (D151's correction), not v12's swapped axes, so redux hexagons are 70 wider and 32 taller rather than 32 / 70.
- **Choice:** the shadow sits on the outline call (D302: the drawer sees only its attrs), not on the node group as v12 did, so labels are not shadowed.
- **Choice:** without the icons plugin the reference text is laid out in the theme font, shrunk to fit the 40 px glyph square; one `ICON_NOT_RENDERED` per render through `ctx.inline.warn` (deduplicated with label icons) or `ctx.warn`. #328 adds the `ctx.icon` glyph.
- **Choice:** two-point `tree` routes are drawn as one cubic along the ports (v12 tidy-tree's elbows through `basis`); longer routes as d3's basis spline.
- **Choice:** gitGraph's `git`, `gitInv` and `gitBranchLabel` palettes copied verbatim from `feature/292_gitgraph` (with D334's dark/neutral rules), without the commit/tag label variables; `gitInv` comes along because gitGraph's builders make the three together.
- **For the maintainer (D331):** the root reads gitGraph's `git0` and `gitBranchLabel0`, a diagram reading another diagram's palette, as v12 did (`styles.ts`). No shared rule or palette reads a mindmap variable, and no mindmap rule branches on a theme name.

## #389 T6 language facet

- **Choice:** D289's "each node id is a definition with no references, so rename changes only it" cannot hold with ids that repeat while the service groups occurrences by name. `LanguageFacet` gains an optional `standalone?: readonly string[]` (core type only, 0 B; DESIGN §4.5 and language.md step 5): an occurrence of such a kind is a symbol of its own, so definition and references give it alone and a rename edits only it. Mindmap sets `standalone: ['node']`; renaming a node to an id another node has is then no clash (ids repeat in v12).
- **Choice:** the rename round-trip spec drops mindmap's `ast` field before comparing models, next to journey's name-order normaliser: the AST id encodes the node id (`%3E` for `>`) and numbers repeats (`n:a@2`), so renaming the first `a` renumbers the second. Not a known entry; the `id` field is still compared.
- **Choice:** completion inserts `::icon()` (not `::icon(`, which swallows the following lines until a `)`), and offers shapes as the id inside each one (`a` → `a[a]`), as flowchart does: an empty shape is an error in v12. Each shape item is lexed alone and kept only if it reads as that shape with that text; else quoted (`q]` → `q]["q]"]`, `-q` → `-q("-q")`), else dropped (an id starting with `"`). Closers are offered after a shape's text at a line end (`(-` takes `)`). Class names come from the other `:::` lines.
- **Choice:** astAt on a `::icon()` or `:::` line gives nothing: the decoration is on its node's AST node (D289) but outside the node's range, which is the node statement (T2).
- Class words are paired in order with the source's blank-separated words (removed spans skipped): an encoded word (`#35;`) or one cut by a directive keeps the token range (dropped by the service), the others rename. A node id cut by a removed span keeps the token range too.
- **Choice:** a subtree's fold also takes the `%%` comment lines right after it that are indented deeper than its node (review of #389, after D259's timeline rule); blank lines after them stay out.

## #390 T5 integration
- Fixture descriptions: also `text-should-wrap-with-icon.mmd` has no icon (four wrong descriptions, not three).

## #328 icons I5
- **Choice:** the glyph is asked for by `mindmapIconName` (D297), 40 px, `paint` = `cScaleLabel<section>` (the reference's colour, a colour under every family: no gradient as flowchart's neo glyphs take, since D297 names the colour), no `fallbackPrefix` (a bare reference is shown as written, as v12's CSS class needed a pack). Drawn as `g.mindmap-icon[transform=translate(…)]` round the fitted glyph, where `text.mindmap-icon` goes without one; layout is unchanged.
- **Choice:** `null` (the extension reports it unresolved) shows the reference as written and mindmap gives no warning (the extension's `ICON_NOT_RENDERED` names it, D291); mindmap's own `ICON_NOT_RENDERED` comes only when no extension has glyphs. `undefined` (a placeholder while the pack loads, D299) leaves the slot empty, as flowchart's frame alone and the plugin's "nothing in shapes".
- **Choice:** the e2e page's static packs gain `fa`'s `book` and an `mdi` pack with `fire` (`packages/dev/src/icon-packs.ts`), the two glyphs the corpus names; no other fixture names them.

## #344 hand-drawn H4
