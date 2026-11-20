import { describe, expect, it } from 'vitest';
import { Canvas, drawText } from '@mermaid-js/core/ascii';
import { droppedFeatures, trimmed } from './diagram.ts';

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

describe('trimmed', () => {
  it('drops the blank rows at the ends and the common left margin, and says how many', () => {
    const canvas = new Canvas();
    drawText(canvas, 4, 2, 'ab');
    drawText(canvas, 3, 4, 'c');
    expect(trimmed(canvas)).toEqual({ text: ' ab\n\nc', top: 2, left: 3 });
  });

  it('reads drawn text as a canvas', () => {
    expect(trimmed('\n\n  x\n   y\n\n')).toEqual({ text: 'x\n y', top: 2, left: 2 });
  });

  it('gives the empty string for an empty drawing', () => {
    expect(trimmed(new Canvas()).text).toBe('');
  });
});
