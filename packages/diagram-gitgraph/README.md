# @mermaid-js/diagram-gitgraph (v13 alpha)

The git graph plugin for Mermaid v13 (spec #292). It holds the lexer, gated token by token against v12's Langium lexer, the parser and model builder (`parseGitGraph`, `GitModel`), checked against mermaid@12 for accept/reject and the model, the custom layout (`layoutGitGraph`), the SVG renderer (`renderGitGraph`) and the plugin object (`gitGraph`). The registry manifest lands in a later ticket; until then the package registers nothing.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
