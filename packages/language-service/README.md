# @mermaid-js/language-service

An editor-agnostic language service for Mermaid: diagnostics, go to definition, references, rename, hover, completion (front-matter `config:` included), folding, semantic tokens, and a cursor ↔ AST map for live previews. It has no runtime dependencies. `@mermaid-js/core` is a peer, and each diagram's language support (its _facet_) is an optional peer that loads on `preload()`.

Use it directly, or through an adapter: `@mermaid-js/language-server` for any LSP editor, `@mermaid-js/language-service-codemirror` for CodeMirror 6, `@mermaid-js/language-service-monaco` for Monaco.

## Setup

```sh
npm install @mermaid-js/language-service @mermaid-js/core @mermaid-js/diagram-flowchart
```

```ts
import { createLanguageService } from '@mermaid-js/language-service';

const service = createLanguageService();
await service.preload(); // load the facets before the first update

const doc = service.update('file:///a.mmd', text); // synchronous, complete, immutable
doc.diagnostics();
doc.completions(offset);
doc.rename(offset, 'NewName'); // { edits } or { refused: reason }
doc.lineFoldingRanges(); // folds by line, as editors show them
doc.lineSemanticTokens(); // tokens cut per line
```

Call `preload()` (or `preload({ types: ['flowchart'] })`) once, before the first `update`. A type whose facet is not loaded gets a `LANGUAGE_NOT_LOADED` diagnostic and generic features only; a facet that fails to load gets `LANGUAGE_LOAD_FAILED`, and one whose parser throws gets `LANGUAGE_FACET_FAILED`. `preload` never rejects.

Positions are UTF-16 offsets into the whole text (front matter included). `doc.lines()` converts to 0-based line and column.

## Third-party diagram types

Pass their rows to `createLanguageService({ facets: [{ type, id, detector, load }] })`. A facet is written against the types this package re-exports (`LanguageFacet`, `ParseResult`, `ProbeResult`, `DocumentView`, `HoverTarget`, …). The shared golden suite runs from `@mermaid-js/language-service/testing` (Node only).

The language server does not load third-party facets by default: a client opts in with `initializationOptions: { mermaid: { plugins: true } }` (D157), so opening an untrusted folder runs none of its code.

## Bundlers

- **Optional peers.** The first-party facets are dynamic imports of optional peers, such as `@mermaid-js/diagram-flowchart/language`. Bundlers resolve them at build time: install the diagram packages you want, or mark the missing ones external. Otherwise the build can fail instead of the service reporting `LANGUAGE_LOAD_FAILED`.
- **No top-level `await` of `preload()` in a Vite entry.** The facet and config-schema chunks import shared code from the entry chunk. An entry that awaits them at top level never finishes loading, with no error. Wrap the setup in a function: `async function start() { await service.preload(); … } void start();`.

## Limitations

- Language support exists for flowchart only. Other types get generic features: comments, directives, and front-matter config.
