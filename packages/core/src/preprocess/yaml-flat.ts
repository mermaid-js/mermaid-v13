/**
 * Flowchart shape data (`A@{ shape: rect }`) without the YAML reader (#277): a flat
 * `key: value` list on one line, read as `parseYaml` reads `{\n<data>\n}`. Anything else (and
 * anything `parseYaml` would warn about or reject) gives undefined, and the caller reads it with
 * `parseYaml`.
 */
import { HASH, SPACE } from '../parser-kit/char-codes.ts';
import type { YamlMap, YamlValue } from './yaml-nodes.ts';
import { plainNumber, unescapeDouble } from './yaml-scalar.ts';

const RE_KEY = /[A-Za-z_][\w-]*/y;
// A plain value that cannot hold an indicator: no `:`, quotes, brackets or commas; or `~` alone.
const RE_PLAIN = /~(?= *(?:,|$))|(?:\w|[-+.][\w.])[\w .+-]*/y;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const WORDS = new Map<string, YamlValue>([
  ['~', null],
  ['null', null],
  ['Null', null],
  ['NULL', null],
  ['true', true],
  ['True', true],
  ['TRUE', true],
  ['false', false],
  ['False', false],
  ['FALSE', false],
]);
// Thrown by `unescapeDouble` for an escape it refuses: the value is the reader's to report.
const NOT_FLAT = new Error('not flat shape data');

/** Whether `s` holds a line break, a tab, any other C0 control, or `#` (a comment): the reader's. */
function readerOnly(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < SPACE || c === HASH) return true;
  }
  return false;
}

function spaces(s: string, i: number): number {
  while (s[i] === ' ') i++;
  return i;
}

/** A quoted value at `i`, `[value, end]`, or undefined when it is not closed or not plain text. */
function quoted(s: string, i: number): [string, number] | undefined {
  const q = s[i];
  let j = i + 1;
  if (q === '"') {
    while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1;
    if (j >= s.length) return undefined;
    try {
      return [
        unescapeDouble(s.slice(i + 1, j), () => {
          throw NOT_FLAT;
        }),
        j + 1,
      ];
    } catch (e) {
      if (e === NOT_FLAT) return undefined;
      throw e;
    }
  }
  for (; j < s.length; j++) {
    if (s[j] !== "'") continue;
    if (s[j + 1] !== "'") break;
    j++;
  }
  if (j >= s.length) return undefined;
  return [s.slice(i + 1, j).replace(/''/g, "'"), j + 1];
}

/** A plain value at `i`, typed as the reader types it, `[value, end]`, or undefined. */
function plain(s: string, i: number): [YamlValue, number] | undefined {
  RE_PLAIN.lastIndex = i;
  const m = RE_PLAIN.exec(s);
  if (!m) return undefined;
  const text = m[0].trimEnd();
  const word = WORDS.get(text);
  if (word !== undefined) return [word, i + m[0].length];
  const c = text[0] ?? '';
  const numeric = c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9');
  return [numeric ? (plainNumber(text) ?? text) : text, i + m[0].length];
}

/** `data` as a flat mapping, or undefined for `parseYaml` to read. */
export function flatYamlMap(data: string): YamlMap | undefined {
  if (readerOnly(data)) return undefined;
  const out: YamlMap = {};
  let i = spaces(data, 0);
  if (i >= data.length) return undefined;
  for (;;) {
    RE_KEY.lastIndex = i;
    const key = RE_KEY.exec(data)?.[0];
    if (key === undefined) return undefined;
    i += key.length;
    if (data[i] !== ':' || data[i + 1] !== ' ') return undefined;
    if (WORDS.has(key) || UNSAFE.has(key) || Object.hasOwn(out, key)) return undefined;
    i = spaces(data, i + 1);
    const c = data[i];
    const read = c === '"' || c === "'" ? quoted(data, i) : plain(data, i);
    if (!read) return undefined;
    out[key] = read[0];
    i = spaces(data, read[1]);
    if (i >= data.length) return out;
    if (data[i] !== ',') return undefined;
    i = spaces(data, i + 1);
    if (i >= data.length) return undefined;
  }
}
