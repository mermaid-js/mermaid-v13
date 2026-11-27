import { describe, expect, it } from 'vitest';
import { authoredColours } from './authored.ts';

describe('authoredColours (D766)', () => {
  it('names the theme variables that hold a CSS colour', () => {
    const names = authoredColours({
      themeVariables: { cScale0: '#ff0000', venn1: 'rebeccapurple', fontSize: '16px' },
    });
    expect([...names].sort()).toEqual(['cScale0', 'venn1']);
  });

  it('skips values the theme drops: empty, misspelt, not a string', () => {
    const names = authoredColours({
      themeVariables: { a: '', b: 'redd', c: 3, d: ['#fff'], e: null },
    });
    expect([...names]).toEqual([]);
  });

  it('is empty without theme variables', () => {
    expect(authoredColours({}).size).toBe(0);
    expect(authoredColours({ themeVariables: 'nope' }).size).toBe(0);
  });
});
