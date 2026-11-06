# Gaps (spec #294)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #380 T0 tree engine
- **Choice:** D284 names the field `DiagramPlugin.layout?: { default, aliases }`, but `layout` is already the plugin's layout method (`packages/core/src/pipeline/types.ts:160`, DESIGN §12.1). The field is `layoutEngine?: { default: string; aliases?: Record<string, string> }` instead; same semantics. DESIGN §12.1 and D284's wording follow in T0.
- **Choice:** the plugin default is applied as the plugin-defaults config layer (`packages/mermaid/src/config-snapshot.ts`, as `flowchart-elk` sets `layout: 'elk'`), above core defaults and below `initialize`, front matter and directives: that is "no layer sets `layout`" without a new registry field.

## #383 T1 lexer
- Exploration (`01-v12-mindmap.md` §9): `a:::b` lexes as one id and `a %% c` keeps the comment in its label in v12. Follow the oracle. **Closed** (#383): both are one `NODE_ID` in the gate (edge cases 1 and 19).

## #386 T2 parser
- Exploration: a node's level is its raw indent width (jison), not its tree depth; `edge-depth-<d>` comes from it (`mindmapDb.ts:326`). Keep the raw level in the model next to the depth. **Closed** (#386): `MindmapNode.level` and `.depth`.
- Exploration: a second `:::` line on the same node replaces its classes (one `:::a b` line sets two). Follow v12. **Closed** (#386): also `::: ` (blanks only) clears them, as in v12.
- The corpus has no `:::` classes: add hand-written fixtures. **Closed** (#386): `corpus/mindmap-cases.json`.
- Found: v12 rejects a node right after a blank line that follows `mindmap` (`mindmap\n\n  root`), and after two blank or comment runs in a row: `SPACELINE` is a statement and a separator in `mindmap.jison`. Followed (oracle); the message says to remove a blank line, and recovery still reads the node.
- **Choice:** AST ids use the id with blanks around it dropped (`a ` and `a` are `n:a`, `n:a@2`); the model keeps v12's id as written.
- **Choice:** a second root is in the AST but not in the model (v12 threw before adding it), and the parents of later nodes are found as if it were not there; a decoration after it lands on its AST node only.
- **Choice:** `icons(model)` lists a reference outside D297's two forms trimmed, as written (it resolves to nothing, so the icons plugin shows it as written).
- **Choice:** symbols (D289) are left to T6 (#389), as timeline's T2 left them to its T6.

## #387 T3 layout
- Exploration: v12's renderer checks `'circle'` but the shape is `'mindmapCircle'` (`mindmapRenderer.ts:65`), so its circle padding override never runs and `mindmap.padding` reaches circles too. **Choice:** D287 says "honour `padding` where v12 does": follow what v12 ran, so circles take `padding`.

## #388 T4 renderer
- Exploration: `edge-depth-<d>` uses the raw indent level, so with 2-space indents classic widths run 11, 5, 3 (not the spec's 11, 8, 5). **Choice:** keep v12's class numbering and the widths its CSS gives (P2, author CSS keeps matching); MIGRATION.md notes it.
- Exploration: v12 has no neo edge taper (`node.taper` is set in `mindmapRenderer.ts:60–62` and never read; neo edges only get a dasharray, `edges.js:969–978`). **Choice:** no taper variable.
- Exploration: the `neutral` `cScaleLabel1` rule applies only under neo. Translate exactly that, as a variable.

## #389 T6 language facet

## #390 T5 integration
- Fixture descriptions: also `text-should-wrap-with-icon.mmd` has no icon (four wrong descriptions, not three).

## #328 icons I5

## #344 hand-drawn H4
