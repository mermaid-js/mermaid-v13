# @mermaid-js/plugin-interactions (v13 alpha)

Brings back the v12 click callbacks (`click A callback`, `call fn()`) and the sequence actor menus (`link`, `links`, `properties`, `details`) as a Mermaid v13 extension plugin. Links (`click A "url"`) work without it. Without it, actor menus are ignored and the svg is the same either way.

```js
import mermaid from 'mermaid';
import { interactions } from '@mermaid-js/plugin-interactions';

await mermaid.registerExternalDiagrams([interactions]);
```

An actor menu is an HTML `div.actorPopupMenu` (with `data-menu-for="<id>"`) that the plugin adds to the element the svg is mounted in, next to the svg. It holds a `div.actorPopupMenuPanel` (plus the actor's `properties.class`) with one `a` per link, opening in a new tab. A click on the actor toggles it. `sequence.forceMenus: true` shows every menu all the time. Menu links get the same URL checks as flowchart links: `securityLevel` and `linkSchemes` apply.

Install `@mermaid-js/plugin-interactions@v13-alpha` together with the newest `mermaid@v13-alpha`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
