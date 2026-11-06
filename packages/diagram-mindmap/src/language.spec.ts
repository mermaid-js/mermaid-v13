import { describe, expect, it } from 'vitest';
import { language, mindmapLanguage } from './language.ts';

/**
 * The mindmap language facet (#389) at its own seam: completions at a probe parse and hover
 * over a plain parse, as the language service calls them. The service-level behaviour
 * (definition, references, rename, folding, semantic tokens) is in the goldens
 * (`packages/language-service/goldens/mindmap`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = mindmapLanguage.parse(text, { keepTokens: true, probe: at });
  return mindmapLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** The text each item at `¦` replaces, and what it inserts. */
function edits(marked: string): [string, string][] {
  const [text, at] = split(marked);
  const result = mindmapLanguage.parse(text, { keepTokens: true, probe: at });
  return mindmapLanguage
    .completions(result.probe!, { text, result })
    .map((c) => [text.slice(c.range.start, c.range.end), c.insertText]);
}

/** Hover at `¦` as `<hovered text> => <contents>`, given the token and symbol the service would pass. */
function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = mindmapLanguage.parse(text, { keepTokens: true });
  const tokens = result.tokens!;
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  let touching: typeof token;
  for (let i = 0; i < tokens.length; i++) {
    const start = tokens.start[i]!;
    const end = tokens.end[i]!;
    if (!/\S/.test(text.slice(start, end))) continue;
    if (start <= at && at < end) token = { kind: tokens.kind[i]!, range: { start, end } };
    else if (end === at) touching = { kind: tokens.kind[i]!, range: { start, end } };
  }
  token ??= touching;
  const symbol = result.symbols.find((s) => s.range.start <= at && at <= s.range.end);
  const h = mindmapLanguage.hover(
    { offset: at, ...(token ? { token } : {}), ...(symbol ? { symbol } : {}) },
    { text, result }
  );
  return h && `${text.slice(h.range.start, h.range.end)} => ${h.contents}`;
}

const SHAPED = (id: string) => [
  `${id}[${id}]`,
  `${id}(${id})`,
  `${id}((${id}))`,
  `${id})${id}(`,
  `${id}))${id}((`,
  `${id}{{${id}}}`,
];

describe('mindmap language facet', () => {
  it('is the mindmap facet under the fixed name `language`', () => {
    expect(mindmapLanguage.id).toBe('mindmap');
    expect(language).toBe(mindmapLanguage);
    expect(mindmapLanguage.namespaces).toEqual([['node'], ['class']]);
    expect(mindmapLanguage.standalone).toEqual(['node']);
  });

  it('records each node id as a definition and each class word as a reference (D289)', () => {
    const text = 'mindmap\n  root\n    a[A]\n    :::x  y\n    a\n    :::y\n    [no id]\n';
    const result = mindmapLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    const kinds = [...result.tokens!.kind.slice(0, result.tokens!.length)];
    expect(kinds.map((k) => mindmapLanguage.categories[k])).not.toContain(undefined);
    expect(
      result.symbols.map((s) => [s.name, s.kind, s.role, text.slice(s.range.start, s.range.end)])
    ).toEqual([
      ['root', 'node', 'def', 'root'],
      ['a', 'node', 'def', 'a'],
      ['x', 'class', 'ref', 'x'],
      ['y', 'class', 'ref', 'y'],
      ['a', 'node', 'def', 'a'],
      ['y', 'class', 'ref', 'y'],
    ]);
  });

  it('drops the blanks around an id from its range', () => {
    const text = 'mindmap\n  root node \n';
    const [s] = mindmapLanguage.parse(text, { keepTokens: true }).symbols;
    expect(s && text.slice(s.range.start, s.range.end)).toBe('root node');
  });

  it('checks new names per kind', () => {
    const ok = (name: string, kind?: string) => mindmapLanguage.isValidId(name, kind);
    expect(ok('b')).toBeUndefined();
    expect(ok('two words')).toBeUndefined();
    expect(ok('a:b%c"d]')).toBeUndefined();
    expect(ok('')).toMatch(/empty/);
    expect(ok(' b')).toMatch(/blank/);
    expect(ok('a\nb')).toMatch(/line break/);
    expect(ok('a[b')).toMatch(/shape/);
    expect(ok('mindmap')).toMatch(/would not read/);
    expect(ok(':::x')).toMatch(/would not read/);
    expect(ok('::icon(x')).toMatch(/shape/);
    expect(ok('%%x')).toMatch(/would not read/);
    expect(ok('urgent', 'class')).toBeUndefined();
    expect(ok('a b', 'class')).toMatch(/two classes/);
    expect(ok('', 'class')).toMatch(/empty/);
    expect(ok('x', 'edge')).toMatch(/not a mindmap symbol kind/);
  });
});

describe('mindmap completions (D95)', () => {
  it('offers the header in an empty text', () => {
    expect(complete('¦')).toEqual(['mindmap']);
    expect(complete('mind¦')).toEqual(['mindmap']);
    expect(edits('mind¦')).toEqual([['mind', 'mindmap']]);
  });

  it('offers the decorations at a statement start once a node is above', () => {
    expect(complete('mindmap\n  root\n  ¦')).toEqual(['::icon()', ':::']);
    expect(complete('mindmap\n  root\n    ¦\n  b')).toEqual(['::icon()', ':::']);
    expect(complete('mindmap\n  root\n  ::i¦')).toEqual(['::icon()']);
    expect(complete('mindmap\n  root\n  ::I¦')).toEqual(['::icon()']);
    expect(edits('mindmap\n  root\n  ::¦')).toEqual([
      ['::', '::icon()'],
      ['::', ':::'],
    ]);
    expect(complete('mindmap\n  ¦')).toEqual([]);
  });

  it('offers the shapes around an id that ends its line', () => {
    expect(complete('mindmap\n  root¦')).toEqual(SHAPED('root'));
    expect(complete('mindmap\n  root\n    a b¦\n    c')).toEqual(SHAPED('a b'));
    expect(edits('mindmap\n  root\n    a¦')[0]).toEqual(['a', 'a[a]']);
    // Not in the middle of an id, before a shape, or after the blanks it took.
    expect(complete('mindmap\n  ro¦ot')).toEqual([]);
    expect(complete('mindmap\n  root\n    a¦[b]')).toEqual([]);
    expect(complete('mindmap\n  root \n    a ¦')).toEqual([]);
  });

  it('offers the closer of the shape after its text at the line end', () => {
    expect(complete('mindmap\n  root\n    a[text¦')).toEqual([']']);
    expect(complete('mindmap\n  root\n    a((text ¦')).toEqual(['))']);
    expect(complete('mindmap\n  root\n    a)text¦\n    b')).toEqual(['(']);
    expect(complete('mindmap\n  root\n    {{hex¦')).toEqual(['}}']);
    expect(edits('mindmap\n  root\n    a(text¦')).toEqual([['', ')']]);
    // Not before any text, nor where a closer follows.
    expect(complete('mindmap\n  root\n    a[¦')).toEqual([]);
    expect(complete('mindmap\n  root\n    a[te¦xt]')).toEqual([]);
    expect(complete('mindmap\n  root\n    a[text¦]')).toEqual([]);
  });

  it('offers the class names used elsewhere in a `:::` line', () => {
    const text = 'mindmap\n  root\n  :::urgent large\n    a\n    :::';
    expect(complete(`${text}¦`)).toEqual(['urgent', 'large']);
    expect(complete(`${text}ur¦`)).toEqual(['urgent']);
    expect(complete(`${text}large ¦`)).toEqual(['urgent']);
    expect(edits(`${text}¦urg`)).toEqual([
      ['urg', 'urgent'],
      ['urg', 'large'],
    ]);
  });

  it('offers nothing in a string, an icon, a comment or a node after two blank lines', () => {
    expect(complete('mindmap\n  root\n    a["text¦')).toEqual([]);
    expect(complete('mindmap\n  root\n  ::icon(fa¦')).toEqual([]);
    expect(complete('mindmap\n  root\n  %% ¦')).toEqual([]);
    expect(complete('mindmap\n\n  root¦')).toEqual([]);
  });
});

describe('mindmap hover (D93)', () => {
  const text = 'mindmap\n  root((Root))\n    a[A]\n    :::urgent\n    ::icon(fa fa-book)\n    b\n';

  it('names the shape of a node, as written, with its place in the tree', () => {
    expect(hover(`mindmap\n  ro¦ot((Root))\n    a[A]\n    b`)).toBe(
      'root((Root)) => **node** `root`\n\nShape: circle, written `((…))`\n\nThe root · 2 children'
    );
    const [h] = [hover(text.replace('a[A]', 'a[¦A]'))];
    expect(h).toBe(
      'a[A] => **node** `a`\n\nShape: square, written `[…]`\n\nDepth 1, under `root` · 0 children\n\nClass: `urgent`\n\nIcon: `fa fa-book`'
    );
    expect(hover(text.replace('    b', '    ¦b'))).toBe(
      'b => **node** `b`\n\nShape: default\n\nDepth 1, under `root` · 0 children'
    );
    expect(hover('mindmap\n  root\n    (¦no id)')).toMatch(
      /^\(no id\) => \*\*node\*\*\n\nShape: rounded, written `\(…\)`/
    );
    expect(hover('mindmap\n  root\n  se¦cond')).toMatch(/Not in the tree/);
  });

  it('explains the keywords and a class', () => {
    expect(hover('mind¦map\n  root')).toMatch(/^mindmap => \*\*`mindmap`\*\*\n\n`mindmap`: starts/);
    expect(hover(text.replace('::icon(', '::ic¦on('))).toMatch(/^::icon\( => /);
    expect(hover(text.replace(':::urgent', ':¦::urgent'))).toMatch(/^::: => /);
    expect(hover(text.replace(':::urgent', ':::urg¦ent'))).toBe(
      'urgent => **class** `urgent`\n\nUsed by 1 node'
    );
    expect(hover(text.replace('fa fa-book', 'fa fa-bo¦ok'))).toBeUndefined();
  });
});
