# @mermaid-js/language-service-monaco

The Mermaid language service in the Monaco editor, in one call: the `mermaid` language id, first-paint Monarch tokens per diagram type, markers, and the completion, hover, definition, references, rename, folding and semantic-token providers. `monaco-editor` and `@mermaid-js/language-service` are peers; nothing here imports Monaco at run time (you pass your `monaco` namespace in).

## Setup

```sh
npm install @mermaid-js/language-service-monaco @mermaid-js/language-service @mermaid-js/core \
  @mermaid-js/diagram-flowchart monaco-editor
```

```ts
import * as monaco from 'monaco-editor';
import { registerMermaid } from '@mermaid-js/language-service-monaco';

async function start() {
  const { service } = await registerMermaid(monaco); // preloads the facets first
  monaco.editor.create(document.body, {
    value: 'flowchart LR\n  A --> B\n',
    language: 'mermaid',
    'semanticHighlighting.enabled': true,
  });
}
void start();
```

Options: `{ service }` to use your own language service, `{ preload }` to load fewer facets, `{ languageId }` for another id, `{ delay }` for the marker debounce (150 ms). Calling `registerMermaid` again for the same `monaco` and id returns a handle to the same registration; the providers stay until every handle is disposed. The single providers (`hoverProvider(service)`, …) are exported for hosts that pick features one by one.

## First-paint highlighting

Before semantic tokens arrive, models are coloured by Monarch tokens generated from each diagram type's grammar (flowchart, sequence, class, state and ER). Each type's tokens are a file of their own that loads when a model of that type first shows up, so a bundler with code splitting keeps them out of the initial chunk. A type without tokens gets semantic tokens only.

## Limitations

- Install the diagram packages you edit: each one's language support is an optional peer of `@mermaid-js/language-service` (see its README for bundler notes).
