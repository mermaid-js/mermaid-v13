# @mermaid-js/language-server

The Mermaid language server: `@mermaid-js/language-service` over LSP (stdio). It serves `.mmd` and `.mermaid` files, and any document opened with language id `mermaid`. On opt-in it also serves the Mermaid fences of Markdown documents (see [Markdown](#markdown-opt-in)).

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

Each snippet turns on the `plugins` option, which loads third-party diagram facets from the workspace's `node_modules` (see [Plugins](#plugins-opt-in)). Leave it out to serve first-party types only.

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

The server then scans each workspace folder's own `node_modules` (not ancestor folders) for packages with a `mermaid` manifest that has a `language` entry. It refuses manifest paths outside the package and gives each import 5 seconds. Embedders can pass rows directly with `startServer(connection, { facets })`, and no scan happens then.

A third-party facet whose hover, completion or rename code throws gives no hover, no items, or a rename refusal that names the failure. It does not fail the request.

## Markdown (opt-in)

By default the server ignores Markdown documents. To get diagnostics, hover, completion, definition, references, rename, highlights, selection ranges and the outline inside the Mermaid fences of Markdown files, the client sends:

```json
{ "initializationOptions": { "mermaid": { "markdown": true } } }
```

The server then serves documents named `.md`, `.markdown` or `.mdx`, and any document opened with language id `markdown` or `mdx`. It finds each fence whose info string starts with `mermaid`, with backticks or tildes, at any indent (a fence inside a list item is indented):

````markdown
1. The flow:

   ```mermaid
   flowchart LR
     A --> B
   ```
````

Each fence is a diagram of its own: completion offers the ids of that fence only, and a rename edits that fence only. Positions are those of the Markdown file. Outside the fences every request answers nothing, and no edit touches the prose. A fence inside a block quote (`> `) is not read.

Your editor's Markdown server probably answers folding ranges and semantic tokens for the same file, and some clients use only one server's answer. So the server leaves both to it for Markdown documents. To get them for the fences from this server too, add `markdownTokensAndFolding`:

```json
{ "initializationOptions": { "mermaid": { "markdown": true, "markdownTokensAndFolding": true } } }
```

`markdownTokensAndFolding` does nothing without `markdown`. Add the Markdown documents to your client's document selector as well, for example `{ language: 'markdown' }` for `vscode-languageclient` or `filetypes = { 'mermaid', 'markdown' }` for Neovim.

## What it does not do

- **Markdown only on opt-in.** Without `mermaid.markdown`, Mermaid fences inside Markdown files get nothing (see [Markdown](#markdown-opt-in)).
- **Stdio only.** There is no IPC, pipe, socket or browser transport.
- **No formatting and no code actions.** The language service has neither.

## Notes

- **Optional peers and bundlers.** The first-party facets are dynamic imports of optional peers, such as `@mermaid-js/diagram-flowchart/language`. If you bundle the server, include the diagram packages or mark them external. A bundler that cannot resolve one fails the build instead of the server reporting `LANGUAGE_LOAD_FAILED`.
- **Top-level `await` in Vite.** If you bundle `@mermaid-js/language-service` into a browser app with Vite, do not `await service.preload()` at the top level of the entry. The lazy chunks import from the entry chunk, and the page never finishes loading. Wrap the setup in a function instead.
