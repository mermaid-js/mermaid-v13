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
      'cynefin',
      'er',
      'flowchart',
      'gantt',
      'gitGraph',
      'info',
      'journey',
      'kanban',
      'mindmap',
      'packet',
      'pie',
      'quadrantChart',
      'radar',
      'sequence',
      'state',
      'timeline',
      'treemap',
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

    it('highlights a gantt chart with the gantt grammar', () => {
      const text =
        'gantt\n  dateFormat YYYY-MM-DD\n  section Build\n  Code :crit, a1, 2024-01-01, 3d\n';
      // A setting and a section are one token each, value included (the jison terminals).
      expect(spans(text)).toEqual([
        'gantt:keyword',
        'dateFormat YYYY-MM-DD:keyword',
        'section Build:keyword',
        'Code:variable',
        ':crit, a1, 2024-01-01, 3d:string',
      ]);
    });

    it('highlights a packet diagram with the packet grammar', () => {
      const out = spans('packet\n  title UDP\n  0-15: "Source Port"\n  +16: "Length"\n');
      expect(out).toEqual([
        'packet:keyword',
        'title UDP:keyword',
        '-:punctuation',
        '::punctuation',
        '"Source Port":string',
        '+:punctuation',
        '::punctuation',
        '"Length":string',
      ]);
    });

    it('highlights a radar chart with the radar grammar', () => {
      const out = spans('radar-beta\n  axis a["Speed"], b\n  curve c{1, 2}\n  max 5\n');
      expect(out[0]).toBe('radar-beta:keyword');
      expect(out).toContain('axis:keyword');
      expect(out).toContain('curve:keyword');
      expect(out).toContain('"Speed":string');
    });

    it('highlights a treemap with the treemap grammar', () => {
      const out = spans('treemap\n  "Root"\n    "Leaf": 12:::hot\n  classDef hot fill:red\n');
      expect(out).toEqual([
        'treemap:keyword',
        '"Root":string',
        '"Leaf":string',
        '::punctuation',
        '::::operator',
        'hot:variable',
        'classDef hot fill:red:keyword',
      ]);
    });

    it('highlights a cynefin diagram with the cynefin grammar', () => {
      const out = spans(
        'cynefin-beta\n  complex\n    "Probe"\n  complex --> clear : "stabilise"\n'
      );
      expect(out[0]).toBe('cynefin-beta:keyword');
      expect(out).toContain('complex:keyword');
      expect(out).toContain('"Probe":string');
      expect(out).toContain('-->:operator');
    });

    it('highlights a kanban board with the kanban grammar', () => {
      const out = spans('kanban\n  todo[Todo]\n    a["Card"]@{ priority: High }\n');
      expect(out[0]).toBe('kanban:keyword');
      expect(out.length).toBeGreaterThan(1);
    });

    it('finds the type after front matter, directives and comments', () => {
      const text = '---\ntitle: T\n---\n%%{init: {}}%%\n%% note\nsequenceDiagram\n  A->>B: x\n';
      expect(spans(text)).toContain('sequenceDiagram:keyword');
    });

    it.each([
      ['a type with no v13 highlighter', 'requirementDiagram\n  element E {\n  }\n'],
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
        changes: { from: 0, to: 'flowchart LR'.length, insert: 'requirementDiagram' },
      }).state;
      expect(spans(state.doc.toString(), treeOf(state))).toEqual([]);
    });
  });
});
