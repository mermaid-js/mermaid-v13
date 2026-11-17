import { describe, expect, it } from 'vitest';
import { c4Language } from '../language.ts';

/**
 * The c4 facet on c4-beta text (spec #730 T6) at its own seam: completion at a probe parse,
 * hover and `isValidId`, as the language service calls them. The service-level behaviour is in
 * the goldens (`packages/language-service/goldens/c4/*\/beta-*`).
 */
const CURSOR = '¦';
const H = 'c4-beta\nperson user "User"\ncontainer api "API" :::team\nstyle team fill:#fff\n';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion items at `¦`, as `label -> insertText @ replaced text`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = c4Language.parse(text, { keepTokens: true, probe: at });
  return c4Language
    .completions(result.probe!, { text, result })
    .map((c) => `${c.label} -> ${c.insertText} @ ${text.slice(c.range.start, c.range.end)}`);
}

/** The text hovered at `¦` and its contents. */
function hover(marked: string): [string, string] | undefined {
  const [text, offset] = split(marked);
  const result = c4Language.parse(text, { keepTokens: true });
  const t = result.tokens!;
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  for (let j = 0; j < t.length; j++) {
    if (t.start[j]! <= offset && offset < t.end[j]!)
      token = { kind: t.kind[j]!, range: { start: t.start[j]!, end: t.end[j]! } };
  }
  const symbol = result.symbols.find((s) => s.range.start <= offset && offset <= s.range.end);
  const h = c4Language.hover(
    { offset, ...(token && { token }), ...(symbol && { symbol }) },
    { text, result }
  );
  return h && [text.slice(h.range.start, h.range.end), h.contents];
}

describe('the c4 facet on c4-beta', () => {
  it('completes the diagram kinds after the header, and the header word itself', () => {
    expect(complete('c4-beta d¦')).toEqual([
      'dynamic -> dynamic @ d',
      'deployment -> deployment @ d',
    ]);
  });

  it('completes element kinds, statement words and ids at a line start', () => {
    expect(complete(`${H}us¦`)).toEqual(['user -> user @ us']);
    expect(complete(`${H}sty¦`)).toEqual(['style -> style  @ sty']);
    expect(complete(`${H}softwareS¦`)).toEqual(['softwareSystem -> softwareSystem  @ softwareS']);
    // A body takes element kinds alone.
    expect(complete(`${H}group g "G" {\n  sty¦\n}`)).toEqual([]);
    expect(complete(`${H}group g "G" {\n  per¦\n}`)).toEqual(['person -> person  @ per']);
  });

  it('completes ids after an arrow or a step, arrows after an id, and no id for a new element', () => {
    expect(complete(`${H}user --> ¦`)).toEqual(['user -> user @ ', 'api -> api @ ']);
    expect(complete(`${H}1: a¦`)).toEqual(['api -> api @ a']);
    expect(complete(`${H}user ¦`)).toEqual([
      '--> -> --> @ ',
      '<-- -> <-- @ ',
      '<--> -> <--> @ ',
      '--- -> --- @ ',
    ]);
    expect(complete(`${H}person ¦`)).toEqual([]);
  });

  it('completes the tags in use, but not the one being typed', () => {
    expect(complete(`${H}person p "P" :::t¦`)).toEqual([':::team -> :::team @ :::t']);
    expect(complete(`${H}person p "P" :::te¦ :::x`)).toEqual([':::team -> :::team @ :::te']);
  });

  it('completes the targets, keys and values of a style', () => {
    expect(complete(`${H}style te¦`)).toEqual(['team -> team @ te']);
    expect(complete(`${H}style team sh¦`)).toEqual(['shape -> shape: @ sh']);
    expect(complete(`${H}style team line:¦`)).toEqual([
      'solid -> solid @ ',
      'dashed -> dashed @ ',
      'dotted -> dotted @ ',
    ]);
    expect(complete(`${H}style team fill:¦`)).toEqual([]);
  });

  it('completes `instances` for a deployment node only', () => {
    expect(complete(`${H}deploymentNode d "D" "" "T" ins¦`)).toEqual([
      'instances -> instances  @ ins',
    ]);
    expect(complete(`${H}container c "C" "" "T" ins¦`)).toEqual([]);
  });

  it('completes nothing in a text in quotes, a comment or a failed line', () => {
    expect(complete(`${H}person p "Us¦er"`)).toEqual([]);
    expect(complete(`${H}%% us¦`)).toEqual([]);
    expect(complete(`${H}person p ?? us¦`)).toEqual([]);
  });

  it('hovers an element id at its declaration and in a relation', () => {
    const [range, contents] = hover(`${H}user --> a¦pi`)!;
    expect(range).toBe('api');
    expect(contents).toContain('**container** `api`');
    expect(contents).toContain('Tags: `:::team`');
    expect(hover(`${H}user --> mis¦sing`)?.[1]).toBe('No element has the id `missing`.');
  });

  it('hovers each element kind with its own doc, and a diagram kind with its own', () => {
    expect(hover(`${H}cont¦ainer c "C"`)?.[1]).toContain('an application or a data store');
    expect(hover('c4-beta con¦tainer\n')?.[1]).toContain('The container view');
  });

  it('hovers a tag and a style target with what they style', () => {
    expect(hover(`${H}person p "P" :::te¦am`)?.[1]).toContain('The tag `team`: 2 elements');
    expect(hover(`${H}style te¦am fill:#000`)?.[1]).toContain('Styled by `style team` at line 4');
    expect(hover(`${H}style team fi¦ll:#000`)?.[1]).toContain('The fill colour');
  });

  it('takes the ids c4-beta takes as new names, and refuses the ones no parse reads back', () => {
    for (const name of ['person', 'container', 'c4-beta', 'on', 'TB', '3ds', 'a-b', 'a_b'])
      expect(c4Language.isValidId(name), name).toBeUndefined();
    expect(c4Language.isValidId('a b')).toMatch(/blank/);
    expect(c4Language.isValidId('')).toMatch(/empty/);
  });
});
