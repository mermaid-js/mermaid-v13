/**
 * Edge labels as tags (D626–D630), over each covered type's `baseline/edge-labels` fixtures
 * through `createMermaid().render()`: every middle label is one rounded box with a 1 px solid
 * border in its edge's colour (a `linkStyle` stroke, else the line colour), filled with the
 * theme background unless the author sets the type's label fill. Colours are read through the
 * root `style`'s declarations, as a browser resolves them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

/** The fixture folders of the types that draw their labels with the shared tag (T1, #942). */
const DIRS = [
  'flowchart',
  'swimlanes',
  'state-diagram-v2',
  'class-diagram',
  'agentflow',
  'er-diagram',
  'c4',
  'c4beta',
];
/** The stroke the fixtures give a styled edge, or the line colour they set. */
const PINK = '#d6336c';
/** Whether a fixture styles an edge in pink: a `stroke`, or C4's `UpdateRelStyle` `$lineColor`. */
const styledEdge = (s: string): boolean =>
  s.includes(`stroke:${PINK}`) || s.includes(`$lineColor="${PINK}"`);

function fixtures(dir: string): [string, string][] {
  const at = join(REPO_ROOT, 'e2e/diagrams', dir, 'baseline/edge-labels');
  return readdirSync(at)
    .filter((f) => f.endsWith('.mmd'))
    .sort()
    .map((f) => [`${dir}/${f}`, readFileSync(join(at, f), 'utf8')]);
}

const CASES = DIRS.flatMap(fixtures);

async function render(source: string, themeVariables?: Record<string, string>): Promise<string> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...(themeVariables && { themeVariables }) });
  return (await m.render('t', source)).svg;
}

const attrsOf = (el: string): Record<string, string> =>
  Object.fromEntries([...el.matchAll(/\s([\w:-]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]));

/** A paint with the root style's `--_x:var(--mermaid-name,fallback)` aliases followed. */
function resolver(svg: string): (paint: string | undefined) => string | undefined {
  const style = attrsOf(/<svg [^>]*>/.exec(svg)![0]).style ?? '';
  const decl = new Map<string, string>();
  for (const d of style.split(';')) {
    const colon = d.indexOf(':');
    const value = d.slice(colon + 1);
    // `--_x:var(--mermaid-name,fallback)`: the fallback is the theme's value.
    if (d.startsWith('--_') && value.startsWith('var(--mermaid-'))
      decl.set(d.slice(0, colon), value.slice(value.indexOf(',') + 1, -1));
  }
  const resolve = (paint: string | undefined): string | undefined => {
    const alias = /^var\((--_\w+)\)$/.exec(paint ?? '')?.[1];
    return alias ? resolve(decl.get(alias)) : paint;
  };
  return resolve;
}

/** Each `g.edgeLabel`: its box's attributes (paints resolved) and its text. */
interface Tag {
  readonly box: Readonly<Record<string, string | undefined>>;
  readonly text: string;
}

function tags(svg: string): Tag[] {
  const resolve = resolver(svg);
  return svg
    .split('<g class="edgeLabel"')
    .slice(1)
    .map((part) => {
      const body = part.slice(0, part.indexOf('</text>') + 7);
      const box = attrsOf(/<rect [^>]*\/>/.exec(body)?.[0] ?? '');
      const text = [...body.matchAll(/>([^<]+)</g)].map((m) => m[1]).join(' ');
      return { box: { ...box, fill: resolve(box.fill), stroke: resolve(box.stroke) }, text };
    });
}

/** The theme background the root style declares. */
const background = (svg: string): string | undefined => resolver(svg)('var(--_bg)');

describe('edge labels are tags (D626–D630)', () => {
  it('has fixtures for each covered type', () => {
    for (const dir of DIRS) expect(fixtures(dir).length, dir).toBeGreaterThan(0);
  });

  it.each(CASES)('%s: rounded, 1 px solid, filled with the background', async (_id, source) => {
    const svg = await render(source);
    const found = tags(svg);
    expect(found.length).toBeGreaterThan(0);
    for (const { box, text } of found) {
      expect(box.rx, text).toBe('6');
      expect(box['stroke-width'], text).toBe('1');
      expect(box['stroke-dasharray'], text).toBeUndefined();
      expect(box.fill, text).toBe(background(svg));
    }
  });

  it.each(CASES.filter(([, s]) => styledEdge(s)))(
    '%s: the styled edge borders its label in its own stroke',
    async (_id, source) => {
      const found = tags(await render(source));
      const styled = found.filter((t) => t.text === 'styled');
      expect(styled).toHaveLength(1);
      expect(styled[0]!.box.stroke).toBe(PINK);
      for (const other of found.filter((t) => t.text !== 'styled'))
        expect(other.box.stroke, other.text).not.toBe(PINK);
    }
  );

  it.each(CASES.filter(([, s]) => s.includes(`lineColor: '${PINK}'`)))(
    '%s: every label is bordered in the line colour',
    async (_id, source) => {
      const found = tags(await render(source));
      expect(found.length).toBeGreaterThan(0);
      for (const t of found) expect(t.box.stroke, t.text).toBe(PINK);
    }
  );

  it('draws one box around a label of two lines, taller than a one-line one', async () => {
    const sources = CASES.filter(([, s]) => s.includes('<br/>'));
    expect(sources.length).toBeGreaterThanOrEqual(DIRS.length);
    for (const [id, source] of sources) {
      const found = tags(await render(source));
      const [two, ...more] = found.filter((t) => / (?:line|and) /.test(t.text));
      expect(more, id).toEqual([]);
      const one = found.find((t) => t !== two)!;
      expect(Number(two!.box.height), id).toBeGreaterThan(Number(one.box.height));
    }
  });

  it('keeps the class multiplicities plain text beside the middle tag', async () => {
    const [, source] = CASES.find(([id]) => id === 'class-diagram/tags.mmd')!;
    const svg = await render(source);
    const terminals = svg.split('<g class="edgeTerminals"').slice(1);
    expect(terminals).toHaveLength(1);
    expect(terminals[0]!.slice(0, terminals[0]!.indexOf('</g>'))).not.toContain('<rect');
    expect(tags(svg).map((t) => t.text)).toContain('holds');
  });

  it.each(CASES.filter(([id]) => !/^(?:class-diagram|c4|c4beta)\//.test(id)))(
    '%s: an author label fill still wins',
    async (_id, source) => {
      const own = { edgeLabelBackground: '#123456', erEdgeLabelBackground: '#654321' };
      const fill = _id.startsWith('er-diagram/') ? '#654321' : '#123456';
      for (const t of tags(await render(source, own))) expect(t.box.fill, t.text).toBe(fill);
    }
  );
});
