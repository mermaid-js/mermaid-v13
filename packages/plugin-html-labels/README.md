# @mermaid-js/plugin-html-labels (v13 alpha)

HTML labels for Mermaid v13, as v12 drew them with `htmlLabels: true`: raw HTML in a label is rendered, and a markdown string becomes HTML. Without the plugin, v13 draws every label as SVG text and drops HTML tags other than bold, italic and `<br>`.

```js
import mermaid from 'mermaid';
import { htmlLabels } from '@mermaid-js/plugin-html-labels';

await mermaid.registerExternalDiagrams([htmlLabels]);
await mermaid.run(); // labels are HTML from here on
```

Registering the plugin turns HTML labels on. `htmlLabels: false` turns them off, as in v12; the plugin's own config key is `html.labels`. Diagram text can set it too, as in v12. To keep that to your page, list the key in `secure`: `mermaid.initialize({ secure: ['html'] })`.

Coming from v12: [the migration guide](https://github.com/mermaid-js/mermaid-v13/blob/mermaid-v13/v13/docs/MIGRATION.md#html-labels).

Install `@mermaid-js/plugin-html-labels@v13-alpha` together with the newest `mermaid@v13-alpha`.

## The svg string holds no HTML

`mermaid.render()` still returns a string that is safe to insert with no sanitizer. Each HTML label is a sized placeholder in it. The HTML enters the page when the diagram is mounted:

- `mermaid.run()` and `mermaid.mount()` do it for you.
- If you insert the string yourself, call `bindFunctions` on the result, as v12 pages did for click callbacks:

  ```js
  const result = await mermaid.render('id', text);
  element.innerHTML = result.svg;
  result.bindFunctions?.(element);
  ```

- For a string you stored and insert later, call `mountHtmlLabels`:

  ```js
  import { mountHtmlLabels } from '@mermaid-js/plugin-html-labels';

  element.innerHTML = storedSvg;
  mountHtmlLabels(element); // pass { linkSchemes } if you set them for the render
  ```

Until it is mounted, the diagram shows no label text. If you export the string, or show it through `<img>`, set `htmlLabels: false`.

## What a label may hold

Every label goes through [DOMPurify](https://github.com/cure53/DOMPurify) before it enters the page, when it is measured and again when it is mounted. The sanitizer cannot be turned off or configured.

- **Elements:** text formatting (`b`, `i`, `u`, `s`, `em`, `strong`, `code`, `sub`, `sup`, `small`, `mark`, `span`, `font` and the like), blocks (`div`, `p`, `h1` to `h6`, `blockquote`, `pre`, `hr`, `br`), lists, tables, `a` and `img`. The full list is the exported `ALLOWED_TAGS`.
- **Links and images:** `href` and `src` pass the same check as Mermaid's own links: relative URLs and the schemes in `linkSchemes` (http, https and mailto by default). A link that opens a new window gets `rel="noopener noreferrer"`.
- **Styles:** a `style` attribute is kept, without declarations that position the element or load something (`url(…)`).
- **Anything else** shaped like a tag, such as `List<T>` or `<iframe>`, is shown as written. `<script>` and `<style>` are dropped with what they hold.

Mermaid draws no style sheet. A label takes the font and text colour of the diagram; its wrapper has the class `html-label` if your page wants to style it.

## Where labels stay SVG

- Outside a browser (Node, a worker), in a deterministic render (`deterministic: true`) and in text output. The output is then the same as without the plugin.
- A label with math (`$$…$$`) or an icon (`fa:…`), so `@mermaid-js/plugin-math` and `@mermaid-js/plugin-icons` still draw it.
- Text a diagram draws without Mermaid's label layout: info, railroad, sankey, treeView and wardley diagrams, and secondary text in gantt, kanban, class, packet, quadrant, sequence, treemap and xychart.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
