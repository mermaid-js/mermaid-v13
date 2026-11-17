---
'@mermaid-js/language-server': patch
---

feat: the language server finds plugins with `@mermaid-js/plugin-autoload`, not `mermaid/node-scan`. With `plugins: true` it reads only the packages each workspace folder's `package.json` declares (`dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`); a plugin installed only as a dependency of another package is no longer found. A workspace folder without a readable `package.json` discovers nothing, and the server logs one line saying so. The server no longer depends on `mermaid`.
