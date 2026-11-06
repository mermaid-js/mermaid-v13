import { describe, expect, it } from 'vitest';
import { parseMindmap } from '../index.ts';

/** Review of #386: one mistake gives one diagnostic, and messages say what the author wrote. */
const errors = (src: string) => parseMindmap(src).diagnostics.filter((d) => d.severity === 'error');

describe('mindmap parser review fixes', () => {
  it('a node that fails inside its shape is still added (pitfall 8)', () => {
    const src = 'mindmap\n  root[""]\n  :::big\n    a\n    b\n';
    const r = parseMindmap(src);
    expect(errors(src).map((d) => d.code)).toEqual(['UNEXPECTED']);
    expect(r.model.nodes.map((n) => [n.id, n.parent, n.classes])).toEqual([
      ['root', undefined, ['big']],
      ['a', 0, []],
      ['b', 0, []],
    ]);
  });

  it('an empty shape or a missing closer is one error, with the node kept', () => {
    expect(errors('mindmap\n  root[]\n    a\n    b\n')).toHaveLength(1);
    const r = parseMindmap('mindmap\n  root[x y\n    a\n');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(1);
    expect(r.model.nodes[0]?.id).toBe('root');
    expect(errors('mindmap\n  root["a" b]\n    c\n')).toHaveLength(1);
  });

  it.each(['', '   ', '%% only a comment', '---\ntitle: t\n---\n', '\n\n'])(
    'reports a missing header once for %j',
    (src) => {
      expect(errors(src).map((d) => d.message)).toEqual([
        'Expected `mindmap`, got the end of the text; a mindmap starts with `mindmap`.',
      ]);
    }
  );

  it('gives the decoration hint only when a decoration follows', () => {
    const [two] = errors('mindmap\n  root\n    a[b] c\n');
    expect(two?.message).not.toMatch(/icon/);
    const [icon] = errors('mindmap\n  root\n    a[b] ::icon(x)\n');
    expect(icon?.message).toMatch(/::icon/);
  });

  it('names a decoration as written', () => {
    const [first] = errors('mindmap\n\n  ::icon(x)\n  root\n');
    expect(first?.message).toContain('got `::icon(x)`');
  });

  it('a rejected second root stretches no span, and its class stays with it', () => {
    const src = 'mindmap\n  root\n    a\n      b\n  z\n  :::q\n    c\n';
    const r = parseMindmap(src);
    const text = (s: { range: { start: number; end: number } }) =>
      src.slice(s.range.start, s.range.end);
    const root = r.statements[1];
    const a = root?.children?.[0];
    expect(text(a!)).toBe('a\n      b');
    expect(text(a!.children![0]!)).toBe('b');
    expect(a!.children![0]!.children).toBeUndefined();
    const z = r.ast.children.find((n) => n.id === 'n:z');
    expect(z?.decorations.map((d) => d.text)).toEqual(['q']);
    expect(r.model.nodes.map((n) => [n.id, n.classes])).toEqual([
      ['root', []],
      ['a', []],
      ['b', []],
      ['c', []],
    ]);
  });
});
