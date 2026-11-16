/**
 * The service's small Markdown (hover and completion docs), split into inline parts the
 * adapters render: CodeMirror as DOM, the LSP server as plain text when the client wants it.
 * And the Mermaid fences of a Markdown document, which a host runs the service on (#180, #811).
 */
import { describe, expect, it } from 'vitest';
import { inlineMarkdown, mermaidFences } from './index.ts';

describe('inlineMarkdown', () => {
  it('splits text, **strong** and `code`', () => {
    expect(inlineMarkdown('**node** `B` here')).toEqual([
      { kind: 'strong', text: 'node' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'B' },
      { kind: 'text', text: ' here' },
    ]);
  });

  it('reads multi-backtick code spans, keeping the backticks inside', () => {
    expect(inlineMarkdown('``a`b``')).toEqual([{ kind: 'code', text: 'a`b' }]);
    // One space of padding on each side is dropped (a span that starts or ends with `).
    expect(inlineMarkdown('`` `x` ``')).toEqual([{ kind: 'code', text: '`x`' }]);
    expect(inlineMarkdown('``` `` ```')).toEqual([{ kind: 'code', text: '``' }]);
    // `**` inside code is code.
    expect(inlineMarkdown('`**y**`')).toEqual([{ kind: 'code', text: '**y**' }]);
  });

  it('keeps an unmatched backtick run or `**` as text', () => {
    expect(inlineMarkdown('a ``b` c')).toEqual([{ kind: 'text', text: 'a ``b` c' }]);
    expect(inlineMarkdown('2 ** 3')).toEqual([{ kind: 'text', text: '2 ** 3' }]);
  });
});

describe('mermaidFences', () => {
  /** Each fence's body, checked against the offset it claims in `markdown`. */
  const bodies = (markdown: string): string[] =>
    mermaidFences(markdown).map((f) => {
      expect(markdown.slice(f.start, f.start + f.text.length)).toBe(f.text);
      return f.text;
    });

  it('finds backtick and tilde fences, each body from the line after its opening fence', () => {
    const md = '# T\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\ntext\n\n~~~mermaid\npie\n~~~\n';
    expect(bodies(md)).toEqual(['flowchart LR\n  A --> B\n', 'pie\n']);
    expect(mermaidFences(md)[0]!.start).toBe(md.indexOf('flowchart'));
  });

  it('keeps the indent of a fence inside a list item in its body', () => {
    const md = '1. Step\n\n   ```mermaid\n   flowchart LR\n     A --> B\n   ```\n2. Next\n';
    expect(bodies(md)).toEqual(['   flowchart LR\n     A --> B\n']);
  });

  it('reads the first word of the info string, in any case', () => {
    const md = '```Mermaid title="x"\npie\n```\n```js\nmermaid\n```\n``` mermaid\ninfo\n```\n';
    expect(bodies(md)).toEqual(['pie\n', 'info\n']);
    expect(bodies('```mermaidx\npie\n```\n```js mermaid\npie\n```\n')).toEqual([]);
  });

  it('closes a fence only with a run of its own character at least as long', () => {
    const md = '````mermaid\nflowchart LR\n```\n~~~~\n````\nafter\n';
    expect(bodies(md)).toEqual(['flowchart LR\n```\n~~~~\n']);
    // A closing fence takes no info string.
    expect(bodies('```mermaid\npie\n``` x\n```\n')).toEqual(['pie\n``` x\n']);
  });

  it('runs an unclosed fence to the end of the document', () => {
    expect(bodies('text\n```mermaid\nflowchart LR\n  A')).toEqual(['flowchart LR\n  A']);
    expect(bodies('```mermaid')).toEqual(['']);
  });

  it('skips a mermaid fence quoted inside another fence', () => {
    const md = '````md\n```mermaid\npie\n```\n````\n```mermaid\ninfo\n```\n';
    expect(bodies(md)).toEqual(['info\n']);
  });

  it('reads CRLF line ends, and an empty body', () => {
    expect(bodies('```mermaid\r\npie\r\n```\r\n~~~mermaid\r\n~~~\r\n')).toEqual(['pie\r\n', '']);
  });

  it('refuses a backtick fence whose info string holds a backtick', () => {
    expect(bodies('```mermaid `x`\npie\n```\n')).toEqual([]);
  });

  it('finds nothing in prose', () => {
    expect(mermaidFences('# Notes\n\nNo diagrams, only `mermaid` in a code span.\n')).toEqual([]);
  });
});
