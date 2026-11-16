import { beforeAll, describe, expect, it } from 'vitest';
import { cellWidth, repairRoutes, routeCollisions } from '@mermaid-js/core/ascii';
import type { LayoutModel } from '@mermaid-js/core/layout';
import { parseRequirement } from '@mermaid-js/diagram-requirement';
import { createMermaid, MermaidError } from 'mermaid';
import { requirementCases, requirementCorpus } from '../requirement/corpus.ts';
import {
  renderRequirementAscii,
  type RequirementAsciiResult,
  type RequirementCellLayout,
} from './requirement-render.ts';
import { readRequirementStructure, requirementExpectedOf } from './requirement-structure.ts';
import type { Charset } from './structure.ts';

// ASCII render properties of the requirement diagram (#588, D320, D438, R-ASCII-9) over the
// requirement corpus (e2e fixtures, v12 spec strings, the cases file), in both charsets, as
// ER's (`er-corpus.spec.ts`): renders wherever SVG renders, deterministic, every box whole
// (`<<Kind>>` and the name above one divider, the `Key: value` lines below it, values cut at 40
// cells), every relation label present, one `contains` mark per `contains` relation and one
// arrowhead per other relation, every line connected box to box, `rows` lines none wider than
// `columns` and one exactly that wide, no trailing spaces, no Unicode glyph in ASCII output,
// no overlapping boxes, no line through a box or a relation label.

const CHARSETS: Charset[] = ['unicode', 'ascii'];

interface Case {
  id: string;
  /** The front-matter title as written. */
  title: string | undefined;
  layout: RequirementCellLayout;
  out: Record<Charset, RequirementAsciiResult>;
  again: Record<Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};

beforeAll(async () => {
  const svg = createMermaid();
  svg.initialize({ deterministic: true });
  for (const item of [...(await requirementCorpus()), ...requirementCases()]) {
    try {
      await svg.render('r', item.source);
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
      continue; // SVG does not render it either
    }
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        out[charset] = await renderRequirementAscii(item.source, { charset });
        again[charset] = (await renderRequirementAscii(item.source, { charset })).text;
      }
      const { title } = parseRequirement(item.source).model;
      cases.push({ id: item.id, title, layout: out.unicode.layout, out, again });
    } catch (e) {
      failed[item.id] = String(e);
    }
  }
}, 300_000);

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
  readRequirementStructure(c.out[cs].text, cs, requirementExpectedOf(c.layout, c.title));

describe('requirement ascii corpus properties (D438, R-ASCII-9)', () => {
  it('renders every requirement diagram SVG renders', () => {
    expect(cases.length).toBeGreaterThan(300);
    expect(failed).toEqual({});
  });

  it('is deterministic', () => {
    expect(perCharset((c, cs) => (c.out[cs].text === c.again[cs] ? [] : ['differs']))).toEqual({});
  });

  it('draws every box whole, and every relation label', () => {
    expect(
      perCharset((c, cs) => {
        const s = structureOf(c, cs);
        return [
          ...s.missingBoxes.map((l) => `box missing: ${JSON.stringify(l)}`),
          ...s.missingEdgeLabels.map((l) => `label missing: ${JSON.stringify(l)}`),
        ];
      })
    ).toEqual({});
  });

  it('marks each contains at its source and each other relation with an arrowhead', () => {
    expect(
      perCharset((c, cs) => {
        const s = structureOf(c, cs);
        const drawn = c.layout.requirement.relations.filter((r) => c.layout.edges.has(r.id));
        const contains = drawn.filter((r) => r.marker === 'contains').length;
        const found: string[] = [];
        if (s.contains !== contains) found.push(`${s.contains} contains marks for ${contains}`);
        if (s.heads !== drawn.length - contains)
          found.push(`${s.heads} arrowheads for ${drawn.length - contains}`);
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
        // Printable ASCII, box drawing and the marks are one column per code point; other text
        // falls back to `cellWidth`.
        const narrow = /^[\x20-\x7e─-◿⊕…]*$/u;
        const width = (l: string) => (narrow.test(l) ? [...l].length : cellWidth(l));
        const widest = Math.max(0, ...lines.map(width));
        const found: string[] = [];
        if (lines.length !== rows) found.push(`${lines.length} lines, rows ${rows}`);
        if (widest !== columns) found.push(`widest ${widest}, columns ${columns}`);
        lines.forEach((l, i) => {
          if (/\s$/u.test(l)) found.push(`trailing space on line ${i + 1}`);
        });
        // Labels keep their own script; the drawing itself is ASCII.
        if (cs === 'ascii' && /[─-◿⊕…]/u.test(text)) found.push('unicode glyph in ascii');
        return found;
      })
    ).toEqual({});
  });

  it('has no overlapping boxes', () => {
    expect(problems((c) => overlaps(c.layout))).toEqual({});
  });

  it('routes no line through a box or a relation label', () => {
    expect(
      problems((c) => {
        const graph = c.layout.requirement.graph;
        return routeCollisions(graph, c.layout, repairRoutes(graph, c.layout).routes).filter(
          (l) => l.kind === 'box' || l.kind === 'label'
        );
      })
    ).toEqual({});
  });
});

interface Rect {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Cells a centred box covers, the grid model's convention (`LayoutGraph.grid`). */
const rect = (id: string, b: { x: number; y: number; width: number; height: number }): Rect => ({
  id,
  x0: Math.round(b.x - b.width / 2 + 0.5),
  y0: Math.round(b.y - b.height / 2 + 0.5),
  x1: Math.round(b.x + b.width / 2 - 0.5),
  y1: Math.round(b.y + b.height / 2 - 0.5),
});

function overlaps(model: LayoutModel): string[] {
  const rects = [...model.nodes].map(([id, n]) => rect(id, n));
  const apart = (a: Rect, b: Rect) => a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0;
  const found: string[] = [];
  rects.forEach((a, i) => {
    for (const b of rects.slice(i + 1)) if (!apart(a, b)) found.push(`${a.id} × ${b.id}`);
  });
  return found;
}
