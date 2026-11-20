import { describe, expect, it } from 'vitest';
import { sourceTheme } from './source-theme.ts';

describe('sourceTheme', () => {
  it('reads the front matter config', () => {
    expect(sourceTheme('---\nconfig:\n  theme: forest\n---\nflowchart LR\n  A')).toBe('forest');
  });

  it("reads an init directive, which wins over the front matter (#1093's dev-02)", () => {
    expect(sourceTheme("%%{init: {'theme':'forest'}}%%\nflowchart LR\n  A")).toBe('forest');
    expect(
      sourceTheme("---\nconfig:\n  theme: dark\n---\n%%{init: {'theme':'neutral'}}%%\npie\n")
    ).toBe('neutral');
  });

  it('is undefined when the text picks no theme', () => {
    expect(sourceTheme('flowchart LR\n  theme --> A')).toBeUndefined();
  });
});
