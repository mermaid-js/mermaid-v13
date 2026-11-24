/**
 * The simple front matter reader against the YAML reader: for every document it accepts, the
 * YAML reader reads the same value with no diagnostic; everything else it leaves to the YAML
 * reader. Then the same through `preprocess`, which must not tell the two apart.
 */
import { describe, expect, it } from 'vitest';
import { simpleConfig } from './frontmatter-config.ts';
import { preprocess } from './preprocess.ts';
import { parseYaml } from './yaml.ts';

const simple = (doc: string) => simpleConfig(doc, 0, doc.length);

/** The fast reader agrees with the full one: same value, and the full one has no diagnostic. */
function agrees(doc: string): boolean {
  const fast = simple(doc);
  if (fast === undefined) return false;
  const full = parseYaml(doc);
  expect(full.diagnostics).toEqual([]);
  expect(fast).toEqual(full.value);
  // Same key order too: config resolution merges in the order the keys come.
  expect(JSON.stringify(fast)).toBe(JSON.stringify(full.value));
  return true;
}

describe('simpleConfig', () => {
  it.each([
    'config:\n  layout: elk',
    'config:\n  theme: dark\n  layout: fixed',
    'config:\n  look: handDrawn\n  theme: base\n  layout: dagre',
    'config:\n  layout:   elk   ',
    'config:\n  theme: my-theme_2',
    'config:\r\n  layout: elk\r\n  theme: dark',
    'config:\r  layout: elk',
    'config:\n  htmlLabels: nope',
    'config:\n  a1: b',
  ])('reads %j as the YAML reader does', (doc) => {
    expect(agrees(doc)).toBe(true);
  });

  it.each([
    // Not the form: left to the YAML reader, whatever it makes of them.
    ['an empty config', 'config:'],
    ['a trailing space after config:', 'config: \n  layout: elk'],
    ['config with a value', 'config: x'],
    ['a title', 'title: x\nconfig:\n  layout: elk'],
    ['a title after config', 'config:\n  layout: elk\ntitle: x'],
    ['one space in', 'config:\n layout: elk'],
    ['three spaces in', 'config:\n   layout: elk'],
    ['four spaces in', 'config:\n    layout: elk'],
    ['a tab in', 'config:\n\tlayout: elk'],
    ['a tab after the colon', 'config:\n  layout:\telk'],
    ['no space after the colon', 'config:\n  layout:elk'],
    ['a nested map', 'config:\n  flowchart:\n    curve: linear'],
    ['an empty value', 'config:\n  layout:'],
    ['a comment', 'config:\n  layout: elk # why'],
    ['a comment line', 'config:\n  # why\n  layout: elk'],
    ['a blank line', 'config:\n\n  layout: elk'],
    ['a trailing line break', 'config:\n  layout: elk\n'],
    ['double quotes', 'config:\n  layout: "elk"'],
    ['single quotes', "config:\n  layout: 'elk'"],
    ['a quoted key', 'config:\n  "layout": elk'],
    ['a number', 'config:\n  fontSize: 12'],
    ['a dotted value', 'config:\n  layout: elk.stress'],
    ['a value with a space', 'config:\n  theme: my theme'],
    ['true', 'config:\n  useMaxWidth: true'],
    ['True', 'config:\n  useMaxWidth: True'],
    ['FALSE', 'config:\n  useMaxWidth: FALSE'],
    ['null', 'config:\n  theme: null'],
    ['Null', 'config:\n  theme: Null'],
    ['an anchor', 'config:\n  layout: &a elk'],
    ['an alias', 'config:\n  layout: *a'],
    ['a flow map', 'config: { layout: elk }'],
    ['a duplicate key', 'config:\n  layout: elk\n  layout: dagre'],
    ['__proto__', 'config:\n  __proto__: x'],
    ['constructor', 'config:\n  constructor: x'],
    ['prototype', 'config:\n  prototype: x'],
    ['a key with a dash', 'config:\n  my-key: x'],
    ['a key with an underscore', 'config:\n  my_key: x'],
    ['a unicode key', 'config:\n  thème: x'],
    ['a unicode value', 'config:\n  theme: sombreé'],
    ['a byte order mark', '﻿config:\n  layout: elk'],
    ['a document marker', '---\nconfig:\n  layout: elk'],
    ['a value starting with a digit', 'config:\n  theme: 3d'],
  ])('leaves %s to the YAML reader', (_name, doc) => {
    expect(simple(doc)).toBeUndefined();
  });

  it('reads only its range of the source', () => {
    const src = 'xx\nconfig:\n  layout: elk\n  theme: dark\nyy';
    const start = src.indexOf('config');
    const end = src.indexOf('\nyy');
    expect(simpleConfig(src, start, end)).toEqual({ config: { layout: 'elk', theme: 'dark' } });
    expect(simpleConfig(src, start, src.indexOf('\n  theme'))).toEqual({
      config: { layout: 'elk' },
    });
    // A range that ends inside a line is not the form.
    expect(simpleConfig(src, start, end - 1)).toBeUndefined();
  });

  it('agrees with the YAML reader on generated documents', () => {
    const keys = ['layout', 'theme', 'look', 'a', 'constructor', 'b-c', '"q"', 'thème', 'x1'];
    const values = ['elk', 'dark', 'true', 'Null', 'v_1', 'v-2', '3', '"s"', "'s'", 'a b', 'é', ''];
    const seps = [': ', ':  ', ':', ':\t'];
    const ends = ['', ' ', '  ', ' # c', '\t'];
    const indents = ['  ', ' ', '   ', '\t'];
    const breaks = ['\n', '\r\n', '\r'];
    let seed = 7;
    const pick = <T>(list: readonly T[]): T => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return list[seed % list.length]!;
    };
    let accepted = 0;
    for (let n = 0; n < 4000; n++) {
      const br = pick(breaks);
      const lines = [pick(['config:', 'config:', 'config: ', 'title: t'])];
      const count = 1 + (n % 4);
      for (let i = 0; i < count; i++)
        lines.push(pick(indents) + pick(keys) + pick(seps) + pick(values) + pick(ends));
      const doc = lines.join(br);
      const fast = simple(doc);
      if (fast === undefined) continue;
      accepted++;
      expect(agrees(doc)).toBe(true);
    }
    expect(accepted).toBeGreaterThan(100);
  });
});

describe('preprocess with simple front matter', () => {
  it.each([
    '---\nconfig:\n  layout: elk\n---\nflowchart TD\n  A-->B\n',
    '---\r\nconfig:\r\n  theme: dark\r\n  layout: fixed\r\n---\r\nflowchart TD\r\n',
    '﻿---\nconfig:\n  layout: elk\n---\nflowchart TD\n',
    '\n\n---\nconfig:\n  layout: elk\n---\nflowchart TD\n',
    '---   \nconfig:\n  look: handDrawn\n---  \nflowchart TD\n',
  ])('gives what the YAML reader gives for %j', (src) => {
    const r = preprocess(src);
    const fm = r.frontMatter!;
    const full = parseYaml(src, { start: fm.yamlRange.start, end: fm.yamlRange.end });
    expect(r.diagnostics).toEqual([]);
    expect(fm.data).toEqual(full.value);
    expect(fm.config).toEqual((full.value as { config: unknown }).config);
    expect(fm.title).toBeUndefined();
  });

  it('reads front matter inside an indented fence with the YAML reader', () => {
    // The fence's indent is stripped from every line: `  config:` is the form only after that.
    const src = '  ---\n  config:\n    layout: elk\n  ---\nflowchart TD\n';
    expect(preprocess(src).frontMatter?.config).toEqual({ layout: 'elk' });
  });

  it('keeps the YAML reader diagnostics for a form it does not take', () => {
    const src = '---\nconfig:\n  layout: elk\n  layout: dagre\n---\nflowchart TD\n';
    const r = preprocess(src);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['YAML_SYNTAX']);
    expect(r.frontMatter?.data).toBeNull();
  });

  it('drops a prototype key with the YAML reader warning', () => {
    const src = '---\nconfig:\n  __proto__: x\n  layout: elk\n---\nflowchart TD\n';
    const r = preprocess(src);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['YAML_UNSAFE_KEY']);
    expect(r.frontMatter?.config).toEqual({ layout: 'elk' });
  });
});
