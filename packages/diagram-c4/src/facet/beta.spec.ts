import { describe, expect, it } from 'vitest';
import { c4Language } from '../language.ts';

/**
 * The c4 facet on c4-beta text (spec #730 T6) at its own seam: completion at a probe parse
 * and `isValidId`, as the language service calls them. The service-level behaviour is in
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

  it('takes the ids c4-beta takes as new names, and refuses the ones no parse reads back', () => {
    for (const name of ['person', 'container', 'c4-beta', 'on', 'TB', '3ds', 'a-b', 'a_b'])
      expect(c4Language.isValidId(name), name).toBeUndefined();
    expect(c4Language.isValidId('a b')).toMatch(/blank/);
    expect(c4Language.isValidId('')).toMatch(/empty/);
  });
});
