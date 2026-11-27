/**
 * Lane titles follow the label rule every type shares (D710, part of #1230): only a markdown
 * string, a whole title in backticks with or without quotes, renders markdown; any other title
 * is plain, where `<br>`, the drawn tags and entities work and `**` stays as written. A
 * flowchart subgraph title (the same source under `layout: dagre`) keeps flowchart's reading.
 * Fixture: `e2e/diagrams/swimlanes/nightly-check/lane-title-markdown.mmd`.
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

async function draw(text: string): Promise<SvgView> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const { svg, warnings } = await m.render('s', text);
  expect(warnings).toEqual([]);
  return parseSvg(svg);
}

describe('swimlane lane titles (D710)', () => {
  it('render markdown only in a markdown string', async () => {
    const tree = await draw(SOURCE);
    // Plain: the asterisks stay, nothing is bold (v12 rendered it; D710 breaks that).
    const plain = runs(tree, 'plain');
    expect(textOf(plain)).toBe('**Bold** lane');
    expect(plain.some((r) => r.bold)).toBe(false);
    // A quoted markdown string.
    const quoted = runs(tree, 'quoted');
    expect(textOf(quoted)).toBe('Italic bold lane');
    expect(quoted.find((r) => r.text === 'Italic')?.italic).toBe(true);
    expect(quoted.find((r) => r.text === 'bold')?.bold).toBe(true);
    // A markdown string without quotes: no backtick is drawn.
    const bare = runs(tree, 'bare');
    expect(textOf(bare)).toBe('Bare lane');
    expect(bare.find((r) => r.text === 'Bare')?.bold).toBe(true);
  });

  it('draw <br>, the tags and entities in a plain title', async () => {
    const tags = runs(await draw(SOURCE), 'tags');
    expect(tags.filter((r) => r.line)).toHaveLength(2);
    expect(textOf(tags)).toBe('twolines bold & it');
    expect(tags.find((r) => r.text === 'bold')?.bold).toBe(true);
    expect(tags.find((r) => r.text === 'it')?.italic).toBe(true);
  });

  it('leave a flowchart subgraph title as flowchart reads it', async () => {
    const tree = await draw(SOURCE.replace('swimlane-beta', 'flowchart'));
    // Flowchart's markdown string is the quoted form; bare backticks stay as written.
    expect(textOf(runs(tree, 'bare'))).toBe('`**Bare** lane`');
    expect(textOf(runs(tree, 'quoted'))).toBe('Italic bold lane');
    expect(textOf(runs(tree, 'plain'))).toBe('**Bold** lane');
  });
});
