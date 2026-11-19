/**
 * The registry's detection against the rule it had before it stopped lower-casing the body and
 * searched it for `%%` once a detection (the reference below): the same type or the same error
 * for every generated source, not only flowcharts.
 */
import { describe, expect, it } from 'vitest';
import { MermaidError } from '@mermaid-js/core';
import { detectText, diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { FIRST_PARTY } from './generated/registry.gen.ts';
import { Registry } from './registry.ts';

/** `Registry.detect` as it was, over the first-party rows. */
function detectByOldRule(src: string, pre: PreprocessResult): string {
  const start = diagramStart(src, pre);
  const body = src.slice(start);
  if (body.trimStart().toLowerCase().startsWith('---')) return 'SYNTAX';
  if (body.trim().toLowerCase() === 'error') return 'error';
  let old: string | undefined;
  const v12 = () => (old ??= detectText(src, start, pre, { keepLastLineComment: true }));
  for (const e of FIRST_PARTY) {
    if (e.pattern.test(body) || (body.includes('%%') && e.pattern.test(v12()))) return e.type;
  }
  return 'UNSUPPORTED_DIAGRAM';
}

function detect(registry: Registry, src: string, pre: PreprocessResult): string {
  try {
    return registry.detect(src, pre).type;
  } catch (error) {
    if (error instanceof MermaidError) return error.code;
    throw error;
  }
}

/** Each row's header as written and in other cases, and pieces that cut or hide one. */
const HEADERS = FIRST_PARTY.flatMap(({ pattern }) => {
  const word = /^\^\\s\*\(?([\w-]+)/.exec(pattern.source)?.[1] ?? '';
  return [word, word.toUpperCase(), word.charAt(0).toUpperCase() + word.slice(1)];
});
const PIECES = [
  'error',
  'ERROR',
  'Error',
  'eRRoR',
  'errors',
  '---',
  '-- -',
  '---\ntitle: t\n---\n',
  '---\nconfig:\n  theme: dark\n---\n',
  ' ',
  '\t',
  '\n',
  '\r\n',
  '\r',
  '\u00a0',
  '\ufeff',
  '\u1680',
  '\u2000',
  '\u2028',
  '\u202f',
  '\u3000',
  '\u0130',
  '\u212a',
  '%%',
  '%% c\n',
  '%%comment',
  '%%{init: {}}%%',
  '%%{init: {"theme": "dark"}}%%\n',
  '%%{',
  '}%%',
  'A --> B',
  '#amp;',
  '-',
];

describe('Registry.detect', () => {
  const registry = new Registry(FIRST_PARTY);

  it.each([
    'error',
    ' ERROR \n',
    'Error%%',
    '\u0130rror',
    'e\u0130ror',
    '\u3000Error\u2028\ufeff',
    'error\u180e',
    'errorr',
    '---',
    ' \n---x',
    '\u00a0---',
    '---\ntitle: t\n---\n---',
    '%%{init: {}}%%\n---',
    '%% c\n---',
    'flow%%{init: {}}%%chart\nA',
    'pie %% c',
    'graph\n%% c',
    'gantt%%',
  ])('gives what the old rule gave for %j', (src) => {
    const pre = preprocess(src);
    expect(detect(registry, src, pre)).toBe(detectByOldRule(src, pre));
  });

  it('gives what the old rule gave for every generated source', () => {
    let seed = 5;
    const next = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return (seed >>> 8) % n;
    };
    const kinds = new Set<string>();
    let compared = 0;
    for (let t = 0; t < 20_000; t++) {
      let src = '';
      for (let j = next(6); j >= 0; j--) {
        src += next(3) === 0 ? HEADERS[next(HEADERS.length)] : PIECES[next(PIECES.length)];
      }
      let pre: PreprocessResult;
      try {
        pre = preprocess(src);
      } catch {
        continue;
      }
      const want = detectByOldRule(src, pre);
      if (detect(registry, src, pre) !== want) expect.fail(JSON.stringify(src));
      kinds.add(want);
      compared++;
    }
    expect(compared).toBeGreaterThan(15_000);
    // Every outcome: both errors, `error` and many types.
    expect([...kinds]).toEqual(expect.arrayContaining(['SYNTAX', 'UNSUPPORTED_DIAGRAM', 'error']));
    expect(kinds.size).toBeGreaterThan(30);
  });
});
