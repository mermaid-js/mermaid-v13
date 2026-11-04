/**
 * The service's small Markdown (hover and completion docs), split into inline parts the
 * adapters render: CodeMirror as DOM, the LSP server as plain text when the client wants it.
 */
import { describe, expect, it } from 'vitest';
import { inlineMarkdown } from './index.ts';

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
