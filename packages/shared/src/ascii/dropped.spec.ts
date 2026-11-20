import { describe, expect, it } from 'vitest';
import { droppedFeatures } from './dropped.ts';

const WHAT = { style: 'colours and styles', curve: 'edge curves', accessibility: 'accTitle' };
const STATEMENTS = { style: ['Style', 'ClassDef'], accessibility: ['AccTitle'] };

const ast = {
  type: 'Document',
  id: 'doc',
  children: [
    { type: 'Style', id: 'style:1' },
    { type: 'AccTitle', id: 'accTitle:1' },
    { type: 'ClassDef', id: 'classDef:1' },
  ],
};

describe('droppedFeatures', () => {
  it('reports nothing when nothing is found and there is no AST', () => {
    expect(droppedFeatures(WHAT, STATEMENTS).warnings(undefined)).toEqual([]);
  });

  it('reports one warning per kind, in the order of `what`, element ids before statement ids', () => {
    const dropped = droppedFeatures(WHAT, STATEMENTS);
    dropped.add('curve');
    dropped.add('style', 'A');
    dropped.add('style', 'A');
    expect(dropped.warnings(ast)).toEqual([
      {
        code: 'ASCII_DROPPED',
        feature: 'style',
        astIds: ['A', 'style:1', 'classDef:1'],
        message: 'Text output has no colours and styles; dropped.',
      },
      {
        code: 'ASCII_DROPPED',
        feature: 'curve',
        astIds: [],
        message: 'Text output has no edge curves; dropped.',
      },
      {
        code: 'ASCII_DROPPED',
        feature: 'accessibility',
        astIds: ['accTitle:1'],
        message: 'Text output has no accTitle; dropped.',
      },
    ]);
  });

  it("names a kind's keys in its message", () => {
    const dropped = droppedFeatures(WHAT, STATEMENTS);
    dropped.add('curve');
    expect(dropped.warnings(undefined, { curve: ' (curve)' })[0]?.message).toBe(
      'Text output has no edge curves (curve); dropped.'
    );
  });
});
