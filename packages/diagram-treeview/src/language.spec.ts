import { describe, expect, it } from 'vitest';
import { language, parseTreeView, treeViewLanguage } from './language.ts';

/**
 * The treeView language facet (#576) at its own seam: its shape, `isValidId` and its name
 * syntax (D487). Completion, hover and everything the service builds on the parse (definition,
 * references, rename, folding, semantic tokens) are in the goldens
 * (`packages/language-service/goldens/treeView`), which read their diagram sources from `.mmd`
 * files.
 */
describe('treeView language facet', () => {
  it('is the treeView facet, exported under the fixed name `language` (D487)', () => {
    expect(language).toBe(treeViewLanguage);
    expect(treeViewLanguage.id).toBe('treeView');
    expect(treeViewLanguage.namespaces).toEqual([['node']]);
    expect(treeViewLanguage.standalone).toEqual(['node']);
  });

  it.each([
    ['index.js', undefined],
    ['my file', undefined],
    [' padded ', undefined],
    ['say "hi"', undefined],
    ["it's", undefined],
    ['', 'A name cannot be empty.'],
    ['  ', 'A name cannot be empty.'],
    ['a\nb', 'A name cannot hold a line break.'],
    ['a\r\nb', 'A name cannot hold a line break.'],
    [
      'lib/',
      '`lib/` ends with `/`, which would make the node a directory: write the name without it (a directory keeps its own `/`).',
    ],
    [
      `"it's"  `,
      '`"it\'s"  ` cannot be written: it holds both `"` and `\'`, so neither quote can hold it, and it cannot be written bare either.',
    ],
  ])('isValidId(%j) (D487)', (name, reason) => {
    expect(treeViewLanguage.isValidId(name, 'node')).toBe(reason);
  });

  const syntax = treeViewLanguage.nameSyntax!;
  /** The parser's symbol of the node named `name` in `text`. */
  const symbol = (text: string, name: string) =>
    parseTreeView(text).symbols.find((s) => s.name === name)!;
  const inner = (text: string, name: string) => {
    const start = text.indexOf(name);
    return { start, end: start + name.length };
  };

  it.each([
    ['index.js', 'index.js', undefined],
    ['src/', 'src', undefined],
    ['"my file"', 'my file', '"'],
    ["'my dir/'", 'my dir', "'"],
  ])('reads %j as %j (quote %j)', (written, name, quote) => {
    const text = `treeView-beta\n  ${written} :::highlight`;
    const read = syntax.read(text, symbol(text, name));
    expect(read).toEqual({ range: inner(text, name), ...(quote ? { quote } : {}) });
  });

  it('drops a name written otherwise than it reads (an entity placeholder)', () => {
    const text = 'treeView-beta\n  a#amp;b';
    expect(syntax.read(text, symbol(text, 'a&amp;b'))).toBeUndefined();
  });

  /** The text after one rename of `name` in `text` to `newName`. */
  const renamed = (text: string, name: string, newName: string) => {
    const read = syntax.read(text, symbol(text, name))!;
    const e = syntax.write(newName, read, text);
    return text.slice(0, e.range.start) + e.newText + text.slice(e.range.end);
  };

  it.each([
    ['  index.js :::highlight', 'index.js', 'main.ts', '  main.ts :::highlight'],
    ['  src/', 'src', 'lib', '  lib/'],
    ['  index.js', 'index.js', 'my file', '  my file'],
    ['  index.js', 'index.js', ' padded', '  " padded"'],
    ['  src/', 'src', 'a :::b', '  "a :::b/"'],
    ['  index.js', 'index.js', 'say "hi" ', `  'say "hi" '`],
    ['  "my file"', 'my file', 'other', '  "other"'],
    ["  'my dir/'", 'my dir', 'x y', "  'x y/'"],
    ['  "my file"', 'my file', 'say "hi"', `  'say "hi"'`],
    ['  "my dir/"', 'my dir', 'say "hi"', `  'say "hi"/'`],
    ['  "my file"', 'my file', `it's "x"`, `  it's "x"`],
  ])('in %j renames %j to %j: %j', (body, name, newName, want) => {
    const text = `treeView-beta\n${body}`;
    expect(renamed(text, name, newName)).toBe(`treeView-beta\n${want}`);
  });
});
