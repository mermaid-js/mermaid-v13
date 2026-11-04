# @mermaid-js/language-server

The Mermaid language server: `@mermaid-js/language-service` over LSP (stdio). It serves `.mmd` and `.mermaid` files, and any document opened with language id `mermaid`. Features: diagnostics (pushed on every change), definition, references, prepare rename and rename, hover, completion (with trigger characters), folding ranges and semantic tokens (UTF-16 positions).

## Setup

```sh
npm install -g @mermaid-js/language-server
mermaid-language-server --stdio
```

Point your editor's LSP client at `mermaid-language-server --stdio` for the `mermaid` language. The server preloads every installed first-party facet while it answers `initialize`, so the first diagnostics are complete. If you embed it, call `startServer(connection)` with a connection of your own. It awaits `service.preload()` the same way.

## Plugins (opt-in)

By default the server serves first-party diagram types only and runs no code from the opened folder (D157). To load third-party diagram facets, the client sends:

```json
{ "initializationOptions": { "mermaid": { "plugins": true } } }
```

The server then scans each workspace folder's own `node_modules` (not ancestor folders) for packages with a `mermaid` manifest that has a `language` entry. It refuses manifest paths outside the package and gives each import 5 seconds. Embedders can pass rows directly with `startServer(connection, { facets })`, and no scan happens then.

## Notes

- **Optional peers and bundlers.** The first-party facets are dynamic imports of optional peers, such as `@mermaid-js/diagram-flowchart/language`. If you bundle the server, include the diagram packages or mark them external; a bundler that cannot resolve one fails the build instead of the server reporting `LANGUAGE_LOAD_FAILED`.
- **Top-level `await` in Vite.** If you bundle `@mermaid-js/language-service` into a browser app with Vite, do not `await service.preload()` at the top level of the entry. The lazy chunks import from the entry chunk, and the page never finishes loading. Wrap the setup in a function instead.
- **Highlighting.** Language support (and so semantic tokens) exists for flowchart only today, and the generated first-paint grammars of the editor adapters are flowchart-only too. Other types get generic features.
