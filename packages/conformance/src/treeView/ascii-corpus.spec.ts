// cspell:words preorder
import { beforeAll, describe, expect, it } from 'vitest';
import { cellWidth, graphemes } from '@mermaid-js/core/ascii';
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  detectTreeView,
  parseTreeView,
  type TreeViewModel,
  type TreeViewNode,
} from '@mermaid-js/diagram-treeview';
import { MermaidError, type TextRenderResult } from 'mermaid';
import { treeViewGateCorpus } from './corpus.ts';
import { treeViewAsciiApi } from './render-api.ts';

// ASCII render properties over the treeView gate corpus (e2e fixtures, v12 spec strings, the
// hand-written and recovery cases, the line separators, each also with CRLF and comment lines),
// in both charsets, through the public `format: 'ascii'` API (#578, D488, R-ASCII-9): renders
// every diagram that renders to SVG and rejects only what SVG rejects; deterministic across fresh
// API objects; `rows` lines, none wider than `columns` and one exactly that wide, no trailing
// spaces, no box glyph in `ascii`. Read back against the parsed model: one line a node in
// preorder, its `tree(1)` prefix from its ancestors, its name (bare or quoted), its description
// in the diagram's one column two cells past the longest line, the gutter mark on exactly the
// highlighted rows; one `ASCII_DROPPED` at most per feature kind. And D488's promise: the
// unicode drawing without its descriptions (and its gutter) is box input that parses to the
// same tree.

type Charset = 'unicode' | 'ascii';
const CHARSETS: Charset[] = ['unicode', 'ascii'];

const GLYPHS = {
  unicode: { tee: '├── ', last: '└── ', bar: '│   ', mark: '▶' },
  ascii: { tee: '|-- ', last: '`-- ', bar: '|   ', mark: '>' },
} as const;

/** Box drawing and the unicode highlight mark. */
const BOX = /[\u2500-\u257f\u25b6]/u;

interface Case {
  id: string;
  model: TreeViewModel;
  out: Record<Charset, TextRenderResult>;
  again: Record<Charset, string>;
  icons: TextRenderResult;
  /** Unicode with `ascii.padding: roomy`. */
  roomy: TextRenderResult;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};
let rejected = 0;

beforeAll(async () => {
  const api = await treeViewAsciiApi();
  const fresh = await treeViewAsciiApi();
  const icons = await treeViewAsciiApi({ treeView: { showIcons: true } });
  for (const item of await treeViewGateCorpus()) {
    if (!detectTreeView(item.source)) continue;
    const parse = parseTreeView(item.source, { preprocessed: preprocess(item.source) });
    const parses = !parse.diagnostics.some((d) => d.severity === 'error');
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        const call = { format: 'ascii', config: { ascii: { charset } } } as const;
        out[charset] = await api.render('mermaid-0', item.source, call);
        again[charset] = (await fresh.render('mermaid-0', item.source, call)).text;
      }
      const withIcons = await icons.render('mermaid-0', item.source, { format: 'ascii' });
      const roomy = await api.render('mermaid-0', item.source, {
        format: 'ascii',
        config: { ascii: { padding: 'roomy' } },
      });
      cases.push({ id: item.id, model: parse.model, out, again, icons: withIcons, roomy });
      if (!parses) failed[item.id] = 'drawn although the parse has errors';
    } catch (e) {
      // Text is rejected only where SVG is too (preprocessing errors included).
      const svg = await api.render('mermaid-0', item.source).then(
        () => undefined,
        (x: unknown) => x
      );
      if (!(e instanceof MermaidError) || e.code !== 'SYNTAX' || svg === undefined)
        failed[item.id] = String(e);
      else rejected++;
    }
  }
}, 600_000);

/** `{ id: problems }` for the cases where `check` finds something, in either charset. */
function problems(check: (c: Case, charset: Charset) => string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of cases) {
    const found = CHARSETS.flatMap((cs) => check(c, cs).map((p) => `${cs}: ${p}`));
    if (found.length > 0) out[c.id] = found.slice(0, 5);
  }
  return out;
}

/** A line as cells: a wide grapheme takes its cell and an empty one after it. */
function cells(line: string): string[] {
  const out: string[] = [];
  for (const g of graphemes(line)) {
    if (g.width === 0) out[out.length - 1] += g.text;
    else out.push(g.text, ...(g.width === 2 ? [''] : []));
  }
  return out;
}

const textLines = (r: TextRenderResult): string[] => (r.text === '' ? [] : r.text.split('\n'));
/** Controls and line separators are drawn as blanks (one row a node). */
const blanked = (s: string): string => s.replace(/[\p{Cc}\u2028\u2029]/gu, ' ');
const highlighted = (n: TreeViewNode): boolean => n.cssClass === 'highlight';
const written = (n: TreeViewNode): string => blanked(n.directory ? `${n.name}/` : n.name);

/** Each node's parent (undefined at the top) and whether it is its parent's last child. */
function family(model: TreeViewModel) {
  const parent = new Map<TreeViewNode, TreeViewNode>();
  const last = new Set<TreeViewNode>(model.roots.slice(-1));
  for (const n of model.nodes) {
    for (const c of n.children) parent.set(c, n);
    if (n.children.length > 0) last.add(n.children[n.children.length - 1]!);
  }
  return { parent, last };
}

/** The `tree(1)` prefix of `n` (D488), from its ancestors. */
function prefixOf(n: TreeViewNode, f: ReturnType<typeof family>, cs: Charset): string {
  const g = GLYPHS[cs];
  if (n.depth === 0) return '';
  let out = f.last.has(n) ? g.last : g.tee;
  for (let a = f.parent.get(n); a && a.depth > 0; a = f.parent.get(a))
    out = (f.last.has(a) ? '    ' : g.bar) + out;
  return out;
}

/** What one line holds, split up: the gutter, the prefix, the name and the description. */
function split(c: Case, cs: Charset, i: number): { gutter: string; rest: string } {
  const line = textLines(c.out[cs])[i] ?? '';
  const gutter = c.model.nodes.some(highlighted) ? 1 : 0;
  const all = cells(line);
  return { gutter: all.slice(0, gutter).join(''), rest: all.slice(gutter).join('') };
}

describe('treeView ascii corpus properties (D488, R-ASCII-9)', { timeout: 120_000 }, () => {
  it('renders every treeView diagram that renders to SVG, and rejects the others with SYNTAX', () => {
    expect(cases.length).toBeGreaterThan(800);
    expect(rejected).toBeGreaterThan(0);
    expect(failed).toEqual({});
  });

  it('is deterministic: a fresh API object draws the same text', () => {
    expect(problems((c, cs) => (c.out[cs].text === c.again[cs] ? [] : ['differs']))).toEqual({});
  });

  it('has `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces', () => {
    expect(
      problems((c, cs) => {
        const { text, rows, columns } = c.out[cs];
        const lines = textLines(c.out[cs]);
        const widest = Math.max(0, ...lines.map((l) => cells(l).length));
        const found: string[] = [];
        if (lines.length !== rows) found.push(`${lines.length} lines, rows ${rows}`);
        if (widest !== columns) found.push(`widest ${widest}, columns ${columns}`);
        if (/ $/m.test(text)) found.push('trailing space');
        // Names keep their own script; the drawing itself is ASCII.
        const own = c.model.nodes.some((n) => BOX.test(n.name + (n.description ?? '')));
        if (cs === 'ascii' && BOX.test(text) && !own) found.push('box glyph in ascii');
        return found;
      })
    ).toEqual({});
  });

  it('draws one line a node, in preorder, with its tree(1) prefix and its name', () => {
    expect(
      problems((c, cs) => {
        const f = family(c.model);
        const found: string[] = [];
        if (textLines(c.out[cs]).length !== c.model.nodes.length)
          found.push(`${textLines(c.out[cs]).length} lines for ${c.model.nodes.length} nodes`);
        c.model.nodes.forEach((n, i) => {
          const { rest } = split(c, cs, i);
          const prefix = prefixOf(n, f, cs);
          if (!rest.startsWith(prefix))
            return void found.push(`line ${i}: prefix ${JSON.stringify(rest)}`);
          const name = rest.slice(prefix.length);
          const w = written(n);
          const as = [w, `"${w}"`, `'${w}'`];
          if (!as.some((x) => name === x || name.startsWith(`${x}  `)))
            found.push(`line ${i}: ${JSON.stringify(name)} for ${JSON.stringify(w)}`);
        });
        return found;
      })
    ).toEqual({});
  });

  // Without a highlight there is no gutter: the prefix property reads each line from column 0.
  it('marks exactly the highlighted rows in a one-cell gutter, there only when one is', () => {
    expect(
      problems((c, cs) => {
        if (!c.model.nodes.some(highlighted)) return [];
        const found: string[] = [];
        c.model.nodes.forEach((n, i) => {
          const { gutter } = split(c, cs, i);
          if (gutter !== (highlighted(n) ? GLYPHS[cs].mark : ' '))
            found.push(`line ${i}: gutter ${JSON.stringify(gutter)}`);
        });
        return found;
      })
    ).toEqual({});
  });

  it('writes the descriptions in one column, two cells past the longest line without them', () => {
    expect(
      problems((c, cs) => {
        const lines = textLines(c.out[cs]);
        const found: string[] = [];
        const starts = new Set<number>();
        let longest = 0;
        c.model.nodes.forEach((n, i) => {
          const line = lines[i] ?? '';
          if (n.description === undefined)
            return void (longest = Math.max(longest, cells(line).length));
          const d = blanked(n.description).replace(/ +$/, '');
          if (!line.endsWith(d)) return void found.push(`line ${i}: no ${JSON.stringify(d)}`);
          const before = line.slice(0, line.length - d.length);
          if (!before.endsWith('  ')) found.push(`line ${i}: description not apart`);
          longest = Math.max(longest, cellWidth(before.replace(/ +$/, '')));
          starts.add(cellWidth(before));
        });
        if (starts.size > 1) found.push(`description columns ${[...starts].join(', ')}`);
        const [start] = [...starts];
        if (start !== undefined && start !== longest + 2)
          found.push(`column ${start}, longest line ${longest}`);
        return found;
      })
    ).toEqual({});
  });

  it('with ascii.padding roomy, puts a line of connectors only between the rows', () => {
    const found: Record<string, string[]> = {};
    for (const c of cases) {
      const compact = textLines(c.out.unicode);
      const roomy = textLines(c.roomy);
      const wrong: string[] = [];
      if (roomy.length !== Math.max(0, 2 * compact.length - 1))
        wrong.push(`${roomy.length} lines for ${compact.length} rows`);
      roomy.forEach((l, i) => {
        if (i % 2 === 0 && l !== compact[i / 2]) wrong.push(`line ${i} is not row ${i / 2}`);
        if (i % 2 === 1 && !/^[ │]*$/.test(l)) wrong.push(`line ${i}: ${JSON.stringify(l)}`);
      });
      if (/ $/m.test(c.roomy.text)) wrong.push('trailing space');
      if (wrong.length > 0) found[c.id] = wrong.slice(0, 5);
    }
    expect(found).toEqual({});
  });

  it('warns once at most per dropped feature, and about the icons whenever one is drawn in SVG', () => {
    expect(
      problems((c, cs) => {
        const found: string[] = [];
        const features = c.out[cs].warnings
          .filter((w) => w.code === 'ASCII_DROPPED')
          .map((w) => w.feature);
        if (new Set(features).size !== features.length) found.push(`twice: ${features.join(', ')}`);
        // Under showIcons every directory with no `icon(…)` draws the folder in SVG (the icon
        // maps, which may hide one with `none`, are for files).
        const icon = c.icons.warnings.filter((w) => w.feature === 'icon');
        const want = c.model.nodes
          .filter((n) => n.directory && n.icon === undefined)
          .map((n) => n.astId);
        const got = icon.flatMap((w) => w.astIds ?? []);
        if (icon.length > 1 || (want.length > 0 && icon.length === 0))
          found.push(`showIcons: ${icon.length} icon warnings`);
        if (want.some((id) => !got.includes(id))) found.push('showIcons: an icon not named');
        return found;
      })
    ).toEqual({});
  });

  // D488: "The unicode output, without the descriptions, is valid treeView box input." With a
  // highlighted row that holds only once the gutter is removed too (its blank before a row at
  // the top is an indent with no box glyph; GAPS T7, D489), so the gutter is cut here. A name
  // holding a control or a line separator (drawn as a blank), a box-drawing branch glyph (which
  // the box pass reads as a prefix) or an entity (v12's `#35;` is the name `&#35;`, which reads
  // back as `&&#35;`) has no written form that shows it as SVG does, so its diagram is left out.
  it('parses its unicode drawing, without the descriptions and the gutter, back to the same tree', () => {
    const shape = (m: TreeViewModel) => m.nodes.map((n) => [n.depth, n.name, n.directory]);
    const unwritable = (m: TreeViewModel) =>
      m.nodes.some((n) => /[\p{Cc}\u2028\u2029└┗├┣]|&#?\w+;/u.test(n.name));
    let checked = 0;
    const found: Record<string, unknown> = {};
    for (const c of cases) {
      if (c.model.nodes.length === 0 || unwritable(c.model)) continue;
      checked++;
      const lines = c.model.nodes.map((n, i) => {
        const { rest } = split(c, 'unicode', i);
        if (n.description === undefined) return rest;
        const d = blanked(n.description).replace(/ +$/, '');
        return rest.slice(0, rest.length - d.length).replace(/ +$/, '');
      });
      // `roomy` too: its lines between rows, gutter cut, are decoration the box pass drops.
      const gutter = c.model.nodes.some(highlighted) ? 1 : 0;
      const between = textLines(c.roomy)
        .filter((_, i) => i % 2 === 1)
        .map((l) => cells(l).slice(gutter).join(''));
      const roomy = lines.flatMap((l, i) => (i === 0 ? [l] : [between[i - 1]!, l]));
      for (const [variant, drawn] of [
        ['compact', lines],
        ['roomy', roomy],
      ] as const) {
        const back = parseTreeView(['treeView-beta', ...drawn].join('\n'));
        const errors = back.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
        if (errors.length > 0) found[`${c.id} ${variant}`] = errors;
        else if (JSON.stringify(shape(back.model)) !== JSON.stringify(shape(c.model)))
          found[`${c.id} ${variant}`] = { drawn, back: shape(back.model) };
      }
    }
    expect(checked).toBeGreaterThan(700);
    expect(found).toEqual({});
  });
});
