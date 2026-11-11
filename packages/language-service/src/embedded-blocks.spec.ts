/**
 * Embedded diagram blocks (ADR-15, #671): the service reads each `mermaid <id> { … }` block of a
 * flowchart or state host as a diagram of its own type. Errors inside a block show at their
 * place in the outer text, and the block body is highlighted as its own type.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from './index.ts';
import type { DocumentSnapshot } from './index.ts';

const service = createLanguageService();
beforeAll(() => service.preload());
const open = (text: string): DocumentSnapshot => service.update('file:///blocks.mmd', text);
/** The text each diagnostic covers, with its code. */
const reported = (doc: DocumentSnapshot) =>
  doc.diagnostics().map((d) => [d.code, doc.text.slice(d.range.start, d.range.end)]);

describe('diagnostics inside a block', () => {
  it('reports a syntax error in a flowchart-hosted block at its place in the outer text', () => {
    const doc = open(
      [
        'flowchart LR',
        '  A --> login',
        '  mermaid login["Login"] {',
        '    sequenceDiagram',
        '      User->>Server: hi',
        '      User->>>Server',
        '  }',
        '  login --> B',
        '',
      ].join('\n')
    );
    expect(reported(doc)).toEqual([['UNEXPECTED', '>']]);
    expect(doc.diagnostics()[0]!.range.start).toBe(doc.text.indexOf('>>>') + 2);
  });

  it('reports a syntax error in a state-hosted block at its place in the outer text', () => {
    const doc = open(
      [
        'stateDiagram-v2',
        '  [*] --> Idle',
        '  Idle --> checkout',
        '  mermaid checkout["Checkout"] {',
        '    flowchart LR',
        '      Cart --> --> Pay',
        '  }',
        '  checkout --> [*]',
        '',
      ].join('\n')
    );
    expect(doc.diagnostics().map((d) => d.code)).toEqual(['UNEXPECTED']);
    expect(doc.diagnostics()[0]!.range.start).toBe(doc.text.indexOf('--> -->') + 4);
  });

  it('reports a block that does not start with a diagram type at its first line', () => {
    const doc = open(
      ['flowchart LR', '  mermaid fruit {', '    %% a note', '    banana split', '  }', ''].join(
        '\n'
      )
    );
    expect(reported(doc)).toEqual([['EMBED_NO_TYPE', 'banana split']]);
    expect(doc.diagnostics()[0]!.message).toContain('`mermaid fruit` block');
  });

  it("reports a block's directive once, as the block's", () => {
    const doc = open(
      [
        'flowchart LR',
        '  mermaid seq {',
        '    %%{init: {"theme": }}%%',
        '    sequenceDiagram',
        '      A->>B: hi',
        '  }',
        '',
      ].join('\n')
    );
    expect(reported(doc)).toEqual([['INVALID_DIRECTIVE', '}']]);
    expect(doc.diagnostics()[0]!.range.start).toBe(doc.text.indexOf('}}%%'));
  });
});

describe('nested blocks', () => {
  /** Blocks nested `depth` deep, the innermost holding `inner`. */
  const nested = (depth: number, inner: string[]): string => {
    const lines = ['flowchart LR'];
    for (let d = 1; d <= depth; d++) {
      const pad = '  '.repeat(2 * d - 1);
      lines.push(`${pad}mermaid l${d} {`, `${pad}  flowchart LR`);
    }
    lines.push(...inner.map((l) => '  '.repeat(2 * depth + 1) + l));
    for (let d = depth; d >= 1; d--) lines.push(`${'  '.repeat(2 * d - 1)}}`);
    return lines.join('\n') + '\n';
  };

  it('reports an error four blocks deep at its place in the outer text', () => {
    const doc = open(nested(4, ['a --> --> b']));
    expect(doc.diagnostics().map((d) => d.code)).toEqual(['UNEXPECTED']);
    expect(doc.diagnostics()[0]!.range.start).toBe(doc.text.indexOf('--> -->') + 4);
  });

  it('reports a block nested five deep at its opening line, as the render does', () => {
    const doc = open(nested(5, ['a --> b']));
    expect(reported(doc)).toEqual([['EMBED_DEPTH', 'mermaid l5 {']]);
  });

  it('highlights the innermost block as its own type', () => {
    const doc = open(nested(3, ['a --> b']));
    const at = doc.text.indexOf('a --> b');
    const tokens = doc.semanticTokens().filter((t) => t.range.start >= at);
    expect(tokens.map((t) => [t.type, doc.text.slice(t.range.start, t.range.end)])).toEqual([
      ['node', 'a'],
      ['operator', '-->'],
      ['node', 'b'],
      ['operator', '}'],
      ['operator', '}'],
      ['operator', '}'],
    ]);
  });
});

describe('highlighting inside a block', () => {
  const FLOW = [
    'flowchart LR',
    '  A --> login',
    '  mermaid login["Login"] {',
    '    sequenceDiagram',
    '      participant User',
    '      User->>Server: hi',
    '  }',
    '',
  ].join('\n');

  it("highlights a block body with the inner type's tokens, not as one host token", () => {
    const doc = open(FLOW);
    const tokens = doc
      .semanticTokens()
      .map((t) => [t.type, doc.text.slice(t.range.start, t.range.end)]);
    expect(tokens).toContainEqual(['keyword', 'sequenceDiagram']);
    expect(tokens).toContainEqual(['keyword', 'participant']);
    expect(tokens).toContainEqual(['keyword', 'mermaid']);
    // The body is no longer one macro token.
    expect(
      tokens.filter(([, t]) => t!.includes('sequenceDiagram') && t !== 'sequenceDiagram')
    ).toEqual([]);
  });

  it('highlights a state-hosted block body as its own type, per line too', () => {
    const doc = open(
      [
        'stateDiagram-v2',
        '  [*] --> checkout',
        '  mermaid checkout["Checkout"] {',
        '    classDiagram',
        '      class Cart',
        '  }',
        '',
      ].join('\n')
    );
    const tokens = doc
      .semanticTokens()
      .map((t) => [t.type, doc.text.slice(t.range.start, t.range.end)]);
    expect(tokens).toContainEqual(['keyword', 'classDiagram']);
    expect(tokens).toContainEqual(['keyword', 'class']);
    const line3 = doc.lineSemanticTokens().filter((t) => t.line === 3);
    expect(line3.map((t) => [t.type, t.character, t.length])).toEqual([['keyword', 4, 12]]);
  });
});
