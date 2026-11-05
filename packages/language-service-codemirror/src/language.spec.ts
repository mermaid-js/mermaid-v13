import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { Tree as TreeClass } from '@lezer/common';
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

const treeOf = (s: EditorState): Tree => ensureSyntaxTree(s, s.doc.length, 1e9)!;

/** Every subtree and buffer with its start: reused ones are the same objects in both trees. */
function parts(tree: Tree, offset = 0): [unknown, number][] {
  return tree.children.flatMap((c, i): [unknown, number][] => {
    const at = offset + tree.positions[i]!;
    return c instanceof TreeClass ? [[c, at], ...parts(c, at)] : [[c, at]];
  });
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

  it.each([
    ['with no front matter', ''],
    ['after front matter', '---\ntitle: T\n---\n'],
  ])(
    'reuses the tree after an edit in the body, %s (#35 review)',
    (_label, head) => {
      const body = Array.from({ length: 800 }, (_, i) => `  A${i} --> B${i}\n`).join('');
      const text = `${head}flowchart LR\n${body}`;
      let state = EditorState.create({ doc: text, extensions: mermaidLanguage() });
      const before = treeOf(state);
      const from = text.indexOf('A100 ');
      state = state.update({ changes: { from, insert: 'x' } }).state;
      const after = treeOf(state);
      expect(spans(state.doc.toString(), after)).toEqual(spans(state.doc.toString()));
      // Past the edit and the tokenizer's 4,096-character lookahead, subtrees are reused.
      const old = new Set(parts(before).map(([c]) => c));
      const reusedAfter = parts(after).filter(([c, at]) => old.has(c) && at > from + 4096);
      expect(reusedAfter.length).toBeGreaterThan(0);
    },
    20_000
  );

  it('parses the 50k bench fixture in well under a second (#171)', () => {
    // Was 1.1–3 s with a 4,096-character copy per token, ~30 ms after #171. The bound is loose
    // so a loaded machine does not fail it; `scripts/bench-parse.ts` reports the time.
    const text = readFileSync(
      join(import.meta.dirname, '../../bench/fixtures/language/flowchart-50k.mmd'),
      'utf8'
    );
    const { parser } = mermaidLanguage().language;
    expect(parser.parse(text).length).toBe(text.length); // also the warm-up
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      parser.parse(text);
      best = Math.min(best, performance.now() - t);
    }
    expect(best).toBeLessThan(500);
  }, 30_000);

  it('reuses the diagram after an edit inside the front matter (#35 review)', () => {
    // Longer than the generated tokenizer's 4,096-character lookahead, which stops reuse
    // of anything that looked at the edit.
    const body = Array.from({ length: 800 }, (_, i) => `  A${i} --> B${i}\n`).join('');
    const text = `---\ntitle: T\n---\nflowchart LR\n${body}`;
    let state = EditorState.create({ doc: text, extensions: mermaidLanguage() });
    const before = treeOf(state);
    // A keystroke in the title moves the body's start by one.
    state = state.update({ changes: { from: 11, insert: 'x' } }).state;
    const after = treeOf(state);
    expect(spans(state.doc.toString(), after)).toEqual(spans(state.doc.toString()));
    const old = new Set(parts(before).map(([c]) => c));
    const all = parts(after);
    expect(all.filter(([c]) => old.has(c)).length).toBeGreaterThan(all.length / 3);
  }, 20_000);
});
