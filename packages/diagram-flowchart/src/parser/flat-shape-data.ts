import type { YamlMap } from '@mermaid-js/core/preprocess';

// Deliberately narrower than YAML: one line, identifier keys, identifier values or quoted
// ASCII text without escapes. In particular, a plain key's colon needs following whitespace.
const ENTRY =
  /[ \t]*([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:[ \t]+(?:"([^"\\]*)"|'([^'\\]*)'|([A-Za-z_][A-Za-z0-9_-]*))[ \t]*(,|$)/y;
const SPECIAL_SCALAR = /^(?:true|True|TRUE|false|False|FALSE|null|Null|NULL)$/;
const UNSUPPORTED = /[^\x20-\x7e\t]|#/;

/**
 * Reads only unambiguous flat shape data, after the parser's existing token normalization.
 * `undefined` delegates the entire block to YAML, including all warnings and error ranges.
 */
export function readFlatShapeData(text: string): YamlMap | undefined {
  if (UNSUPPORTED.test(text)) return undefined;
  const value: YamlMap = {};
  let pos = 0;
  while (pos < text.length) {
    ENTRY.lastIndex = pos;
    const entry = ENTRY.exec(text);
    if (!entry) return undefined;
    const key = entry[1]!;
    const plain = entry[4];
    if (
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype' ||
      Object.hasOwn(value, key) ||
      SPECIAL_SCALAR.test(key) ||
      (plain !== undefined && SPECIAL_SCALAR.test(plain))
    ) {
      return undefined;
    }
    value[key] = entry[2] ?? entry[3] ?? plain!;
    pos = ENTRY.lastIndex;
    // YAML allows one trailing comma, including whitespace before the closing brace.
    if (entry[5] === ',') {
      while (text[pos] === ' ' || text[pos] === '\t') pos++;
    }
  }
  return value;
}
