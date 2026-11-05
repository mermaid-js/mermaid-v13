/**
 * A first-paint parser whose import fails (#190): the type stays uncoloured, the editor does
 * not retry it on every parse, another type still loads when an edit changes the type, and
 * `loadHighlighter` tries again. The sequence row's import is made to fail, as a chunk that
 * does not load would.
 */
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import type { Tree } from '@lezer/common';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import { describe, expect, it, vi } from 'vitest';
import type * as Grammars from './grammars.ts';
import { loadHighlighter, mermaidLanguage } from './language.ts';

const sequence = vi.hoisted(() => ({ fail: true, calls: 0 }));

vi.mock('./grammars.ts', async (importOriginal) => {
  const real = await importOriginal<typeof Grammars>();
  return {
    LEZER_HIGHLIGHTERS: {
      ...real.LEZER_HIGHLIGHTERS,
      sequence: () => {
        sequence.calls++;
        return sequence.fail
          ? Promise.reject(new Error('chunk failed to load'))
          : real.LEZER_HIGHLIGHTERS.sequence();
      },
    },
  };
});

const highlighter = tagHighlighter([
  { tag: tags.keyword, class: 'keyword' },
  { tag: tags.operator, class: 'operator' },
]);

function spans(text: string, tree: Tree): string[] {
  const out: string[] = [];
  highlightTree(tree, highlighter, (from, to, cls) => out.push(`${text.slice(from, to)}:${cls}`));
  return out;
}

const treeOf = (s: EditorState): Tree => ensureSyntaxTree(s, s.doc.length, 1e9)!;
const DOC = 'sequenceDiagram\n  Alice->>Bob: Hi\n';

describe('a first-paint parser that fails to load', () => {
  it('leaves the type uncoloured, re-picks on an edit, and retries only when asked', async () => {
    let state = EditorState.create({ doc: DOC, extensions: mermaidLanguage() });
    expect(spans(DOC, treeOf(state))).toEqual([]); // still loading
    await expect(loadHighlighter('sequence')).resolves.toBeUndefined(); // failed, not thrown
    expect(sequence.calls).toBe(1);

    // Re-parses (each edit) find the failure and give no colours without importing again.
    for (let i = 0; i < 3; i++) {
      state = state.update({ changes: { from: state.doc.length, insert: ' ' } }).state;
      expect(spans(state.doc.toString(), treeOf(state))).toEqual([]);
    }
    expect(sequence.calls).toBe(1);

    // An edit to another type loads that type's parser and colours it.
    state = state.update({
      changes: { from: 0, to: 'sequenceDiagram'.length, insert: 'flowchart LR' },
    }).state;
    treeOf(state);
    await loadHighlighter('flowchart');
    state = state.update({ changes: { from: state.doc.length, insert: ' ' } }).state;
    expect(spans(state.doc.toString(), treeOf(state))[0]).toBe('flowchart:keyword');

    // Asked again, it tries again; once the import works, the type is coloured.
    sequence.fail = false;
    await loadHighlighter('sequence');
    expect(sequence.calls).toBe(2);
    state = EditorState.create({ doc: DOC, extensions: mermaidLanguage() });
    expect(spans(DOC, treeOf(state))).toContain('sequenceDiagram:keyword');
  });
});
