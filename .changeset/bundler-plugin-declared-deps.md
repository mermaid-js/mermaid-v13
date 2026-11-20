---
'@mermaid-js/bundler-plugin': patch
---

feat: the bundler plugin's build-time scan reads only the packages the app's `package.json` declares (`dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`), so a plugin npm or Yarn hoists as another package's dependency is no longer bundled: add it to your `package.json`. A root with no readable `package.json` discovers nothing and warns once.
