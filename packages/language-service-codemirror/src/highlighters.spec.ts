/**
 * First-paint highlighting per diagram type (D134, #190): the Lezer language picks the
 * detected type's generated parser, loaded on demand, and colours nothing for a type that
 * has none (never flowchart's colours).
 */
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import type { Tree } from '@lezer/common';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import { beforeAll, describe, expect, it } from 'vitest';
import { LEZER_HIGHLIGHTERS, loadHighlighter, mermaidLanguage } from './language.ts';

const highlighter = tagHighlighter([
  { tag: tags.keyword, class: 'keyword' },
  { tag: tags.string, class: 'string' },
  { tag: tags.operator, class: 'operator' },
  { tag: tags.variableName, class: 'variable' },
  { tag: tags.punctuation, class: 'punctuation' },
]);

/** Every highlighted span as `text:class`, in order. */
function spans(text: string, tree: Tree = mermaidLanguage().language.parser.parse(text)): string[] {
  const out: string[] = [];
  highlightTree(tree, highlighter, (from, to, cls) => {
    out.push(`${text.slice(from, to).trim()}:${cls}`);
  });
  return out;
}

const treeOf = (s: EditorState): Tree => ensureSyntaxTree(s, s.doc.length, 1e9)!;

describe('the per-type first-paint highlighters (D134)', () => {
  it('has a row for each v13 diagram type', () => {
    expect(Object.keys(LEZER_HIGHLIGHTERS).sort()).toEqual([
      'class',
      'er',
      'flowchart',
      'journey',
      'mindmap',
      'pie',
      'quadrantChart',
      'sequence',
      'state',
      'timeline',
    ]);
  });

  it('colours nothing for a type whose highlighter is not loaded yet', () => {
    // A fresh module state cannot be had here, so the type is one no test loads first.
    expect(spans('stateDiagram-v2\n  [*] --> Idle\n')).toEqual([]);
  });

  describe('once loaded', () => {
    beforeAll(async () => {
      for (const id of Object.keys(LEZER_HIGHLIGHTERS)) await loadHighlighter(id);
    });

    it('highlights a flowchart', () => {
      expect(spans('flowchart LR\n  A --> B\n')).toEqual([
        'flowchart:keyword',
        'A:variable',
        '-->:operator',
        'B:variable',
      ]);
    });

    it('highlights a sequence diagram with the sequence grammar', () => {
      expect(spans('sequenceDiagram\n  Alice->>Bob: Hi\n')).toEqual([
        'sequenceDiagram:keyword',
        'Alice:variable',
        '->>:operator',
        'Bob:variable',
        ': Hi:string',
      ]);
    });

    it('highlights a class diagram with the class grammar', () => {
      expect(spans('classDiagram\n  class Animal\n')).toEqual([
        'classDiagram:keyword',
        'class:keyword',
        'Animal:variable',
      ]);
    });

    it('highlights a state diagram with the state grammar', () => {
      const out = spans('stateDiagram-v2\n  [*] --> Idle\n');
      expect(out[0]).toBe('stateDiagram-v2:keyword');
      expect(out).toContain('-->:operator');
      expect(out).toContain('Idle:variable');
    });

    it('highlights an ER diagram with the ER grammar', () => {
      const out = spans('erDiagram\n  CUSTOMER ||--o{ ORDER : places\n');
      expect(out[0]).toBe('erDiagram:keyword');
      expect(out).toContain('CUSTOMER:variable');
      expect(out).toContain('ORDER:variable');
    });

    it('highlights a user journey with the journey grammar', () => {
      const out = spans('journey\n  section Go to work\n  Make tea: 5: Me\n');
      expect(out[0]).toBe('journey:keyword');
      expect(out).toContain('Make tea:variable');
      expect(out).toContain(': 5: Me:string');
    });

    it('highlights a quadrant chart with the quadrant grammar', () => {
      const out = spans('quadrantChart\n  x-axis Low --> High\n  A: [0.3, 0.6]\n');
      expect(out[0]).toBe('quadrantChart:keyword');
      expect(out).toContain('x-axis:keyword');
      expect(out).toContain('-->:operator');
    });

    it('finds the type after front matter, directives and comments', () => {
      const text = '---\ntitle: T\n---\n%%{init: {}}%%\n%% note\nsequenceDiagram\n  A->>B: x\n';
      expect(spans(text)).toContain('sequenceDiagram:keyword');
    });

    it.each([
      ['a type with no v13 highlighter', 'gantt\n  title Plan\n'],
      ['a type v12 does not know', 'notADiagram\n  A --> B\n'],
      ['an empty text', ''],
      ['a header being typed', 'flo'],
    ])('colours nothing for %s, not as flowchart', (_label, text) => {
      expect(spans(text)).toEqual([]);
    });

    it('re-picks the grammar when an edit changes the type', () => {
      const body = '  Alice->>Bob: Hi\n';
      let state = EditorState.create({
        doc: `sequenceDiagram\n${body}`,
        extensions: mermaidLanguage(),
      });
      expect(spans(state.doc.toString(), treeOf(state))).toContain('->>:operator');
      // Rewrite the header: the same body now reads as a flowchart, then as an unknown type.
      state = state.update({
        changes: { from: 0, to: 'sequenceDiagram'.length, insert: 'flowchart LR' },
      }).state;
      expect(spans(state.doc.toString(), treeOf(state))).toEqual(spans(state.doc.toString()));
      expect(spans(state.doc.toString(), treeOf(state))[0]).toBe('flowchart:keyword');
      state = state.update({
        changes: { from: 0, to: 'flowchart LR'.length, insert: 'gantt' },
      }).state;
      expect(spans(state.doc.toString(), treeOf(state))).toEqual([]);
    });
  });
});
