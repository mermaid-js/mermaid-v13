import { describe, expect, it } from 'vitest';
import { stripMermaidOnlyConfig } from './normalize.ts';

describe('stripMermaidOnlyConfig', () => {
  it('drops look: handDrawn and layout: elk from front matter, so every renderer uses dagre-style layout', () => {
    const src =
      '---\nconfig:\n  look: handDrawn\n  layout: elk\n  theme: forest\n---\nflowchart LR\n  A --> B\n';
    expect(stripMermaidOnlyConfig(src)).toEqual({
      source: '---\nconfig:\n  theme: forest\n---\nflowchart LR\n  A --> B\n',
      changed: true,
    });
  });

  it('drops them from %%{init}%% JSON with their comma', () => {
    const src = '%%{init: {"layout": "elk.stress", "theme": "dark"}}%%\nflowchart LR\n  A --> B';
    expect(stripMermaidOnlyConfig(src).source).toBe(
      '%%{init: {"theme": "dark"}}%%\nflowchart LR\n  A --> B'
    );
  });

  it('leaves other diagrams alone', () => {
    expect(stripMermaidOnlyConfig('flowchart LR\n  A[layout: elk] --> B')).toEqual({
      source: 'flowchart LR\n  A[layout: elk] --> B',
      changed: false,
    });
  });
});
