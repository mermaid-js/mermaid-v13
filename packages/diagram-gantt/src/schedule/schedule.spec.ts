import { describe, expect, it } from 'vitest';
import { FixtureDb } from './fixtures.ts';
import { schedule } from './schedule.ts';
import { ScheduleError, type ScheduledTask } from './types.ts';

// Spec #293 T3: the schedule seam. Expected dates are v12's (`ganttDb.spec.ts` at fa796a943
// and the v12 oracle), written as local dates, so every case holds in both zones the gantt
// projects run in (UTC, America/Los_Angeles).
const NOW = new Date(2031, 4, 6, 9, 30).getTime();
const TODAY = new Date(2031, 4, 6).getTime();
const d = (y: number, m: number, day: number, h = 0, min = 0): number =>
  new Date(y, m - 1, day, h, min).getTime();
const run = (db: FixtureDb, now = NOW) => schedule(db.input(), { now });
const times = (t: ScheduledTask): [number?, number?] => [t.start, t.end];
const ymd = () => new FixtureDb().setDateFormat('YYYY-MM-DD');

describe('schedule follows v12 getTasks()', () => {
  it('reads fixed dates and durations', () => {
    const s = run(
      ymd()
        .addTask('a', 'id1,2013-01-01,2013-01-12')
        .addTask('b', 'id2,2013-01-01,2h')
        .addTask('c', 'id3,2013-01-01,2w')
        .addTask('d', '2013-01-01,4d')
    );
    expect(s.tasks.map(times)).toEqual([
      [d(2013, 1, 1), d(2013, 1, 12)],
      [d(2013, 1, 1), d(2013, 1, 1, 2)],
      [d(2013, 1, 1), d(2013, 1, 15)],
      [d(2013, 1, 1), d(2013, 1, 5)],
    ]);
    expect(s.tasks.map((t) => [t.task.id, t.order])).toEqual([
      ['id1', 0],
      ['id2', 1],
      ['id3', 2],
      ['task1', 3],
    ]);
  });

  it('starts a one-field task where the one before ends', () => {
    const s = run(ymd().addTask('a', 'id1,2013-01-01,2w').addTask('b', '2d'));
    expect(times(s.tasks[1]!)).toEqual([d(2013, 1, 15), d(2013, 1, 17)]);
  });

  it('resolves after and until across sections and forward references (eleven passes)', () => {
    const s = run(
      ymd()
        .addSection('sec1')
        .addTask('t1', 'id1,2013-01-01,2w')
        .addTask('t2', 'id2,after id3,1d')
        .addSection('sec2')
        .addTask('t3', 'id3,after id1,2d')
        .addTask('t4', 'id4,2013-01-01,until id3')
    );
    expect(s.tasks.map(times)).toEqual([
      [d(2013, 1, 1), d(2013, 1, 15)],
      [d(2013, 1, 17), d(2013, 1, 18)],
      [d(2013, 1, 15), d(2013, 1, 17)],
      [d(2013, 1, 1), d(2013, 1, 15)],
    ]);
  });

  it('takes the latest end of several after ids and the earliest start of several until ids', () => {
    const s = run(
      ymd()
        .addTask('t1', 'id1,after id2 id3 id4,1d')
        .addTask('t2', 'id2,2013-01-01,1d')
        .addTask('t3', 'id3,2013-02-01,3d')
        .addTask('t4', 'id4,2013-02-01,2d')
        .addTask('t5', 'id5,2013-01-01,until id2 id3 id4')
    );
    expect(s.tasks[0]!.end).toBe(d(2013, 2, 5));
    expect(s.tasks[4]!.end).toBe(d(2013, 1, 1));
  });

  it('falls back to local midnight of now for unknown ids, and lists them once', () => {
    const s = run(
      ymd()
        .addTask('t1', 'id1,2013-01-01,2w')
        .addTask('t2', 'id2,after id9 id8,1d')
        .addTask('t3', 'id3,2013-01-01,until id9')
    );
    expect(s.tasks[1]!.start).toBe(TODAY);
    expect(s.tasks[2]!.end).toBe(TODAY);
    expect(s.unknownIds).toEqual(['id9', 'id8']);
  });

  it('lists data that is neither a date nor a duration, and gives the task no duration', () => {
    const s = run(ymd().addTask('M1', 'milestone, 2023-01-01, m1'));
    expect(times(s.tasks[0]!)).toEqual([d(2023, 1, 1), d(2023, 1, 1)]);
    expect(s.badDurations).toEqual(['m1']);
  });

  it('pushes ends past excluded days, keeping where the bar ends', () => {
    const s = run(
      ymd()
        .setExcludes('weekends 2019-02-06,friday')
        .addTask('test1', 'id1,2019-02-01,1d')
        .addTask('test2', 'id2,after id1,2d')
        .addTask('test3', 'id3,after id2,7d')
        .addTask('test4', 'id4,2019-02-01,2019-02-20')
        .addTask('test5', 'id5,after id4,1d')
        .addTask('test6', 'id6,2019-02-13,2d')
        .addTask('test7', 'id7,after id6,1d')
    );
    expect(s.tasks.map((t) => [t.start, t.end, t.renderEnd])).toEqual([
      [d(2019, 2, 1), d(2019, 2, 4), d(2019, 2, 2)],
      [d(2019, 2, 4), d(2019, 2, 7), d(2019, 2, 6)],
      [d(2019, 2, 7), d(2019, 2, 20), d(2019, 2, 20)],
      [d(2019, 2, 1), d(2019, 2, 20), undefined],
      [d(2019, 2, 20), d(2019, 2, 21), d(2019, 2, 21)],
      [d(2019, 2, 13), d(2019, 2, 18), d(2019, 2, 15)],
      [d(2019, 2, 18), d(2019, 2, 19), d(2019, 2, 19)],
    ]);
    expect(s.tasks[3]!.manualEnd).toBe(true);
  });

  it('starts weekends on friday when told to', () => {
    const s = run(
      ymd().setExcludes('weekends').setWeekend('friday').addTask('t', 'id1,2024-02-28, 3d')
    );
    expect(s.tasks[0]!.end).toBe(d(2024, 3, 4));
  });

  it('never pushes an end written as YYYY-MM-DD, whatever the format', () => {
    // `2019-02-08` is not a `DD/MM/YYYY` date, so it is read as a duration (invalid: no
    // duration), yet v12 still marks it manual and skips the excludes.
    const s = run(
      new FixtureDb()
        .setDateFormat('DD/MM/YYYY')
        .setExcludes('weekends')
        .addTask('t', 'id1,01/02/2019,2019-02-08')
    );
    expect(s.tasks[0]!.manualEnd).toBe(true);
    expect(s.tasks[0]!.end).toBe(d(2019, 2, 1));
  });

  it('adds a day to end dates under inclusiveEndDates, not to durations', () => {
    const s = run(
      ymd()
        .enableInclusiveEndDates()
        .addTask('a', 'id1,2019-02-01,1d')
        .addTask('b', 'id2,2019-02-01,2019-02-03')
    );
    expect(s.tasks.map(times)).toEqual([
      [d(2019, 2, 1), d(2019, 2, 2)],
      [d(2019, 2, 1), d(2019, 2, 4)],
    ]);
  });

  it('reads x as milliseconds', () => {
    const s = run(
      new FixtureDb()
        .setDateFormat('x')
        .addTask('a', 'id1,0,20ms')
        .addTask('b', 'id2,after id1,5ms')
        .addTask('c', 'id4,after id2,0.005s')
    );
    expect(s.tasks.map(times)).toEqual([
      [0, 20],
      [20, 25],
      [25, 30],
    ]);
  });

  it('gives vert markers no row', () => {
    const s = run(
      ymd().addTask('a', '2020-01-01,1d').addTask('v', 'vert, 2020-01-02,0d').addTask('b', '1d')
    );
    expect(s.tasks.map((t) => t.order)).toEqual([0, -1, 1]);
  });

  it('leaves a cycle of references unresolved', () => {
    const s = run(ymd().addTask('a', 'a,after b,1d').addTask('b', 'b,after a,1d'));
    expect(s.tasks.map((t) => t.start)).toEqual([undefined, undefined]);
  });

  it('cannot find a __proto__ id, as v12 stored ids on a plain object', () => {
    const s = run(
      ymd().addTask('a', '__proto__,2020-01-01,1d').addTask('b', 'b,after __proto__,1d')
    );
    expect(s.tasks[1]!.start).toBe(TODAY);
    expect(s.unknownIds).toEqual(['__proto__']);
  });

  it('is pure: the same input and now give the same schedule', () => {
    const db = ymd().addTask('a', 'a,after nope,1d');
    expect(run(db, NOW)).toEqual(run(db, NOW));
    expect(run(db, NOW + 86_400_000).tasks[0]!.start).toBe(TODAY + 86_400_000);
  });
});

describe('schedule errors are where v12 threw (D274)', () => {
  const fails = (db: FixtureDb) => {
    try {
      run(db);
    } catch (e) {
      if (e instanceof ScheduleError) return [e.kind, e.index, e.message];
      throw e;
    }
    return undefined;
  };

  it('rejects an invalid date and a year past 10000', () => {
    expect(fails(ymd().addTask('a', 'a,2020-01-01,1d').addTask('b', 'b,nonsense,1d'))).toEqual([
      'invalidDate',
      1,
      expect.stringContaining('Invalid date:nonsense'),
    ]);
    expect(
      fails(new FixtureDb().setDateFormat('YYYYMMDD').addTask('t', 'id1,202304,1d'))![2]
    ).toContain('Invalid date:202304');
  });

  it('rejects a first task with no start', () => {
    expect(fails(ymd().addTask('a', '1d'))!.slice(0, 2)).toEqual(['noStart', 0]);
  });

  it('rejects more than three fields', () => {
    expect(fails(ymd().addTask('a', 'a,b,2020-01-01,1d'))!.slice(0, 2)).toEqual([
      'tooManyFields',
      0,
    ]);
  });

  it('rejects excludes that leave no day after 10,000 tries', () => {
    const all = ymd().setExcludes('weekends,monday,tuesday,wednesday,thursday,friday');
    expect(fails(all.addTask('t', 'id1,2019-02-01,7d'))).toEqual([
      'excluded',
      0,
      expect.stringContaining('after 10,000 iterations'),
    ]);
    const fridays = ymd().setExcludes('weekends,monday,tuesday,wednesday,thursday');
    expect(fails(fridays.addTask('t', 'id1,2019-02-01,7d'))).toBeUndefined();
  });

  it('rejects a timestamp past the Date range rather than drawing NaN', () => {
    expect(
      fails(new FixtureDb().setDateFormat('x').addTask('t', 't,99999999999999999,1d'))![0]
    ).toBe('invalidDate');
  });
});

describe.runIf(Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/Los_Angeles')(
  'daylight saving time (America/Los_Angeles)',
  () => {
    it('adds one calendar day across a 25-hour day', () => {
      const s = run(ymd().addTask('dst', 'id1,2020-11-01,1d'));
      expect(s.tasks[0]!.end! - s.tasks[0]!.start!).toBe(25 * 3_600_000);
    });
  }
);
