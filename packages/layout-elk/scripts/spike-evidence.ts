/**
 * Spike E1 #239 evidence: lays out the v12 ELK corpus with `layoutSync` and with elkjs's own
 * `layout()`, in Node and in Chromium, Firefox and WebKit pages (and a Chromium Web Worker),
 * and prints equality, scheduled timers and time per graph as JSON.
 *
 *   pnpm exec tsx --conditions=mermaid-source packages/layout-elk/scripts/spike-evidence.ts [full]
 *
 * where `full` is the capture script's full output
 * (with v12's own browser results), to compare against as well.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';
import { build } from 'esbuild';
import elkBundled from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import corpus from '../fixtures/v12-elk-corpus.json' with { type: 'json' };

interface Entry {
  source: string;
  input: ElkNode;
  v12Output?: ElkNode | null;
}

const ELK = elkBundled.default;
const RUNS = 5;
const graphs = corpus as unknown as Entry[];
const out = (line: unknown) => process.stdout.write(`${JSON.stringify(line)}\n`);

// The same logic runs in Node and, stringified, in the page, so it carries its own helpers.
async function measure(
  layoutSync: (g: ElkNode) => ElkNode,
  Elk: new () => { layout(g: ElkNode): Promise<ElkNode> },
  entries: { source: string; input: ElkNode }[],
  runs: number
) {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v === null || typeof v !== 'object') return v;
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (k !== '$H') o[k] = strip(x);
    return o;
  };
  const host = globalThis as unknown as Record<string, (...a: unknown[]) => unknown>;
  const names = ['setTimeout', 'setInterval', 'queueMicrotask', 'requestAnimationFrame'];
  const originals = names.map((n) => host[n]);
  const scheduled: string[] = [];
  const t0 = performance.now();
  const results = [];
  for (const { source, input } of entries) {
    const expected = JSON.stringify(strip(await new Elk().layout(structuredClone(input))));
    names.forEach((n, i) => {
      if (originals[i])
        host[n] = (...args: unknown[]) => {
          scheduled.push(`${n} in ${source}`);
          return originals[i]!.apply(globalThis, args);
        };
    });
    const times: number[] = [];
    let actual = '';
    try {
      for (let r = 0; r < runs; r++) {
        const graph = structuredClone(input);
        const start = performance.now();
        const laidOut = layoutSync(graph);
        times.push(performance.now() - start);
        actual = JSON.stringify(strip(laidOut));
      }
    } finally {
      names.forEach((n, i) => {
        if (originals[i]) host[n] = originals[i]!;
      });
    }
    const asyncStart = performance.now();
    await new Elk().layout(structuredClone(input));
    const asyncMs = performance.now() - asyncStart;
    times.sort((a, b) => a - b);
    results.push({
      source,
      equal: actual === expected,
      minMs: times[0] ?? 0,
      medianMs: times[Math.floor(times.length / 2)] ?? 0,
      asyncMs,
      output: actual,
    });
  }
  return { results, scheduled, totalMs: performance.now() - t0 };
}

const stripJson = (v: unknown) =>
  JSON.stringify(v, (k, x: unknown) => (k === '$H' ? undefined : x));

async function main() {
  const capturePath = process.argv[2];
  const v12 = capturePath ? (JSON.parse(readFileSync(capturePath, 'utf8')) as Entry[]) : undefined;

  // Count timers from loading elkjs (GWT init) and the first call (algorithm registration).
  const host = globalThis as unknown as Record<string, (...a: unknown[]) => unknown>;
  const timerNames = ['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask'];
  const saved = timerNames.map((n) => host[n]!);
  const scheduledAtLoad: string[] = [];
  timerNames.forEach((n, i) => {
    host[n] = (...args: unknown[]) => {
      scheduledAtLoad.push(n);
      return saved[i]!.apply(globalThis, args);
    };
  });
  const importStart = performance.now();
  const { layoutSync } = await import('../src/sync.ts');
  const importMs = performance.now() - importStart;
  const firstStart = performance.now();
  layoutSync(structuredClone(graphs[0]!.input));
  const firstCallMs = performance.now() - firstStart;
  timerNames.forEach((n, i) => {
    host[n] = saved[i]!;
  });

  const node = await measure(layoutSync, ELK, graphs, RUNS);
  const nodeOutputs = node.results.map((r) => r.output);
  out({
    host: `node ${process.version}`,
    importMs,
    firstCallMs,
    graphs: node.results.length,
    allEqual: node.results.every((r) => r.equal),
    scheduledAtLoadAndFirstCall: scheduledAtLoad,
    scheduledDuringSyncCalls: node.scheduled,
    activeResourcesAfter: process.getActiveResourcesInfo(),
    equalToV12BrowserLayout: v12
      ? v12.every((e, i) => stripJson(e.v12Output) === nodeOutputs[i])
      : 'not checked',
  });
  for (const r of node.results) {
    const { output: _output, ...row } = r;
    out(row);
  }

  const entry = fileURLToPath(new URL('./spike-browser-entry.ts', import.meta.url));
  const bundle = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    write: false,
    conditions: ['mermaid-source'],
    logLevel: 'silent',
  });
  const script = bundle.outputFiles[0]!.text;
  out({ browserBundleBytes: script.length });

  for (const type of [chromium, firefox, webkit]) {
    let browser;
    try {
      browser = await type.launch({ timeout: 60_000 });
    } catch (error) {
      out({ host: type.name(), launched: false, error: String(error).split('\n')[0] });
      continue;
    }
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>elk sync</title>');
    await page.addScriptTag({ content: script });
    const result = await page.evaluate(
      async ([fn, entries, runs]) => {
        const spike = (window as unknown as { __elkSpike: { layoutSync: never; ELK: never } })
          .__elkSpike;
        // tsx's esbuild wraps named functions in `__name(…)`; the page has no such helper.
        // eslint-disable-next-line @typescript-eslint/no-implied-eval -- spike harness
        const make = new Function('__name', `return (${fn})`) as (
          name: (f: unknown) => unknown
        ) => typeof measure;
        return make((f) => f)(spike.layoutSync, spike.ELK, entries, runs);
      },
      [measure.toString(), graphs.map(({ source, input }) => ({ source, input })), RUNS] as const
    );
    const sameAsNode = result.results.every((r, i) => r.output === nodeOutputs[i]);
    out({
      host: `${type.name()} ${browser.version()}`,
      graphs: result.results.length,
      allEqual: result.results.every((r) => r.equal),
      sameAsNode,
      scheduledDuringSyncCalls: result.scheduled,
      medianMsSum: result.results.reduce((s, r) => s + r.medianMs, 0),
      asyncMsSum: result.results.reduce((s, r) => s + r.asyncMs, 0),
      perGraphMedianMs: result.results.map((r) => Number(r.medianMs.toFixed(2))),
    });

    if (type === chromium) {
      const worker = await page.evaluate(async (code) => {
        const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        return new Promise<string>((resolve) => {
          const w = new Worker(url);
          w.onmessage = (e: MessageEvent<string>) => resolve(String(e.data));
          w.onerror = (e) => resolve(`worker error: ${e.message}`);
        });
      }, `${script}\n;try { __elkSpike.layoutSync({ id: 'r', children: [{ id: 'a', width: 1, height: 1 }] }); postMessage('ok'); } catch (e) { postMessage('threw: ' + e.message); }`);
      out({ host: 'chromium Web Worker', result: worker });
    }
    await browser.close();
  }
}

await main();
