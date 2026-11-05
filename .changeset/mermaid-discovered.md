---
'mermaid': patch
---

feat: `mermaid/discovered`, an empty module that `@mermaid-js/bundler-plugin` replaces with the plugins it found at build time; `mermaid` registers them before the first render (`initialize({ discovery: false })` turns them off). Without the plugin nothing changes. `mermaid/node-scan` also exports `FIRST_PARTY_IDS`.
