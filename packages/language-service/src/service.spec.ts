import { beforeAll, describe, expect, it } from 'vitest';
import { flowchartLanguage } from '@mermaid-js/diagram-flowchart/language';
import { createLanguageService } from './index.ts';
import type { DocumentSnapshot, Range } from './index.ts';

const service = createLanguageService();
beforeAll(() => service.preload());
const open = async (text: string, uri = 'file:///a.mmd'): Promise<DocumentSnapshot> =>
  service.update(uri, text);
const texts = (doc: DocumentSnapshot, ranges: readonly Range[]) =>
  ranges.map((r) => doc.text.slice(r.start, r.end));
/** Offset of the `n`th (1-based) occurrence of `needle`, plus `delta`. */
const at = (text: string, needle: string, n = 1, delta = 0): number => {
  let i = -1;
  for (let k = 0; k < n; k++) i = text.indexOf(needle, i + 1);
  if (i < 0) throw new Error(`no ${needle}`);
  return i + delta;
};

describe('snapshots', () => {
  it('after preload, gives the full answer on the first snapshot (D155)', async () => {
    const fresh = createLanguageService();
    await fresh.preload();
    const doc = fresh.update('file:///first.mmd', 'flowchart TD\n  A --> B\n  A --> C\n');
    expect(doc.facet?.id).toBe('flowchart');
    expect(doc.diagnostics()).toEqual([]);
    expect(doc.references(15).map((r) => doc.text.slice(r.start, r.end))).toEqual(['A', 'A']);
  });

  it('without preload, gives LANGUAGE_NOT_LOADED and the generic features', () => {
    const fresh = createLanguageService();
    const text = '---\ntitle: x\n---\nflowchart TD\n  %% note\n  A --> B\n';
    const doc = fresh.update('file:///cold.mmd', text);
    expect(doc.facet).toBeUndefined();
    const [d, ...rest] = doc.diagnostics();
    expect(rest).toEqual([]);
    expect(d).toEqual(expect.objectContaining({ severity: 'info', code: 'LANGUAGE_NOT_LOADED' }));
    expect(d?.message).toContain('flowchart');
    expect(d?.message).not.toContain('not supported');
    expect(doc.foldingRanges().map((f) => f.kind)).toEqual(['frontMatter']);
    expect(doc.semanticTokens().map((t) => t.type)).toEqual(['comment']);
  });

  it('is immutable: a later update does not change an earlier snapshot', async () => {
    const a = await open('flowchart TD\n  A --> B\n', 'file:///imm.mmd');
    const b = await open('flowchart TD\n  A --> C\n', 'file:///imm.mmd');
    expect(texts(a, a.references(at(a.text, 'B')))).toEqual(['B']);
    expect(texts(b, b.references(at(a.text, 'B')))).toEqual(['C']);
    expect(service.get('file:///imm.mmd')).toBe(b);
  });

  it('memoises queries', async () => {
    const doc = await open('flowchart TD\n  A --> B\n');
    expect(doc.foldingRanges()).toBe(doc.foldingRanges());
    expect(doc.semanticTokens()).toBe(doc.semanticTokens());
  });

  it('uses a third-party facet passed in, after the first-party detectors', async () => {
    const custom = createLanguageService({
      facets: [
        {
          type: 'custom',
          id: 'custom',
          detector: (text) => /^\s*custom/.test(text),
          facet: { ...flowchartLanguage, id: 'custom' },
        },
      ],
    });
    // An eager row needs no preload.
    const doc = custom.update('x', 'custom\n');
    expect(doc.facet?.id).toBe('custom');
  });

  it('gives third-party detectors the cleaned text and the front-matter config, as v12 did', () => {
    const seen: [string, unknown][] = [];
    const custom = createLanguageService({
      facets: [
        {
          type: 'custom',
          id: 'custom',
          detector: (text, config) => {
            seen.push([text, config]);
            return false;
          },
        },
      ],
    });
    custom.update('x', '---\nconfig:\n  theme: dark\n---\n%%{init: {}}%%\ncustom %% note\n  A\n');
    expect(seen).toEqual([['custom\n  A\n', { theme: 'dark' }]]);
  });
});

describe('diagnostics (D91)', () => {
  it('passes preprocess and parse diagnostics through as they are', async () => {
    const doc = await open('---\ntitle: [\n---\nflowchart TD\n  A --> \n');
    const codes = doc.diagnostics().map((d) => d.code);
    expect(codes.length).toBeGreaterThanOrEqual(2);
    expect(doc.diagnostics()).toEqual(
      flowchartLanguage.parse(doc.text, { keepTokens: true }).diagnostics
    );
  });

  it('gives a v12 type with no facet one info diagnostic on its header', async () => {
    const doc = await open('%% hi\njourney\n  title T\n');
    expect(doc.facet).toBeUndefined();
    expect(doc.type).toBe('journey');
    const [d, ...rest] = doc.diagnostics();
    expect(rest).toEqual([]);
    expect(d?.severity).toBe('info');
    expect(d?.code).toBe('NO_LANGUAGE_SUPPORT');
    expect(doc.text.slice(d!.range.start, d!.range.end)).toBe('journey');
  });

  it('gives an unknown type UNSUPPORTED_DIAGRAM, as the renderer does', async () => {
    const doc = await open('foo\n');
    expect(doc.type).toBeUndefined();
    expect(doc.diagnostics()).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'UNSUPPORTED_DIAGRAM',
        range: { start: 0, end: 3 },
      }),
    ]);
  });
});

describe('definition, references and rename (D92)', () => {
  const src = [
    'flowchart TD',
    '  A --> B & C',
    '  subgraph one [One]',
    '    B',
    '  end',
    '  A --> one',
    '  style A fill:#f00',
    '  class A,B hot',
    '  classDef hot fill:#f96',
    '  click A "https://example.com"',
    '',
  ].join('\n');

  it('goes to the first definition and lists every reference across statements', async () => {
    const doc = await open(src);
    const onA = at(src, 'A', 5);
    expect(doc.definition(onA)).toEqual({ start: at(src, 'A'), end: at(src, 'A') + 1 });
    expect(texts(doc, doc.references(onA))).toEqual(['A', 'A', 'A', 'A', 'A']);
    expect(doc.references(onA).map((r) => r.start)).toEqual([
      at(src, 'A'),
      at(src, 'A --> one'),
      at(src, 'style A', 1, 6),
      at(src, 'class A', 1, 6),
      at(src, 'click A', 1, 6),
    ]);
  });

  it('resolves an edge to a subgraph id to the subgraph', async () => {
    const doc = await open(src);
    expect(doc.definition(at(src, 'one', 2, 1))).toEqual({
      start: at(src, 'one'),
      end: at(src, 'one') + 3,
    });
  });

  it('renames across the chain, style, class and click statements', async () => {
    const doc = await open(src);
    const result = doc.rename(at(src, 'class A', 1, 6), 'Start');
    if (!('edits' in result)) throw new Error(result.refused);
    let out = src;
    for (const e of [...result.edits].sort((a, b) => b.range.start - a.range.start))
      out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
    expect(out).toBe(src.replace(/\bA\b/g, 'Start'));
  });

  it('prepares a rename on the name under the cursor', async () => {
    const doc = await open(src);
    expect(doc.prepareRename(at(src, 'hot', 2, 1))).toEqual({
      range: { start: at(src, 'hot', 2), end: at(src, 'hot', 2) + 3 },
      placeholder: 'hot',
    });
    expect(doc.prepareRename(at(src, 'fill'))).toEqual({
      refused: 'There is no id or class name here to rename.',
    });
  });

  it('refuses an invalid name and a clash in the same namespace, with a reason', async () => {
    const doc = await open(src);
    const onA = at(src, 'A');
    expect(doc.rename(onA, 'end')).toEqual({ refused: "'end' is a keyword." });
    expect(doc.rename(onA, 'a b')).toEqual({ refused: 'An id cannot contain spaces.' });
    expect(doc.rename(onA, 'one')).toEqual({
      refused: "'one' is already a subgraph id in this diagram.",
    });
    // Classes are another namespace: a class may share a node's name.
    expect(doc.rename(onA, 'hot')).toHaveProperty('edits');
  });

  /** `text` with the edits of a successful rename at `offset` to `name` applied. */
  const renamed = async (text: string, offset: number, name: string): Promise<string> => {
    const result = (await open(text)).rename(offset, name);
    if (!('edits' in result)) throw new Error(result.refused);
    let out = text;
    for (const e of [...result.edits].sort((a, b) => b.range.start - a.range.start))
      out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
    return out;
  };

  it('renames a written generated edge id with the nodes it is made of (#170)', async () => {
    const edge = 'flowchart TD\n  B --> D\n  L_B_D_0@{ animation: fast }\n';
    expect(await renamed(edge, at(edge, '> D', 1, 2), 'Done')).toBe(
      'flowchart TD\n  B --> Done\n  L_B_Done_0@{ animation: fast }\n'
    );
    expect(await renamed(edge, at(edge, 'B'), 'Begin')).toBe(
      'flowchart TD\n  Begin --> D\n  L_Begin_D_0@{ animation: fast }\n'
    );
    // Ids holding `_` are cut where the edge's ends are, not at every `_`.
    const under = 'flowchart TD\n  A_1 --> B_2\n  A_1 --> B_2\n  L_A_1_B_2_2@{ animation: slow }\n';
    expect(await renamed(under, at(under, 'B_2'), 'X')).toBe(
      'flowchart TD\n  A_1 --> X\n  A_1 --> X\n  L_A_1_X_2@{ animation: slow }\n'
    );
    // The node's name inside the id goes to the node; the rest of the id is the edge.
    const doc = await open(edge);
    const node = at(edge, '> D', 1, 2);
    expect(doc.definition(at(edge, 'B_D', 1, 2))).toEqual({ start: node, end: node + 1 });
    expect(texts(doc, doc.references(at(edge, 'L_')))).toEqual(['L_B_D_0']);
  });

  it('keeps a user edge id that only looks generated as an edge id', async () => {
    const own = 'flowchart TD\n  B L_B_D_0@--> D\n  L_B_D_0@{ animation: fast }\n';
    expect(await renamed(own, at(own, '> D', 1, 2), 'Done')).toBe(
      'flowchart TD\n  B L_B_D_0@--> Done\n  L_B_D_0@{ animation: fast }\n'
    );
  });

  it('records `class` on an edge id as the edge, not a node (#170)', async () => {
    const cls = 'flowchart LR\n  a link@--> b\n  class link,b hot\n  classDef hot fill:#f96\n';
    const doc = await open(cls);
    expect(doc.references(at(cls, 'link', 2)).map((r) => r.start)).toEqual([
      at(cls, 'link'),
      at(cls, 'link', 2),
    ]);
    expect(await renamed(cls, at(cls, 'link'), 'e1')).toBe(cls.replace(/link/g, 'e1'));
    expect(await renamed(cls, at(cls, 'b'), 'c')).toBe(cls.replace(/\bb\b/g, 'c'));
  });

  it('refuses everything on a type with no facet', async () => {
    const doc = await open('journey\n  title T\n');
    expect(doc.definition(11)).toBeUndefined();
    expect(doc.references(11)).toEqual([]);
    expect(doc.rename(11, 'X')).toEqual({
      refused: 'journey diagrams are not supported by the v13 language service yet.',
    });
  });
});

describe('astAt and rangeOf (D97)', () => {
  it('maps an offset to the AST ids around it, innermost first, and back', async () => {
    const src = 'flowchart TD\n  subgraph one\n    A --> B\n  end\n';
    const doc = await open(src);
    // The edge spans `A --> B`, so it contains its end nodes.
    expect(doc.astAt(at(src, 'B'))).toEqual(['n:B', 'e:A>B', 'chain:1', 's:one']);
    expect(doc.astAt(at(src, '-->', 1, 1))).toEqual(['e:A>B', 'chain:1', 's:one']);
    const r = doc.rangeOf('e:A>B');
    expect(r && src.slice(r.start, r.end)).toBe('A --> B');
    expect(doc.rangeOf('n:nope')).toBeUndefined();
  });
});
