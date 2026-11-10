import { beforeAll, describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import { createMermaid, MermaidError } from 'mermaid';
import type { CorpusItem } from '../types.ts';
import { collisions, droppedTwice, overlaps, textFaults } from './ascii/checks.ts';
import { renderAgentflowAscii, type AgentflowAsciiResult } from './ascii/render.ts';
import { readAgentflow, type Charset } from './ascii/structure.ts';
import { agentflowCases, agentflowCorpus } from './corpus.ts';

// ASCII render properties of agentflow (#551, D320, D469, R-ASCII-5, R-ASCII-8, R-ASCII-9) over
// the agentflow corpus (the e2e fixtures, the v12 spec and syntax-page strings, the cases file),
// in both charsets, through the public `format: 'ascii'` API: renders wherever SVG renders,
// deterministic, `rows` lines none wider than `columns` and one exactly that wide, no trailing
// spaces, no box glyph in ascii output; no overlapping boxes, no line through a node, an edge
// label or a flow title; read back against the cell layout (`ascii-structure.ts`): every node
// its kind's text form (D469) with its label inside, every flow frame whole with only its title
// on its border, edge labels in place, `-.-` dotted and the rest solid, `-->` ending in a head,
// `--x` in a cross, a tee where a line leaves a box; one `ASCII_DROPPED` per feature kind.

const CHARSETS: Charset[] = ['unicode', 'ascii'];

interface Case {
  id: string;
  title?: string;
  out: Record<Charset, AgentflowAsciiResult>;
  again: Record<Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};
let corpusSize = 0;
let rejected = 0;

beforeAll(async () => {
  const corpus: CorpusItem[] = [...(await agentflowCorpus()), ...agentflowCases()];
  corpusSize = corpus.length;
  const svg = createMermaid();
  svg.initialize({ deterministic: true });
  for (const item of corpus) {
    try {
      await svg.render('a', item.source);
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
      rejected++;
      continue; // SVG does not render it either
    }
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        out[charset] = await renderAgentflowAscii(item.source, { charset });
        again[charset] = (await renderAgentflowAscii(item.source, { charset })).text;
      }
      const title = preprocess(item.source).frontMatter?.title;
      cases.push({ id: item.id, ...(title !== undefined ? { title } : {}), out, again });
    } catch (e) {
      failed[item.id] = String(e);
    }
  }
}, 600_000);

/** `{ id: problems }` for the cases where `check` finds something, in either charset. */
function problems(check: (c: Case, cs: Charset) => readonly unknown[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of cases) {
    const found = CHARSETS.flatMap((cs) => check(c, cs).map((p) => `${cs}: ${String(p)}`));
    if (found.length > 0) out[c.id] = found.slice(0, 6);
  }
  return out;
}

describe('agentflow ascii corpus properties (#551, D469, R-ASCII-9)', { timeout: 120_000 }, () => {
  it('renders every agentflow that renders to SVG', () => {
    expect(corpusSize).toBeGreaterThan(300);
    expect(cases.length).toBeGreaterThan(250);
    expect(rejected).toBeGreaterThan(0);
    expect(failed).toEqual({});
  });

  it('is deterministic', () => {
    expect(problems((c, cs) => (c.out[cs].text === c.again[cs] ? [] : ['differs']))).toEqual({});
  });

  it('has `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces', () => {
    expect(problems((c, cs) => textFaults(c.out[cs]))).toEqual({});
  });

  it('uses no Unicode line or marker glyph in ascii output', () => {
    const glyph = /[─-◿✕]/u;
    expect(
      problems((c, cs) => {
        if (cs !== 'ascii') return [];
        const p = c.out.ascii.layout.agentflow;
        const texts = [
          ...[...p.nodes, ...p.groups, ...p.edges].flatMap((v) =>
            v.label.lines.map((runs) => runs.map((r) => r.text).join(''))
          ),
          c.title ?? '',
        ];

        if (texts.some((t) => glyph.test(t))) return [];
        return glyph.test(c.out.ascii.text) ? ['Unicode glyph in ascii output'] : [];
      })
    ).toEqual({});
  });

  it('has no overlapping boxes (nodes apart; a node or flow inside a flow or apart)', () => {
    expect(problems((c, cs) => overlaps(c.out[cs].layout))).toEqual({});
  });

  it('routes no line through a node, an edge label or a flow title', () => {
    expect(problems((c, cs) => collisions(c.out[cs]))).toEqual({});
  });

  it('draws what the layout says, where it says: text forms, frames, labels, strokes and ends', () => {
    let ends = 0;
    const found = problems((c, cs) => {
      const r = readAgentflow(c.out[cs].text, cs, c.out[cs].layout, c.title);
      ends += r.ends;
      return r.faults;
    });
    expect(found).toEqual({});
    expect(ends).toBeGreaterThan(1000);
  });

  it('warns at most once per dropped feature kind', () => {
    expect(problems((c, cs) => droppedTwice(c.out[cs]))).toEqual({});
  });
});
