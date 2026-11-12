# ADR-15: Embedded diagrams

Status: accepted (maintainer, 2026-11-11), after a proof of concept on branch
`poc/embedded-diagrams`. Decision log rows D547 to D553.
Builds on ADR-6 (plugin discovery), ADR-14 (text output) and D177 (inline boxes). User docs:
[embedded-diagrams.md](../embedded-diagrams.md).

## Context

Authors want a diagram inside a diagram: one node of a flowchart that holds a whole sequence
diagram, mind map or class diagram. v12 has no way to do this; the closest is a link to another
diagram. v13 is the chance to add it, because its plugins share one pipeline (parse, layout,
draw) and already compose foreign content: math and icons become measured SVG fragments that a
label places (D177).

Five questions had to be settled:

1. **Syntax.** The new construct must not change the meaning of any text that parses today, in
   any diagram that may become a host. The block body is another diagram's text, so the host
   parser cannot understand it, and the body may itself contain `end`, `{` and `}`.
2. **Model.** Is the embedded diagram a node in the host's layout, or a free region?
3. **Who renders it.** Plugins see no registry (`RenderContext`, `pipeline/types.ts`), diagrams
   must not import each other, and drawing is synchronous: everything has to be loaded first.
4. **Isolation.** Every plugin writes a whole `<svg>` with theme aliases on its root and ids
   prefixed by a hash of text and config. Two diagrams in one SVG must not share styles or ids.
5. **Cost.** A large diagram made of many embedded diagrams should not pay for parts the
   reader does not see.

What exists today (probed on `mermaid-v13` at beaa8010f, v13 parsers match v12 by design):

| Line | flowchart | state | class | ER |
|---|---|---|---|---|
| `mermaid["T"]` | valid (a node) | | | |
| `mermaid sub["T"]` | error | valid (two states) | error | valid |
| `mermaid sub` | error | valid | valid | valid |
| `mermaid sub["T"] {` … `}` | error | error | error | valid (an entity block) |
| `end mermaid` | error | valid | valid | error |
| `A@{ view: collapsed }` | valid (folds a subgraph) | error | | |

So `mermaid[` and any opener without a brace already mean something somewhere, a closing `end`
cannot be found without knowing every inner grammar, and a trailing `{` is free in flowchart,
state and class.

A rough timing on the same commit (20 runs, busy machine, ratios only): parsing is about a
quarter of a full render (sequence, 150 messages: 0.4 of 1.6 ms; flowchart, 120 nodes: 0.4 of
2.0 ms).

## Decision

**Syntax: `mermaid <id>["Title"] {` … `}`.** A line that starts with the keyword `mermaid`,
then an id, an optional `["Title"]` and ends with `{` opens a block. The id is required (edges
need it); the title is optional. `mermaid` alone, `mermaid["T"]` and `mermaid --> B` stay
ordinary nodes and states, so every diagram that parses today parses the same way.

```
flowchart LR
  A --> login
  mermaid login["Login flow"] {
    sequenceDiagram
      U->>S: credentials
      S-->>U: token
  }
  login --> B
```

**The body is raw text, found by a lexer state.** On the opener the host lexer enters a
raw-body state (like flowchart's `md_string`) and emits one token with the body verbatim. It
finds the matching `}` by line: a line whose text ends in `{` opens a level, a line that starts
with `}` closes one; braces inside `"…"` strings and `%%` comment lines do not count. Braces
inside a line (`A{decision}`, `id{{hexagon}}`) never count. This covers every inner diagram that
uses braces (state composites, class bodies, ER entities, C4 boundaries, nested blocks) without
knowing their grammars. The body is never tokenized as host syntax, which is both correct and
cheaper than lexing it.

**The body starts with a diagram type.** After blank lines, blanks, `%%` comments and front
matter, the first line must be detected as a diagram type; otherwise the block is an error
("a `mermaid` block must start with a diagram type"). This also lets ER host blocks later: there,
`mermaid sub {` followed by attributes stays an entity, followed by a diagram header it is a
block.

**A block is a node.** It takes part in the host's layout like any node, sized by its content.
Edges attach to its border and never reach elements inside it. Its id is a node id: a second
node or block with the same id is an error. It may sit wherever a node may: in a flowchart
`subgraph`, in a composite `state X { }`; `class`, `classDef` and `style` apply to the box. In a
state diagram it is a state (`A --> login`).

**Nesting is allowed, up to depth 4.** A block may contain blocks if its type is a host. Deeper
nesting is an error, as with flowchart's subgraph depth limit.

**`mermaid` renders blocks before the host draws (option c).** The host's parse result lists
its blocks, `embeds: [{ id, text, offset }]`. Before drawing, `mermaid` detects each block's
type, loads its plugin and resources, and renders it, deepest blocks first. The host receives
each finished block by id as a measured fragment (`width`, `height`, an `SvgNode`), in the same
way it receives math and icon boxes (D177), and lays it out as a node of that size. Core gains
one data field and one lookup; hosts stay simple and render nothing foreign. Rejected options:

- (a) `ctx.embed(text)` called while drawing: drawing is synchronous, so blocks must be found
  and loaded first anyway, and core would need a callback into the registry that lives in
  `mermaid`, growing core's contract and its size budget.
- (b) each host renders its blocks: hosts cannot see the registry and would have to import
  other diagram packages, which diagrams must not do, and every host would differ.

**Each block is drawn as a nested `<svg>`** at its natural size, never scaled. Its id prefix is
the host's prefix, `-`, and the block id in a one-to-one encoding that never writes `-` (`_` is
`__`, any other character but a letter or digit is `_<hex>_`), so ids never clash, including two
identical blocks, `a.b` beside `a_b`, and a block `b` in `a` beside a block `a-b`. It
carries its own theme aliases on its own root, so host and block styles never mix.

**Look.** A border and a transparent background, which tells a block apart from a subgraph, and
an optional title strip; every host draws it with core's shape, which `mermaid` hands it as `RenderContext.blockShapes` (D554). A block inherits its host's resolved config, the host's front matter
and directives included, so theme, look and font come from the host. Front matter and directives
at the top of a block may then set diagram sections only (for example `sequence.mirrorActors`):
every other key (`theme`, `themeVariables`, `look`, `securityLevel`, `wrap`, …) is ignored with
one warning. `theme` and `layout` inside a section do not reach the block: the theme is the
host's, and the layout resolves for the block's own type.

**Errors fail the render.** A parse error inside a block, or a block whose type is unknown or
not available (not ported, or not registered under `mermaid/slim`), fails the whole render. The
position is reported in the outer text's lines and columns. Blocks whose types are not available
are reported together: one error names each block and type, at the first of them.

**Limits and security apply to the whole document.** `maxTextSize` and `maxEdges` count all
blocks together, so splitting a diagram into blocks cannot get past them. Block SVG goes through
the same allow-list as any other output.

**Folding.** A block folds with the statement that folds a subgraph: `login@{ view: collapsed }`.
The state parser gains `@{ … }`, accepting only `view: collapsed` and only on block ids (other
keys and targets are errors; folding composite states is a later change). A folded block is
captured by the lexer and its type detected from the first line; it is never parsed, laid out,
rendered or loaded, and its type need not be installed. It is drawn as a dedicated folded shape,
the same in every host and for every type (#665): the border with four corner brackets, the
title, a divider, then a generic diagram icon and the type in small capitals (for example
*Login flow* over *SEQUENCE*), with the same transparent background. `mermaid` hands the host
the detected type by block id (`RenderContext.foldedType`) and the shape with the open one
(`RenderContext.blockShapes`, D554), outside the core bundle. Errors inside a folded body are not reported at render time; the
editor still reports them.

**Text output.** A block whose type has text output is drawn inside a frame. A block whose type
has none is a frame with its title and `[classDiagram]` and one warning; the host's text output
still succeeds. A folded block is drawn like a folded subgraph (a box with `+` in its top-left corner and the title), plus a dotted divider and the inner type on a second line, with no warning.

**Interaction and accessibility.** Links, `click` callbacks and tooltips inside a block work as
in a stand-alone diagram (through `plugin-interactions` where they need it). The box has
`role="img"` and the title as its accessible name; the block's own `accTitle` and `accDescr` stay
inside its nested `<svg>`.

**Editor.** The language service reports block errors at their position and highlights a block
body with its own type's highlighting. Completion, hover and rename inside a block need region
delegation in the language service and come later.

**First hosts: flowchart and state.** Two hosts prove the contract is not flowchart-shaped.
Every diagram type can be embedded from the start, since that side needs nothing from the type.
Adding a host is parser work plus listing its blocks in the parse result.

## Consequences

- No existing diagram changes meaning; the new syntax is an error in v12 and in v13 before this
  change, in both hosts.
- Render time grows with unfolded blocks only. Folding skips a block's parse (about a quarter of
  its cost), layout and drawing, and in a browser its type's chunk is not downloaded.
- One render can now load several diagram types. `prepare` must walk the block tree before
  drawing, and `mermaid/slim` users must register every type their blocks use.
- The host's parse result grows an `embeds` list, which is also what folding, the editor and the
  limits read.
- The line-based brace rule fails on a quoted label that spans lines and ends a line with a lone
  `{`; the error then points at the block's opening line.
- ER, class and other graph diagrams can become hosts later without a syntax change for authors;
  ER needs the first-line rule to keep entity blocks.
- Click-to-expand a folded block in the browser is left for `plugin-interactions`; nothing here
  blocks it.

## Build order

1. Core contract and the render pass in `mermaid` (embeds in the parse result, block rendering,
   nested `<svg>` isolation, limits).
2. Flowchart host.
3. State host, including `@{ view: collapsed }`.
4. Folded shape and text output.
5. Editor diagnostics and highlighting.

Each step ships with `.mmd` fixtures under `e2e/diagrams/` for its host and for folded blocks.
