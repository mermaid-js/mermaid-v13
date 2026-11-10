// From v12 `swimlanes/__tests__/laneTitleBands.spec.ts` (c9b12739f): its cases test the router's
// rails against title bands (T0b, #595). This keeps the part T0a owns: where the engine reserves
// each lane's title band (D536), on top for TB/BT and on the left for LR/RL (v12 put RL's on the
// right and BT's at the bottom).
import { describe, expect, it } from 'vitest';
import type { Dir, LayoutModel, LayoutModelGroup } from '../../types.ts';
import { DEFAULT_SWIMLANE_ID } from '../helpers.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { layoutGraph } from './graphs.ts';

const graphOf = (direction: Dir) =>
  layoutGraph({
    direction,
    lanes: { HoE: ['HE_CA', 'HE_Ans'], StatusSeeker: ['A', 'B'], TechLead: ['TL_CA'] },
    edges: [
      ['HE_CA', 'HE_Ans'],
      ['A', 'B'],
      ['B', 'TL_CA'],
      ['B', 'HE_CA'],
    ],
    size: { width: 110, height: 45 },
    spacing: { node: 40, rank: 90 },
    titles: true,
  });

const edges = (g: LayoutModelGroup) => ({
  left: g.x - g.width / 2,
  right: g.x + g.width / 2,
  top: g.y - g.height / 2,
  bottom: g.y + g.height / 2,
});

describe.each(['TB', 'BT'] as const)('%s: lane title bands', (direction) => {
  const model = swimlaneLayout(graphOf(direction));
  it.each(['HoE', 'StatusSeeker', 'TechLead'])('puts the title of %s on top', (id) => {
    const lane = model.groups.get(id)!;
    const b = edges(lane);
    expect(lane.title.x).toBeCloseTo(lane.x, 6);
    expect(lane.title.y).toBeCloseTo(b.top + 21 / 2, 6);
    // Nothing of the lane's content reaches into the band.
    for (const [, n] of model.nodes) {
      if (Math.abs(n.x - lane.x) < lane.width / 2) {
        expect(n.y - n.height / 2).toBeGreaterThanOrEqual(b.top + 21);
      }
    }
  });
});

describe.each(['LR', 'RL'] as const)('%s: lane title bands', (direction) => {
  const model = swimlaneLayout(graphOf(direction));
  it.each(['HoE', 'StatusSeeker', 'TechLead'])('puts the title of %s on the left', (id) => {
    const lane = model.groups.get(id)!;
    const b = edges(lane);
    expect(lane.title.y).toBeCloseTo(lane.y, 6);
    expect(lane.title.x).toBeCloseTo(b.left + 36 / 2, 6);
    for (const [, n] of model.nodes) expect(n.x - n.width / 2).toBeGreaterThanOrEqual(b.left + 36);
  });
});

describe('lanes are the top-level groups (D535, D536): no field of their own', () => {
  /** Group ids across the flow, by position. */
  const across = (model: LayoutModel, direction: string) =>
    [...model.groups]
      .sort(([, a], [, b]) => (direction === 'LR' ? a.y - b.y : a.x - b.x))
      .map(([id]) => id);

  it('lays the lanes out across the flow, the engine-made default lane included', () => {
    expect(across(swimlaneLayout(graphOf('TB')), 'TB')).toEqual([
      'HoE',
      'StatusSeeker',
      'TechLead',
    ]);
    const loose = layoutGraph({
      direction: 'LR',
      lanes: { Sales: ['A'], Ops: ['B'] },
      nodes: ['L'],
      edges: [['L', 'A']],
    });
    const lanes = across(swimlaneLayout(loose), 'LR');
    expect([...lanes].sort()).toEqual([DEFAULT_SWIMLANE_ID, 'Ops', 'Sales'].sort());
    expect(lanes.filter((id) => id !== DEFAULT_SWIMLANE_ID)).toEqual(['Sales', 'Ops']);
    expect('lanes' in swimlaneLayout(loose)).toBe(false);
  });
});
