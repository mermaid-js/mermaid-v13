# @mermaid-js/language-service-codemirror

The Mermaid language service in CodeMirror 6, as one `mermaid()` extension: first-paint highlighting per diagram type, diagnostics, completion, hover, folding, semantic tokens, and a facet that reports the AST ids under the cursor (for live previews). Every runtime import is a peer: the `@codemirror/*` and `@lezer/*` packages, `@mermaid-js/language-service` and `@mermaid-js/core`.

## Setup

```sh
npm install @mermaid-js/language-service-codemirror @mermaid-js/language-service @mermaid-js/core \
  @mermaid-js/diagram-flowchart codemirror
```

```ts
import { basicSetup, EditorView } from 'codemirror';
import { mermaid } from '@mermaid-js/language-service-codemirror';

async function start() {
  const view = new EditorView({
    doc: 'flowchart LR\n  A --> B\n',
    extensions: [basicSetup, await mermaid({ onCursorAst: (ids) => highlight(ids) })],
    parent: document.body,
  });
}
void start();
```

`mermaid()` waits for `service.preload()`, so every installed diagram's language support is loaded before the first snapshot. Pass `{ service }` to share one language service between editors, and `{ preload: { types: ['flowchart'] } }` to load fewer facets. Each feature is also exported on its own (`mermaidLanguage`, `mermaidDiagnostics`, `mermaidCompletion`, …).

## First-paint highlighting

Before semantic tokens arrive, the text is coloured by a Lezer parser generated from the diagram type's grammar (flowchart, sequence, class, state and ER). Each type's parser is a file of its own that loads when a document of that type first shows up, so a bundler with code splitting keeps it out of the initial chunk. Call `loadHighlighter('sequence')` to have one ready before the first paint. A type without a parser gets semantic tokens only.

## Limitations

- The `@lezer/lr` peer range is `~1.4.2`: the generated tokenizers read their text through @lezer/lr internals for speed, and that path is tested against 1.4.2 (`src/language.spec.ts`). Another @lezer/lr still works, by a path up to 50× slower.
- Install the diagram packages you edit: each one's language support is an optional peer of `@mermaid-js/language-service` (see its README for bundler notes).
