import { beforeAll, describe, expect, it } from 'vitest';
import { parseTreeView } from '@mermaid-js/diagram-treeview';
import type { Mermaid, TextRenderResult } from 'mermaid';
import { treeViewAsciiApi } from './render-api.ts';

// TreeView's text output (spec #518 T7, #578, D488, D320, R-ASCII-5, R-ASCII-6, R-ASCII-8)
// through the public `format: 'ascii'` API. D488: `tree(1)` style from the first real row (no
// `/` row), `├── ` `└── ` `│   ` (`|-- ` `` `-- `` `|   ` in `ascii`), directories with their
// `/`, descriptions in one aligned column, icons dropped with one `ASCII_DROPPED`, a highlighted
// row marked `▶` (`>`) in a one-cell gutter.

let api: Mermaid;
beforeAll(async () => {
  api = await treeViewAsciiApi();
});

const lines = (...rows: string[]): string => rows.join('\n');
const tree = (...rows: string[]): string => ['treeView-beta', ...rows].join('\n');

function draw(src: string, ascii: Record<string, unknown> = {}): Promise<TextRenderResult> {
  return api.render('mermaid-0', src, { format: 'ascii', config: { ascii } });
}

const PROJECT = tree(
  '  my-project/',
  '    src/',
  '      components/',
  '        MyComponent.js',
  '      index.js',
  '    package.json',
  '  README.md'
);

describe('shape (D488)', () => {
  it('draws tree(1) style from the first real row, directories with their /', async () => {
    const out = await draw(PROJECT);
    expect(out.text).toBe(
      lines(
        'my-project/',
        '├── src/',
        '│   ├── components/',
        '│   │   └── MyComponent.js',
        '│   └── index.js',
        '└── package.json',
        'README.md'
      )
    );
    expect(out).toMatchObject({ format: 'ascii', columns: 26, rows: 7, diagramType: 'treeView' });
  });

  it('has an ascii form: |-- `-- and |   ', async () => {
    expect((await draw(PROJECT, { charset: 'ascii' })).text).toBe(
      lines(
        'my-project/',
        '|-- src/',
        '|   |-- components/',
        '|   |   `-- MyComponent.js',
        '|   `-- index.js',
        '`-- package.json',
        'README.md'
      )
    );
  });

  it('draws every node at the top at column 0, and nothing for an empty tree', async () => {
    expect((await draw(tree('a', 'b/', '  c'))).text).toBe(lines('a', 'b/', '└── c'));
    expect(await draw('treeView-beta')).toMatchObject({ text: '', rows: 0, columns: 0 });
  });

  it('reads box-drawn input as the same tree it draws', async () => {
    const box = tree('my-project/', '├── src/', '│   └── index.ts', '└── README.md');
    expect((await draw(box)).text).toBe(box.split('\n').slice(1).join('\n'));
  });

  it('puts the descriptions in one column, two cells past the longest line', async () => {
    const src = tree(
      '  src/ ## sources',
      '    index.ts ## entry point',
      '    a-much-longer-name.ts',
      '  README.md ## docs'
    );
    expect((await draw(src)).text).toBe(
      lines(
        // The longest line, `└── a-much-longer-name.ts`, is 25 cells: the column is 27.
        `${'src/'.padEnd(27)}sources`,
        `${'├── index.ts'.padEnd(27)}entry point`,
        '└── a-much-longer-name.ts',
        `${'README.md'.padEnd(27)}docs`
      )
    );
  });

  it('marks a highlighted row in a one-cell gutter, ▶ or >', async () => {
    const src = tree('  src/ :::highlight', '    App.tsx :::highlight ## main', '    b.ts');
    expect((await draw(src)).text).toBe(lines('▶src/', '▶├── App.tsx  main', ' └── b.ts'));
    expect((await draw(src, { charset: 'ascii' })).text).toBe(
      lines('>src/', '>|-- App.tsx  main', ' `-- b.ts')
    );
    // No gutter when no row is highlighted; another class is not a highlight.
    expect((await draw(tree('  a :::other'))).text).toBe('a');
  });

  // D488 says both "a highlighted row is marked in a one-cell gutter" and "the unicode output,
  // without the descriptions, is valid treeView box input". With a highlighted row they
  // conflict: the gutter's blank before a row at the top is an indent with no box glyph. The
  // round trip holds once the descriptions and the gutter are removed (GAPS T7, for the
  // maintainer: D489).
  it('is box input with a highlighted row only once the gutter is removed', async () => {
    const src = tree('  a/', '    b :::highlight', '  c');
    const { text } = await draw(src);
    expect(text).toBe(lines(' a/', '▶└── b', ' c'));
    const raw = parseTreeView(`treeView-beta\n${text}`);
    expect(raw.diagnostics.map((d) => d.code)).toContain('BOX_UNEXPECTED_INDENT');
    const cut = text.split('\n').map((l) => l.slice(1));
    const back = parseTreeView(['treeView-beta', ...cut].join('\n'));
    expect(back.diagnostics).toEqual([]);
    expect(back.model.nodes.map((n) => [n.depth, n.name])).toEqual([
      [0, 'a'],
      [1, 'b'],
      [0, 'c'],
    ]);
  });

  it('puts a line between rows with ascii.padding roomy, carrying the connectors on', async () => {
    const roomy = await draw(PROJECT, { padding: 'roomy' });
    expect(roomy.text).toBe(
      lines(
        'my-project/',
        '│',
        '├── src/',
        '│   │',
        '│   ├── components/',
        '│   │   │',
        '│   │   └── MyComponent.js',
        '│   │',
        '│   └── index.js',
        '│',
        '└── package.json',
        '',
        'README.md'
      )
    );
    expect(roomy.rows).toBe(13);
    expect((await draw(PROJECT, { padding: 'roomy', charset: 'ascii' })).text.split('\n')[3]).toBe(
      '|   |'
    );
    // The box pass drops the connector lines as decoration: the same tree reads back.
    const back = parseTreeView(`treeView-beta\n${roomy.text}`);
    expect(back.diagnostics).toEqual([]);
    expect(back.model.nodes.map((n) => [n.depth, n.name])).toEqual(
      parseTreeView(PROJECT).model.nodes.map((n) => [n.depth, n.name])
    );
  });

  it('writes each glyph of a name in a cell of its own, wide ones in two', async () => {
    const src = tree('  📦 pkg/ ## box', '    ünï.txt ## file', '    中文.md ## wide');
    expect((await draw(src)).text).toBe(
      lines('📦 pkg/      box', '├── ünï.txt  file', '└── 中文.md  wide')
    );
  });
});

describe('names', () => {
  it('writes a name bare, or in quotes where it would not read back bare', async () => {
    const src = tree(
      '  plain name.txt',
      '  "  padded "',
      '  "a ## not a description"',
      '  "x :::y"',
      `  'say "hi"'`,
      `  "'quoted'"`,
      '  "title.txt"',
      '  ""',
      '  "50% off"'
    );
    expect((await draw(src)).text).toBe(
      lines(
        'plain name.txt',
        '"  padded "',
        '"a ## not a description"',
        '"x :::y"',
        'say "hi"',
        `"'quoted'"`,
        '"title.txt"',
        '""',
        '50% off'
      )
    );
  });

  it('draws a line break or a tab in a name or description as a blank, one row a node', async () => {
    const src = tree('  "a\n  b" ## c\td', '  e');
    expect((await draw(src)).text).toBe(lines('a   b  c d', 'e'));
  });
});

/** The `ASCII_DROPPED` warnings of a drawing, by feature. */
const dropped = (out: TextRenderResult) =>
  out.warnings
    .filter((w) => w.code === 'ASCII_DROPPED')
    .map((w) => ({ feature: w.feature, astIds: w.astIds }));

describe('what text cannot show (R-ASCII-5, D82)', () => {
  it('drops the icons with one ASCII_DROPPED naming the nodes that draw one', async () => {
    const src = tree('  a/', '    b.ts icon(fa:bell)', '    c.ts icon(none)', '    d.ts');
    expect(dropped(await draw(src))).toEqual([{ feature: 'icon', astIds: ['node:a/b.ts'] }]);
    const all = await api.render('mermaid-0', src, {
      format: 'ascii',
      config: { treeView: { showIcons: true } },
    });
    expect(dropped(all)).toEqual([
      { feature: 'icon', astIds: ['node:a', 'node:a/b.ts', 'node:a/d.ts'] },
    ]);
    expect(all.text).toBe(lines('a/', '├── b.ts', '├── c.ts', '└── d.ts'));
  });

  it('drops a class other than highlight, and the accessibility statements', async () => {
    const src = tree(
      'accTitle: Files',
      'accDescr: All of them',
      '  a :::other',
      '  b :::highlight'
    );
    expect(dropped(await draw(src))).toEqual([
      { feature: 'style', astIds: ['node:a'] },
      { feature: 'accessibility', astIds: ['accTitle', 'accDescr'] },
    ]);
    expect(dropped(await draw(tree('  a :::highlight ## d')))).toEqual([]);
  });

  it('is never cropped: ASCII_TOO_WIDE when it does not fit ascii.maxWidth', async () => {
    const out = await draw(PROJECT, { maxWidth: 10 });
    expect(out.columns).toBe(26);
    expect(out.text).toBe((await draw(PROJECT)).text);
    expect(out.warnings.map((w) => w.code)).toContain('ASCII_TOO_WIDE');
    expect((await draw(PROJECT, { maxWidth: 26 })).warnings).toEqual([]);
  });
});
