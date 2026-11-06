# @mermaid-js/diagram-gitgraph (v13 alpha)

The git graph plugin for Mermaid v13 (spec #292). So far it holds the lexer, gated token by token against v12's Langium lexer, and the parser and model builder (`parseGitGraph`, `GitModel`), checked against mermaid@12 for accept/reject and the model. The layout, renderer and registry manifest land in later tickets; until then the package registers nothing.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
