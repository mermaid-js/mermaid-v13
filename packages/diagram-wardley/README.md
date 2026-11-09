# @mermaid-js/diagram-wardley (v13 alpha)

The Wardley map plugin for Mermaid v13: parser, model, layout and SVG renderer for `wardley-beta`, plus the language facet at `@mermaid-js/diagram-wardley/language`. There is no text output (`format: 'ascii'`) for Wardley maps.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-wardley@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { wardley } from '@mermaid-js/diagram-wardley';

const mermaid = createMermaid({ diagrams: [wardley] });
```

Its options are v12's `wardley-beta` config section, read from `initialize()`, front matter and `%%{init}`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
