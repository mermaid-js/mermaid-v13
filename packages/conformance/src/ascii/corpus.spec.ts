import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { repairRoutes, routeCollisions } from '@mermaid-js/core/ascii';
import { createMermaid, MermaidError } from 'mermaid';
import { REPO_ROOT, corpusFromDir, isEmbeddedFixture } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import { expectedOf } from './expected.ts';
import { overlaps, sizeFaults } from './flow-checks.ts';
import { renderAscii, type AsciiResult, type CellLayout } from './render.ts';
import { readStructure, type Charset } from './structure.ts';

// ASCII render properties over the whole in-repo flowchart corpus, in both charsets (D87,
// R-ASCII-9): renders wherever SVG renders, deterministic, every visible node label inside a
// box and every edge label present, every edge line connected box to box, no overlapping boxes,
// no edge through a box, an edge label or a group title, `rows` lines none wider than `columns`
// and one exactly that wide, no trailing spaces.

const CHARSETS: Charset[] = ['unicode', 'ascii'];

interface Case {
  id: string;
  /** An embedded-diagram fixture (ADR-15): its blocks frame other diagrams' drawings. */
  embedded: boolean;
  layout: CellLayout;
  out: Record<Charset, AsciiResult>;
  again: Record<Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};

async function* corpus(): AsyncGenerator<CorpusItem> {
  yield* corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/flowchart'), 'e2e');
  const specs = join(REPO_ROOT, 'packages/conformance/corpus/flowchart-v12-specs.json');
  yield* JSON.parse(readFileSync(specs, 'utf8')) as CorpusItem[];
}

beforeAll(async () => {
  const svg = createMermaid();
  svg.initialize({ deterministic: true });
  for await (const item of corpus()) {
    let type: string;
    try {
      type = (await svg.render('corpus', item.source)).diagramType;
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
      continue; // SVG does not render it either
    }
    if (!type.startsWith('flowchart')) continue;
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        out[charset] = await renderAscii(item.source, { charset });
        again[charset] = (await renderAscii(item.source, { charset })).text;
      }
      cases.push({
        id: item.id,
        embedded: isEmbeddedFixture(item),
        layout: out.unicode.layout,
        out,
        again,
      });
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

describe('ascii corpus properties (D87, R-ASCII-9)', () => {
  it('renders every flowchart that renders to SVG', () => {
    expect(cases.length).toBeGreaterThan(700);
    expect(failed).toEqual({});
  });

  it('is deterministic', () => {
    expect(perCharset((c, cs) => (c.out[cs].text === c.again[cs] ? [] : ['differs']))).toEqual({});
  });

  // The flowchart reader cannot read the other diagrams' drawings inside a block's frame (ADR-15):
  // the embedded fixtures' structure is checked by the mermaid package's embedded-ascii spec
  // and the v13 goldens (`ascii/v13/embedded_*`) instead.
  it('draws every visible node label inside a box, and every edge label', () => {
    expect(
      perCharset((c, cs) => {
        if (c.embedded) return [];
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
        if (c.embedded) return [];
        const s = readStructure(c.out[cs].text, cs, expectedOf(c.layout, c.layout.title));
        return s.dangling.map((at) => `edge line with a free end at ${at}`);
      })
    ).toEqual({});
  });

  it('has `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces', () => {
    expect(perCharset((c, cs) => sizeFaults(c.out[cs]))).toEqual({});
  });

  it('has no overlapping boxes (nodes apart; a node or group inside a group or apart)', () => {
    expect(problems((c) => overlaps(c.layout))).toEqual({});
  });

  // #45 (D78, R-ASCII-1): after the repair router no edge passes through a node box, another
  // edge's label or a group title (titles are labels owned by their group).
  it('routes no edge through a node box, an edge label or a group title', () => {
    expect(
      problems((c) => {
        const graph = c.layout.flow.graph;
        return routeCollisions(graph, c.layout, repairRoutes(graph, c.layout).routes).filter(
          (l) => l.kind === 'box' || l.kind === 'label'
        );
      })
    ).toEqual({});
  });
});
