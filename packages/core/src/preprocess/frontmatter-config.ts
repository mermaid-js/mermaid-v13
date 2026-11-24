/**
 * The front matter most diagrams carry, read without the YAML reader: `config:` alone on the
 * first line, then one or more `  key: value` lines, two spaces in, a word for the key and a
 * plain word for the value. Anything else (comments, quotes, typed words, numbers, nesting,
 * duplicate or prototype keys, tabs, other indents) is left to the full reader, which gives the
 * same value for every document this accepts (`frontmatter-config.spec.ts`).
 */
import { lineEnd, newlineAt } from '../parser-kit/scanner.ts';
import type { YamlMap } from './yaml.ts';

const RE_ENTRY = /^ {2}([A-Za-z][A-Za-z0-9]*): +([A-Za-z][A-Za-z0-9_-]*) *$/;
// Plain words the reader reads as null or a boolean, and keys it drops.
const RE_TYPED = /^(?:null|Null|NULL|true|True|TRUE|false|False|FALSE)$/;
const UNSAFE = /^(?:constructor|prototype)$/;

/** The document `src[start, end)` as the YAML reader reads it, when it has the simple form. */
export function simpleConfig(src: string, start: number, end: number): YamlMap | undefined {
  let at = lineEnd(src, start);
  if (at >= end || src.slice(start, at) !== 'config:') return undefined;
  const config: YamlMap = {};
  do {
    at += newlineAt(src, at);
    const to = lineEnd(src, at);
    const m = to <= end ? RE_ENTRY.exec(src.slice(at, to)) : null;
    if (!m) return undefined;
    const [, key, value] = m as unknown as [string, string, string];
    if (RE_TYPED.test(value) || UNSAFE.test(key) || Object.hasOwn(config, key)) return undefined;
    config[key] = value;
    at = to;
  } while (at < end);
  return { config };
}
