---
'mermaid': patch
---

feat: the `mermaid` bin takes `--plugin <package>` (repeatable) and `--autoload`. `--plugin` registers a plugin package resolved from the current directory: its default export (or its only plugin export) as a lazy diagram, a diagram plugin or an extension. `--autoload` registers every plugin your `package.json` lists through `@mermaid-js/plugin-autoload`, which it imports from your project only when it is installed; otherwise the command exits with an error naming the package. The bin still has no dependency. Node discovery on the first render now reads only the packages your `package.json` declares (`dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`), so a plugin hoisted as someone else's dependency is no longer found, and it stands down on an instance that `autoload` serves.
