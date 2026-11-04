import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import type { Tree } from '@lezer/common';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import { describe, expect, it } from 'vitest';
import { mermaidLanguage } from './language.ts';

const highlighter = tagHighlighter([
  { tag: tags.keyword, class: 'keyword' },
  { tag: tags.string, class: 'string' },
  { tag: tags.operator, class: 'operator' },
  { tag: tags.variableName, class: 'variable' },
]);

/** Every highlighted span as `text:class`, in order. */
function spans(text: string, tree = mermaidLanguage().language.parser.parse(text)): string[] {
  const out: string[] = [];
  highlightTree(tree, highlighter, (from, to, cls) => {
    out.push(`${text.slice(from, to).trim()}:${cls}`);
  });
  return out;
}

describe('the Lezer language (#21 grammar)', () => {
  it('highlights a flowchart', () => {
    expect(spans('flowchart LR\n  A --> B\n')).toEqual([
      'flowchart:keyword',
      'A:variable',
      '-->:operator',
      'B:variable',
    ]);
  });

  it('reads front matter as front matter, not as flowchart text (GAPS #28)', () => {
    // A `'` or `(` in the YAML would otherwise leave a label mode open into the diagram.
    const text = "---\ntitle: it's (open\nconfig:\n  theme: dark\n---\nflowchart LR\n  A --> B\n";
    expect(spans(text)).toEqual(['flowchart:keyword', 'A:variable', '-->:operator', 'B:variable']);
  });

  it('highlights the whole text when there is no closed front matter fence', () => {
    expect(spans('flowchart TD\n  A --- B')[0]).toBe('flowchart:keyword');
  });

  it('re-reads the text when an edit opens or closes the front matter', () => {
    const body = Array.from({ length: 300 }, (_, i) => `  A${i} --> B${i}\n`).join('');
    const closed = `---\ntitle: (x\n---\nflowchart LR\n${body}`;
    let state = EditorState.create({ doc: closed, extensions: mermaidLanguage() });
    const treeOf = (s: EditorState): Tree => ensureSyntaxTree(s, s.doc.length, 5000)!;
    expect(spans(closed, treeOf(state))).toEqual(spans(closed));
    // Delete the closing fence: the block is unclosed and runs to the end (core's reading).
    state = state.update({ changes: { from: 14, to: 18 } }).state;
    const open = state.doc.toString();
    expect(spans(open, treeOf(state))).toEqual(spans(open));
    expect(spans(open)).toEqual([]);
    // Put it back: the diagram is highlighted again, not reused as blanks.
    state = state.update({ changes: { from: 14, insert: '---\n' } }).state;
    expect(spans(closed, treeOf(state))).toEqual(spans(closed));
    expect(spans(closed)[0]).toBe('flowchart:keyword');
  });
});
