import { afterEach, describe, expect, it, vi } from 'vitest';
import * as simple from './frontmatter-config.ts';
import { preprocess } from './preprocess.ts';
import * as yaml from './yaml.ts';

afterEach(() => vi.restoreAllMocks());

/** Force the original full-reader route without changing source offsets or interpretation. */
function fullReader(src: string) {
  const bypass = vi.spyOn(simple, 'simpleConfig').mockReturnValue(undefined);
  try {
    return preprocess(src);
  } finally {
    bypass.mockRestore();
  }
}

describe('front matter: simple config differential', () => {
  it.each(['\n', '\r\n', '\r'])('bypasses YAML with %j line endings', (nl) => {
    const src = [
      '---',
      'config:',
      '  layout: elk',
      '  theme: dark',
      '  look: handDrawn',
      '---',
      'graph TD',
    ].join(nl);
    const expected = fullReader(src);
    const reader = vi.spyOn(yaml, 'parseYaml');
    expect(preprocess(src)).toStrictEqual(expected);
    expect(reader).not.toHaveBeenCalled();
  });

  it('keeps source ranges, leading blanks, trailing spaces and repeated calls', () => {
    const src = '\n\n--- \nconfig:\n  theme:  neo-dark  \n  layout: ELK2\n---\n\ngraph TD';
    const expected = fullReader(src);
    const actual = preprocess(src);
    expect(actual).toStrictEqual(expected);
    actual.frontMatter!.config!.theme = 'changed';
    expect(preprocess(src)).toStrictEqual(expected);
  });

  it.each([
    'config:\n  theme: true',
    'config:\n  theme: True',
    'config:\n  theme: TRUE',
    'config:\n  theme: false',
    'config:\n  theme: False',
    'config:\n  theme: FALSE',
    'config:\n  theme: null',
    'config:\n  theme: Null',
    'config:\n  theme: NULL',
    'config:\n  theme: ~',
    'config:\n  theme: 0',
    'config:\n  theme: -0',
    'config:\n  theme: 0xFF',
    'config:\n  theme: 1e4',
    'config:\n  theme: .inf',
    'config:\n  theme: .nan',
    'config:\n  theme: 2026-01-01',
    'config:\n  theme: "dark"',
    "config:\n  theme: 'dark'",
    'config:\n  theme: "a\\nb"',
    'config:\n  theme: "unterminated',
    'config:\n  theme: "\\q"',
    'config:\n  theme: dark # comment',
    'config:\n  theme: dark\n# comment',
    'config:\n  theme: dark\n  theme: base',
    'config:\n  theme: dark\n  layout: elk\n  layout: fixed',
    'config:\n  theme:\n    name: dark',
    'config:\n  theme: [dark, base]',
    'config:\n  theme: {name: dark}',
    'config:\n  theme: |\n    dark',
    'config:\n  theme: >\n    dark',
    'config:\n  theme: dark\n    continued',
    'config:\n  theme: dark\n    layout: elk',
    'config:\n  theme: dark\n layout: elk',
    'config:\n\ttheme: dark',
    'config:\n  theme: dark\n\tlook: classic',
    'config:\n  theme: dark\n  __proto__: bad',
    'config:\n  constructor: bad',
    'config:\n  prototype: bad',
    'config:\n  theme: dark\n  true: value',
    'config:\n  theme: dark\n  Null: value',
    'config:\n  theme: &anchor dark',
    'config:\n  theme: *anchor',
    'config:\n  theme: !!str dark',
    'config:\n  theme: @bad',
    'config:\n  theme: `bad',
    'config:\n  theme: dark\u0000',
    'config:\n  theme: dark\u0001',
    'config:\n  theme: café',
    'config:\n  theme: dark\u00a0look',
    'config:\n  theme: dark\n  layout:',
    'config:',
    'config:\n',
    'config:\r\n',
    'config:\n\n',
    '',
    '# empty',
    'title: Hello\nconfig:\n  theme: dark',
    'displayMode: compact\nconfig:\n  theme: dark',
    'config: {theme: dark}',
    '- dark',
    'true',
    'config:\n  theme: dark\n...',
    'config:\n  theme: dark\n---\nconfig:\n  layout: elk',
  ])('preserves full-reader results and diagnostics for %j', (body) => {
    const src = `\n---\n${body}\n---\ngraph TD`;
    const expected = fullReader(src);
    expect(preprocess(src)).toStrictEqual(expected);
  });

  it.each([' ', '  ', '\t'])('uses the full reader for a fence indent of %j', (indent) => {
    const src = ['---', 'config:', '  theme: dark', '---', 'graph TD']
      .map((line) => indent + line)
      .join('\r\n');
    const expected = fullReader(src);
    const reader = vi.spyOn(yaml, 'parseYaml');
    expect(preprocess(src)).toStrictEqual(expected);
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('differentially checks word values, key order and mutations at each source position', () => {
    for (const value of [
      'dark',
      'TRUEish',
      'nullish',
      'yes',
      'No',
      'on',
      'OFF',
      'a-b_c9',
      'Nulls',
    ]) {
      for (const keys of [
        ['theme', 'layout', 'look'],
        ['look', 'theme'],
        ['theme', 'theme'],
      ]) {
        const body = `config:\n${keys.map((key) => `  ${key}: ${value}`).join('\n')}`;
        const src = `---\n${body}\n---\ngraph TD`;
        expect(preprocess(src)).toStrictEqual(fullReader(src));
      }
    }
    const body = 'config:\n  theme: dark\n  layout: elk';
    for (let i = 0; i <= body.length; i++) {
      for (const inserted of [
        '\n',
        '\r',
        '\t',
        ' ',
        ':',
        '#',
        '"',
        "'",
        '\0',
        '{',
        '-',
        '\u007f',
      ]) {
        const src = `---\n${body.slice(0, i)}${inserted}${body.slice(i)}\n---\ngraph TD`;
        expect(preprocess(src), JSON.stringify(src)).toStrictEqual(fullReader(src));
      }
    }
  });
});
