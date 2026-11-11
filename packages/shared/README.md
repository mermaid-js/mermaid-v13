# @mermaid-js/shared (v13 alpha)

Code that several Mermaid v13 diagram packages share, kept out of `@mermaid-js/core` so a page loads it only with a diagram that uses it. There is no root entry: import a subpath.

| Subpath | Holds |
| --- | --- |
| `/parser/rule` | The lexer and parser base for diagrams ported from a v12 langium grammar |
| `/parser/state` | The lexer base for diagrams ported from a v12 jison lexer |
| `/parser/tree` | The lexer and parser base for the indentation-tree diagrams (mindmap, kanban) |
| `/parser/table` | The rule-table lexer for diagrams that run a v12 jison lexer's rules as they are |
| `/parser/v12-text` | The text a v12 jison lexer saw, with each character's source range |
| `/parser/drop` | Offset helpers both lexer families use |
| `/parser/facet` | Completion and hover helpers for a diagram's `./language` entry |
| `/parser/flow` | The lexer, parser and model builder base flowchart shares with the diagrams whose grammar was cut from its own (agentflow) |
| `/parser/flow-facet` | Completion and hover for the same diagrams' `./language` entries |
| `/shapes/kit` | Shape types, paddings, sizers and path builders |
| `/shapes/basic` | The bracket-syntax node shapes several diagrams draw, one export per shape |
| `/shapes/extended` | The other flowchart node shapes |
| `/svg/route` | Edge paths for graph diagrams |
| `/svg/arrowheads` | Arrowhead markers and the trim they need |
| `/svg/graph` | The edge label on its background box and the text style a label is measured with |
| `/layout` | Spacing, group padding and bounds helpers for graph layouts |
| `/ascii` | Line, label, frame and title drawing and the shapes' text forms for ASCII output |

A subpath is one file or one family that always loads together: a barrel over files with different users would make every importer load all of them, because the bundler splits per file.

`@mermaid-js/core` and `mermaid` never import this package. It has no runtime dependencies; core is a peer.

You don't use this package directly. Install [`mermaid`](https://www.npmjs.com/package/mermaid).

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
