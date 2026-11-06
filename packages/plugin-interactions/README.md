# @mermaid-js/plugin-interactions (v13 alpha)

Brings back the v12 click callbacks (flowchart `click A callback`, `call fn()`; class `callback A "fn"`, `click A call fn()`; gantt `click a call fn()`, on the task's bar and label) and the sequence actor menus (`link`, `links`, `properties`, `details`) as a Mermaid v13 extension plugin. Links (`click A "url"`, class `link A "url"`, gantt `click a href "url"`) and tooltips work without it. Without it, actor menus are ignored and the svg is the same either way.

```js
import mermaid from 'mermaid';
import { interactions } from '@mermaid-js/plugin-interactions';

await mermaid.registerExternalDiagrams([interactions]);
```

An actor menu is an HTML `div.actorPopupMenu` (with `data-menu-for="<id>"`) that the plugin puts right after the diagram's `<svg>`, never inside it. It holds a `div.actorPopupMenuPanel` (plus the actor's `properties.class`) with one `a` per link, which opens in a new tab. A click on the actor's top or bottom symbol toggles it, and it opens below the top symbol. With `sequence.forceMenus: true`, every menu is shown all the time. Menu links get the same URL checks as flowchart links (`securityLevel`, `linkSchemes`). A refused link becomes `about:blank`, as in v12.

Binding is keyed on content: calling `bindFunctions` again with the same interactions adds nothing, and calling it with different ones replaces what was bound for that svg. `mount()` rebinds on every render. When one element holds several diagrams, each render binds only its own svg.

Install `@mermaid-js/plugin-interactions@v13-alpha` together with the newest `mermaid@v13-alpha`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
