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
  // A, B ->> A, C ->> A ->> B in one lane: C's relation from A skips B and runs under the row.
  const skipping = model(
    frame('evt', 'A'),
    frame('evt', 'B', { sources: ['01'] }),
    frame('evt', 'C', { sources: ['01', '02'] })
  );
  const routed = (): EventModelLayout =>
    layoutEventModel(skipping, eventModelTestContext(theme, {}, halfEm));
  type Relation = EventModelLayout['relations'][number];
  const reroute = (l: EventModelLayout, id: string, f: (r: Relation) => Partial<Relation>) => ({
    ...l,
    relations: l.relations.map((r) => (r.id === id ? { ...r, ...f(r) } : r)),
  });

  it('catches a relation drawn through a box of its lane, along another (#672)', () => {
    const l = routed();
    expect(eventModelLayoutViolations(skipping, l)).toEqual([]);
    expect(l.relations.find((r) => r.id === 'relation:01->03')?.route).toBe('under');
    // The straight route from A's right edge to C's left: through B, and along A → B.
    const a = l.boxes[0] as EventModelBoxLayout;
    const c = l.boxes[2] as EventModelBoxLayout;
    const tip = { x: c.x, y: c.y + c.height / 2 };
    const broken = reroute(l, 'relation:01->03', (r) => ({
      route: 'along',
      points: [{ x: a.x + a.width, y: a.y + a.height / 2 }, tip],
      head: [r.head[0], tip, r.head[2]],
    }));
    const v = eventModelLayoutViolations(skipping, broken).join('\n');
    expect(v).toContain('relation relation:01->03 runs through box 1');
    expect(v).toContain('relations relation:01->02 and relation:01->03 share a run');
  });

  it('catches a relation between lanes drawn through an unrelated box (D743, #1234)', () => {
    // E, U, and a reset C ->> E: v12's segment from E's ⅔ to U's ⅓ runs inside C.
    const resetting = model(
      frame('evt', 'E'),
      frame('ui', 'U'),
      frame('rmo', 'C', { reset: true, sources: ['01'] })
    );
    const l = layoutEventModel(resetting, eventModelTestContext(theme, {}, halfEm));
    expect(eventModelLayoutViolations(resetting, l)).toEqual([]);
    const e = l.boxes[0] as EventModelBoxLayout;
    const u = l.boxes[1] as EventModelBoxLayout;
    const tip = { x: u.x + u.width / 3, y: u.y + u.height };
    const broken = reroute(l, 'relation:01->02', (r) => ({
      points: [{ x: e.x + (2 * e.width) / 3, y: e.y }, tip],
      head: [r.head[0], tip, r.head[2]],
    }));
    expect(eventModelLayoutViolations(resetting, broken)).toContain(
      'relation relation:01->02 runs through box 2'
    );
  });

  it('lets through only a relation the layout marks as having no detour (D743)', () => {
    // Two wide read models fill the middle lane on both sides of E ->> U: no column fits.
    const long = 'x'.repeat(50);
    const blocked = model(
      frame('rmo', long),
      frame('evt', 'E'),
      frame('ui', 'U'),
      frame('rmo', long, { reset: true })
    );
    const l = layoutEventModel(blocked, eventModelTestContext(theme, {}, halfEm));
    expect(eventModelLayoutViolations(blocked, l)).toEqual([]);
    const unmarked = {
      ...l,
      relations: l.relations.map(({ noDetour: _, ...r }) => r),
    };
    expect(eventModelLayoutViolations(blocked, unmarked)).toContain(
      'relation relation:02->03 runs through box 0'
    );
  });

  it('catches a relation within a lane leaving it', () => {
    const broken = reroute(routed(), 'relation:01->03', (r) => ({
      points: r.points.map((p, k) => (k === 1 || k === 2 ? { ...p, y: p.y + 100 } : p)),
    }));
    expect(eventModelLayoutViolations(skipping, broken)).toContain(
      'relation relation:01->03 leaves its lane'
    );
  });

  it('catches a self loop whose leg is mostly arrowhead', () => {
    const looped = model(frame('evt', 'E'), frame('ui', 'A', { sources: ['01', '02'] }));
    const l = layoutEventModel(looped, eventModelTestContext(theme, {}, halfEm));
    const broken = reroute(l, 'relation:02->02', (r) => ({
      points: r.points.map((p, k) => (k === 1 || k === 2 ? { ...p, y: p.y - 15 } : p)),
    }));
    expect(eventModelLayoutViolations(looped, broken)).toContain(
      "relation relation:02->02's loop has a leg shorter than twice its head"
    );
  });
});
