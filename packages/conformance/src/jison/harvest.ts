/**
 * Harvests a parity corpus for one jison type (D212, R-TEST-3, DESIGN §13.1): every source
 * v12's specs for the type wrote (how they are found is the descriptor's `harvest.method`),
 * plus the examples of v12's syntax page, read from git at the last v12 commit. The result
 * is committed as `corpus/<type>-v12-specs.json`, next to the e2e fixtures.
 */
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { join, posix } from 'node:path';
import { REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import { JISON_TYPES } from './types.ts';
import type { JisonType, JisonTypeDescriptor } from './types.ts';

/** The last v12 commit of mermaid's own history in this repo. */
export const V12_COMMIT = 'fa796a943';

/** Where `harvest <type>` writes the type's corpus. */
export function harvestPath(type: JisonType): string {
  return join(REPO_ROOT, 'packages/conformance/corpus', `${type}-v12-specs.json`);
}

const git = (...args: string[]) =>
  execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });

/** True when the v12 history the harvest reads is in this clone (a shallow one lacks it). */
export function hasV12History(): boolean {
  try {
    git('cat-file', '-e', `${V12_COMMIT}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

/** The corpus `harvest <type>` writes, in file order, without duplicate sources. */
export function harvest(type: JisonType): CorpusItem[] {
  const { dir, docs, method }: JisonTypeDescriptor['harvest'] = JISON_TYPES[type].harvest;
  const items: CorpusItem[] = [];
  const seen = new Set<string>();
  const add = (id: string, source: string) => {
    if (seen.has(source)) return;
    seen.add(source);
    items.push({ id, source });
  };
  const show = (file: string) => git('show', `${V12_COMMIT}:${file}`);
  const specFiles = () =>
    git('ls-tree', '-r', '--name-only', V12_COMMIT, '--', dir)
      .split('\n')
      .filter((f) => /\.spec\.[jt]s$/.test(f))
      .sort();
  const idOf = (file: string, n: number) => `v12-specs/${file.slice(dir.length + 1)}#${n}`;

  if (method.kind === 'literals') {
    for (const file of specFiles()) {
      let n = 0;
      for (const m of show(file).matchAll(LITERAL)) {
        const raw = m[1] ?? m[2] ?? m[3] ?? '';
        if (!method.header.test(raw) || raw.includes('${')) continue;
        add(idOf(file, ++n), unescape(raw));
      }
    }
  } else if (method.kind === 'chains') {
    for (const file of specFiles()) {
      let n = 0;
      for (const source of chainSources(show(file))) {
        if (method.header.test(source)) add(idOf(file, ++n), source);
      }
    }
  } else {
    for (const spec of method.specs) {
      const file = `${dir}/${spec}`;
      let n = 0;
      const text = show(file);
      const js = file.endsWith('.ts') ? stripTypeScriptTypes(text) : text;
      const globals: Record<string, unknown> = {};
      for (const name of method.identity ?? []) globals[name] = (s: unknown) => s;
      if (method.readsFiles) Object.assign(globals, gitFiles(posix.dirname(file), show));
      runSpec(
        js,
        method.parsers,
        (source) => {
          n++;
          if (typeof source === 'string') add(idOf(file, n), source);
        },
        globals
      );
    }
  }

  const page = show(`packages/mermaid/src/docs/syntax/${docs}`);
  let k = 0;
  for (const m of page.matchAll(/```mermaid(?:-example)?\n([\s\S]*?)```/g)) {
    add(`v12-docs/${docs}#${++k}`, m[1] ?? '');
  }
  return items;
}

// --- literals --------------------------------------------------------------------------------

const LITERAL = /`((?:[^`\\]|\\.)*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;

const SIMPLE: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  0: '\0',
};

/** The value of a JS string literal's body: its escapes decoded, line continuations dropped. */
export function unescape(raw: string): string {
  return raw.replace(
    /\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(\r\n|[\s\S]))/g,
    decodeEscape
  );
}

function decodeEscape(
  _: string,
  cp: string | undefined,
  u: string | undefined,
  x: string | undefined,
  c: string | undefined
): string {
  const hex = cp ?? u ?? x;
  if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
  if (c === undefined || /^[\r\n\u2028\u2029]/.test(c)) return ''; // a line continuation
  return SIMPLE[c] ?? c;
}

// --- chains ----------------------------------------------------------------------------------

const LIT = String.raw`\`(?:[^\`\\]|\\.)*\`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
const PART = new RegExp(LIT, 'g');

/** Every source a spec builds from one literal or a `a + b + …` chain of them. */
function chainSources(text: string): string[] {
  const keywords = keywordsOf(text);
  const out: string[] = [];
  for (const parts of chains(text)) {
    let sources = [''];
    try {
      for (const p of parts) {
        const vs = decodeLiteral(p, keywords);
        sources = sources.flatMap((s) => vs.map((v) => s + v));
      }
    } catch {
      continue;
    }
    out.push(...sources);
  }
  return out;
}

/** The literals of `text`, grouped into `a + b + …` chains. */
function chains(text: string): string[][] {
  const out: string[][] = [];
  let end = -1;
  for (const m of text.matchAll(PART)) {
    const last = out[out.length - 1];
    if (last && /^\s*\+\s*$/.test(text.slice(end, m.index))) last.push(m[0]);
    else out.push([m[0]]);
    end = m.index + m[0].length;
  }
  return out;
}

/**
 * The values of one JS string literal (its escapes decoded): one, or one per keyword for a
 * template whose only interpolation is `${keyword}` (the spec's `it.each(keywords)`).
 */
function decodeLiteral(lit: string, keywords: readonly string[]): string[] {
  const body = lit.slice(1, -1);
  const raw = lit.startsWith('`') ? body : body.replace(/`/g, '\\`');
  if (!lit.startsWith('`') || !body.includes('${')) {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- decodes a JS literal from the v12 specs (trusted repo text)
    return [new Function('return `' + raw + '`')() as string];
  }
  if (body.replace(/\$\{keyword\}/g, '').includes('${')) throw new Error('template');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- decodes a JS literal from the v12 specs (trusted repo text)
  const f = new Function('keyword', 'return `' + raw + '`') as (k: string) => string;
  return keywords.map(f);
}

/** The spec's `const keywords = [...]` list, if it has one. */
function keywordsOf(text: string): string[] {
  const m = /const keywords = (\[[\s\S]*?\n\s*\]);/.exec(text);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- decodes a JS literal from the v12 specs (trusted repo text)
  return m ? (new Function('return ' + (m[1] ?? '[]'))() as string[]) : [];
}

// --- run -------------------------------------------------------------------------------------

/**
 * `fs`, `path` and `__dirname` for a spec in `dir` (repo-relative) that reads files next to it:
 * `fs.readFileSync` reads a repo-relative path from git through `show`.
 */
function gitFiles(dir: string, show: (file: string) => string): Record<string, unknown> {
  return {
    __dirname: dir,
    path: { resolve: (...parts: string[]) => posix.join(...parts) },
    fs: { readFileSync: (file: string) => show(file) },
  };
}

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

/**
 * Runs v12 spec `text` with its imports stubbed: the `describe`/`it` callbacks are called in
 * order, `expect` is inert (it calls a function passed to it, for `toThrow`), and
 * `<name>.parser.parse` / `<name>.parse` call `record` with their argument, for each of
 * `parserNames`. `globals` are more names in the spec's scope (real helpers in place of inert
 * imports). gitGraph's harvest (`../gitgraph/harvest.ts`) runs its spec with it too.
 */
export function runSpec(
  text: string,
  parserNames: readonly string[],
  record: (source: unknown) => void,
  globals: Readonly<Record<string, unknown>> = {}
): void {
  const queue: Fn[] = [];
  const hooks: Fn[][] = [[]];
  const call = (fn: Fn, ...args: unknown[]) => {
    try {
      // An async body fails after its first `await`, past this `try`.
      const result = fn(...args);
      if (result instanceof Promise) result.catch(noop);
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
  const parser = () => ({ parser: { parse: record, yy: inert() }, parse: record });
  const scope: Record<string, unknown> = {
    describe,
    it,
    test: it,
    beforeEach,
    afterEach: noop,
    expect,
    ...Object.fromEntries(parserNames.map((name) => [name, parser()])),
    ...globals,
  };
  const body = stripImports(text);
  const names = Object.keys(scope);
  // Free identifiers the specs import (the DB, setConfig, …) resolve to inert values.
  const free = new Proxy({} as Record<string | symbol, unknown>, {
    has: (_, key) => typeof key === 'string' && !(key in globalThis) && !names.includes(key),
    get: (_, key) => (key === Symbol.unscopables ? undefined : inert()),
  });
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runs v12's own spec text, read from git
  const spec = new Function('__free', ...names, `with (__free) {\n${body}\n}`) as Fn;
  spec(free, ...names.map((k) => scope[k]));
  for (const test of queue) test();
}

/**
 * `text` without its import statements, multi-line ones included (type-only imports went with
 * the types). An import ends at the line holding its module string.
 */
function stripImports(text: string): string {
  const out: string[] = [];
  let inImport = false;
  for (const line of text.split('\n')) {
    if (!inImport && !line.startsWith('import ')) {
      out.push(line);
      continue;
    }
    inImport = !/(?:^import|\bfrom)\s*['"]/.test(line);
    out.push('');
  }
  return out.join('\n');
}
