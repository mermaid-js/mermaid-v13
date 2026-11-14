---
'@mermaid-js/language-server': patch
---

fix: the language server exits when its editor closes stdin, prints `--version`, refuses the IPC, pipe and socket transports, sends the document version with its diagnostics, syncs changes incrementally, keeps the service's completion order in every LSP editor, and its README now covers every diagram type and shows Neovim, Helix and `vscode-languageclient` setups (#805, #806, #807, #812).
