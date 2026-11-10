import { beforeAll, describe, expect, it } from 'vitest';
import type { Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutEventModel, type EventModelLayout } from '@mermaid-js/diagram-eventmodeling';
import {
  eventModelTestContext,
  eventModelTestTheme,
} from '@mermaid-js/diagram-eventmodeling/testing';
import { loadOracle, type Oracle } from '../oracle.ts';
import type { CorpusItem } from '../types.ts';
import { eventModelingGateCorpus } from './corpus.ts';
import { eventModelingV12Geometry, type EventModelV12Geometry } from './v12.ts';
import { parseEventModelForParity } from './v13.ts';

/**
 * The layout against v12's `getState()` and `renderer.ts` (#604) over the gate corpus, where
 * both accept and the lanes agree (model parity lists where they do not: D522). v12 measured
 * with the oracle's stub document (every text 0 × 1 px; a data block, which v12 joined with
 * `\n` and not `<br/>`, as one line), and v13 with a measurer of 0 × 0, so every box is
 * `80 + 20` square on both sides and the placement can be compared to the px:
 * - lanes, boxes and relations come in v12's order, each in v12's lane;
 * - lane tops and heights, box tops, widths and heights equal v12's;
 * - box x equals v12's up to the first box v12 put less than 10 after its lane's previous box
 *   (over it, mostly), where v13 puts it 10 after (D521); a model with no such box has every x,
 *   the lane widths and every relation segment between lanes equal to v12's;
 * - a relation within a lane runs from the source's right edge to the target's left (D521) and
 *   a self relation loops (v12 drew both through the boxes).
 */
const stub: Measurer = {
  id: 'stub',
  width: () => 0,
  metrics: () => ({ ascent: 0, descent: 0, lineHeight: 0 }),
};
const PAD = 10;

let theme: Theme;
let oracle: Oracle;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = await eventModelTestTheme();
  oracle = await loadOracle();
  corpus = await eventModelingGateCorpus();
});

/** The first box v12 put less than `PAD` after the previous box of its lane, if any. */
function firstCrowded(v12: EventModelV12Geometry): number | undefined {
  const right = new Map<number, number>();
  for (const [k, b] of v12.boxes.entries()) {
    const before = right.get(b.lane);
    if (before !== undefined && b.x < before + PAD) return k;
    right.set(b.lane, b.x + b.width);
  }
  return undefined;
}

function compare(v12: EventModelV12Geometry, v13: EventModelLayout, ids: string[]): string[] {
  const out: string[] = [];
  const eq = (what: string, a: unknown, b: unknown): void => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      out.push(`${what}: v12 ${JSON.stringify(a)}, v13 ${JSON.stringify(b)}`);
  };
  eq(
    'lanes',
    v12.lanes.map((l) => [l.index, l.y, l.height]),
    v13.lanes.map((l) => [l.index, l.y, l.height])
  );
  const laneIndex = (k: number): number | undefined => v13.lanes[k]?.index;
  eq(
    'boxes',
    v12.boxes.map((b) => [b.frame, b.lane, b.y, b.width, b.height]),
    v13.boxes.map((b) => [ids[b.frame], laneIndex(b.lane), b.y, b.width, b.height])
  );
  eq(
    'relations',
    v12.relations.map((r) => [r.source, r.target]),
    v13.relations.map((r) => [ids[r.source], ids[r.target]])
  );
  const crowded = firstCrowded(v12);
  const upTo = crowded ?? v12.boxes.length;
  eq(
    'x before the first D521 fix',
    v12.boxes.slice(0, upTo).map((b) => b.x),
    v13.boxes.slice(0, upTo).map((b) => b.x)
  );
  if (crowded !== undefined) {
    const v12x = v12.boxes[crowded]?.x ?? 0;
    const box = v13.boxes[crowded];
    const before = v13.boxes
      .slice(0, crowded)
      .reverse()
      .find((b) => b.lane === box?.lane);
    if (!box || !before || box.x !== before.x + before.width + PAD || box.x <= v12x)
      out.push(`box ${crowded} is not placed ${PAD} after its lane's previous box (D521)`);
  } else {
    eq(
      'lane widths',
      v12.lanes.map((l) => l.width),
      v13.lanes.map((l) => l.width)
    );
    v12.relations.forEach((r, k) => {
      const v = v13.relations[k];
      if (!v) return;
      if (r.sameLane) {
        const route = v.source === v.target ? 'self' : 'along';
        eq(`relation ${k} route`, route, v.route);
      } else
        eq(
          `relation ${k}`,
          r.points,
          v.points.flatMap((p) => [p.x, p.y])
        );
    });
  }
  return out;
}

describe('event modeling layout against mermaid@12', () => {
  it('places lanes, boxes and relations as v12, apart from D521', async () => {
    const failures: string[] = [];
    let compared = 0;
    let fixed = 0;
    let exact = 0;
    let lanesDiffer = 0;
    for (const item of corpus) {
      let model;
      try {
        model = parseEventModelForParity(item.source);
      } catch {
        continue;
      }
      const result = await oracle.parse(item.source);
      if (!result.accepted) continue;
      const v12 = eventModelingV12Geometry(result.db);
      const v13 = layoutEventModel(model, eventModelTestContext(theme, {}, stub));
      if (v12.lanes.map((l) => l.index).join() !== v13.lanes.map((l) => l.index).join()) {
        lanesDiffer++;
        continue;
      }
      compared++;
      if (firstCrowded(v12) === undefined) exact++;
      else fixed++;
      const ids = model.frames.map((f) => f.id);
      const v = compare(v12, v13, ids);
      if (v.length > 0) failures.push(`${item.id}: ${v.slice(0, 3).join('; ')}`);
    }
    process.stdout.write(
      `eventmodeling layout vs v12: ${compared} compared (${exact} exact, ${fixed} with a D521 fix), ${lanesDiffer} with other lanes (D522)\n`
    );
    expect(compared).toBeGreaterThan(300);
    expect(exact).toBeGreaterThan(200);
    expect(fixed).toBeGreaterThan(10);
    expect(lanesDiffer).toBeLessThan(10);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);
});
