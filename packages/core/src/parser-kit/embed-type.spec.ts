import { describe, expect, it } from 'vitest';
import { noDiagramType } from './embed-type.ts';

describe('noDiagramType', () => {
  const range = { start: 10, end: 20 };

  it('names the first word of the line when there is one', () => {
    expect(noDiagramType('inner', 'flowchar LR', range)).toEqual({
      severity: 'error',
      code: 'EMBED_NO_TYPE',
      message:
        'The `mermaid inner` block must start with a diagram type, such as `sequenceDiagram` or `classDiagram`, after any blank lines, comments and front matter; `flowchar` is not a diagram type.',
      range,
    });
  });

  it('stops the word at a bracket, brace, semicolon or colon', () => {
    expect(noDiagramType('b', 'A[box] --> B', range).message).toMatch(/; `A` is not/);
  });

  it('names no word for an empty line', () => {
    expect(noDiagramType('b', '', range).message).toBe(
      'The `mermaid b` block must start with a diagram type, such as `sequenceDiagram` or `classDiagram`, after any blank lines, comments and front matter.'
    );
  });
});
