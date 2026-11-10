import { describe, expect, it } from 'vitest';
import { ISHIKAWA_EMPTY, ISHIKAWA_INDENT_CLAMPED, parseIshikawa } from '../index.ts';
import type { IshikawaCause, IshikawaModel } from '../index.ts';

/**
 * The ishikawa parser through `parseIshikawa` (spec #519). Expected trees are mermaid\@12's,
 * from the oracle (`getRoot()`, `getDiagramTitle()`), unless a test says otherwise.
 */
const model = (src: string): IshikawaModel => {
  const r = parseIshikawa(src);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.model;
};

/** The causes as `[depth, text]` in preorder, the effect at depth 0. */
const tree = (m: IshikawaModel): [number, string][] => {
  const out: [number, string][] = m.effect ? [[0, m.effect.text]] : [];
  const walk = (causes: readonly IshikawaCause[], depth: number) => {
    for (const c of causes) {
      out.push([depth, c.text]);
      walk(c.causes, depth + 1);
    }
  };
  walk(m.causes, 1);
  return out;
};

describe('ishikawa parser: effect and causes', () => {
  it('makes the first line the effect and nests causes by indent', () => {
    const m = model(
      'ishikawa-beta\n    Blurry Photo\n        Process\n            Out of focus\n        User\n            Shaky hands\n'
    );
    expect(tree(m)).toEqual([
      [0, 'Blurry Photo'],
      [1, 'Process'],
      [2, 'Out of focus'],
      [1, 'User'],
      [2, 'Shaky hands'],
    ]);
  });

  it('reads an unindented effect and causes (v12 spec 2)', () => {
    expect(tree(model('ishikawa-beta\nProblem\nCause A\n  Subcause A1\nCause B\n'))).toEqual([
      [0, 'Problem'],
      [1, 'Cause A'],
      [2, 'Subcause A1'],
      [1, 'Cause B'],
    ]);
  });

  it("ignores the effect's indent: the first cause sets the baseline (v12 spec 3)", () => {
    const m = model('ishikawa-beta\n    Problem\nCause A\n  Subcause A1\nCause B\n');
    expect(tree(m)).toEqual([
      [0, 'Problem'],
      [1, 'Cause A'],
      [2, 'Subcause A1'],
      [1, 'Cause B'],
    ]);
    expect(m.warnings).toEqual([]);
  });

  it('takes the effect from the header line, after `ishikawa` when `-beta` runs on', () => {
    expect(tree(model('ishikawa-beta Problem here\n  A'))).toEqual([
      [0, 'Problem here'],
      [1, 'A'],
    ]);
    expect(tree(model('ishikawa-betax\n  A'))).toEqual([
      [0, '-betax'],
      [1, 'A'],
    ]);
  });

  it('pops to the last cause of a lower level, so a deeper indent is not a deeper depth', () => {
    const m = model('ishikawa-beta\nP\n  A\n      a\n    b');
    expect(tree(m)).toEqual([
      [0, 'P'],
      [1, 'A'],
      [2, 'a'],
      [2, 'b'],
    ]);
    expect(m.causes[0]?.causes.map((c) => [c.text, c.level])).toEqual([
      ['a', 5],
      ['b', 3],
    ]);
  });

  it('counts a tab as one column, and matches the keyword in any case', () => {
    expect(tree(model('ishikawa\nP\n\tA\n\t\ta\n\tB'))).toEqual([
      [0, 'P'],
      [1, 'A'],
      [2, 'a'],
      [1, 'B'],
    ]);
    expect(tree(model('ISHIKAWA\nP\n  A'))).toEqual([
      [0, 'P'],
      [1, 'A'],
    ]);
  });

  it('keeps an inline `%%`, `<br>` and entities in the text, and reads `title` as a cause', () => {
    const m = model(
      'ishikawa-beta\nP<br>Q\n  A %% not a comment\n  title Foo\n  accTitle: x\n  A &amp; #35; b<br/>c  '
    );
    expect(tree(m)).toEqual([
      [0, 'P<br>Q'],
      [1, 'A %% not a comment'],
      [1, 'title Foo'],
      [1, 'accTitle: x'],
      [1, 'A &amp; &#35; b<br/>c'],
    ]);
    expect(m.title).toBeUndefined();
  });

  it('keeps the front-matter title apart from the effect (D492)', () => {
    const m = model('---\ntitle: FM\n---\nishikawa-beta\nP\n  A');
    expect(m.title).toBe('FM');
    expect(m.effect?.text).toBe('P');
  });
});

describe('ishikawa parser: AST ids, ranges, symbols and spans (D497)', () => {
  const src = 'ishikawa-beta\n  P  \n  A\n    a\n    a\n  A\n';
  const r = parseIshikawa(src);
  const at = (text: string, from = 0) => {
    const start = src.indexOf(text, from);
    return { start, end: start + text.length };
  };

  it('ids the effect and each cause by its position in the tree', () => {
    expect(r.ast.children.map((n) => [n.type, n.id, n.text])).toEqual([
      ['Effect', 'effect', 'P'],
      ['Cause', 'cause:1', 'A'],
      ['Cause', 'cause:1.1', 'a'],
      ['Cause', 'cause:1.2', 'a'],
      ['Cause', 'cause:2', 'A'],
    ]);
    expect(r.model.effect?.ast).toBe('effect');
    expect(r.model.causes.map((c) => [c.ast, c.causes.map((s) => s.ast)])).toEqual([
      ['cause:1', ['cause:1.1', 'cause:1.2']],
      ['cause:2', []],
    ]);
  });

  it('gives each line the range of its text, blanks left out', () => {
    expect(r.model.effect?.range).toEqual(at('P'));
    expect(r.model.causes[1]?.range).toEqual(at('A', src.indexOf('    a\n  A') + 1));
    expect(r.ast.children.map((n) => n.indent)).toEqual([2, 2, 4, 4, 2]);
  });

  it('makes each cause a definition of its own, and nests cause spans by the tree', () => {
    expect(r.symbols.map((s) => [s.name, s.kind, s.role])).toEqual([
      ['A', 'cause', 'def'],
      ['a', 'cause', 'def'],
      ['a', 'cause', 'def'],
      ['A', 'cause', 'def'],
    ]);
    const first = src.indexOf('A');
    const lastA = src.lastIndexOf('    a') + 5;
    expect(r.statements.map((s) => [s.kind, s.range, s.children?.length ?? 0])).toEqual([
      ['header', at('ishikawa-beta'), 0],
      ['effect', at('P'), 0],
      ['cause', { start: first, end: lastA }, 2],
      ['cause', { start: src.lastIndexOf('A'), end: src.lastIndexOf('A') + 1 }, 0],
    ]);
  });
});

describe('ishikawa parser: warnings (D496)', () => {
  it('warns once when there is no effect', () => {
    for (const src of ['ishikawa-beta\n', 'ishikawa-beta\n   \n', 'ishikawa %% c\n']) {
      const r = parseIshikawa(src);
      expect(r.diagnostics.map((d) => [d.severity, d.code])).toEqual([['warning', ISHIKAWA_EMPTY]]);
      expect(r.model.effect).toBeUndefined();
      expect(r.model.causes).toEqual([]);
    }
  });

  it('flattens causes indented less than the first cause, with one warning naming each', () => {
    const src = 'ishikawa-beta\nP\n    A\n      a1\n  B\n    b1\n C';
    const r = parseIshikawa(src);
    expect(tree(r.model)).toEqual([
      [0, 'P'],
      [1, 'A'],
      [2, 'a1'],
      [1, 'B'],
      [1, 'b1'],
      [1, 'C'],
    ]);
    const warnings = r.model.warnings;
    expect(warnings.map((d) => d.code)).toEqual([ISHIKAWA_INDENT_CLAMPED]);
    const w = warnings[0]!;
    expect(w.range.start).toBe(src.indexOf('B'));
    expect(w.related?.map((x) => src.slice(x.range.start, x.range.end))).toEqual(['B', 'C']);
    expect(w.message).toMatch(/2 causes are indented less than the first cause \(`A` at line 3\)/);
  });

  it('names every clamped cause in the message, up to ten, then how many more (D496)', () => {
    const clamp = (n: number) =>
      parseIshikawa(
        ['ishikawa-beta', 'P', '    A', ...Array.from({ length: n }, (_, i) => `  C${i + 1}`)].join(
          '\n'
        )
      ).model.warnings[0]!;
    const five = clamp(5);
    expect(five.message).toBe(
      '5 causes are indented less than the first cause (`A` at line 3), so they are read as top-level causes: `C1` at line 4, `C2` at line 5, `C3` at line 6, `C4` at line 7, `C5` at line 8. Indent them at least as deep as the first cause to nest them.'
    );
    expect(five.related).toHaveLength(5);
    const twelve = clamp(12);
    expect(twelve.message).toContain(': `C1` at line 4, `C2` at line 5,');
    expect(twelve.message).toContain(
      '`C10` at line 13, and 2 more. Indent them at least as deep as the first cause to nest them.'
    );
    expect(twelve.message).not.toContain('`C11`');
    expect(twelve.related?.map((r) => r.message.split(' ')[0])).toEqual(
      Array.from({ length: 12 }, (_, i) => `\`C${i + 1}\``)
    );
  });
});

describe('ishikawa parser: errors (R-PARSE-4)', () => {
  const errors = (src: string) =>
    parseIshikawa(src).diagnostics.filter((d) => d.severity === 'error');

  it('rejects a header with no line break after it, once', () => {
    const [e, ...rest] = errors('ishikawa');
    expect(rest).toEqual([]);
    expect(e?.code).toBe('UNEXPECTED');
    expect(e?.message).toBe(
      'Expected a line of text: the effect or a cause, got the end of the text; end the header line with a line break, then write the effect.'
    );
  });

  it('rejects a line starting with the keyword, and reads on', () => {
    const r = parseIshikawa('ishikawa-beta\nP\n  ishikawa review\n  B\nIshikawa\n  C');
    expect(r.diagnostics.map((d) => [d.code, d.range.start])).toEqual([
      ['UNEXPECTED', 18],
      ['UNEXPECTED', 38],
    ]);
    expect(r.diagnostics[0]?.message).toMatch(
      /^Expected a line of text: the effect or a cause, got `ishikawa`; a line may not start with the keyword/
    );
    expect(tree(r.model)).toEqual([
      [0, 'P'],
      [1, 'B'],
      [1, 'C'],
    ]);
  });

  it('rejects a line after a blank line right after the header, and still reads it', () => {
    const r = parseIshikawa('ishikawa-beta\n\nP\n  A');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['UNEXPECTED']);
    expect(r.diagnostics[0]?.message).toMatch(
      /^Expected a line break, got `P`; remove a blank or comment line above it, or add one/
    );
    expect(tree(r.model)).toEqual([
      [0, 'P'],
      [1, 'A'],
    ]);
    // Two blank runs (a comment line between) after a line: the same.
    expect(errors('ishikawa-beta\nP\n%%\n\n  A')).toHaveLength(1);
    expect(errors('ishikawa-beta\nP\n\n\n  A')).toEqual([]);
  });

  it('rejects text after a comment that a line separator ends', () => {
    const [e, ...rest] = errors('ishikawa-beta %% c P');
    expect(rest).toEqual([]);
    expect(e?.message).toMatch(/got `P`; a comment ends at a line separator/);
  });

  it('names the text past a directive cut out between the blanks and the text', () => {
    // The indent, then a removed directive (trivia), then the text: the message names the text.
    const src = 'ishikawa-beta %% c\u2028 %%{init: {}}%%P\n  A';
    const [e, ...rest] = errors(src);
    expect(rest).toEqual([]);
    expect(e?.message).toMatch(/got `P`; a comment ends at a line separator/);
    expect(e?.range).toEqual({ start: src.indexOf('P'), end: src.indexOf('P') + 1 });
  });

  it('reports a missing header once and reads the lines', () => {
    const r = parseIshikawa('Problem\n  A');
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      'Expected `ishikawa` or `ishikawa-beta`, got `Problem`; an Ishikawa diagram starts with `ishikawa` or `ishikawa-beta`.',
    ]);
    expect(tree(r.model)).toEqual([
      [0, 'Problem'],
      [1, 'A'],
    ]);
    expect(errors('')).toHaveLength(1);
  });
});
