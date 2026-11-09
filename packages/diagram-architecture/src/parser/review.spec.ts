import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURE_UNKNOWN_ID,
  ARCHITECTURE_UNKNOWN_PARENT,
  detectArchitecture,
  parseArchitecture,
} from '../index.ts';
import { ArchitectureRegistry } from './normalise.ts';
import { T } from './tokens.ts';

/** The /code-review findings on #599, one spec each (they failed on 49a03c704). */
const src = (...lines: string[]) => ['architecture-beta', ...lines].join('\n');
const codes = (text: string) =>
  parseArchitecture(text).diagnostics.map((d) => `${d.severity} ${d.code}`);

describe('#599 review', () => {
  it('1: a broken end does not hide an unknown id at the other end or a later member', () => {
    expect(codes(src('service a', 'service q extra', 'q:R -- L:zz'))).toEqual([
      'error UNEXPECTED',
      `error ${ARCHITECTURE_UNKNOWN_ID}`,
    ]);
    expect(codes(src('service a', 'service q extra', 'align row q a ghost'))).toEqual([
      'error UNEXPECTED',
      'error ARCHITECTURE_ALIGN_MEMBER',
    ]);
    // Only broken ids: still quiet.
    expect(codes(src('service q extra', 'service r extra', 'q:R -- L:r'))).toEqual([
      'error UNEXPECTED',
      'error UNEXPECTED',
    ]);
  });

  it('2: a statement that fails at its line end burns no `@n`', () => {
    const ids = (text: string) => parseArchitecture(text).ast.children.map((n) => n.id);
    expect(ids(src('service a', 'service a extra', 'service a'))).toEqual([
      'architecture',
      'service:a',
      'service:a@2',
    ]);
    const edges = parseArchitecture(src('service a', 'service b', 'a:R -- L:b x', 'a:R -- L:b'))
      .model.edges;
    expect(edges.map((e) => e.astId)).toEqual(['edge:a->b']);
    expect(ids(src('title x y', 'accTitle: a', 'title z'))).toEqual([
      'architecture',
      'title',
      'accTitle',
      'title@2',
    ]);
  });

  it('3: a service kept without its parent raises no `{group}` warning', () => {
    expect(codes(src('service a in nope', 'service b', 'a{group}:R -- L:b'))).toEqual([
      `error ${ARCHITECTURE_UNKNOWN_PARENT}`,
    ]);
  });

  it('4: detects a header cut by a directive, as v12 did', () => {
    const text = 'archi%%{init: {}}%%tecture-beta\nservice a';
    expect(detectArchitecture(text)).toBe(true);
    expect(parseArchitecture(text).diagnostics).toEqual([]);
    expect(detectArchitecture('archi%%{init: {}}%%tect')).toBe(false);
  });

  it('5: dropped statements leave no references', () => {
    const { symbols } = parseArchitecture(
      src('group g', 'service a', 'service b in g extra', 'a:R -- L:a x', 'align row a a [x]')
    );
    expect(symbols.map((s) => `${s.name} ${s.role}`)).toEqual(['g def', 'a def']);
  });

  it('6: a text statement with an error sets nothing', () => {
    const { model, ast, statements } = parseArchitecture(
      src('accDescr { hello } service x', 'title t extra')
    );
    expect(model.accDescr).toBe('');
    expect(ast.children.map((n) => n.type)).toEqual(['Header', 'Title']);
    expect(statements.map((s) => s.kind)).toEqual(['header', 'title']);
  });

  it('7: `accTitle` as a word mid-statement gets no accessibility hint', () => {
    const [d] = parseArchitecture(src('service a accTitle')).diagnostics;
    expect(d?.message).toMatch(/^Expected .*, got `accTitle`/);
    const [e] = parseArchitecture(src('accTitle x')).diagnostics;
    expect(e?.message).toBe('Expected `:` after `accTitle`; write it as `accTitle: …`.');
  });

  it('8: the probe is in an accessibility value only after its `:`', () => {
    const text = src('accTitle  : x');
    const mode = (o: number) => parseArchitecture(text, { probe: o }).probe?.mode;
    const colon = text.indexOf(':');
    expect(mode(colon - 1)).toBe('INITIAL');
    expect(mode(colon + 1)).toBe('accTitle');
    const block = src('accDescr  { x }');
    const at = (o: number) => parseArchitecture(block, { probe: o }).probe?.mode;
    expect(at(block.indexOf('{'))).toBe('INITIAL');
    expect(at(block.indexOf('x'))).toBe('accDescr');
  });

  it('9: align ids count kept alignments', () => {
    const ids = parseArchitecture(
      src('service a', 'service b', 'align row a b [x]', 'align row a b')
    ).ast.children.map((n) => n.id);
    expect(ids).toEqual(['architecture', 'service:a', 'service:b', 'align:1']);
    expect(T.Align).toBeDefined();
  });

  it('10: the registry returns its outcome', () => {
    const r = new ArchitectureRegistry();
    expect(r.add('group', 'g', undefined)).toEqual({ added: true, parent: undefined });
    expect(r.add('service', 'a', 'nope')).toMatchObject({
      added: true,
      parent: undefined,
      problem: { code: ARCHITECTURE_UNKNOWN_PARENT },
    });
    expect(r.add('service', 'a', 'g')).toMatchObject({ added: false, problem: { at: 'id' } });
    expect(r.add('junction', 'j', 'g')).toEqual({ added: true, parent: 'g' });
  });
});
