# @mermaid-js/shared (v13 alpha)

Code that several Mermaid v13 diagram packages share, kept out of `@mermaid-js/core` so a page loads it only with a diagram that uses it. There is no root entry: import a subpath.

| Subpath | Holds |
| --- | --- |
| `/parser/rule` | The lexer and parser base for diagrams ported from a v12 langium grammar |
| `/parser/state` | The lexer base for diagrams ported from a v12 jison lexer |
| `/parser/drop` | Offset helpers both lexer families use |
| `/parser/facet` | Completion and hover helpers for a diagram's `./language` entry |
| `/svg/edges` | Edge paths, arrowheads and edge labels for graph diagrams |
| `/layout` | Spacing, group padding and bounds helpers for graph layouts |
| `/ascii` | Line, label and title drawing for ASCII output |

`@mermaid-js/core` and `mermaid` never import this package. It has no runtime dependencies; core is a peer.

You don't use this package directly. Install [`mermaid`](https://www.npmjs.com/package/mermaid).

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
