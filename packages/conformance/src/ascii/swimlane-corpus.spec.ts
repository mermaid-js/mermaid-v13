// ASCII render properties over the swimlane corpus (`e2e/diagrams/swimlanes`), in both charsets
// (#603, D534, D179, R-ASCII-9). Text output takes flowchart's `ascii` hook with the built-in
// `layered` engine, lanes drawn as plain groups (subgraph frames), and warns one
// `ASCII_DROPPED` (`feature: 'layout'`). Nothing of the swimlane engine reaches it: no
// `LayoutModel.lanes`, no `SWIMLANE_*` warning, no default lane. The same holds for any
// flowchart with `layout: swimlane` (D535), which draws the same text. Besides flowchart's own
// corpus properties (`corpus.spec.ts`), no edge label, arrowhead or marker sits on a group
// frame (pitfall 20).
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { repairRoutes, routeCollisions } from '@mermaid-js/core/ascii';
import type { Point } from '@mermaid-js/core/layout';
import { createMermaid, type Warning } from 'mermaid';
import { REPO_ROOT, corpusFromDir } from '../corpus.ts';
import { expectedOf } from './expected.ts';
import { frameFaults, overlaps, sizeFaults } from './flow-checks.ts';
import { renderAscii, type AsciiResult, type CellLayout } from './render.ts';
import { readStructure, type Charset } from './structure.ts';

const CHARSETS: Charset[] = ['unicode', 'ascii'];
const HEADER = /^(\s*)swimlane-beta\b/m;

interface Case {
  id: string;
  layout: CellLayout;
  routes: ReadonlyMap<string, readonly Point[]>;
  out: Record<Charset, AsciiResult>;
  again: Record<Charset, string>;
  /** The same source as `flowchart` with `layout: swimlane` (D535), unicode. */
  asFlowchart: AsciiResult;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};

beforeAll(async () => {
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/swimlanes'), 'e2e')) {
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        out[charset] = await renderAscii(item.source, { charset });
        again[charset] = (await renderAscii(item.source, { charset })).text;
      }
      const flowchart = item.source.replace(
        HEADER,
        '$1%%{init: {"layout": "swimlane"}}%%\n$1flowchart'
      );
      const asFlowchart = await renderAscii(flowchart, { charset: 'unicode' });
      const { layout } = out.unicode;
      const { routes } = repairRoutes(layout.flow.graph, layout);
      cases.push({ id: item.id, layout, routes, out, again, asFlowchart });
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

/** What is wrong with a render's warnings: one `ASCII_DROPPED` for the layout, nothing of lanes. */
function warningFaults(warnings: readonly Warning[]): string[] {
  const dropped = warnings.filter((w) => w.code === 'ASCII_DROPPED' && w.feature === 'layout');
  const found: string[] = [];
  if (dropped.length !== 1) found.push(`${dropped.length} ASCII_DROPPED (layout) warnings`);
  for (const w of warnings)
    if (/^(SWIMLANE_|LAYOUT_UNKNOWN|ELK_)/.test(w.code)) found.push(`warned ${w.code}`);
  return found;
}

describe('swimlane ascii corpus properties (#603, D534)', () => {
  it('advertises ascii for the swimlane type, as for flowchart (manifest `formats`)', () => {
    const m = createMermaid();
    expect(m.supportsFormat('swimlane', 'ascii')).toBe(true);
  });

  it('renders every swimlane fixture as text, typed `swimlane`', () => {
    expect(cases.length).toBeGreaterThan(40);
    expect(failed).toEqual({});
    expect(problems((c) => (c.out.unicode.diagramType === 'swimlane' ? [] : ['type']))).toEqual({});
  });

  it('warns one ASCII_DROPPED (layout) and nothing lane-specific (D179, D534)', () => {
    expect(perCharset((c, cs) => warningFaults(c.out[cs].warnings))).toEqual({});
  });

  it('lays out with layered: no lanes, no default lane, every subgraph a plain group', () => {
    expect(
      problems((c) => {
        const { layout } = c;
        const found: string[] = [];
        const groups = c.layout.flow.groups.map((g) => g.id).sort();
        const laid = [...layout.groups.keys()].sort();
        if (JSON.stringify(groups) !== JSON.stringify(laid))
          found.push(`groups ${laid.join(',')}, subgraphs ${groups.join(',')}`);
        return found;
      })
    ).toEqual({});
  });

  it('draws a flowchart with `layout: swimlane` the same, with the same one warning (D535)', () => {
    expect(
      problems((c) => [
        ...(c.asFlowchart.text === c.out.unicode.text ? [] : ['text differs']),
        ...warningFaults(c.asFlowchart.warnings),
      ])
    ).toEqual({});
  });

  it('is deterministic', () => {
    expect(perCharset((c, cs) => (c.out[cs].text === c.again[cs] ? [] : ['differs']))).toEqual({});
  });

  it('draws every visible node label inside a box, and every edge label', () => {
    expect(
      perCharset((c, cs) => {
        const s = readStructure(c.out[cs].text, cs, expectedOf(c.layout, c.layout.title));
        return [
          ...s.missingNodes.map((l) => `node label in no box: ${JSON.stringify(l)}`),
          ...s.missingEdgeLabels.map((l) => `edge label missing: ${JSON.stringify(l)}`),
        ];
      })
    ).toEqual({});
  });

  it('connects every edge line box to box (no free end, none ending on a title)', () => {
    expect(
      perCharset((c, cs) => {
        const s = readStructure(c.out[cs].text, cs, expectedOf(c.layout, c.layout.title));
        return s.dangling.map((at) => `edge line with a free end at ${at}`);
      })
    ).toEqual({});
  });

  it('keeps edge labels, arrowheads and markers off lane and group frames (pitfall 20)', () => {
    expect(perCharset((c, cs) => frameFaults(c.out[cs].text, c.layout, c.routes, cs))).toEqual({});
  });

  it('has `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces', () => {
    expect(perCharset((c, cs) => sizeFaults(c.out[cs]))).toEqual({});
  });

  it('has no overlapping boxes (nodes apart; a node or group inside a group or apart)', () => {
    expect(problems((c) => overlaps(c.layout))).toEqual({});
  });

  it('routes no edge through a node box, an edge label or a lane title', () => {
    expect(
      problems((c) =>
        routeCollisions(c.layout.flow.graph, c.layout, c.routes).filter(
          (l) => l.kind === 'box' || l.kind === 'label'
        )
      )
    ).toEqual({});
  });
});
