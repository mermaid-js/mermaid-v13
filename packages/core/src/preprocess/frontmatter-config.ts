/** Conservative recognizer for the common front-matter config document. */
import { lineEnd, newlineAt } from '../parser-kit/scanner.ts';
import type { YamlMap } from './yaml.ts';

const RE_CONFIG_ENTRY = /^ {2}(layout|theme|look): +([A-Za-z][A-Za-z0-9_-]*) *$/;
const RE_TYPED_WORD = /^(?:null|Null|NULL|true|True|TRUE|false|False|FALSE)$/;

/**
 * Common front matter is just a config mapping of layout, theme and look names. Recognize
 * only that complete document, with two-space indentation and plain ASCII word values.
 * Everything else goes to the full reader, including typed words and duplicate keys, so it
 * remains responsible for YAML syntax, diagnostics, unsafe keys and source positions.
 */
export function simpleConfig(src: string, start: number, end: number): YamlMap | undefined {
  const firstEnd = lineEnd(src, start);
  if (src.slice(start, firstEnd) !== 'config:' || firstEnd >= end) return undefined;
  let at = firstEnd + newlineAt(src, firstEnd);
  if (at >= end) return undefined;
  const config: YamlMap = {};
  while (at < end) {
    const to = Math.min(lineEnd(src, at), end);
    const entry = RE_CONFIG_ENTRY.exec(src.slice(at, to));
    if (!entry) return undefined;
    const key = entry[1]!;
    const value = entry[2]!;
    if (RE_TYPED_WORD.test(value) || Object.hasOwn(config, key)) return undefined;
    config[key] = value;
    at = to + newlineAt(src, to);
  }
  return { config };
}
