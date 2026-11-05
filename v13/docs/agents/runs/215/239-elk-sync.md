# E1 #239 — ELK synchronous call: result

**Verdict: it works. No stop rule tripped.** elkjs 0.12.0 (v12 develop's lock) lays out synchronously, in-process, with no worker, no timer and no Promise, by calling its in-process worker's dispatcher directly. Over all 80 corpus graphs the output equals elkjs's own `layout()` (Node, Chromium, Firefox), and nothing is scheduled. The layout contract stays synchronous (D172).

Code: `packages/layout-elk/src/sync.ts` (`layoutSync`), spec `src/sync.spec.ts`, fixture `fixtures/v12-elk-corpus.json`, scripts `scripts/capture-v12-corpus.ts`, `scripts/spike-evidence.ts`. The package is `private` with `exports["./sync"]` only. E2 publishes it.

## How it works

`elkjs/lib/elk-worker.min.js` (the GWT build that `elk.bundled.js`, v12's import, wraps as module 2) exports `{ default: FakeWorker, Worker: FakeWorker }` when it loads outside a Web Worker. `FakeWorker` has a public `dispatcher` (`Dispatcher.saveDispatch`), and the dispatcher posts its answer through the `postMessage` it was built with, which calls `fakeWorker.onmessage` synchronously. elkjs's async-ness is just two `setTimeout(…, 0)` hops (`FakeWorker.postMessage`, `PromisedWorker`'s `onmessage`) plus `new ELK()` sending `register` the same way.

`layoutSync` creates one `FakeWorker` lazily, sets `onmessage` to store the answer, sends `register` (the default 9 algorithms, as `new ELK()` does) once, then for each call sends `{cmd:'layout', graph, layoutOptions, options:{logging:false, measureExecutionTime:false}}` through `saveDispatch` and reads the answer before it returns. Errors come back as `{error}`; they are flattened as `ELK` does (`__java$exception` → `cause`) and thrown. Like `layout()` with the in-process worker, it writes positions into the input graph and returns the same object. 0.12.0's dispatcher (`elk-worker.js:79543-79604`) matches 01-v12-elk.md's 0.9.3 description: same commands, same `saveDispatch`, same FakeWorker.

## Corpus

80 graphs = every `e2e/diagrams/**/*.mmd` that selects ELK: ER 43, requirement 24, flowchart 7, state 4, class 2. 04-corpus.md counts 79. Its grep misses `flowchart/pr-check/8368-elk-label-parallel-edge.mmd`, which selects ELK with `%%{init: {'layout': 'elk'}}%%`. Inputs are **v12's own ELK graphs**, not a throwaway adapter: v12 develop's built `packages/mermaid/dist` (develop 63333fd8d, elkjs 0.12.0) is copied, its elk chunk gets two hooks (input at `layout(graph)`, output at the resolver), and each source is rendered with `mermaid.render` in Chromium. Each render makes exactly one `elk.layout()` call. The two class sources hold literal `&lt;&lt;interface&gt;&gt;` (v12's Cypress decoded it as HTML), so the capture decodes `&lt;`/`&gt;` first. Requirement has no v13 package yet; its graphs still exercise ELK.

## Checks

| Check | Node 24.19 | Chromium 151 | Firefox 153 |
| --- | --- | --- | --- |
| `layoutSync` = `new ELK().layout()` (same process, `$H` ignored), 80/80 | yes | yes | yes |
| Same bytes as Node's `layoutSync` output | — | yes | yes |
| Same as v12's own in-browser `layout()` output from the capture | yes (80/80) | — | — |
| `setTimeout`/`setInterval`/`setImmediate`/`queueMicrotask` (+ rAF in pages) calls during the calls | 0 | 0 | 0 |
| Timers while elkjs loads plus the first call (`register`) | 0 | — | — |
| `process.getActiveResourcesInfo()` after the run | `[]` | — | — |

WebKit could not be launched on this machine (Playwright `launch` timed out twice, unrelated to ELK). It is not covered.

The spec (vitest, Node) covers: corpus equality (80 `it.each` rows), `layoutOptions` (defaults under the graph's own options, as in `layout()`), an error (`JsonImportException: Referenced shape does not exist`) thrown with `layout()`'s message, with the next call still working, and no timers/immediates/microtasks on a fresh module instance. A control test checks that the same spy does see `layout()`'s `setTimeout`. The GWT watchdog (`enter_0`, `elk-worker.js:8378`, only when re-entered more than 2 s after the last tick) and `reportToBrowser` (`:8421`, uncaught errors only) never fired, including on the error path. `saveDispatch` catches the error before GWT's entry wrapper would report it.

## Findings for E2

1. **`$H` is not layout output.** GWT stamps `$H`, a process-wide identity-hash counter, on every object it hashes, both in the input graph and in the output. Two `layout()` calls on the same graph differ in `$H` only. Equality above ignores `$H`. The adapter must never read it, and it must not reach the SVG (determinism, R-API-2).
2. **Web Workers: not supported, same as v12.** When the module loads where `document` is undefined and `self` is defined, elkjs binds `self.onmessage` instead of exporting FakeWorker. `layoutSync` then throws `elkjs did not export its in-process worker` (checked in a Chromium Worker). v12's `new ELK()` fails there too. Deno and Bun define `self` with no `document`, so they would take the same branch (not tested).
3. **Shared state.** One FakeWorker per module instance, re-entrancy impossible (sync). `register` happens once, on the first call.
4. **Packaging.** elkjs is CJS: import `elkjs/lib/elk-worker.min.js` by default import (works in Node ESM, esbuild, vitest), with an ambient `.d.ts` (`src/elk-worker.d.ts`). `elk.bundled.js`'s typings are CJS-shaped: the constructor is `.default` under `nodenext`. Publishing needs a `THIRD_PARTY_ALLOWED` entry for `elkjs` in `tools/check-deps` (published plugins may only depend on workspace packages today) and elkjs's license (`EPL-2.0 OR GPL-3.0-or-later`) in the package's notices.
5. **Size.** `sync.ts` + elkjs, esbuild `--minify` ESM: 1,453,221 B, **437,000 B gz** (`elk.bundled.js` alone: 466,718 B gz; the sync path drops elk-api and the Node/web-worker shim). Load: ~65 ms to import in Node, first call ~50 ms (on a busy machine, up to 466/284 ms).

## Time per graph

Median of 5 `layoutSync` runs per graph, after one warm-up call. "Node layout()" is one `await new ELK().layout()` and includes construction, `register` and both timer hops. Firefox's `performance.now()` has 1 ms resolution, and its first graphs include JIT warm-up. The machine was running other agents, so treat absolute numbers as upper bounds. Node totals: sync 143 ms for all 80 (median 0.85 ms, max 10.8 ms); `layout()` 3,235 ms. Chromium: median 0.6 ms, max 6.3 ms. Firefox: median 3 ms, max 213 ms.

| # | Source (under e2e/diagrams/) | nodes/edges | equal | Node sync ms | Node layout() ms | Chromium sync ms | Firefox sync ms |
|---|---|---|---|---|---|---|---|
| 1 | class-diagram/nightly-check/handdrawn/hd-should-render-a-full-class-diagram-using-elk.mmd | 16/11 | yes | 7.72 | 38.84 | 6.3 | 163 |
| 2 | class-diagram/nightly-check/should-render-a-full-class-diagram-using-elk.mmd | 16/11 | yes | 10.78 | 24.66 | 4.3 | 80 |
| 3 | er-diagram/visual-check/a-cyclical-er-diagram-elk-layout.mmd | 3/3 | yes | 1.78 | 170.06 | 1.3 | 3 |
| 4 | er-diagram/visual-check/a-not-so-simple-er-diagram-elk-layout.mmd | 7/8 | yes | 3.44 | 10.50 | 2.5 | 5 |
| 5 | er-diagram/visual-check/a-not-so-simple-er-diagram-without-htmllabels-elk-layout.mmd | 7/8 | yes | 2.84 | 8.75 | 2.2 | 10 |
| 6 | er-diagram/visual-check/an-er-diagram-with-a-recursive-relationship-elk-layout.mmd | 3/3 | yes | 8.62 | 50.79 | 1.2 | 3 |
| 7 | er-diagram/visual-check/an-er-diagram-with-blank-or-empty-labels-elk-layout.mmd | 3/3 | yes | 2.36 | 34.30 | 1 | 2 |
| 8 | er-diagram/visual-check/an-er-diagram-with-bt-direction-elk-layout.mmd | 3/2 | yes | 3.16 | 6.35 | 1.1 | 2 |
| 9 | er-diagram/visual-check/an-er-diagram-with-lr-direction-elk-layout.mmd | 3/2 | yes | 1.20 | 151.46 | 0.8 | 4 |
| 10 | er-diagram/visual-check/an-er-diagram-with-multiple-relationships-between-the-same-two-entities-elk-layout.mmd | 2/2 | yes | 2.64 | 20.37 | 0.8 | 2 |
| 11 | er-diagram/visual-check/an-er-diagram-with-relationships-with-unicode-text-elk-layout.mmd | 2/1 | yes | 0.82 | 5.64 | 0.7 | 2 |
| 12 | er-diagram/visual-check/an-er-diagram-with-relationships-with-unicode-text-without-htmllabels-elk-layout.mmd | 2/1 | yes | 1.24 | 74.94 | 0.8 | 2 |
| 13 | er-diagram/visual-check/an-er-diagram-with-rl-direction-elk-layout.mmd | 3/2 | yes | 1.18 | 34.26 | 0.9 | 2 |
| 14 | er-diagram/visual-check/an-er-diagram-with-tb-direction-elk-layout.mmd | 3/2 | yes | 1.39 | 14.17 | 0.9 | 2 |
| 15 | er-diagram/visual-check/an-er-diagram-with-unicode-text-elk-layout.mmd | 1/0 | yes | 0.44 | 3.97 | 0.4 | 1 |
| 16 | er-diagram/visual-check/an-er-diagram-with-unicode-text-without-htmllabels-elk-layout.mmd | 1/0 | yes | 0.42 | 4.49 | 0.3 | 1 |
| 17 | er-diagram/visual-check/entities-and-attributes-with-big-and-small-entity-names-elk-layout.mmd | 2/1 | yes | 0.85 | 118.58 | 0.6 | 2 |
| 18 | er-diagram/visual-check/entities-and-attributes-with-big-and-small-entity-names-without-htmllabels-elk-layout.mmd | 2/1 | yes | 0.95 | 6.27 | 0.7 | 2 |
| 19 | er-diagram/visual-check/entities-that-have-no-relationships-elk-layout.mmd | 4/2 | yes | 1.98 | 5.71 | 1 | 9 |
| 20 | er-diagram/visual-check/entities-with-aliases-elk-layout.mmd | 6/8 | yes | 9.00 | 9.63 | 2.5 | 6 |
| 21 | er-diagram/visual-check/entities-with-and-without-attributes-elk-layout.mmd | 2/1 | yes | 1.00 | 8.91 | 0.6 | 3 |
| 22 | er-diagram/visual-check/entities-with-attributes-that-begin-with-asterisk-elk-layout.mmd | 2/1 | yes | 0.75 | 12.88 | 0.5 | 31 |
| 23 | er-diagram/visual-check/entities-with-attributes-that-begin-with-asterisk-without-htmllabels-elk-layout.mmd | 2/1 | yes | 0.76 | 128.65 | 0.6 | 3 |
| 24 | er-diagram/visual-check/entities-with-comments-elk-layout.mmd | 2/1 | yes | 0.83 | 9.55 | 0.6 | 2 |
| 25 | er-diagram/visual-check/entities-with-comments-without-htmllabels-elk-layout.mmd | 2/1 | yes | 0.75 | 9.14 | 0.6 | 3 |
| 26 | er-diagram/visual-check/entities-with-entity-name-aliases-elk-layout.mmd | 2/1 | yes | 0.88 | 4.85 | 0.6 | 4 |
| 27 | er-diagram/visual-check/entities-with-generic-and-array-attributes-elk-layout.mmd | 1/0 | yes | 0.39 | 4.05 | 0.4 | 3 |
| 28 | er-diagram/visual-check/entities-with-generic-and-array-attributes-without-htmllabels-elk-layout.mmd | 1/0 | yes | 0.36 | 6.59 | 0.4 | 1 |
| 29 | er-diagram/visual-check/entities-with-keys-and-comments-elk-layout.mmd | 2/1 | yes | 0.76 | 6.41 | 0.6 | 1 |
| 30 | er-diagram/visual-check/entities-with-keys-and-comments-without-htmllabels-elk-layout.mmd | 2/1 | yes | 0.69 | 15.34 | 0.6 | 2 |
| 31 | er-diagram/visual-check/entities-with-keys-elk-layout.mmd | 2/1 | yes | 0.73 | 44.52 | 0.6 | 3 |
| 32 | er-diagram/visual-check/entities-with-keys-without-htmllabels-elk-layout.mmd | 2/1 | yes | 0.80 | 15.22 | 0.5 | 2 |
| 33 | er-diagram/visual-check/entities-with-length-in-attributes-type-elk-layout.mmd | 1/0 | yes | 0.33 | 42.29 | 0.3 | 1 |
| 34 | er-diagram/visual-check/entities-with-length-in-attributes-type-without-htmllabels-elk-layout.mmd | 1/0 | yes | 0.37 | 11.24 | 0.3 | 1 |
| 35 | er-diagram/visual-check/entities-with-styles-applied-from-class-statement-elk-layout.mmd | 2/0 | yes | 0.42 | 16.82 | 0.4 | 1 |
| 36 | er-diagram/visual-check/entities-with-styles-applied-from-class-statement-without-htmllabels-elk-layout.mmd | 2/0 | yes | 0.41 | 10.83 | 0.3 | 2 |
| 37 | er-diagram/visual-check/entities-with-styles-applied-from-style-statement-elk-layout.mmd | 2/0 | yes | 0.41 | 10.06 | 0.4 | 1 |
| 38 | er-diagram/visual-check/entities-with-styles-applied-from-style-statement-without-htmllabels-elk-layout.mmd | 2/0 | yes | 0.50 | 13.98 | 0.4 | 1 |
| 39 | er-diagram/visual-check/entities-with-styles-applied-from-the-default-class-and-other-styles-elk-layout.mmd | 2/0 | yes | 0.60 | 16.69 | 0.4 | 1 |
| 40 | er-diagram/visual-check/er-diagram-with-edge-labels-centered-when-htmllabels-is-false-elk-layout.mmd | 5/5 | yes | 1.60 | 161.10 | 1.1 | 3 |
| 41 | er-diagram/visual-check/er-subgraphs-elk-layout.mmd | 3/1 | yes | 2.12 | 34.54 | 1.6 | 3 |
| 42 | er-diagram/visual-check/nested-er-subgraphs-with-direction-override-elk-layout.mmd | 5/2 | yes | 5.95 | 30.12 | 2.3 | 6 |
| 43 | er-diagram/visual-check/relationship-labels-with-line-breaks-elk-layout.mmd | 5/4 | yes | 2.12 | 11.16 | 1.2 | 4 |
| 44 | er-diagram/visual-check/simple-er-diagram-elk-layout.mmd | 3/2 | yes | 1.15 | 69.20 | 0.9 | 2 |
| 45 | er-diagram/visual-check/simple-er-diagram-without-htmllabels-elk-layout.mmd | 3/2 | yes | 1.21 | 20.33 | 0.9 | 4 |
| 46 | flowchart/nightly-check/elk-container-algorithms/elk-box-layout-with-edges.mmd | 3/3 | yes | 0.59 | 9.94 | 0.1 | 1 |
| 47 | flowchart/nightly-check/elk-container-algorithms/elk-rectpacking-layout-with-edges.mmd | 3/3 | yes | 0.47 | 6.15 | 0.3 | 2 |
| 48 | flowchart/nightly-check/elk-container-algorithms/elk-subgraph-with-box-algorithm.mmd | 6/2 | yes | 1.23 | 127.21 | 0.9 | 5 |
| 49 | flowchart/pr-check/3-layout-elk-subgraphs.mmd | 9/5 | yes | 5.70 | 124.00 | 2.8 | 7 |
| 50 | flowchart/pr-check/8368-elk-label-parallel-edge.mmd | 3/3 | yes | 1.29 | 8.54 | 1 | 2 |
| 51 | flowchart/visual-check/should-keep-the-true-entry-on-top-when-a-back-edge-feeds-it-79.mmd | 6/6 | yes | 1.96 | 197.43 | 1.4 | 19 |
| 52 | flowchart/visual-check/subgraph-titles-wider-than-children.mmd | 8/5 | yes | 3.39 | 164.22 | 2.8 | 16 |
| 53 | requirement/nightly-check/a-not-so-simple-requirement-diagram-elk-layout.mmd | 9/8 | yes | 2.98 | 116.23 | 2.6 | 48 |
| 54 | requirement/nightly-check/a-not-so-simple-requirement-diagram-without-htmllabels-elk-layout.mmd | 9/8 | yes | 2.75 | 106.03 | 2.7 | 13 |
| 55 | requirement/nightly-check/a-requirement-diagram-with-bt-direction-elk-layout.mmd | 2/1 | yes | 0.77 | 63.24 | 0.7 | 3 |
| 56 | requirement/nightly-check/a-requirement-diagram-with-empty-information-elk-layout.mmd | 2/0 | yes | 0.50 | 17.45 | 0.5 | 1 |
| 57 | requirement/nightly-check/a-requirement-diagram-with-lr-direction-elk-layout.mmd | 2/1 | yes | 0.68 | 21.25 | 0.7 | 2 |
| 58 | requirement/nightly-check/a-requirement-diagram-with-rl-direction-elk-layout.mmd | 2/1 | yes | 0.79 | 5.28 | 0.9 | 2 |
| 59 | requirement/nightly-check/a-requirement-diagram-with-tb-direction-elk-layout.mmd | 2/1 | yes | 0.78 | 4.60 | 0.6 | 2 |
| 60 | requirement/nightly-check/a-simple-requirement-diagram-elk-layout.mmd | 2/1 | yes | 0.79 | 149.68 | 0.6 | 2 |
| 61 | requirement/nightly-check/a-simple-requirement-diagram-without-htmllabels-elk-layout.mmd | 2/1 | yes | 0.89 | 13.22 | 0.6 | 2 |
| 62 | requirement/nightly-check/edge-labels-correctly-when-flowchart-htmllabels-is-false-elk-layout.mmd | 4/5 | yes | 1.98 | 104.14 | 1.6 | 6 |
| 63 | requirement/nightly-check/requirements-and-elements-with-and-without-information-elk-layout.mmd | 2/0 | yes | 0.47 | 7.44 | 0.6 | 4 |
| 64 | requirement/nightly-check/requirements-and-elements-with-long-and-short-text-elk-layout.mmd | 2/0 | yes | 5.28 | 5.45 | 0.4 | 5 |
| 65 | requirement/nightly-check/requirements-and-elements-with-long-and-short-text-without-htmllabels-elk-layout.mmd | 2/0 | yes | 1.88 | 36.58 | 0.5 | 2 |
| 66 | requirement/nightly-check/requirements-and-elements-with-markdown-text-elk-layout.mmd | 2/0 | yes | 0.47 | 10.58 | 0.4 | 3 |
| 67 | requirement/nightly-check/requirements-and-elements-with-markdown-text-without-htmllabels-elk-layout.mmd | 2/0 | yes | 0.46 | 19.21 | 0.4 | 3 |
| 68 | requirement/nightly-check/requirements-and-elements-with-quoted-text-for-spaces-elk-layout.mmd | 2/0 | yes | 0.50 | 11.80 | 0.3 | 5 |
| 69 | requirement/nightly-check/requirements-and-elements-with-styles-applied-from-class-statement-elk-layout.mmd | 2/1 | yes | 0.72 | 10.45 | 0.6 | 2 |
| 70 | requirement/nightly-check/requirements-and-elements-with-styles-applied-from-class-statement-without-htmllabels-elk-layout.mmd | 2/1 | yes | 0.71 | 15.81 | 0.5 | 2 |
| 71 | requirement/nightly-check/requirements-and-elements-with-styles-applied-from-classes-with-shorthand-syntax-elk-layout.mmd | 2/1 | yes | 0.83 | 11.98 | 0.8 | 8 |
| 72 | requirement/nightly-check/requirements-and-elements-with-styles-applied-from-classes-with-shorthand-syntax-without-htmllabels-elk-layout.mmd | 2/1 | yes | 0.78 | 11.55 | 0.6 | 2 |
| 73 | requirement/nightly-check/requirements-and-elements-with-styles-applied-from-style-statement-elk-layout.mmd | 2/1 | yes | 0.77 | 15.31 | 0.5 | 2 |
| 74 | requirement/nightly-check/requirements-and-elements-with-styles-applied-from-style-statement-without-htmllabels-elk-layout.mmd | 2/1 | yes | 0.70 | 16.12 | 0.6 | 3 |
| 75 | requirement/nightly-check/requirements-and-elements-with-styles-applied-from-the-default-class-and-other-styles-elk-layout.mmd | 2/1 | yes | 0.86 | 7.48 | 0.5 | 2 |
| 76 | requirement/nightly-check/requirements-and-elements-with-styles-applied-from-the-default-class-and-other-styles-without-htmllabels-elk-layout.mmd | 2/1 | yes | 0.83 | 36.56 | 0.7 | 5 |
| 77 | state-diagram-v2/nightly-check/elk/elk-composite-entry-default-centering.mmd | 12/11 | yes | 5.11 | 93.95 | 4.4 | 213 |
| 78 | state-diagram-v2/nightly-check/elk/elk-notes-keep-their-layout.mmd | 6/3 | yes | 3.22 | 132.43 | 1.6 | 8 |
| 79 | state-diagram-v2/nightly-check/elk/elk-start-end-edge-centering.mmd | 2/1 | yes | 0.67 | 7.06 | 0.5 | 1 |
| 80 | state-diagram-v2/pr-check/composite-with-a-loop-starts-on-its-start-state.mmd | 6/6 | yes | 2.67 | 38.43 | 1.8 | 15 |
