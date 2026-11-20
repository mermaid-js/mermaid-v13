import { describe, expect, it } from 'vitest';
import { Canvas, drawText } from '@mermaid-js/core/ascii';
import { trimmed } from './diagram.ts';

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
