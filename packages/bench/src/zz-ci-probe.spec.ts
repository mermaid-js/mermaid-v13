// TEMPORARY CI probe (removed before the PR is ready): logs the R-LANG-4 ratios measured by
// several methods on the hosted runner, under the load of the rest of `pnpm test`.
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { it } from 'vitest';
import { createLanguageService } from '@mermaid-js/language-service';
import { flowchartLanguage } from '@mermaid-js/diagram-flowchart/language';
import { sequenceLanguage } from '@mermaid-js/diagram-sequence/language';
import { bestOfEach, cycle, LANGUAGE_FIXTURE, typing } from './language.ts';
import { SEQUENCE_FIXTURE, sequenceCycle } from './language-sequence.ts';

const procMs = () => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};
const threadMs = () => {
  const u = process.threadCpuUsage();
  return (u.user + u.system) / 1000;
};
let gcFn: ((o?: object) => void) | undefined;
function gc(minor: boolean) {
  if (!gcFn) {
    setFlagsFromString('--expose-gc');
    gcFn = runInNewContext('gc') as (o?: object) => void;
  }
  gcFn(minor ? { type: 'minor' } : undefined);
}

interface Method {
  clock: () => number;
  rounds: number;
  warmup: number;
  gc: false | 'minor' | 'major';
  block: number;
}
const METHODS: Record<string, Method | 'old'> = {
  old: 'old',
  warm: { clock: threadMs, rounds: 40, warmup: 10, gc: false, block: 1 },
  warmproc: { clock: procMs, rounds: 40, warmup: 10, gc: false, block: 1 },
  block: { clock: threadMs, rounds: 40, warmup: 10, gc: false, block: 4 },
  blockminor: { clock: threadMs, rounds: 40, warmup: 10, gc: 'minor', block: 4 },
};

function measure(m: Method, ...fns: ((i: number) => unknown)[]): number[] {
  for (let i = 0; i < m.warmup; i++) for (const fn of fns) fn(i);
  const best = fns.map(() => Infinity);
  for (let i = 0; i < m.rounds; i++) {
    for (const [k, fn] of fns.entries()) {
      if (m.gc) gc(m.gc === 'minor');
      const t = m.clock();
      fn(m.warmup + i);
      best[k] = Math.min(best[k]!, m.clock() - t);
    }
  }
  return best;
}

it('probe', async () => {
  const service = createLanguageService();
  await service.preload({ types: ['flowchart', 'sequence'] });
  for (let rep = 0; rep < 3; rep++) {
    for (const which of ['flowchart', 'sequence'] as const) {
      const flow = which === 'flowchart';
      const texts = typing(flow ? LANGUAGE_FIXTURE : SEQUENCE_FIXTURE);
      const parse = flow
        ? (i: number) => flowchartLanguage.parse(texts(i), { keepTokens: true })
        : (i: number) => sequenceLanguage.parse(texts(i), { keepTokens: true });
      const full = flow
        ? (i: number) => cycle(service, texts(i))
        : (i: number) => sequenceCycle(service, texts(i));
      for (const [name, m] of Object.entries(METHODS)) {
        const k = m === 'old' ? 1 : m.block;
        const parseK = (i: number) => {
          for (let j = 0; j < k; j++) parse(k * i + j);
        };
        const t0 = performance.now();
        const [pk, c] = m === 'old' ? bestOfEach(25, parse, full) : measure(m, parseK, full);
        const p = pk! / k;
        const line = `R-LANG-4-PROBE ${JSON.stringify({ rep, which, method: name, parse: p, cycle: c, ratio: c! / p, ms: Math.round(performance.now() - t0) })}`;
        console.log(line);
      }
    }
  }
}, 600_000);
