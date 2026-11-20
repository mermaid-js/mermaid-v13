# @mermaid-js/shared (v13 alpha)

Code that Mermaid v13 diagram packages share, kept out of `@mermaid-js/core` so a page loads it only with a diagram that uses it. Core holds what the pipeline and the entry point need; a helper written for diagrams lives here, whether three types use it or all of them. There is no root entry: import a subpath.

| Subpath | Holds |
| --- | --- |
| `/parser/rule` | The lexer and parser base for diagrams ported from a v12 langium grammar |
| `/parser/state` | The lexer base for diagrams ported from a v12 jison lexer |
| `/parser/tree` | The lexer and parser base for the indentation-tree diagrams (mindmap, kanban) |
| `/parser/tree-facet` | Completion pieces for the same diagrams' `./language` entries |
| `/parser/line-tokens` | The token view of the parsers that read a statement per line (treeView, treemap), and how their errors quote a token |
| `/parser/table` | The rule-table lexer for diagrams that run a v12 jison lexer's rules as they are |
| `/parser/v12-text` | The text a v12 jison lexer saw, with each character's source range |
| `/parser/support` | The stop sentinel, the "got …" text of an unexpected token and the escaper of names in AST ids |
| `/parser/generic-types` | v12's `parseGenericTypes`, which class and ER diagrams run over a type's `~…~` generics |
| `/parser/drop` | Offset helpers both lexer families use |
| `/parser/callback` | v12's argument list of a `call fn(…)` click callback, for class diagrams and the interactions plugin |
| `/parser/common-values` | The values of `common.langium`'s strings, `title`, `accTitle` and `accDescr`, for the diagrams that do not load `/parser/rule` |
| `/parser/seen-tokens` | The token list of a langium-family diagram's lexer as v12's lexer saw it, for the language service and lexer-parity specs |
| `/parser/facet` | Completion and hover helpers for a diagram's `./language` entry |
| `/parser/flow` | The lexer, parser and model builder base flowchart shares with the diagrams whose grammar was cut from its own (agentflow) |
| `/parser/flow-facet` | Completion and hover for the same diagrams' `./language` entries |
| `/shapes/kit` | Shape types, paddings, sizers and path builders, and the person figure's proportions |
| `/shapes/basic` | The node shapes several diagrams draw, one export per shape: the bracket-syntax shapes, the lined document and the collapsed-group card |
| `/shapes/extended` | The node shapes only flowchart draws |
| `/svg/document` | The SVG root, title and description, the front-matter title over the drawing (`placeTitle`, `titledViewBox`), class lists, palette slots, the style cache, the clickable cursor (`clickCursor`) and the edge animation (`animateEdge`) every renderer uses |
| `/svg/route` | Edge paths for graph diagrams |
| `/svg/arrowheads` | Arrowhead markers and the trim they need |
| `/svg/graph` | The edge label drawn as a tag (a rounded, bordered box sized by `labelPatch`) and the text style a label is measured with |
| `/svg/node-paint` | The node paint flowchart and agentflow draw vertices and edges with, and the plain stroke an inner line takes under a gradient |
| `/config/readers` | Readers for config numbers, lengths and `useMaxWidth` |
| `/testing/layout-invariants` | What the diagrams' layout invariant checks share: the non-finite walk, box containment and overlap, `near`, the tolerance and the way a box is printed. Workspace-only: specs import it, the build and the tarball leave it out |
| `/testing/test-context` | The config, theme and render context a diagram's tests render with, as the pipeline builds them. Workspace-only |
| `/testing/render-harness` | `createRenderHarness(plugin, spec)`: a source or a model through the plugin's parse, layout and render, for a package's `render<Type>ForTest`. Workspace-only |
| `/layout` | Spacing, group padding and bounds helpers for graph layouts |
| `/ascii` | Line, label, frame and title drawing and the shapes' text forms for ASCII output |

A subpath is one file or one family that always loads together: a barrel over files with different users would make every importer load all of them, because the bundler splits per file.

`@mermaid-js/core` and `mermaid` never import this package. It has no runtime dependencies; core is a peer.

You don't use this package directly. Install [`mermaid`](https://www.npmjs.com/package/mermaid).

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
