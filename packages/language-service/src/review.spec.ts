/**
 * Edge cases from the #31 review: rename checked in context, facet loading failures,
 * immutability and the semantic token types around subgraphs.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { flowchartLanguage } from '@mermaid-js/diagram-flowchart/language';
import type { DocumentView, LanguageFacet } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from './index.ts';
import { contextOf } from './snapshot.ts';
import type { DocumentSnapshot, FacetEntry, RenameResult } from './index.ts';

const service = createLanguageService();
beforeAll(() => service.preload());
let n = 0;
const open = async (text: string): Promise<DocumentSnapshot> =>
  service.update(`review:///${n++}`, text);
const at = (text: string, needle: string, k = 1): number => {
  let i = -1;
  for (let j = 0; j < k; j++) i = text.indexOf(needle, i + 1);
  if (i < 0) throw new Error(`no ${needle}`);
  return i;
};
const applied = (text: string, r: RenameResult): string => {
  if (!('edits' in r)) throw new Error(r.refused);
  let out = text;
  for (const e of [...r.edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
};
const renamed = async (text: string, needle: string, k: number, to: string) =>
  (await open(text)).rename(at(text, needle, k), to);

describe('rename is checked in context (D92)', () => {
  it.each([
    ['flowchart TD\nA-->B\n', 'A', 1, 'x-'],
    ['flowchart TD\nB---A\n', 'A', 1, 'o'],
    ['flowchart TD\nA-->B\nB:::foo\n', 'B', 2, 'C:'],
    ['flowchart TD\nA --> B\nclassDef foo fill:red\nclass A foo\n', 'foo', 1, 'a,b'],
  ])(
    'refuses a rename that reads differently in place: %j, %s #%i → %s',
    async (text, needle, k, to) => {
      const r = await renamed(text, needle, k, to);
      expect(r).toEqual({ refused: expect.stringContaining(`'${to}'`) as unknown });
    }
  );

  it('accepts names that read back the same', async () => {
    const cls = 'flowchart TD\nA --> B\nclassDef foo fill:red\nclass A foo\nA:::foo\n';
    expect(applied(cls, await renamed(cls, 'foo', 1, 'bar'))).toBe(cls.replace(/foo/g, 'bar'));
    const edge = 'flowchart TD\nA e1@--> B\n';
    expect(applied(edge, await renamed(edge, 'e1', 1, 'e9'))).toBe('flowchart TD\nA e9@--> B\n');
  });

  it('renames one id in a click list without touching a longer one', async () => {
    const text = 'flowchart TD\nA --> AA\nclick A,AA callback\n';
    expect(applied(text, await renamed(text, 'A', 1, 'Q'))).toBe(
      'flowchart TD\nQ --> AA\nclick Q,AA callback\n'
    );
  });

  it('covers an edge id in `e1@{ … }` in the edge namespace', async () => {
    const text = 'flowchart TD\nA e1@--> B\ne1@{ animate: true }\n';
    const doc = await open(text);
    expect(doc.references(at(text, 'e1', 2)).map((r) => r.start)).toEqual([
      at(text, 'e1'),
      at(text, 'e1', 2),
    ]);
    expect(applied(text, doc.rename(at(text, 'e1'), 'e9'))).toBe(text.replace(/e1/g, 'e9'));
  });
});

const fake = (id: string): LanguageFacet => ({ ...flowchartLanguage, id });
const row = (type: string, load: FacetEntry['load']): FacetEntry => ({
  type,
  id: type,
  detector: (text) => text.startsWith(type),
  load,
});

describe('facet loading', () => {
  it('treats a loader that resolves to something other than a facet as failed', async () => {
    let loads = 0;
    const s = createLanguageService({
      facets: [
        row('zzz', () => {
          loads++;
          return Promise.resolve(undefined as unknown as LanguageFacet);
        }),
      ],
    });
    await s.preload();
    const doc = s.update('x', 'zzz\n');
    expect(loads).toBe(1);
    expect(doc.diagnostics().map((d) => d.code)).toEqual(['LANGUAGE_LOAD_FAILED']);
  });

  it('handles a loader that throws at once like a rejected one, with its own message', async () => {
    const s = createLanguageService({
      facets: [
        row('yyy', () => {
          throw new Error('boom');
        }),
        row('www', () => Promise.reject(new Error('offline'))),
      ],
    });
    await s.preload();
    const sync = s.update('x', 'yyy\n');
    const async = s.update('y', 'www\n');
    expect(sync.diagnostics()).toEqual([
      expect.objectContaining({
        code: 'LANGUAGE_LOAD_FAILED',
        message: expect.stringContaining('boom') as unknown,
      }),
    ]);
    expect(async.diagnostics()[0]?.message).toContain('offline');
    expect(async.diagnostics()[0]?.message).not.toContain('not supported');
  });

  it('turns a facet parse that throws into LANGUAGE_FACET_FAILED with generic features', async () => {
    const thrower: LanguageFacet = {
      ...fake('thrower'),
      parse: () => {
        throw new Error('boom');
      },
    };
    const s = createLanguageService({
      facets: [
        {
          type: 'thrower',
          id: 'thrower',
          detector: (t) => t.startsWith('thrower'),
          facet: thrower,
        },
      ],
    });
    await s.preload();
    const text = 'thrower\n  %% note\n  x\n';
    const doc = s.update('x', text);
    expect(doc.facet).toBeUndefined();
    expect(doc.diagnostics()).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'LANGUAGE_FACET_FAILED',
        range: { start: 0, end: 7 },
        message: expect.stringContaining('boom') as unknown,
      }),
    ]);
    // Generic features: the comment is still marked, queries answer without the facet.
    expect(doc.semanticTokens().map((t) => t.type)).toEqual(['comment']);
    expect(doc.completions(text.length)).toEqual([]);
    expect(doc.hover(text.indexOf('x'))).toBeUndefined();
  });

  it('adds the preprocess diagnostics a facet does not report, once each', async () => {
    const text = '---\nconfig:\n  theme: dark: bad\n---\n%%{init: {"a" 1}}%%\nthird\n  A[x\n';
    // A third-party facet that leaves preprocess to the service: only its own error.
    const own: LanguageFacet = {
      ...fake('third'),
      parse: (t, o) => {
        const r = flowchartLanguage.parse(t, o);
        return { ...r, diagnostics: r.diagnostics.filter((d) => d.code === 'UNCLOSED') };
      },
    };
    const s = createLanguageService({
      facets: [{ type: 'third', id: 'third', detector: (t) => t.startsWith('third'), facet: own }],
    });
    await s.preload();
    expect(
      s
        .update('x', text)
        .diagnostics()
        .map((d) => d.code)
    ).toEqual(['YAML_SYNTAX', 'INVALID_DIRECTIVE', 'UNCLOSED']);
    // Flowchart reports them itself: still once each.
    const flow = text.replace('third', 'flowchart LR');
    expect((await open(flow)).diagnostics().map((d) => d.code)).toEqual([
      'YAML_SYNTAX',
      'INVALID_DIRECTIVE',
      'UNCLOSED',
    ]);
  });

  it('keeps a replaced first-party row apart from the other rows of the same diagram id', async () => {
    const s = createLanguageService({
      facets: [
        {
          type: 'flowchart-v2',
          id: 'flowchart',
          detector: (text) => /^\s*(graph|flowchart)/.test(text),
          load: () => Promise.resolve(fake('custom')),
        },
      ],
    });
    await s.preload();
    const elk = s.update('a', 'flowchart-elk TD\nA-->B\n');
    const v2 = s.update('b', 'flowchart TD\nA-->B\n');
    expect(elk.facet?.id).toBe('flowchart');
    expect(v2.facet?.id).toBe('custom');
  });
});

describe('preload (D155)', () => {
  const counted = () => {
    const loads: string[] = [];
    const rows = ['aaa', 'bbb'].map((type) =>
      row(type, () => {
        loads.push(type);
        return Promise.resolve(fake(type));
      })
    );
    return { loads, service: createLanguageService({ facets: rows }) };
  };

  it('loads only the types asked for', async () => {
    const { loads, service: s } = counted();
    await s.preload({ types: ['aaa'] });
    expect(loads).toEqual(['aaa']);
    expect(s.update('x', 'aaa\n').facet?.id).toBe('aaa');
    expect(
      s
        .update('y', 'bbb\n')
        .diagnostics()
        .map((d) => d.code)
    ).toEqual(['LANGUAGE_NOT_LOADED']);
  });

  it('narrows first-party facets by diagram id', async () => {
    const s = createLanguageService();
    await s.preload({ types: ['flowchart'] });
    expect(s.update('x', 'flowchart TD\nA\n').facet?.id).toBe('flowchart');
  });

  it('loads each facet once when called again', async () => {
    const { loads, service: s } = counted();
    await Promise.all([s.preload(), s.preload()]);
    await s.preload();
    expect(loads.sort()).toEqual(['aaa', 'bbb']);
  });
});

describe('snapshots are immutable', () => {
  it('freezes what queries return', async () => {
    const doc = await open('flowchart TD\nA-->B\nA -->\n');
    const tokens = doc.semanticTokens();
    expect(() => {
      (tokens as unknown[]).length = 0;
    }).toThrow();
    expect(doc.semanticTokens().length).toBeGreaterThan(0);
    const diags = doc.diagnostics();
    expect(Object.isFrozen(diags)).toBe(true);
    expect(Object.isFrozen(diags[0])).toBe(true);
    expect(Object.isFrozen(doc.foldingRanges())).toBe(true);
    const def = doc.definition(13);
    expect(Object.isFrozen(def)).toBe(true);
  });
});

describe('the snapshot hides its parse (D90)', () => {
  it('exports DocumentSnapshot as a type only, with no public context', async () => {
    const api = await import('./index.ts');
    expect('DocumentSnapshot' in api).toBe(false);
    const doc = await open('flowchart TD\n  A --> B\n');
    expect('context' in doc).toBe(false);
    expect(Object.keys(doc)).toEqual([]);
  });

  it('hands a facet a parse it cannot change behind the memoised queries', async () => {
    let seen: DocumentView | undefined;
    const spy: LanguageFacet = {
      ...fake('spy'),
      hover: (_at, view) => {
        seen = view;
        return undefined;
      },
    };
    // The spy replaces flowchart's row: flowchart's parse, the spy's hover.
    const s = createLanguageService({
      facets: [
        {
          type: 'flowchart-v2',
          id: 'flowchart',
          detector: (t) => t.startsWith('flowchart'),
          facet: spy,
        },
      ],
    });
    const text = 'flowchart TD\n  subgraph S\n    A --> B\n  end\n  A[x\n';
    const doc = s.update('spy', text);
    doc.hover(text.indexOf('A'));
    const result = seen!.result;
    for (const part of [
      seen,
      result,
      result.diagnostics,
      result.diagnostics[0],
      result.diagnostics[0]!.range,
      result.symbols,
      result.statements,
      result.tokens,
      result.ast,
    ])
      expect(Object.isFrozen(part)).toBe(true);
    expect(() => {
      result.statements.length = 0;
    }).toThrow(TypeError);
    // Elements are not frozen, but the queries read their own copies, taken before the facet
    // ran: a change made now (before folding or references were ever asked) reaches neither.
    expect(result.symbols.length).toBeGreaterThan(2);
    expect(result.statements.map((st) => st.kind)).toContain('subgraph');
    for (const sym of result.symbols) sym.range.start = 999;
    for (const st of result.statements) st.range.end = 0;
    const sub = doc.foldingRanges().find((f) => f.kind === 'subgraph');
    expect(sub && text.slice(sub.range.start, sub.range.end)).toBe(
      'subgraph S\n    A --> B\n  end'
    );
    expect(doc.references(text.indexOf('A')).map((r) => r.start)).toEqual([
      text.indexOf('A'),
      text.lastIndexOf('A'),
    ]);
  });
});

describe('diagnostics are frozen copies', () => {
  it('copies range, related and expected, and leaves the parse result as it was', async () => {
    const doc = await open('flowchart TD\n  subgraph S\n    A --> B\n');
    const own = contextOf(doc).result!.diagnostics;
    const d = doc.diagnostics().find((x) => x.related?.length)!;
    expect(d.related!.length).toBeGreaterThan(0);
    const src = own.find((x) => x.code === d.code)!;
    expect(d).toEqual(src);
    for (const part of [d, d.range, d.related, d.related![0], d.related![0]!.range])
      expect(Object.isFrozen(part)).toBe(true);
    if (d.expected) expect(Object.isFrozen(d.expected)).toBe(true);
    expect(d.range).not.toBe(src.range);
    expect(d.related![0]).not.toBe(src.related![0]);
    expect(Object.isFrozen(src)).toBe(false);
    expect(Object.isFrozen(src.range)).toBe(false);
  });

  it('copies expected', async () => {
    const doc = await open('flowchart TD\n  A -->\n');
    const d = doc.diagnostics().find((x) => x.expected?.length)!;
    const src = contextOf(doc).result!.diagnostics.find((x) => x.code === d.code)!;
    expect(d.expected).toEqual(src.expected);
    expect(d.expected).not.toBe(src.expected);
    expect(Object.isFrozen(d.expected)).toBe(true);
    expect(Object.isFrozen(src.expected)).toBe(false);
  });
});

describe('semantic tokens around subgraphs (D94)', () => {
  const typed = (doc: DocumentSnapshot) =>
    doc
      .semanticTokens()
      .filter((t) => t.type === 'node' || t.type === 'subgraph')
      .map(
        (t) => `${doc.text.slice(t.range.start, t.range.end)} ${t.type} [${t.modifiers.join(',')}]`
      );

  it('types a subgraph id as subgraph when an edge names it first', async () => {
    const text = 'flowchart TD\nA-->S\nsubgraph S\n  a\nend\n';
    const doc = await open(text);
    expect(typed(doc)).toEqual([
      'A node [declaration,definition]',
      'S subgraph []',
      'S subgraph [declaration,definition]',
      'a node [declaration,definition]',
    ]);
    expect(doc.definition(at(text, 'S'))).toEqual({
      start: at(text, 'S', 2),
      end: at(text, 'S', 2) + 1,
    });
  });

  it('gives an edge to an earlier subgraph no declaration', async () => {
    const doc = await open('flowchart TD\nsubgraph S\n  a\nend\nA --> S\n');
    expect(typed(doc)).toEqual([
      'S subgraph [declaration,definition]',
      'a node [declaration,definition]',
      'A node [declaration,definition]',
      'S subgraph []',
    ]);
  });
});

describe('semantic tokens never overlap (LSP, #38)', () => {
  const tokens = (doc: DocumentSnapshot) =>
    doc.semanticTokens().map((t) => `${doc.text.slice(t.range.start, t.range.end)} ${t.type}`);

  it('keeps a node id that spans lexer tokens whole', async () => {
    // `default-index.js` is two lexer tokens and one node.
    const doc = await open('flowchart LR\n  default-index.js --> b\n');
    expect(tokens(doc)).toEqual([
      'flowchart keyword',
      'LR enumMember',
      'default-index.js node',
      '--> operator',
      'b node',
    ]);
  });

  it('keeps a node id that starts with digits whole (#36 review)', async () => {
    const doc = await open('flowchart TD\n  1A --> 1B\n');
    expect(tokens(doc)).toEqual([
      'flowchart keyword',
      'TD enumMember',
      '1A node',
      '--> operator',
      '1B node',
    ]);
  });

  it('ends a keyword before a comment its token runs over', async () => {
    const doc = await open('flowchart LR\n  subgraph S\n    a\n  end\n\n  %% note\n  a --> b\n');
    expect(tokens(doc)).toContain('end keyword');
    expect(tokens(doc)).toContain('%% note comment');
  });

  it('are in order and disjoint over the corpus', () => {
    const root = join(import.meta.dirname, '../../../e2e/diagrams');
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) =>
      f.endsWith('.mmd')
    );
    let overlaps = 0;
    for (const f of files) {
      const list = service.update('x', readFileSync(join(root, f), 'utf8')).semanticTokens();
      for (let i = 1; i < list.length; i++)
        if (list[i]!.range.start < list[i - 1]!.range.end) overlaps++;
    }
    expect(overlaps).toBe(0);
  });
});
