/**
 * Lane titles follow the label rule every type shares (#1368, #1407): only a quoted markdown
 * string renders markdown; any other title is plain, where `<br>`, the drawn tags and entities
 * work and `**` and bare backticks stay as written. A flowchart subgraph title (the same source
 * as a flowchart) reads the same. Fixture:
 * `e2e/diagrams/swimlanes/nightly-check/lane-title-markdown.mmd`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';

const SOURCE = readFileSync(
  join(REPO_ROOT, 'e2e/diagrams/swimlanes/nightly-check/lane-title-markdown.mmd'),
  'utf8'
);

interface Run {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  /** Whether the run starts a line (it has its own `y`). */
  readonly line: boolean;
}

/** The runs of the title label of the group `id`: one per `<tspan>`, or the bare `<text>`. */
function runs(tree: SvgView, id: string): Run[] {
  const group = tree.find({ 'data-id': id })[0];
  expect(group, id).toBeDefined();
  const label = tree.find((n) => n.tag === 'text' && within(n, group!))[0];
  expect(label, `${id} has a label`).toBeDefined();
  const spans = tree.children(label!).filter((c) => tree.tag(c) === 'tspan');
  const run = (n: SvgElement): Run => ({
    text: n.children.map((c) => tree.textOf(c) ?? '').join(''),
    bold: tree.getAttr(n, 'font-weight') === 'bold',
    italic: tree.getAttr(n, 'font-style') === 'italic',
    line: tree.getAttr(n, 'y') !== undefined,
  });
  return spans.length === 0 ? [run(label!)] : spans.map(run);
}

const within = (n: SvgElement, group: SvgElement): boolean => {
  for (let p = n.parent; p; p = p.parent) if (p === group) return true;
  return false;
};

const textOf = (rs: readonly Run[]): string => rs.map((r) => r.text).join('');

/** `text` drawn, with exactly the warnings whose codes are `codes`. */
async function draw(text: string, codes: readonly string[] = []): Promise<SvgView> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const { svg, warnings } = await m.render('s', text);
  expect(warnings.map((w) => w.code)).toEqual(codes);
  return parseSvg(svg);
}

describe('swimlane lane titles (#1368)', () => {
  it('render markdown only in a quoted markdown string', async () => {
    // The plain `**Bold** lane` gives the render its one MARKDOWN_NOT_READ.
    const tree = await draw(SOURCE, ['MARKDOWN_NOT_READ']);
    // Plain: the asterisks stay, nothing is bold (v12 rendered it; D710 breaks that).
    const plain = runs(tree, 'plain');
    expect(textOf(plain)).toBe('**Bold** lane');
    expect(plain.some((r) => r.bold)).toBe(false);
    // A quoted markdown string.
    const quoted = runs(tree, 'quoted');
    expect(textOf(quoted)).toBe('Italic bold lane');
    expect(quoted.find((r) => r.text === 'Italic')?.italic).toBe(true);
    expect(quoted.find((r) => r.text === 'bold')?.bold).toBe(true);
    // Bare backticks are no markdown string: drawn as written (#1368, a change from D710).
    const bare = runs(tree, 'bare');
    expect(textOf(bare)).toBe('`**Bare** lane`');
    expect(bare.some((r) => r.bold)).toBe(false);
  });

  it('draw <br>, the tags and entities in a plain title', async () => {
    const tags = runs(await draw(SOURCE, ['MARKDOWN_NOT_READ']), 'tags');
    expect(tags.filter((r) => r.line)).toHaveLength(2);
    expect(textOf(tags)).toBe('twolines bold & it');
    expect(tags.find((r) => r.text === 'bold')?.bold).toBe(true);
    expect(tags.find((r) => r.text === 'it')?.italic).toBe(true);
  });

  it('read a flowchart subgraph title the same way', async () => {
    // A plain flowchart title with `**` gives the one MARKDOWN_NOT_READ of the render (#1395).
    const tree = await draw(SOURCE.replace('swimlane-beta', 'flowchart'), ['MARKDOWN_NOT_READ']);
    // Flowchart's markdown string is the quoted form; bare backticks stay as written.
    expect(textOf(runs(tree, 'bare'))).toBe('`**Bare** lane`');
    expect(textOf(runs(tree, 'quoted'))).toBe('Italic bold lane');
    expect(textOf(runs(tree, 'plain'))).toBe('**Bold** lane');
  });
});
