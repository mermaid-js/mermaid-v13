# Mermaid LSP for VS Code (dev only)

A minimal VS Code extension that runs [`@mermaid-js/language-server`](../../README.md) over stdio, so maintainers can try the LSP in VS Code. It is private and not published.

It registers the `mermaid` language for `*.mmd` and `*.mermaid` files and leaves every feature to the server: diagnostics, hover, completion, folding, semantic tokens, go to definition, find references and F2 Rename Symbol. There is no TextMate grammar, so all colour comes from semantic tokens.

## Which server it runs

1. `mermaidLsp.serverPath`, when set: a path to the server's `cli.js`.
2. Else the workspace build, `packages/language-server/dist/cli.js`, when it exists.
3. Else `mermaid-language-server` on `PATH` (`npm install -g @mermaid-js/language-server@v13-alpha`).

A `cli.js` runs on VS Code's own Node, so no `node` is needed on `PATH`. The client passes `--stdio` and leaves `transport` unset: the server refuses IPC, pipe and socket. Server logs go to the **Mermaid LSP** output channel.

`mermaidLsp.plugins` sends the server's `{ "mermaid": { "plugins": true } }` initialization option, which loads third-party diagram facets from each workspace folder's `node_modules`. Run **Mermaid LSP: Restart Server** after changing either setting.

## Run it from the repository (F5)

Build the server with its workspace dependencies, and the extension:

```sh
pnpm install
pnpm --filter "@mermaid-js/language-server..." build
pnpm --filter vscode-mermaid-lsp build
```

Open the repository root in VS Code, pick **Run Mermaid LSP extension** in Run and Debug, and press F5. An Extension Development Host opens on [`sample/`](sample/flowchart.mmd). In `flowchart.mmd`:

- put the cursor on `pr` and press F2: every `pr` in the file is renamed. On a keyword, the server refuses with "There is no id or class name here to rename."
- hover `pr` for its label, shape, class and edges; Go to Definition and Find All References work on it too.
- delete the `]` after `Pull request`: a diagnostic says the label is unclosed.
- the `subgraph` folds, and completion at the start of a line offers `subgraph`, `style`, `classDef` and the rest.

Rebuild the extension (`pnpm --filter vscode-mermaid-lsp build`) after editing `src/extension.ts`, and the server after editing its sources, then restart the host.

## Install it as a VSIX

```sh
cd packages/language-server/examples/vscode
pnpm build
pnpm dlx @vscode/vsce package --no-dependencies --skip-license
code --install-extension vscode-mermaid-lsp-0.0.0.vsix
```

The extension is bundled into `dist/extension.cjs`, so `--no-dependencies` is safe. An installed VSIX does not sit next to the workspace build, so set `mermaidLsp.serverPath` to `packages/language-server/dist/cli.js` (absolute path), or install the server on `PATH`.

If another installed extension also registers the `mermaid` language (for Markdown preview or syntax highlighting), both stay active on `.mmd` files; disable the other one if their results mix.
