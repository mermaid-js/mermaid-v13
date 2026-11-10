import { beforeAll, describe, expect, it } from 'vitest';
import { createMermaid, MermaidError } from 'mermaid';
import { collisions, overlaps, textFaults } from './ascii/checks.ts';
import { renderAgentflowAscii, type AgentflowAsciiResult } from './ascii/render.ts';
import { readAgentflow, type Charset } from './ascii/structure.ts';
import { flowFuzz } from './ascii/fuzz.ts';

// Pitfall 20 for agentflow text (#551, D469): edge labels and arrowheads stay off flow frames.
// Generated flow diagrams (flowchart's subgraph fuzz broke about 3% of frames before its fix):
// nested and collapsed flows of every kind of node, flows with their own direction, `global`
// nodes, nodes outside, and edges of the three kinds (some labelled, some long) between members
// of different flows, from a member to its own flow and back, into and out of flows, and between
// flows, in every direction. Each is drawn in both charsets through the public API and read back
// against its cell layout: every frame whole with only its title on its border, every label in
// place, every end's head, cross or tee where the line meets its box.

const CHARSETS: Charset[] = ['unicode', 'ascii'];
interface Case {
  id: string;
  source: string;
  out: Record<Charset, AgentflowAsciiResult>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};
let rejected = 0;

beforeAll(async () => {
  const svg = createMermaid();
  svg.initialize({ deterministic: true });
  for (const item of flowFuzz(200)) {
    try {
      await svg.render('a', item.source);
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
      rejected++;
      continue;
    }
    try {
      const out = {} as Case['out'];
      for (const charset of CHARSETS)
        out[charset] = await renderAgentflowAscii(item.source, { charset });
      cases.push({ id: item.id, source: item.source, out });
    } catch (e) {
      failed[item.id] = String(e);
    }
  }
}, 600_000);

function problems(check: (c: Case, cs: Charset) => readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of cases) {
    const found = CHARSETS.flatMap((cs) => check(c, cs).map((p) => `${cs}: ${p}`));
    if (found.length > 0) out[c.id] = found.slice(0, 6);
  }
  return out;
}

describe(
  'agentflow ascii: labels and arrowheads off frames (pitfall 20, #551)',
  { timeout: 120_000 },
  () => {
    it('renders every generated flow diagram', () => {
      expect(rejected).toBe(0);
      expect(cases.length).toBe(200);
      expect(failed).toEqual({});
    });

    it('keeps every frame whole, with nothing but its title on its border', () => {
      expect(
        problems((c, cs) =>
          readAgentflow(c.out[cs].text, cs, c.out[cs].layout).faults.filter((f) =>
            f.startsWith('frame:')
          )
        )
      ).toEqual({});
    });

    it('draws every label in place and every end where its line meets its box', () => {
      expect(
        problems((c, cs) =>
          readAgentflow(c.out[cs].text, cs, c.out[cs].layout).faults.filter(
            (f) => !f.startsWith('frame:')
          )
        )
      ).toEqual({});
    });

    // Core's router finds no lane for a few edges from a nested member to an outer flow (as for
    // flowchart's subgraphs): those warn `ASCII_ROUTE` (D78) and are counted, not failed.
    it('routes no line through a node, an edge label or a flow title unless it warns ASCII_ROUTE, and overlaps no boxes', () => {
      expect(
        problems((c, cs) => [...collisions(c.out[cs], true), ...overlaps(c.out[cs].layout)])
      ).toEqual({});
      const warned = cases.filter((c) =>
        c.out.unicode.warnings.some((w) => w.code === 'ASCII_ROUTE')
      );
      expect(warned.length).toBeLessThan(cases.length * 0.05);
    });

    it('has `rows` lines, none wider than `columns`, no trailing spaces', () => {
      expect(problems((c, cs) => textFaults(c.out[cs]))).toEqual({});
    });
  }
);
