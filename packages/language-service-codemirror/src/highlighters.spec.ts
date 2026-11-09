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
import { firstPartyFacets } from '@mermaid-js/language-service';
import { highlighted, sampleOf } from '../scripts/highlighted.ts';
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

/** The highlighted types (each package's manifest), each with its first-paint sample. */
const TYPES = highlighted();

describe('the per-type first-paint highlighters (D134)', () => {
  it('has a row for each first-party facet, and each one a sample', () => {
    const facets = [...new Set(firstPartyFacets.filter((e) => e.load).map((e) => e.id))];
    expect(Object.keys(LEZER_HIGHLIGHTERS).sort()).toEqual(facets.sort());
    expect(TYPES.map((h) => h.id).sort()).toEqual(facets.sort());
  });

  it('colours nothing for a type whose highlighter is not loaded yet', () => {
    // A fresh module state cannot be had here, so the type is one no test loads first.
    expect(spans('stateDiagram-v2\n  [*] --> Idle\n')).toEqual([]);
  });

  describe('once loaded', () => {
    beforeAll(async () => {
      for (const id of Object.keys(LEZER_HIGHLIGHTERS)) await loadHighlighter(id);
    });

    // Each type's sample (`packages/diagram-<type>/grammar/<type>.sample.mmd`), its spans as
    // `__highlights__/<id>.txt` prints them: the header is a keyword, so the type's own grammar ran.
    it.each(TYPES.map((h) => [h.id, sampleOf(h, 'sample')] as const))(
      'highlights a %s sample with its own grammar',
      async (id, text) => {
        const out = spans(text);
        expect(out[0]).toBe(`${text.split(/\s/)[0]}:keyword`);
        await expect(`${out.join('\n')}\n`).toMatchFileSnapshot(`__highlights__/${id}.txt`);
      }
    );

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
