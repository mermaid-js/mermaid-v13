import { describe, expect, it } from 'vitest';
import { writtenName } from './convert.ts';
import { parseTreeView } from './parser.ts';
import { nameForm, plainlyBare, readsBack, type NameLine } from './written.ts';

// The shared name read-back (#578, D487, D488): the facet's rename and the text output write a
// name bare when the parser reads it back so, else in quotes. `plainlyBare` skips the parser
// for plain names; it must never say bare where the parser does not read the name back.

const LINES: NameLine[] = ['indented', 'box-top', 'box-branch'];

const NAMES: [string, boolean][] = [
  ['index.ts', false],
  ['my file.txt', false],
  ['a   b', false],
  ['src', true],
  ['', true],
  ['📦 pkg', true],
  ['中文.md', false],
  ['a-b_c+d@e,f(g)[h]{i}!$=~^', false],
  ['fa:fa-car', false],
  ['a:b', false],
  ['javascript:alert(1)', false],
  ['50% off', false],
  ['a %% c', false],
  ['a ## d', false],
  ['a##b', false],
  ['a #35; b', false],
  ['x :::y', false],
  ['a:::hl', false],
  ['a icon(x)', false],
  ['aicon(x)', false],
  ['  padded ', false],
  [' a', false],
  ['a ', false],
  ['"q', false],
  ["'q", false],
  ['say "hi"', false],
  ["it's", false],
  ['title.txt', false],
  ['title x', false],
  ['accTitle A', false],
  ['accDescrX', false],
  ['treeView-beta', false],
  ['Title', false],
  ['<a href="x">l</a>', false],
  ['a<br>b', false],
  ['x ─ y', false],
  ['│', false],
  ['a├b', false],
  ['a\tb', false],
];

describe('plainlyBare', () => {
  it('says bare only where the parser reads the name back bare, on every line', () => {
    const wrong = NAMES.flatMap(([name, directory]) => {
      const w = writtenName(name, directory);
      if (!plainlyBare(w)) return [];
      return LINES.filter((l) => !readsBack(w, name, directory, l)).map((l) => `${w} on ${l}`);
    });
    expect(wrong).toEqual([]);
  });

  it('earns its keep: the plain names of a file tree skip the parser', () => {
    const plain = ['index.ts', 'my file.txt', 'src/', '📦 pkg/', 'fa:fa-car', '50% off'];
    expect(plain.filter((w) => !plainlyBare(w))).toEqual(['50% off']);
  });
});

describe('nameForm', () => {
  it('writes a name bare when it reads back so, and in a quote it does not hold otherwise', () => {
    expect(nameForm('index.ts', false, '', 'box-branch')).toBe('index.ts');
    expect(nameForm('src', true, '', 'box-top')).toBe('src/');
    expect(nameForm('  padded ', false, '', 'box-branch')).toBeUndefined();
    expect(nameForm('  padded ', false, '"', 'box-branch')).toBe('"  padded "');
    expect(nameForm('a ## d', true, "'", 'indented')).toBe("'a ## d/'");
    expect(nameForm('say "hi"', false, '"', 'indented')).toBeUndefined();
    expect(nameForm("it's", false, "'", 'indented')).toBeUndefined();
  });

  it('reads the name where it stands: a decoration glyph is a name after a branch, not at the top', () => {
    expect(nameForm('│', false, '', 'box-branch')).toBe('│');
    expect(nameForm('│', false, '', 'box-top')).toBeUndefined();
    expect(nameForm('│', false, '"', 'box-top')).toBe('"│"');
    expect(nameForm('title.txt', false, '', 'indented')).toBeUndefined();
  });
});

describe('markdown strings (#1368)', () => {
  const model = (line: string) =>
    parseTreeView(`treeView-beta\n${line}\n`).model.nodes.map((n) => [n.name, n.markdown]);

  it('marks a quoted name wholly in backticks, in either quote, a directory’s `/` aside', () => {
    expect(model('"`**x**`"')).toEqual([['`**x**`', true]]);
    expect(model("'`x`'")).toEqual([['`x`', true]]);
    expect(model('"`src`/"')).toEqual([['`src`', true]]);
  });

  it('marks no bare name, and no quoted name with other text or a backtick inside', () => {
    expect(model('`**x**`')).toEqual([['`**x**`', undefined]]);
    expect(model('"a `x` b"')).toEqual([['a `x` b', undefined]]);
    expect(model('"`a`b`"')).toEqual([['`a`b`', undefined]]);
    expect(model('"**x**"')).toEqual([['**x**', undefined]]);
  });

  it('writes a markdown string in quotes and a plain name in backticks bare, so each reads back', () => {
    for (const line of LINES) {
      expect(nameForm('`x`', false, '', line, true)).toBeUndefined();
      expect(nameForm('`x`', false, '"', line, true)).toBe('"`x`"');
      expect(nameForm('`x`', true, "'", line, true)).toBe("'`x`/'");
      expect(nameForm('`x`', false, '', line)).toBe('`x`');
      expect(nameForm('`x`', false, '"', line)).toBeUndefined();
    }
  });
});
