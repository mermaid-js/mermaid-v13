---
'@mermaid-js/plugin-autoload': patch
---

feat: first release of `@mermaid-js/plugin-autoload`, opt-in plugin discovery for Node. `await autoload(mermaid)` registers the plugins your app's `package.json` lists (`dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`), read from the app's own `node_modules` and registered in package-name order: diagrams, extensions and layouts. Every manifest path must stay inside its package and each import has a time limit. It returns the warnings and never throws for a package's sake: a package that fails to load, has a bad manifest or repeats an id is skipped with a warning and the others still register. A plugin installed only as a dependency of another package is not found: add it to your `package.json`. Call it before the first render.
