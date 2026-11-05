/**
 * Spike E1 #239: regenerates fixtures/v12-elk-corpus.json.
 *
 * Renders every e2e/diagrams source that selects ELK with v12 develop's built mermaid
 * (`packages/mermaid/dist` of a v12 develop checkout) in Chromium, and records the graph v12's
 * ELK adapter hands to `elk.layout()` and the graph elkjs answers with. The dist is copied first
 * and its elk chunks patched with two hooks (`__elkIn` at `function layout(graph) {`,
 * `__elkOut` before `resolver(null, json.data)`), so the checkout is only read.
 *
 *   pnpm exec tsx packages/layout-elk/scripts/capture-v12-corpus.ts V12_DIST FULL_OUT_JSON
 *
 * The fixture keeps `source` and `input`; the full output also has `v12Output`, which
 * spike-evidence.ts can compare against.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = fileURLToPath(new URL('../fixtures/v12-elk-corpus.json', import.meta.url));
// `layout: elk…` in frontmatter or `'layout': 'elk'` in an init directive.
const SELECTS_ELK = String.raw`^\s*layout:\s*elk|['"]layout['"]\s*:\s*['"]elk|^\s*flowchart-elk`;

/** What the page holds: v12's mermaid and the capture hooks the patched chunks call. */
interface Hooks {
  mermaid: { initialize(c: object): void; render(id: string, text: string): Promise<unknown> };
  __cur: { inputs: unknown[]; outputs: unknown[] };
  __elkIn(g: unknown): void;
  __elkOut(g: unknown): void;
}

function corpusFiles(): string[] {
  const out = execFileSync('git', ['grep', '-lE', SELECTS_ELK, '--', 'e2e/diagrams/*.mmd'], {
    cwd: repo,
    encoding: 'utf8',
  });
  return out.trim().split('\n').sort();
}

function patchedDist(source: string): string {
  const dist = mkdtempSync(join(tmpdir(), 'v12-dist-'));
  cpSync(source, dist, { recursive: true });
  const chunks = join(dist, 'chunks', 'mermaid.esm');
  for (const name of readdirSync(chunks).filter((n) => /^elk-.*\.mjs$/.test(n))) {
    const path = join(chunks, name);
    const code = readFileSync(path, 'utf8')
      .replace(
        'function layout(graph) {',
        'function layout(graph) { globalThis.__elkIn && globalThis.__elkIn(graph);'
      )
      .replace(
        'resolver(null, json.data);',
        'globalThis.__elkOut && globalThis.__elkOut(json.data); resolver(null, json.data);'
      );
    writeFileSync(path, code);
  }
  return dist;
}

async function main() {
  const [v12Dist, fullOut] = process.argv.slice(2);
  if (!v12Dist || !fullOut) throw new Error('usage: capture-v12-corpus.ts <v12-dist> <out.json>');
  const dist = patchedDist(v12Dist);
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><body></body>');
      return;
    }
    try {
      const type = extname(path) === '.mjs' ? 'text/javascript' : 'application/octet-stream';
      res.writeHead(200, { 'content-type': type }).end(readFileSync(join(dist, path)));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${base}/`);
  await page.evaluate(async (url) => {
    const w = window as unknown as Hooks;
    const mermaid = ((await import(`${url}/mermaid.esm.mjs`)) as { default: Hooks['mermaid'] })
      .default;
    w.mermaid = mermaid;
    mermaid.initialize({ startOnLoad: false });
    w.__elkIn = (g: unknown) => w.__cur.inputs.push(JSON.parse(JSON.stringify(g)));
    w.__elkOut = (g: unknown) => {
      if (g && typeof g === 'object') w.__cur.outputs.push(JSON.parse(JSON.stringify(g)));
    };
  }, base);

  const corpus = [];
  for (const file of corpusFiles()) {
    // Two class sources carry literal &lt;&lt;interface&gt;&gt;, which v12's Cypress pages
    // decoded as HTML before mermaid saw them.
    const source = readFileSync(join(repo, file), 'utf8')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>');
    const run = await page.evaluate(async (text) => {
      const w = window as unknown as Hooks;
      w.__cur = { inputs: [], outputs: [] };
      let error: string | undefined;
      try {
        await w.mermaid.render(`d${Math.random().toString(36).slice(2)}`, text);
      } catch (e) {
        error = String(e);
      }
      return { ...w.__cur, error };
    }, source);
    if (run.error || run.inputs.length !== 1) {
      throw new Error(`${file}: ${run.inputs.length} layout calls ${run.error ?? ''}`);
    }
    corpus.push({ source: file, input: run.inputs[0], v12Output: run.outputs[0] ?? null });
  }
  await browser.close();
  server.close();
  writeFileSync(fullOut, JSON.stringify(corpus));
  writeFileSync(
    fixture,
    `${JSON.stringify(
      corpus.map(({ source, input }) => ({ source, input })),
      null,
      2
    )}\n`
  );
  process.stdout.write(`${corpus.length} graphs\n`);
}

await main();
