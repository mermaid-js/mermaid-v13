import { describe, expect, it } from 'vitest';
import { LANGIUM_NAMES } from './tokens.ts';
import { parseInfo } from './parser.ts';

const errors = (src: string) => parseInfo(src).diagnostics.filter((d) => d.severity === 'error');

describe('parseInfo: the model', () => {
  it('reads showInfo, wherever v12 accepted it', () => {
    for (const src of ['info showInfo', 'info\n\n  showInfo\n', '\n  info %% c\n  showInfo'])
      expect(parseInfo(src).model.showInfo, JSON.stringify(src)).toBe(true);
    expect(parseInfo('info').model.showInfo).toBe(false);
  });

  it('keeps the last title, accTitle and accDescr, as v12’s Langium assignments did', () => {
    const { model, diagnostics } = parseInfo(
      'info\ntitle one\ntitle  two  words\naccTitle: A\naccDescr {\n  line one\n\n  line two\n}'
    );
    expect(diagnostics).toEqual([]);
    expect(model).toMatchObject({
      title: 'two words',
      accTitle: 'A',
      accDescr: 'line one\nline two',
    });
  });

  it('falls back to the front-matter title when the text has none (D218)', () => {
    expect(parseInfo('---\ntitle: Front\n---\ninfo').model.title).toBe('Front');
    expect(parseInfo('---\ntitle: Front\n---\ninfo\ntitle In text').model.title).toBe('In text');
    expect(parseInfo('info').model).not.toHaveProperty('title');
  });

  it('gives the AST ids info, title, accTitle and accDescr, with @n on repeats', () => {
    const { ast } = parseInfo('info showInfo\ntitle a\ntitle b\naccTitle: c\naccDescr: d');
    expect(ast.children.map((n) => n.id)).toEqual([
      'info',
      'title',
      'title@2',
      'accTitle',
      'accDescr',
    ]);
    const src = 'info\n%% c\nshowInfo';
    const header = parseInfo(src).ast.children[0]!;
    expect(src.slice(header.range.start, header.range.end)).toBe(src);
  });
});

describe('parseInfo: errors', () => {
  it('rejects what v12 rejected, one diagnostic per error (pitfall 8)', () => {
    expect(errors('info unsupported')).toHaveLength(1);
    expect(errors('info\ntitle a\nshowInfo')).toHaveLength(1);
    expect(errors('info showInfo showInfo')).toHaveLength(1);
    expect(errors('info\nunsupported\ntitle a\nnope\naccTitle x')).toHaveLength(3);
    expect(errors('infox')).toHaveLength(1);
    expect(errors('info\naccDescr { never closed')).toHaveLength(1);
  });

  it('says what an info diagram holds, and never names a token (R-ERR-5)', () => {
    const names = Object.values(LANGIUM_NAMES).filter((n) => /^[A-Z_]+$/.test(n));
    for (const src of [
      'info unsupported',
      'info\ntitle a\nshowInfo',
      'info info',
      'infox',
      'info\naccTitle x',
      'info\naccDescr {a} title b',
    ]) {
      const [d] = errors(src);
      expect(d, src).toBeDefined();
      for (const n of names) expect(d!.message, src).not.toContain(n);
    }
    expect(errors('info unsupported')[0]!.message).toContain('`showInfo`');
    expect(errors('info\ntitle a\nshowInfo')[0]!.message).toContain('goes once, after `info`');
    expect(errors('info\naccTitle x')[0]!.message).toContain('accTitle: …');
  });

  it('never throws, and recovers at the next line', () => {
    const { ast } = parseInfo('info\n@@\ntitle after');
    expect(ast.children.map((n) => n.type)).toEqual(['Header', 'Title']);
  });
});
