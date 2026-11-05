/**
 * Story 26 (spec #26, #180): the language service runs in a Web Worker, where there is no
 * `window` and no `document`. The spec bundles the service from source (esbuild, the
 * `mermaid-source` condition, every first-party facet) into one ES module, starts it as a
 * module worker from a Blob URL, and asks it over `postMessage` for what an editor host would:
 * diagnostics, completion, hover, rename and folding. Node is covered by the Vitest specs and
 * the main thread by the example editors (codemirror.spec.ts, monaco.spec.ts).
 *
 * Deno is not run here. #180 asks for a Deno smoke test only if Deno is in CI's Playwright
 * image, and it is not: mcr.microsoft.com/playwright:v1.62.1-noble installs Ubuntu noble,
 * Node 24 from NodeSource, git, yarn and the three browsers, and nothing else (its
 * utils/docker/Dockerfile.noble at v1.62.1). The `pnpm e2e` job runs in that image, so a Deno
 * test there would have to download Deno on every run.
 */
import { join } from 'node:path';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

const SERVICE = join(import.meta.dirname, '..', '..', 'packages', 'language-service', 'src');

/**
 * The worker: one service, preloaded once; each message is a document and the offsets to query.
 * It answers with plain data (snapshots do not cross `postMessage`).
 */
const WORKER_ENTRY = `
import { createLanguageService } from './index.ts';
const service = createLanguageService();
const ready = service.preload();
self.onmessage = async ({ data }) => {
  try {
    await ready;
    const doc = service.update(data.uri, data.text);
    const slice = (r) => doc.text.slice(r.start, r.end);
    const rename = doc.rename(data.renameAt, data.newName);
    self.postMessage({
      globals: { window: typeof window, document: typeof document, self: typeof self },
      type: doc.type,
      diagnostics: doc.diagnostics().map((d) => ({ severity: d.severity, text: slice(d.range) })),
      completions: doc.completions(data.completeAt).map((c) => c.label),
      hover: doc.hover(data.hoverAt)?.contents ?? null,
      rename: 'edits' in rename ? rename.edits.map((e) => ({ text: slice(e.range), newText: e.newText })) : rename,
      folds: doc.foldingRanges().map((f) => f.kind ?? null),
    });
  } catch (error) {
    self.postMessage({ error: String(error && error.stack || error) });
  }
};
`;

let bundle = '';
test.beforeAll(async () => {
  const out = await build({
    stdin: { contents: WORKER_ENTRY, resolveDir: SERVICE, sourcefile: 'worker.ts', loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    conditions: ['mermaid-source'],
    logLevel: 'silent',
  });
  bundle = out.outputFiles[0]!.text;
});

interface Query {
  uri: string;
  text: string;
  completeAt: number;
  hoverAt: number;
  renameAt: number;
  newName: string;
}

const FLOWCHART = `flowchart LR
  A[Start] --> B{Ready?}
  subgraph review
    B --> C
  end
  C -->
`;

test('the language service answers from a Web Worker, without DOM globals', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const query: Query = {
    uri: 'file:///worker.mmd',
    text: FLOWCHART,
    completeAt: FLOWCHART.length - 1,
    hoverAt: FLOWCHART.indexOf('B{'),
    renameAt: FLOWCHART.indexOf('A['),
    newName: 'Begin',
  };
  const second: Query = {
    uri: 'file:///worker-seq.mmd',
    text: 'sequenceDiagram\n  Alice->>Bob: hi\n  Bob->>Alice: yo\n',
    completeAt: 0,
    hoverAt: 0,
    renameAt: 'sequenceDiagram\n  '.length,
    newName: 'Carol',
  };
  const answers = await page.evaluate(
    async ({ code, queries }) => {
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const worker = new Worker(url, { type: 'module' });
      const ask = (q: unknown) =>
        new Promise<unknown>((resolve) => {
          worker.onmessage = (event: MessageEvent) => resolve(event.data);
          worker.onerror = (event) => resolve({ error: event.message });
          worker.postMessage(q);
        });
      const out: unknown[] = [];
      for (const q of queries) out.push(await ask(q));
      worker.terminate();
      return out;
    },
    { code: bundle, queries: [query, second] }
  );
  expect(errors).toEqual([]);
  const [flow, seq] = answers as Record<string, unknown>[];
  expect(flow!.error).toBeUndefined();
  // A dedicated worker: `self` exists, the DOM does not.
  expect(flow!.globals).toEqual({ window: 'undefined', document: 'undefined', self: 'object' });
  expect(flow!.type).toBe('flowchart-v2');
  // `C --> ` with no target: one error at the end of the text.
  expect(flow!.diagnostics).toEqual([expect.objectContaining({ severity: 'error' })]);
  expect(flow!.completions).toEqual(expect.arrayContaining(['A', 'B', 'C']));
  expect(flow!.hover).toContain('`B`');
  expect(flow!.rename).toEqual([{ text: 'A', newText: 'Begin' }]);
  expect(flow!.folds).toEqual(['subgraph']);
  // The other facets load in the worker too.
  expect(seq!.error).toBeUndefined();
  expect(seq!.type).toBe('sequence');
  expect(seq!.diagnostics).toEqual([]);
  expect(seq!.rename).toEqual([
    { text: 'Alice', newText: 'Carol' },
    { text: 'Alice', newText: 'Carol' },
  ]);
});
