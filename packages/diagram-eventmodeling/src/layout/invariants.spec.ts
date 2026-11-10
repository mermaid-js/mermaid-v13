import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { eventModelTestContext, eventModelTestTheme } from '../test-context.ts';
import { frame, halfEm, model } from './layout.fixtures.ts';
import { eventModelLayoutViolations } from './invariants.ts';
import { layoutEventModel } from './layout.ts';
import type { EventModelBoxLayout, EventModelLayout } from './types.ts';

// The checker must catch each broken rule (a checker that passes everything proves nothing).
let theme: Theme;
beforeAll(async () => {
  theme = await eventModelTestTheme();
});

const m = model(
  frame('ui', 'A'),
  frame('cmd', 'B'),
  frame('ui', 'C', { sources: ['02'] }),
  frame('ui', 'D', { sources: ['03'] })
);
const sound = (): EventModelLayout => layoutEventModel(m, eventModelTestContext(theme, {}, halfEm));

function withBox(l: EventModelLayout, k: number, patch: Partial<EventModelBoxLayout>) {
  return { ...l, boxes: l.boxes.map((b, i) => (i === k ? { ...b, ...patch } : b)) };
}

describe('eventModelLayoutViolations', () => {
  it('passes a sound layout', () => {
    expect(eventModelLayoutViolations(m, sound())).toEqual([]);
  });

  it.each([
    ['a NaN', (l: EventModelLayout) => withBox(l, 0, { width: Number.NaN }), /is NaN/],
    ['overlapping boxes', (l: EventModelLayout) => withBox(l, 2, { x: 300 }), /overlaps/],
    [
      'a box outside its lane',
      (l: EventModelLayout) => withBox(l, 1, { y: (l.boxes[1]?.y ?? 0) + 200 }),
      /outside its lane/,
    ],
    [
      'boxes out of frame order',
      (l: EventModelLayout) => withBox(l, 1, { x: 200 }),
      /box 1 is not right of box 0/,
    ],
    [
      'overlapping lanes',
      (l: EventModelLayout) => ({
        ...l,
        lanes: l.lanes.map((x, i) => (i === 1 ? { ...x, y: x.y - 20 } : x)),
      }),
      /is not below lane 0/,
    ],
    [
      'a relation off its box',
      (l: EventModelLayout) => ({
        ...l,
        relations: l.relations.map((r) => ({
          ...r,
          points: [{ x: 0, y: 0 }, ...r.points.slice(1)],
        })),
      }),
      /starts off its source's edge/,
    ],
    [
      'a name outside its box',
      (l: EventModelLayout) => {
        const b = l.boxes[0] as EventModelBoxLayout;
        return withBox(l, 0, { name: { ...b.name, x: b.x - 5 } });
      },
      /name .* is outside/,
    ],
    [
      'something outside the bounds',
      (l: EventModelLayout) => ({ ...l, bounds: { ...l.bounds, width: 10 } }),
      /outside the bounds/,
    ],
    [
      'a missing relation',
      (l: EventModelLayout) => ({ ...l, relations: l.relations.slice(1) }),
      /relations differ/,
    ],
  ])('catches %s', (_, broken, message) => {
    const v = eventModelLayoutViolations(m, broken(sound()));
    expect(
      v.some((s) => message.test(s)),
      v.join('\n')
    ).toBe(true);
  });

  it('catches a self loop ending where another relation ends (overlapping heads)', () => {
    const looped = model(frame('evt', 'E'), frame('ui', 'A', { sources: ['01', '02'] }));
    const l = layoutEventModel(looped, eventModelTestContext(theme, {}, halfEm));
    expect(eventModelLayoutViolations(looped, l)).toEqual([]);
    const up = l.relations.find((r) => r.route === 'up');
    const end = up?.points[1] as EventModelLayout['relations'][number]['points'][number];
    // A loop brought down onto the end of the relation from E (the bottom ⅓ anchor).
    const broken = {
      ...l,
      relations: l.relations.map((r) =>
        r.route === 'self'
          ? {
              ...r,
              points: [r.points[0]!, { x: end.x, y: end.y - 5 }, end],
              head: [r.head[0], end, r.head[2]] as typeof r.head,
            }
          : r
      ),
    };
    const v = eventModelLayoutViolations(looped, broken);
    expect(
      v.some((x) => x.includes('meets relation:01->02 at an end')),
      v.join('\n')
    ).toBe(true);
  });
});
