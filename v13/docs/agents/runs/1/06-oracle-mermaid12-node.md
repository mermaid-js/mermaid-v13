# 06 — Running `mermaid@12` as a DOM-free oracle in Node (tickets #4, #8)

Everything here was **verified on 2026-11-02** with Node and `npm:mermaid@12.2.0` in a scratch project. The scratch install project was session-local and is gone; `packages/conformance/src/oracle.ts` is the maintained version.

## Installable as an alias? Yes
- `npm view mermaid versions` ends `… 11.17.2, 12.0.0, 12.1.0, 12.2.0`. dist-tags: `latest: 12.2.0`.
- `"mermaid12": "npm:mermaid@12.2.0"` installs fine (117 packages). The pnpm equivalent is `"mermaid12": "npm:mermaid@12.2.0"` in `packages/conformance/package.json` devDependencies. Pin exactly 12.2.0 (the bench "frozen" baseline). The weekly bump job (#4) moves the alias to newer 12.x.
- Note: the root `pnpm-workspace.yaml` has `minimumReleaseAge: 4320` (3 days). That matters for the bump job.
- Exports: `"."` → `dist/mermaid.core.mjs` (deps external: d3, dompurify, khroma, js-yaml…), `"./*"`. Runtime deps of 12.2.0: d3, uuid, dayjs, elkjs, katex, khroma, marked, stylis, roughjs, cytoscape(+fcose, cose-bilkent), d3-sankey, dompurify, ts-dedent, chevrotain ~13.2.0, es-toolkit, dagre-d3-es, @iconify/utils, @upsetjs/venn.js, @mermaid-js/parser ^2.0.1, @braintree/sanitize-url.

## Does parser + db run in Node without jsdom?
- **Importing works with no DOM globals.** `import mermaid from 'mermaid12'` succeeds with `window`/`document` undefined (~100 ms).
- **Parsing a flowchart fails out of the box**: `TypeError: DOMPurify.addHook is not a function`, from `FlowDB.addVertex → sanitizeText → common.sanitizeText → removeScript/DOMPurify` (`packages/mermaid/src/diagrams/common/common.ts:62-97`). Without a `window`, DOMPurify's default export is a bare factory with no `sanitize`/`addHook`.
- Results by DOM shim (set `globalThis.window` before importing mermaid):

| Shim | parse works | Label text vs browser DOMPurify |
|---|---|---|
| jsdom 26 | yes | **matches browser** (`A[<]` → `&lt;`, `<script>` and `onerror` stripped) |
| linkedom | yes | **no sanitising at all** (DOMPurify `isSupported` false → passthrough); `<script>` kept |
| happy-dom | yes | **wrong**: `A[<]` → `""`, `<b>x</b> <br> y` → `<br> y`, edge `<i>e</i>` → `e` |
| **no DOM + `dompurify` stubbed to identity** (Node loader hook, see below) | yes | raw pre-sanitise text (`<`, `<script>…`, `<img … onerror…>` kept verbatim) |

- **Recommendation (inference): stub `dompurify`.** v13 stores label text as written and escapes it at output (as the reference implementation does; see the reference implementation `tests/compat/flowchart/SKIPPED.md`). An identity DOMPurify gives the v12 model in exactly that pre-sanitise form, with no DOM at all. This meets #4's "no jsdom" and makes the normaliser simpler. What it gives up: v12's sanitise-time changes to label text are not part of the oracle comparison. Those belong to the security tests (#12), not to parity.
  - Node: `node --import ./reg.mjs` where `reg.mjs` does `register('./hooks.mjs', import.meta.url)` and `hooks.mjs`'s `resolve()` maps the specifier `'dompurify'` → `purify-stub.mjs` (`{ sanitize: t => t, addHook(){}, removeHook(){}, removeHooks(){}, removeAllHooks(){}, setConfig(){}, isSupported: true }`).
  - Vitest equivalent (untested inference): `test.server.deps.inline: ['mermaid12']` plus `resolve.alias: { dompurify: '<stub>' }`. An externalised dep is resolved by Node, which bypasses Vite aliases, so it has to be inlined. Or set `execArgv: ['--import', reg]` in pool options.
- The repo's current root vitest config uses `environment: 'jsdom'` (`/Users/knsv/repos/mermaid-v13/vite.config.ts`). #2 requires core tests to run with no DOM shim, so give `conformance` its own `environment: 'node'` project.

## Oracle call recipe (verified)
```js
import mermaid from 'mermaid12';
await mermaid.parse('flowchart LR\n A');            // registers diagrams (addDiagrams); required before getDiagramFromText
const r = await mermaid.parse(src);                 // {diagramType:'flowchart-v2', config:{…frontmatter/directive config}} or throws
const d = await mermaid.mermaidAPI.getDiagramFromText(src);   // Diagram; d.type, d.db (FlowDB), d.parser
d.db.getVertices() /* Map */; d.db.getEdges(); d.db.getSubGraphs(); d.db.getClasses(); d.db.getDirection(); d.db.getTooltip(id)
d.db.getAccTitle(); d.db.getAccDescription(); d.db.getDiagramTitle()
```
- `getDiagramFromText` runs the full preprocess (front matter, directives, comments) and `encodeEntities`. So **model text contains entity placeholders**: `A["#quot; &amp; #9829;"]` → `ﬂ°quot¶ß &amp; ﬂ°°9829¶ß`. The normaliser must apply v12's `decodeEntities` (`packages/mermaid/src/utils.ts`, called at `mermaidAPI.ts:366`) or an equivalent.
- Shape errors throw plain `Error('No such shape: blob.')`. Syntax errors are jison errors with `e.hash` (`loc.first_line` etc., `expected`, `token`). Messages say `Parse error on line N:`.
- Caution (inference): `mermaid.initialize`/directives mutate global site config in v12. Call `mermaid.mermaidAPI.reset()` (or `globalReset`) between oracle inputs that carry `%%{init}%%`, or the config could leak into the next input.

## Alternative oracle that needs no npm mermaid at runtime (the reference implementation's approach)
Build the jison parser in-process from the vendored `flow.jison` (`jison` npm). Drive it with a recording `yy`, then compare token streams, accept/reject and the sequence of `yy.*` calls (`pele/tests/support/{jison,oracle,flow-oracle}.ts`; see 02-reference-port.md). This is stricter at the parser level, but it skips FlowDB's semantic checks (shape validation, `destructLink`, subgraph merging). DESIGN §13.1 chose the `mermaid@12` db route. The reference implementation's route is a cheap extra gate for the lexer (#8).
