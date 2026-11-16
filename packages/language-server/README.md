# @mermaid-js/language-server

The Mermaid language server: `@mermaid-js/language-service` over LSP (stdio). It serves `.mmd` and `.mermaid` files, and any document opened with language id `mermaid`.

Every first-party diagram type has language support: flowchart, sequence, class, state, ER, gantt, pie, mindmap, timeline, journey, gitGraph, quadrantChart, requirement, C4, sankey, xychart, packet, block, architecture, kanban, radar, treemap, treeView, venn, ishikawa, railroad, wardley, cynefin, usecase, eventmodeling, agentflow and info. Features:

- diagnostics, pushed on every change with the document version they answer
- definition, references, prepare rename and rename
- document highlights: the other uses of the name under the cursor, its definition marked as a write
- selection ranges: expand and shrink the selection from a name to its statement, its block and the whole text
- document symbols: the outline (also breadcrumbs and go to symbol), each name once at its definition, nested by subgraph, composite state or namespace; a client without hierarchical symbols gets a flat list with container names
- hover
- completion, with trigger characters, in the order the service ranks the items
- folding ranges and semantic tokens

It answers the `textDocument/` requests `definition`, `references`, `documentHighlight`, `prepareRename`, `rename`, `hover`, `completion`, `foldingRange`, `selectionRange`, `documentSymbol` and `semanticTokens/full`, and pushes `textDocument/publishDiagnostics`.

Positions are UTF-16, LSP's default. Sync is incremental.

## Install

```sh
npm install -g @mermaid-js/language-server@v13-alpha
mermaid-language-server --version
```

Install with the `@v13-alpha` tag, which holds the newest alpha. Without a tag, npm installs `latest`, which can point at an older alpha.

The server runs over stdio: start it as `mermaid-language-server --stdio`. It exits when its client closes stdin: with code 0 after `shutdown`, else 1. `--node-ipc`, `--socket` and `--pipe` are refused with an error, so configure your editor's client for stdio.

## Editor setup

Each snippet turns on the `plugins` option, which loads third-party diagram facets from the `node_modules` of the workspace and of its packages (see [Plugins](#plugins-opt-in)). Leave it out to serve first-party types only.

### Neovim (0.11 or newer)

```lua
vim.filetype.add({ extension = { mmd = 'mermaid', mermaid = 'mermaid' } })

vim.lsp.config('mermaid', {
  cmd = { 'mermaid-language-server', '--stdio' },
  filetypes = { 'mermaid' },
  root_markers = { 'package.json', '.git' },
  init_options = { mermaid = { plugins = true } },
})
vim.lsp.enable('mermaid')
```

### Helix (`languages.toml`)

```toml
[language-server.mermaid]
command = "mermaid-language-server"
args = ["--stdio"]
config = { mermaid = { plugins = true } }

[[language]]
name = "mermaid"
scope = "source.mermaid"
file-types = ["mmd", "mermaid"]
language-servers = ["mermaid"]
```

Helix sends `config` as the initialization options.

### `vscode-languageclient` (a VS Code extension of your own)

```ts
import { LanguageClient } from 'vscode-languageclient/node';

const client = new LanguageClient(
  'mermaid',
  'Mermaid',
  { command: 'mermaid-language-server', args: ['--stdio'] },
  {
    documentSelector: [
      { language: 'mermaid' },
      { scheme: 'file', pattern: '**/*.{mmd,mermaid}' },
    ],
    initializationOptions: { mermaid: { plugins: true } },
  }
);
await client.start();
```

Leave `transport` unset, or set it to `TransportKind.stdio`. The IPC, pipe and socket transports are refused.

### Your own Node program

Call `startServer(connection)` with a connection of your own. The server preloads every first-party facet while it answers `initialize`, so the first diagnostics are complete.

## Plugins (opt-in)

By default the server serves first-party diagram types only and runs no code from the opened folder (D157). To load third-party diagram facets, the client sends:

```json
{ "initializationOptions": { "mermaid": { "plugins": true } } }
```

The server then scans each workspace folder's own `node_modules` (not ancestor folders) for packages with a `mermaid` manifest that has a `language` entry. It finds them with the same scan `mermaid` uses to render in Node (`mermaid/node-scan`), so a plugin package is either usable in both or skipped by both, with the same warning in the server's log. It refuses manifest paths outside the package, gives each import 5 seconds, and never lets a package replace a first-party diagram type. When two packages have the same diagram id, the first by package name wins. Embedders can pass rows directly with `startServer(connection, { facets })`, and no scan happens then.

The workspace folders are scanned while the server answers `initialize`. A client that names no workspace folder gets first-party types only, and the server logs one line saying so: it never scans its working directory.

When a `file:` document opens, the server also scans the nearest package root above it, the nearest directory with a `package.json` that names a package or lists dependencies, as `mermaid` finds an app's root in Node. So in a pnpm workspace, a plugin that is a dependency of `packages/foo` (installed in `packages/foo/node_modules`) is found once a document under `packages/foo` opens. The same rules apply: only that package's own `node_modules`, paths confined to each package, 5 seconds per import, and an id another package already holds is skipped. The document opens with the facets found so far; when the scan finds new ones, the server rebuilds its service and pushes fresh diagnostics for every open document.

This happens only for documents inside a workspace folder the client named, and only when the package root lies inside that folder too (symlinks followed). A file opened from elsewhere, or one whose nearest package root is above the folder, never runs code from its `node_modules`. Each package root is scanned once per session. A folder added to the workspace later is not scanned, and neither are packages installed after their root was scanned: restart the server to pick them up.

A third-party facet whose hover, completion or rename code throws gives no hover, no items, or a rename refusal that names the failure. It does not fail the request.

## What it does not do

- **No Markdown.** Mermaid blocks inside Markdown files get nothing. The server serves `.mmd` and `.mermaid` documents only.
- **Stdio only.** There is no IPC, pipe, socket or browser transport.
- **No formatting and no code actions.** The language service has neither.

## Notes

- **Optional peers and bundlers.** The first-party facets are dynamic imports of optional peers, such as `@mermaid-js/diagram-flowchart/language`. If you bundle the server, include the diagram packages or mark them external. A bundler that cannot resolve one fails the build instead of the server reporting `LANGUAGE_LOAD_FAILED`.
- **Top-level `await` in Vite.** If you bundle `@mermaid-js/language-service` into a browser app with Vite, do not `await service.preload()` at the top level of the entry. The lazy chunks import from the entry chunk, and the page never finishes loading. Wrap the setup in a function instead.
