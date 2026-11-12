---
'@mermaid-js/plugin-interactions': patch
---

fix: click callbacks (`click A call fn()`, `click A callback`, class `callback A "fn"`, gantt `click a call fn()`) now run only with `initialize({ securityLevel: 'loose' })`, as in Mermaid v12. Under any other level the plugin binds no callback and the render adds one `CALLBACK_IGNORED` warning. Links, tooltips and actor menus are unchanged. If you use callbacks, set `securityLevel: 'loose'` next to registering the plugin.
