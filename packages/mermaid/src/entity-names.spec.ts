// Entity names in labels (#396, D559): the punctuation names draw as their characters, and a
// name core does not know draws as the author wrote it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corpusLabels } from './testing/labels.ts';

const { drawnBy: render, textOf } = corpusLabels(readFileSync);

describe('entity names in labels (#396, D559)', () => {
  it('a flowchart draws the punctuation names, and unknown names as written', async () => {
    expect(await render('flowchart/baseline/text/entity-names.mmd')).toEqual(
      expect.arrayContaining([
        'x : y ; $5 | ok',
        '(a) [b] {c}',
        '50% + tax',
        'unknown #bogus; stays',
        'typed &bogus; stays',
      ])
    );
  });

  it('a state diagram draws them in transition and state text', async () => {
    expect(await render('state-diagram-v2/baseline/text/entity-names.mmd')).toEqual(
      expect.arrayContaining(['foo: bar', 'unknown #bogus; stays', 'a ; b #1'])
    );
  });

  it('an ER diagram draws them in aliases, comments and relationship labels', async () => {
    expect(await render('er-diagram/baseline/text/entity-names.mmd')).toEqual(
      expect.arrayContaining(['x : y ; #1', 'unknown #bogus; stays', '50% + tax'])
    );
  });

  it('a quadrant chart draws them in bare and quoted text', async () => {
    expect(await render('quadrant-chart/baseline/text/entity-names.mmd')).toEqual(
      expect.arrayContaining([
        'unknown #bogus; title',
        'Low : a',
        'High #bogus; b',
        'bare #bogus; stays',
        'quoted #bogus; stays',
        'Point #bogus; p',
        'Q ; r',
      ])
    );
  });

  it('a usecase diagram draws them in bare and quoted labels', async () => {
    expect(await render('usecase/baseline/text/entity-names.mmd')).toEqual(
      expect.arrayContaining(['x : y ; z', 'unknown #bogus; stays', 'bare #bogus; stays'])
    );
  });

  it('a usecase diagram draws the same characters in text output', async () => {
    const r = await textOf('usecase/baseline/text/entity-names.mmd');
    for (const text of ['x : y ; z', 'unknown #bogus; stays', 'bare #bogus; stays'])
      expect(r.text).toContain(text);
  });

  it('text output draws the same characters', async () => {
    const r = await textOf('flowchart/baseline/text/entity-names.mmd');
    for (const text of ['x : y ; $5 | ok', '(a) [b] {c}', '50% + tax', 'unknown #bogus;'])
      expect(r.text).toContain(text);
    expect(r.text).toContain('typed &bogus;');
  });
});
