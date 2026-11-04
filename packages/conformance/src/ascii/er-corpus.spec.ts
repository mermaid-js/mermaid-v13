import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { cellWidth, repairRoutes, routeCollisions } from '@mermaid-js/core/ascii';
import type { LayoutModel } from '@mermaid-js/core/layout';
import { parseEr } from '@mermaid-js/diagram-er';
import { REPO_ROOT, corpusFromDir } from '../corpus.ts';
import { renderErAscii, type ErAsciiResult, type ErCellLayout } from './er-render.ts';
import { erExpectedOf, readErStructure } from './er-structure.ts';
import type { Charset } from './structure.ts';

// ASCII render properties over the in-repo ER corpus, in both charsets (#136, D87, D109,
// R-ASCII-9): renders every diagram that parses, deterministic, every entity's table inside
// a box and every relationship label present, two crow's-foot ends per relationship and no
// arrowheads, every line connected box to box, `rows` lines none wider than `columns` and one
// exactly that wide, no trailing spaces, no overlapping boxes, no line through a box, a
// relationship label or a subgraph title.

const CHARSETS: Charset[] = ['unicode', 'ascii'];

interface Case {
  id: string;
  layout: ErCellLayout;
  out: Record<Charset, ErAsciiResult>;
  again: Record<Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};

beforeAll(async () => {
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/er-diagram'), 'e2e')) {
    if (parseEr(item.source).diagnostics.some((d) => d.severity === 'error')) continue;
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        out[charset] = await renderErAscii(item.source, { charset });
        again[charset] = (await renderErAscii(item.source, { charset })).text;
      }
      cases.push({ id: item.id, layout: out.unicode.layout, out, again });
    } catch (e) {
      failed[item.id] = String(e);
    }
  }
}, 300_000);

/** `{ id: problems }` for the cases where `check` finds something. */
function problems(check: (c: Case) => unknown[]): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const c of cases) {
    const found = check(c);
    if (found.length > 0) out[c.id] = found;
  }
  return out;
}

const perCharset = (check: (c: Case, charset: Charset) => unknown[]) =>
  problems((c) =>
    CHARSETS.flatMap((charset) => check(c, charset).map((p) => `${charset}: ${String(p)}`))
  );

const structureOf = (c: Case, cs: Charset) =>
  readErStructure(c.out[cs].text, cs, erExpectedOf(c.layout));

describe('er ascii corpus properties (D87, R-ASCII-9)', () => {
  it('renders every ER diagram that parses', () => {
    expect(cases.length).toBeGreaterThan(180);
    expect(failed).toEqual({});
  });

  it('is deterministic', () => {
    expect(perCharset((c, cs) => (c.out[cs].text === c.again[cs] ? [] : ['differs']))).toEqual({});
  });

  it('draws every entity’s table inside a box, and every relationship label', () => {
    expect(
      perCharset((c, cs) => {
        const s = structureOf(c, cs);
        return [
          ...s.missingEntities.map((l) => `entity in no box: ${JSON.stringify(l)}`),
          ...s.missingEdgeLabels.map((l) => `label missing: ${JSON.stringify(l)}`),
        ];
      })
    ).toEqual({});
  });

  it('draws both ends of every relationship, and no arrowheads', () => {
    expect(
      perCharset((c, cs) => {
        const s = structureOf(c, cs);
        const drawn = c.layout.er.edges.filter((e) => c.layout.edges.has(e.id)).length;
        const found: string[] = [];
        if (s.ends !== 2 * drawn) found.push(`${s.ends} ends for ${drawn} relationships`);
        if (s.kinds.some((k) => k === 'unknown' || k.endsWith('?')))
          found.push(`unreadable ends: ${s.kinds.join()}`);
        if (s.heads !== 0) found.push(`${s.heads} arrowheads`);
        return found;
      })
    ).toEqual({});
  });

  it('connects every line box to box (no free end)', () => {
    expect(
      perCharset((c, cs) => structureOf(c, cs).dangling.map((at) => `free end at ${at}`))
    ).toEqual({});
  });

  it('has `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces', () => {
    expect(
      perCharset((c, cs) => {
        const { text, rows, columns } = c.out[cs];
        const lines = text === '' ? [] : text.split('\n');
        // Measured apart from `cellWidth` where that is possible: printable ASCII, box drawing
        // and the marks are one column per code point; other text falls back to `cellWidth`.
        const narrow = /^[\x20-\x7e─-◿ΛV]*$/u;
        const width = (l: string) => (narrow.test(l) ? [...l].length : cellWidth(l));
        const widest = Math.max(0, ...lines.map(width));
        const found: string[] = [];
        if (lines.length !== rows) found.push(`${lines.length} lines, rows ${rows}`);
        if (widest !== columns) found.push(`widest ${widest}, columns ${columns}`);
        lines.forEach((l, i) => {
          if (/\s$/u.test(l)) found.push(`trailing space on line ${i + 1}`);
        });
        // Labels keep their own script; the drawing itself is ASCII.
        if (cs === 'ascii' && /[\u2500-\u25ff\u039b]/u.test(text)) found.push('box glyph in ascii');
        return found;
      })
    ).toEqual({});
  });

  it('has no overlapping boxes (entities apart; an entity or subgraph inside a subgraph or apart)', () => {
    expect(problems((c) => overlaps(c.layout))).toEqual({});
  });

  it('routes no line through an entity, a relationship label or a subgraph title', () => {
    expect(
      problems((c) => {
        const graph = c.layout.er.graph;
        return routeCollisions(graph, c.layout, repairRoutes(graph, c.layout).routes).filter(
          (l) => l.kind === 'box' || l.kind === 'label'
        );
      })
    ).toEqual({});
  });
});

interface Rect {
  id: string;
  group: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Cells a centred box covers, the grid model's convention (`LayoutGraph.grid`). */
const rect = (
  id: string,
  group: boolean,
  b: { x: number; y: number; width: number; height: number }
): Rect => ({
  id,
  group,
  x0: Math.round(b.x - b.width / 2 + 0.5),
  y0: Math.round(b.y - b.height / 2 + 0.5),
  x1: Math.round(b.x + b.width / 2 - 0.5),
  y1: Math.round(b.y + b.height / 2 - 0.5),
});

function overlaps(model: LayoutModel): string[] {
  const rects = [
    ...[...model.nodes].map(([id, n]) => rect(id, false, n)),
    ...[...model.groups].map(([id, g]) => rect(id, true, g)),
  ];
  const apart = (a: Rect, b: Rect) => a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0;
  const within = (a: Rect, b: Rect) =>
    b.group && a.x0 > b.x0 && a.x1 < b.x1 && a.y0 > b.y0 && a.y1 < b.y1;
  const found: string[] = [];
  rects.forEach((a, i) => {
    for (const b of rects.slice(i + 1)) {
      if (!apart(a, b) && !within(a, b) && !within(b, a)) found.push(`${a.id} × ${b.id}`);
    }
  });
  return found;
}
