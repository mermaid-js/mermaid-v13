import { describe, expect, it } from 'vitest';
import { GANTT_PARITY_NOW, v12Schedule } from './v12-schedule.ts';

// The schedule oracle itself (spec #293 T3): v12's getTasks() at GANTT_PARITY_NOW, local time.
const TODAY = new Date(new Date(GANTT_PARITY_NOW).setHours(0, 0, 0, 0)).getTime();
const ISO = 'gantt\ndateFormat YYYY-MM-DD\n';

describe('v12 schedule oracle', () => {
  it('schedules in local time', async () => {
    const s = await v12Schedule(ISO + 'a :a, 2014-01-01, 2d\nb :after a, 1d');
    expect(s).toEqual({
      ok: true,
      tasks: [
        expect.objectContaining({ id: 'a', start: new Date(2014, 0, 1).getTime(), order: 0 }),
        expect.objectContaining({ id: 'task1', start: new Date(2014, 0, 3).getTime() }),
      ],
    });
  });

  it('falls back to today for an undeclared id, even after a diagram that declared it', async () => {
    // Without the flush, v12's stale `taskDb.yy` (0) would name `b` itself, which never resolves.
    await v12Schedule(ISO + 'y :yy, 2015-01-01, 2d');
    const s = await v12Schedule(ISO + 'b :b, after yy, 1d');
    expect(s.ok && s.tasks[0]!.start).toBe(TODAY);
  });

  it('reports where v12 failed', async () => {
    expect(await v12Schedule(ISO + 'a :1d')).toMatchObject({ ok: false });
    expect(await v12Schedule(ISO + 'a :a, nope, 1d')).toMatchObject({
      ok: false,
      error: expect.stringContaining('Invalid date:nope') as unknown,
    });
    expect(await v12Schedule(ISO + 'a :done')).toMatchObject({ ok: false });
  });
});
