// TEMPORARY CI probe helper (removed before the PR is ready).
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { createLanguageService } from '@mermaid-js/language-service';
import { flowchartLanguage } from '@mermaid-js/diagram-flowchart/language';
import { sequenceLanguage } from '@mermaid-js/diagram-sequence/language';
import { cycle, LANGUAGE_FIXTURE, typing } from './language.ts';
import { SEQUENCE_FIXTURE, sequenceCycle } from './language-sequence.ts';

const procMs = () => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};
let gcFn: ((o?: object) => void) | undefined;
function gc(type: 'minor' | 'major') {
  if (!gcFn) {
    setFlagsFromString('--expose-gc');
    gcFn = runInNewContext('gc') as (o?: object) => void;
  }
  gcFn({ type });
}

interface Method {
  rounds: number;
  warmup: number;
  gc?: 'minor' | 'major';
  block?: number;
}
const METHODS: Record<string, Method> = {
  old: { rounds: 25, warmup: 0 },
  warm60: { rounds: 60, warmup: 10 },
  minor: { rounds: 40, warmup: 10, gc: 'minor' },
  major: { rounds: 40, warmup: 10, gc: 'major' },
  block: { rounds: 40, warmup: 10, block: 4 },
};

function samples(m: Method, ...fns: ((i: number) => unknown)[]): number[][] {
  for (let i = 0; i < m.warmup; i++) for (const fn of fns) fn(i);
  const out = fns.map((): number[] => []);
  for (let i = 0; i < m.rounds; i++) {
    for (const [k, fn] of fns.entries()) {
      if (m.gc) gc(m.gc);
      const t = procMs();
      fn(m.warmup + i);
      out[k]!.push(Math.round((procMs() - t) * 1000) / 1000);
    }
  }
  return out;
}

export async function probe(mode: string): Promise<void> {
  const service = createLanguageService();
  await service.preload({ types: ['flowchart', 'sequence'] });
  {
    const texts = typing(LANGUAGE_FIXTURE);
    const t = process.threadCpuUsage();
    const p0 = procMs();
    for (let i = 0; i < 10; i++) flowchartLanguage.parse(texts(i), { keepTokens: true });
    const th = process.threadCpuUsage(t);
    console.log(
      `R-LANG-4-CLOCKS ${JSON.stringify({ mode, proc: procMs() - p0, thread: (th.user + th.system) / 1000 })}`
    );
  }
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
        const k = m.block ?? 1;
        const parseK = (i: number) => {
          for (let j = 0; j < k; j++) parse(k * i + j);
        };
        const t0 = performance.now();
        const [p, c] = samples(m, parseK, full);
        const ms = Math.round(performance.now() - t0);
        console.log(
          `R-LANG-4-RAW ${JSON.stringify({ mode, rep, which, method: name, k, ms, p, c })}`
        );
      }
    }
  }
}
