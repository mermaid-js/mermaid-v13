/**
 * Story 35 (spec #26, #180): a Markdown host calls the service on a fenced block's text and
 * maps offsets itself. The service knows nothing about Markdown; the host below finds the
 * fenced mermaid blocks, gives each block's body to `update` under its own uri, and adds the
 * body's start offset to every range that comes back (and subtracts it from every offset it
 * sends). Diagnostics, completion and rename land on the right characters of the Markdown
 * file, and the prose around a block is never edited.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService, LineIndex } from './index.ts';
import type { DocumentSnapshot, Range } from './index.ts';

/** One fenced mermaid block: its body text and where the body starts in the Markdown file. */
interface Block {
  readonly start: number;
  readonly text: string;
}

/** The host's own fence scan: a backtick or tilde mermaid fence up to its closing fence. */
function mermaidBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const open = /^(```|~~~)mermaid[^\n]*\n/gm;
  for (let m = open.exec(markdown); m; m = open.exec(markdown)) {
    const start = m.index + m[0].length;
    const close = new RegExp(`^${m[1]}\\s*$`, 'm');
    const rest = markdown.slice(start);
    const end = close.exec(rest);
    const length = end ? end.index : rest.length;
    blocks.push({ start, text: rest.slice(0, length) });
    open.lastIndex = start + length;
  }
  return blocks;
}

const MARKDOWN = `# Release notes

The flow below starts at A and ends at Done. A is also a letter in this prose.

\`\`\`mermaid
flowchart LR
  A[Start] --> B{Ready?}
  B -- yes --> Done
  B -- no --> A
\`\`\`

Some text between the blocks.

~~~mermaid
flowchart TD
  X --> (
~~~
`;

const blocks = mermaidBlocks(MARKDOWN);
let docs: DocumentSnapshot[] = [];
beforeAll(async () => {
  const service = createLanguageService();
  await service.preload();
  docs = blocks.map((b, i) => service.update(`file:///notes.md#block-${i}`, b.text));
});
const toMarkdown = (b: Block, r: Range): Range => ({
  start: r.start + b.start,
  end: r.end + b.start,
});
/** The block holding a Markdown offset, and the offset inside it. */
function hostAt(offset: number): { block: Block; doc: DocumentSnapshot; local: number } {
  const i = blocks.findIndex((b) => offset >= b.start && offset <= b.start + b.text.length);
  if (i < 0) throw new Error(`offset ${offset} is not in a mermaid block`);
  return { block: blocks[i]!, doc: docs[i]!, local: offset - blocks[i]!.start };
}
/** Markdown offset of the `n`th (1-based) occurrence of `needle` at or after `from`. */
const find = (needle: string, from = 0, n = 1): number => {
  let i = from - 1;
  for (let k = 0; k < n; k++) i = MARKDOWN.indexOf(needle, i + 1);
  if (i < 0) throw new Error(`no ${needle}`);
  return i;
};

describe('a mermaid block embedded in Markdown', () => {
  it('the host finds both fenced blocks and the service detects each one', () => {
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.text.startsWith('flowchart LR\n')).toBe(true);
    expect(blocks[1]!.text).toBe('flowchart TD\n  X --> (\n');
    expect(docs.map((d) => d.type)).toEqual(['flowchart-v2', 'flowchart-v2']);
  });

  it('maps diagnostics onto the Markdown file, line and column included', () => {
    expect(docs[0]!.diagnostics()).toEqual([]);
    const [d, ...rest] = docs[1]!.diagnostics();
    expect(rest).toEqual([]);
    expect(d!.severity).toBe('error');
    const r = toMarkdown(blocks[1]!, d!.range);
    // The error sits on the `(` in the second block, not at the block-relative offset.
    expect(MARKDOWN.slice(r.start, Math.max(r.end, r.start + 1))).toBe('(');
    expect(r.start).toBe(find('  X --> (') + '  X --> '.length);
    const lines = new LineIndex(MARKDOWN);
    const pos = lines.position(r.start);
    expect(MARKDOWN.split('\n')[pos.line]).toBe('  X --> (');
    expect(pos.column).toBe('  X --> '.length);
  });

  it('completes node ids at a Markdown offset, with the replace range mapped back', () => {
    // Cursor right after `B -- no --> ` in the first block, before the `A` it replaces.
    const offset = find('B -- no --> A') + 'B -- no --> '.length;
    const { block, doc, local } = hostAt(offset);
    const items = doc.completions(local);
    const labels = items.map((i) => i.label);
    for (const id of ['A', 'B', 'Done']) expect(labels).toContain(id);
    // The second block's X is another document: it is not offered here.
    expect(labels).not.toContain('X');
    const item = items.find((i) => i.label === 'Done')!;
    const r = toMarkdown(block, item.range);
    expect(MARKDOWN.slice(r.start, r.end)).toBe('A');
    const edited = MARKDOWN.slice(0, r.start) + item.insertText + MARKDOWN.slice(r.end);
    expect(edited).toContain('  B -- no --> Done\n```');
  });

  it('renames inside the block only, leaving the prose and the other block alone', () => {
    const offset = find('A[Start]');
    const { block, doc, local } = hostAt(offset);
    const prepared = doc.prepareRename(local);
    expect('range' in prepared && MARKDOWN.slice(...span(toMarkdown(block, prepared.range)))).toBe(
      'A'
    );
    const result = doc.rename(local, 'Begin');
    if (!('edits' in result)) throw new Error(result.refused);
    const edits = result.edits.map((e) => ({ ...e, range: toMarkdown(block, e.range) }));
    expect(edits.map((e) => MARKDOWN.slice(e.range.start, e.range.end))).toEqual(['A', 'A']);
    let out = MARKDOWN;
    for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
      out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
    expect(out).toBe(
      MARKDOWN.replace('  A[Start] -->', '  Begin[Start] -->').replace(
        '  B -- no --> A\n',
        '  B -- no --> Begin\n'
      )
    );
    // The prose's A's are untouched.
    expect(out).toContain('starts at A and ends at Done. A is also');
  });
});

const span = (r: Range): [number, number] => [r.start, r.end];
