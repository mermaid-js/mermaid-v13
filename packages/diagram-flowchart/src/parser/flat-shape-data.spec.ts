import { describe, expect, it, vi } from 'vitest';
import { parseYaml } from '@mermaid-js/core/preprocess';
import * as flat from './flat-shape-data.ts';
import { parseFlowchart } from './parser.ts';

const supported = [
  '',
  'shape: rect',
  '\tshape\t: cyl, label: "Disk", ',
  'shape: rounded, label: "a, b: [c] {d}"',
  "label: 'single quoted text', shape: hex",
  'label: "", shape: rect',
  "label: 'true', shape: rect",
  'label: "123", shape: rect',
  'label: "a<b/>c", shape: rect',
  'toString: value, hasOwnProperty: value, shape: rect',
];

const fallback = [
  ' ',
  'shape:rect',
  '"shape": rect',
  'shape: rect, label: two words',
  'label: "escaped \\" quote"',
  'label: "line\\nfeed"',
  'label: "\\x41\\u0042\\U00000043"',
  'label: "bad\\q"',
  "label: 'it''s quoted'",
  "label: 'back\\slash'",
  'shape: rect # comment',
  'label: "# inside quotes"',
  'shape: rect\nlabel: hello',
  'label: "line\n  feed"',
  'label: "carriage\rreturn"',
  'label: café',
  'label: "♥"',
  'label: "\0"',
  'label: "\u007f"',
  'label: "\ud800"',
  'label: "\udc00"',
  'label: "\uffff"',
  ...[
    'true',
    'True',
    'TRUE',
    'false',
    'False',
    'FALSE',
    'null',
    'Null',
    'NULL',
    '~',
    '0',
    '-0',
    '+3',
    '0xff',
    '0o77',
    '0b11',
    '1.2',
    '1e3',
    '.inf',
    '-.Inf',
    '.NaN',
    '',
  ].map((value) => `label: ${value}`),
  'true: hello',
  'null: hello',
  'shape: rect, shape: circle',
  '__proto__: hello, shape: rect',
  'constructor: hello, shape: rect',
  'prototype: hello, shape: rect',
  'label: [a, b]',
  'label: {a: b}',
  'label: &anchor hello',
  'label: *anchor',
  'label: !tag hello',
  'label: |\n  hello',
  'label: >\n  hello',
  'label: %hello',
  'label: @hello',
  'label: `hello',
  'label: "unclosed',
  "label: 'unclosed",
  'shape: rect,, label: hello',
  ',shape: rect',
  'shape: rect label: hello',
  'label: "hello" extra',
  'shape:',
  'shape: rect, missing',
];

describe('flat shape data', () => {
  it.each(supported)('matches the full YAML value for %j', (text) => {
    const yaml = parseYaml(`{\n${text}\n}`);
    expect(yaml.diagnostics).toEqual([]);
    expect(flat.readFlatShapeData(text)).toStrictEqual(yaml.value);
  });

  it.each(fallback)('delegates %j to YAML', (text) => {
    expect(flat.readFlatShapeData(text)).toBeUndefined();
  });

  it('matches YAML across combinations of keys, values and separators', () => {
    for (const key of ['shape', 'label', 'toString', '_key', 'key-2']) {
      for (const value of ['rect', 'a-b', '_text', '"hello, world"', "'value'", '""']) {
        for (const space of [' ', '\t', '  ']) {
          for (const suffix of ['', ',', ', ', ',\t']) {
            const text = `${space}${key}${space}:${space}${value}${suffix}`;
            expect(flat.readFlatShapeData(text)).toStrictEqual(parseYaml(`{${text}}`).value);
          }
        }
      }
    }
  });

  it.each([...supported, ...fallback])('preserves the complete parse result for %j', (text) => {
    const source = `flowchart TD\n A@{${text}} --> B\n C --> D\n`;
    const actual = parseFlowchart(source, { keepTokens: true });
    const bypass = vi.spyOn(flat, 'readFlatShapeData').mockReturnValue(undefined);
    try {
      expect(actual).toStrictEqual(parseFlowchart(source, { keepTokens: true }));
    } finally {
      bypass.mockRestore();
    }
  });

  it('preserves joined blocks and normalized multiline quoted labels', () => {
    for (const source of [
      'flowchart TD\n A@{shape: cyl,}@{label: Disk}',
      'flowchart TD\n A@{shape: cyl}@{label: Disk}',
      'flowchart TD\n A@{shape: rect, label: "line\n  feed"}',
      'flowchart TD\n A@{shape: rect, label: "line\r\n  feed"}',
    ]) {
      const actual = parseFlowchart(source, { keepTokens: true });
      const bypass = vi.spyOn(flat, 'readFlatShapeData').mockReturnValue(undefined);
      try {
        expect(actual).toStrictEqual(parseFlowchart(source, { keepTokens: true }));
      } finally {
        bypass.mockRestore();
      }
    }
  });

  it('delegates long malformed identifiers, whitespace and unterminated quotes', () => {
    const word = 'a'.repeat(50_000);
    const blanks = ' '.repeat(50_000);
    for (const text of [
      `${word}${blanks}!`,
      `shape:${blanks}!`,
      `label: ${word}${blanks}!`,
      `label: "${word}${blanks}`,
      `label: '${word}${blanks}`,
      `${blanks},`,
    ]) {
      expect(flat.readFlatShapeData(text)).toBeUndefined();
      const source = `flowchart TD\n A@{${text}}`;
      const actual = parseFlowchart(source);
      const bypass = vi.spyOn(flat, 'readFlatShapeData').mockReturnValue(undefined);
      try {
        expect(actual).toStrictEqual(parseFlowchart(source));
      } finally {
        bypass.mockRestore();
      }
    }
  });
});
