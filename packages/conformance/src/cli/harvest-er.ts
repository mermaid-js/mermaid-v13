/**
 * Writes `corpus/er-v12-specs.json`: every source v12's ER parser specs passed to
 * `erDiagram.parser.parse`, plus the examples of v12's ER syntax page, read from git at the
 * last v12 commit. They are a parity corpus next to the e2e fixtures (R-TEST-3, DESIGN §13.1).
 *
 * Most ER spec sources are template literals built from loop variables, so a regex over the
 * spec text misses them. Instead each spec file runs here with its imports stubbed: the
 * `describe`/`it` callbacks are called in order, `expect` is inert (it calls a function passed
 * to it, for `toThrow`), and `parse` records its argument.
 *
 * Usage: `pnpm --filter @mermaid-js/conformance harvest:er`
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';

const V12 = 'fa796a943';
const DIR = 'packages/mermaid/src/diagrams/er';
const SPECS = ['parser/erDiagram.spec.js', 'parser/subgraph.spec.js'];
const git = (...args: string[]) =>
  execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });

const items: CorpusItem[] = [];
const seen = new Set<string>();
const add = (id: string, source: string) => {
  if (seen.has(source)) return;
  seen.add(source);
  items.push({ id, source });
};

type Fn = (...args: unknown[]) => unknown;
const noop = (): undefined => undefined;
/** A constructible function, as a Proxy target that `new` may be used on. */
function constructible(): void {
  // Inert: a Proxy target only.
}

/** A value every property access, call and construction of which returns another such value. */
function inert(): unknown {
  const target = constructible as unknown as object;
  const proxy: unknown = new Proxy(target, {
    get: (_, key) => (key === Symbol.toPrimitive ? () => '' : proxy),
    apply: () => proxy,
    construct: () => proxy as object,
  });
  return proxy;
}

function run(file: string, text: string): void {
  let n = 0;
  const record = (source: unknown) => {
    n++;
    if (typeof source === 'string') add(`v12-specs/${file}#${n}`, source);
  };
  const queue: Fn[] = [];
  const hooks: Fn[][] = [[]];
  const call = (fn: Fn, ...args: unknown[]) => {
    try {
      fn(...args);
    } catch {
      // An assertion on the inert DB, or an expected parse error: the source is recorded.
    }
  };
  const describe = (_name: unknown, body: Fn) => {
    hooks.push([...(hooks[hooks.length - 1] ?? [])]);
    call(body);
    hooks.pop();
  };
  const it = (_name: unknown, body: Fn) => {
    const before = [...(hooks[hooks.length - 1] ?? [])];
    queue.push(() => {
      for (const h of before) call(h);
      call(body);
    });
  };
  const each = (rows: unknown[]) => (name: unknown, body: Fn) => {
    for (const row of rows)
      it(name, () => (Array.isArray(row) ? body(...(row as unknown[])) : body(row)));
  };
  Object.assign(it, { each, skip: it, only: it });
  Object.assign(describe, { each, skip: describe, only: describe });
  const beforeEach = (fn: Fn) => hooks[hooks.length - 1]?.push(fn);
  const expect = (value: unknown) => {
    let called = false;
    const matcher: unknown = new Proxy(noop as unknown as object, {
      get: () => matcher,
      apply: () => {
        if (typeof value === 'function' && !called) {
          called = true;
          call(value as Fn);
        }
        return undefined;
      },
    });
    return matcher;
  };
  const erDiagram = { parser: { parse: record, yy: inert() }, parse: record };
  const scope = { describe, it, test: it, beforeEach, afterEach: noop, expect, erDiagram };
  const body = text.replace(/^import .*$/gm, '');
  const names = Object.keys(scope);
  // Free identifiers the specs import (ErDB, setConfig, …) resolve to inert values.
  const free = new Proxy({} as Record<string | symbol, unknown>, {
    has: (_, key) => typeof key === 'string' && !(key in globalThis) && !names.includes(key),
    get: (_, key) => (key === Symbol.unscopables ? undefined : inert()),
  });
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runs v12's own spec text, read from git
  const spec = new Function('__free', ...names, `with (__free) {\n${body}\n}`) as Fn;
  spec(free, ...names.map((k) => scope[k as keyof typeof scope]));
  for (const test of queue) test();
}

for (const file of SPECS) run(file, git('show', `${V12}:${DIR}/${file}`));
const docs = git('show', `${V12}:packages/mermaid/src/docs/syntax/entityRelationshipDiagram.md`);
let k = 0;
for (const m of docs.matchAll(/```mermaid(?:-example)?\n([\s\S]*?)```/g)) {
  add(`v12-docs/entityRelationshipDiagram.md#${++k}`, m[1] ?? '');
}
const out = join(REPO_ROOT, 'packages/conformance/corpus/er-v12-specs.json');
writeFileSync(out, JSON.stringify(items, null, 2) + '\n');
process.stdout.write(`${items.length} sources\n`);
