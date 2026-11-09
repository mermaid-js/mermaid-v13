import { describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { parseUsecase } from './parser.ts';

/**
 * The parser's own outputs beyond the model v12 had (#563): AST ids (D475), symbols (D477),
 * statement spans for folding and highlighting, the front-matter title (D472), JSON rows, and
 * diagnostics with related ranges (D473). Model parity with v12 is the conformance suite's.
 */
type RawGlob = (
  pattern: string,
  options: { query: '?raw'; import: 'default'; eager: true }
) => Readonly<Record<string, string>>;
/** Vite's `import.meta.glob` (Vitest runs it) reads the files: the package needs no Node types. */
const FIXTURES = (import.meta as ImportMeta & { glob: RawGlob }).glob(
  '../../../../e2e/diagrams/usecase/nightly-check/parser-*.mmd',
  {
    query: '?raw',
    import: 'default',
    eager: true,
  }
);
const CASES_FILE = (import.meta as ImportMeta & { glob: RawGlob }).glob(
  '../../../conformance/corpus/usecase-cases.json',
  {
    query: '?raw',
    import: 'default',
    eager: true,
  }
);
/** An e2e fixture, `e2e/diagrams/usecase/nightly-check/<name>.mmd`. */
const fixture = (name: string): string => {
  const text = FIXTURES[`../../../../e2e/diagrams/usecase/nightly-check/${name}.mmd`];
  if (text === undefined) throw new Error(`no fixture ${name}`);
  return text;
};
const CASES = JSON.parse(Object.values(CASES_FILE)[0] ?? '[]') as { id: string; source: string }[];
/** A case of `corpus/usecase-cases.json`, `usecase-cases/parse/<name>`. */
const testCase = (name: string): string => {
  const found = CASES.find((c) => c.id === `usecase-cases/parse/${name}`);
  if (!found) throw new Error(`no case ${name}`);
  return found.source;
};

/** Every AST node id, depth first. */
function ids(node: AstNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(ids)];
}

describe('parseUsecase AST ids (D475)', () => {
  it('names each mention by its resolved kind, with @n for later mentions', () => {
    const { ast, model } = parseUsecase(fixture('parser-ast-ids'));
    expect(ids(ast)).toEqual([
      'doc',
      'usecase',
      'rel:User->Login',
      'actor:User',
      'usecase:Login',
      'actor:User@2',
      'rel:Login->Logout',
      'usecase:Login@2',
      'usecase:Logout',
      'boundary:Shop',
      'usecase:Pay',
      'json:P',
      'rel:e1',
      'actor:User@3',
      'json:P@2',
      'note:1',
      'note:2',
      'classDef:1',
      'class:1',
    ]);
    expect(model.actors.map((a) => a.astId)).toEqual(['actor:User']);
    expect(model.useCases.map((u) => u.astId)).toEqual([
      'usecase:Login',
      'usecase:Logout',
      'usecase:Pay',
    ]);
    expect(model.boundaries[0]?.astId).toBe('boundary:Shop');
    expect(model.jsonTables[0]?.astId).toBe('json:P');
    expect(model.relationships.map((r) => r.astId)).toEqual([
      'rel:User->Login',
      'rel:Login->Logout',
      'rel:e1',
    ]);
    expect(model.notes.map((n) => [n.id, n.astId])).toEqual([
      ['note-0', 'note:1'],
      ['note-1', 'note:2'],
    ]);
  });

  it('counts parallel relations, and percent-encodes what ids reserve', () => {
    const { ast } = parseUsecase(fixture('parser-parallel-relations'));
    expect(ast.children.filter((c) => c.type === 'Relation').map((c) => c.id)).toEqual([
      'rel:A->B',
      'rel:A->B@2',
      'rel:a_b->B',
    ]);
  });
});

describe('parseUsecase symbols (D477)', () => {
  it('defines at the first mention and refers at the others', () => {
    const { symbols } = parseUsecase(fixture('parser-symbols'));
    expect(symbols.map((s) => [s.name, s.kind, s.role])).toEqual([
      ['User', 'actor', 'def'],
      ['Login', 'usecase', 'def'],
      ['User', 'actor', 'ref'],
      ['Login', 'usecase', 'ref'],
      ['Login', 'usecase', 'ref'],
      ['User', 'actor', 'ref'],
      ['e1', 'edge', 'def'],
      ['Login', 'usecase', 'ref'],
      ['e1', 'edge', 'ref'],
    ]);
  });

  it('names a quoted element by its label, the text between the quotes (D191)', () => {
    const src = fixture('parser-quoted-symbol');
    const { symbols } = parseUsecase(src);
    const reset = symbols.filter((s) => s.name === 'Reset password');
    expect(reset.map((s) => [s.role, src.slice(s.range.start, s.range.end)])).toEqual([
      ['def', 'Reset password'],
      ['ref', 'Reset_password'],
    ]);
  });

  it('has no symbol for a name that resolves to nothing', () => {
    const { symbols } = parseUsecase(testCase('unresolved-class'));
    expect(symbols).toEqual([]);
  });
});

describe('parseUsecase statements', () => {
  it('spans each statement, a boundary with its members', () => {
    const src = fixture('parser-statements');
    const { statements } = parseUsecase(src);
    const text = (r: { start: number; end: number }) => src.slice(r.start, r.end);
    expect(
      statements.map((s) => [s.kind, text(s.range), (s.children ?? []).map((c) => text(c.range))])
    ).toEqual([
      ['header', 'usecase-beta', []],
      ['actor', 'actor A', []],
      ['boundary', 'systemBoundary S\n  B\n  actor C\nend', ['B', 'actor C']],
      ['relation', 'A --> B', []],
    ]);
  });
});

describe('parseUsecase model extras', () => {
  it('keeps the front-matter title (D472)', () => {
    const { model } = parseUsecase(fixture('parser-front-matter-title'));
    expect(model.title).toBe('Shop');
  });

  it('flattens JSON tables into rows in source key order', () => {
    const { model } = parseUsecase(fixture('parser-json-rows'));
    expect(model.jsonTables[0]?.rows).toEqual([
      { key: '2', accessibleKey: '2', value: 'b' },
      { key: '1', accessibleKey: '1', value: 'a' },
      { key: 'list', accessibleKey: 'list', value: 'x' },
      { key: '', accessibleKey: 'list', value: 'y' },
      { key: 'o.k', accessibleKey: 'o.k', value: 'true' },
      { key: 'e', accessibleKey: 'e', value: '{}' },
    ]);
  });

  it("shows v12's entity codes as their characters, and keeps an author's `&` as written", () => {
    const { model } = parseUsecase(fixture('parser-entities'));
    expect(model.useCases.map((u) => u.label)).toEqual(['x & y', '&amp;']);
  });
});

describe('parseUsecase diagnostics (D473)', () => {
  it('words a model error as v12 did, without its location, the earlier declaration related', () => {
    const src = testCase('kind-conflict');
    const [d] = parseUsecase(src).diagnostics;
    expect(d?.message).toBe("ID 'Shared' is declared as both actor and usecase");
    expect(src.slice(d?.range.start, d?.range.end)).toBe('Shared');
    expect(d?.range.start).toBe(src.lastIndexOf('Shared'));
    expect(d?.related?.map((r) => [r.message, r.range.start])).toEqual([
      ['previous declaration', src.indexOf('Shared')],
    ]);
  });

  it("names a generated id's label as v12 did", () => {
    const { diagnostics } = parseUsecase(testCase('generated-collision'));
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Generated ID \'A_B\' collides with another declaration (label "A-B")',
    ]);
    expect(diagnostics[0]?.related?.[0]?.message).toBe('previous declaration (label "A B")');
  });

  it('reports a statement v12 could not choose at its start, where v12 did', () => {
    const src = testCase('statement-choice');
    const [d] = parseUsecase(src).diagnostics;
    expect(d?.range.start).toBe(src.indexOf('A;'));
    expect(d?.message).toMatch(/^Expected .*, got `;`\.$/);
  });

  it('never throws', () => {
    const names = ['header', 'quote', 'stereotype', 'json', 'markdown', 'acc-descr'];
    for (const src of names.map((n) => testCase(`never-throws-${n}`))) {
      expect(() => parseUsecase(src)).not.toThrow();
    }
  });
});
