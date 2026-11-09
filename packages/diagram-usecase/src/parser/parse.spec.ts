import { describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { parseUsecase } from './parser.ts';

/**
 * The parser's own outputs beyond the model v12 had (#563): AST ids (D475), symbols (D477),
 * statement spans for folding and highlighting, the front-matter title (D472), JSON rows, and
 * diagnostics with related ranges (D473). Model parity with v12 is the conformance suite's.
 */
const H = 'usecase-beta\n';

/** Every AST node id, depth first. */
function ids(node: AstNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(ids)];
}

describe('parseUsecase AST ids (D475)', () => {
  it('names each mention by its resolved kind, with @n for later mentions', () => {
    const { ast, model } = parseUsecase(
      H +
        [
          'User --> Login',
          'actor User',
          'Login --> Logout',
          'systemBoundary Shop',
          '  Pay',
          'end',
          'json P@{"a": 1}',
          'User e1@--> P',
          'note for Login "n"',
          'note for User "m"',
          'classDef hot fill:red',
          'class Login hot',
        ].join('\n')
    );
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
    const { ast } = parseUsecase(H + 'A --> B\nA --> B\n"a#b" --> B');
    expect(ast.children.filter((c) => c.type === 'Relation').map((c) => c.id)).toEqual([
      'rel:A->B',
      'rel:A->B@2',
      'rel:a_b->B',
    ]);
  });
});

describe('parseUsecase symbols (D477)', () => {
  it('defines at the first mention and refers at the others', () => {
    const { symbols } = parseUsecase(
      H +
        'User --> Login\nactor User\nnote for Login "x"\nstyle Login fill:red\nUser e1@--> Login\ne1@{ animate: true }'
    );
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
    const src = H + '"Reset password" --> Done\nnote for Reset_password "x"';
    const { symbols } = parseUsecase(src);
    const reset = symbols.filter((s) => s.name === 'Reset password');
    expect(reset.map((s) => [s.role, src.slice(s.range.start, s.range.end)])).toEqual([
      ['def', 'Reset password'],
      ['ref', 'Reset_password'],
    ]);
  });

  it('has no symbol for a name that resolves to nothing', () => {
    const { symbols } = parseUsecase(H + 'class Ghost hot');
    expect(symbols).toEqual([]);
  });
});

describe('parseUsecase statements', () => {
  it('spans each statement, a boundary with its members', () => {
    const src = H + 'actor A\nsystemBoundary S\n  B\n  actor C\nend\nA --> B';
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
    const { model } = parseUsecase('---\ntitle: Shop\n---\nusecase-beta\nA');
    expect(model.title).toBe('Shop');
  });

  it('flattens JSON tables into rows in source key order', () => {
    const { model } = parseUsecase(
      H + 'json P@{"2": "b", "1": "a", "list": ["x", "y"], "o": {"k": true}, "e": {}}'
    );
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
    const { model } = parseUsecase(H + 'A[x #amp; y]\nB["&amp;"]');
    expect(model.useCases.map((u) => u.label)).toEqual(['x & y', '&amp;']);
  });
});

describe('parseUsecase diagnostics (D473)', () => {
  it('words a model error as v12 did, without its location, the earlier declaration related', () => {
    const src = H + 'actor Shared\nShared';
    const [d] = parseUsecase(src).diagnostics;
    expect(d?.message).toBe("ID 'Shared' is declared as both actor and usecase");
    expect(src.slice(d?.range.start, d?.range.end)).toBe('Shared');
    expect(d?.range.start).toBe(src.lastIndexOf('Shared'));
    expect(d?.related?.map((r) => [r.message, r.range.start])).toEqual([
      ['previous declaration', src.indexOf('Shared')],
    ]);
  });

  it("names a generated id's label as v12 did", () => {
    const { diagnostics } = parseUsecase(H + '"A B"\n"A-B"');
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Generated ID \'A_B\' collides with another declaration (label "A-B")',
    ]);
    expect(diagnostics[0]?.related?.[0]?.message).toBe('previous declaration (label "A B")');
  });

  it('reports a statement v12 could not choose at its start, where v12 did', () => {
    const src = H + 'A; B';
    const [d] = parseUsecase(src).diagnostics;
    expect(d?.range.start).toBe(src.indexOf('A;'));
    expect(d?.message).toMatch(/^Expected .*, got `;`\.$/);
  });

  it('never throws', () => {
    for (const src of [H, H + '"', H + '<<', H + 'json P@{', H + '"`', H + 'accDescr {', '']) {
      expect(() => parseUsecase(src)).not.toThrow();
    }
  });
});
