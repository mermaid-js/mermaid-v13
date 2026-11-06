import { describe, expect, it } from 'vitest';
import { autoTicks, intervalTicks, timeFormat } from './axis.ts';
import { add, format, parseDuration, parseStrict, readEndDate, readStartDate } from './dates.ts';

// Ported from Pele's tests/gantt/dates.test.ts at 3a2f075 (spec #293, D271), with v13's cases for
// the v12 quirks and the time zones below. Pele's cases build dates with the local-time Date
// constructor, so they hold in any zone; vitest runs this file under TZ=UTC and under
// TZ=America/Los_Angeles (root vitest.config.ts), where the DST cases bite.
// cspell:ignore kepano

const NOW = new Date(2031, 4, 6, 9, 30, 15, 250);
const parse = (input: string, template: string): Date | undefined =>
  parseStrict(input, template, NOW);

function zone(date: Date, colon: boolean): string {
  const offset = -date.getTimezoneOffset();
  const abs = Math.abs(offset);
  const two = (n: number): string => String(n).padStart(2, '0');
  return (offset >= 0 ? '+' : '-') + two(Math.floor(abs / 60)) + (colon ? ':' : '') + two(abs % 60);
}

describe('strict date parsing', () => {
  it.each([
    ['2014-01-06', 'YYYY-MM-DD', new Date(2014, 0, 6)],
    ['06-01-2014', 'DD-MM-YYYY', new Date(2014, 0, 6)],
    ['14/1/6', 'YY/M/D', new Date(2014, 0, 6)],
    ['70/12/31', 'YY/M/D', new Date(1970, 11, 31)],
    ['2014-01-06 17:49', 'YYYY-MM-DD HH:mm', new Date(2014, 0, 6, 17, 49)],
    ['2014-01-06 7:5:9', 'YYYY-MM-DD H:m:s', new Date(2014, 0, 6, 7, 5, 9)],
    ['2014-01-06T07:05:09.123', 'YYYY-MM-DDTHH:mm:ss.SSS', new Date(2014, 0, 6, 7, 5, 9, 123)],
    ['9:30 PM', 'h:mm A', new Date(2031, 4, 6, 21, 30)],
    ['12:05 am', 'hh:mm a', new Date(2031, 4, 6, 0, 5)],
    ['12:05 pm', 'hh:mm a', new Date(2031, 4, 6, 12, 5)],
    ['Jan 5, 2024', 'MMM D, YYYY', new Date(2024, 0, 5)],
    ['5th January 2024', 'Do MMMM YYYY', new Date(2024, 0, 5)],
    ['22nd December 2024', 'Do MMMM YYYY', new Date(2024, 11, 22)],
    ['on 2024-03-01', '[on] YYYY-MM-DD', new Date(2024, 2, 1)],
    ['17:49', 'HH:mm', new Date(2031, 4, 6, 17, 49)],
    ['2024', 'YYYY', new Date(2024, 0, 1)],
    ['03', 'MM', new Date(2031, 2, 1)],
    ['7', 'D', new Date(2031, 4, 7)],
    ['20', 'ss', new Date(2031, 4, 6, 0, 0, 20)],
    ['2 2024', 'Q YYYY', new Date(2024, 3, 1)],
    ['Monday 2024', 'dddd YYYY', new Date(2024, 0, 1)],
  ])('reads %s as %s', (input, template, expected) => {
    expect(parse(input, template)).toEqual(expected);
  });

  it.each([
    ['2014-1-6', 'YYYY-MM-DD'],
    ['2014-01-06 7:05:09', 'YYYY-MM-DD H:m:s'],
    ['2014-13-01', 'YYYY-MM-DD'],
    ['2014-02-30', 'YYYY-MM-DD'],
    ['202-12-01', 'YYYY-MM-DD'],
    ['202304', 'YYYYMMDD'],
    ['2014-01-06 ', 'YYYY-MM-DD'],
    [' 2014-01-06', 'YYYY-MM-DD'],
    ['2014-01-06x', 'YYYY-MM-DD'],
    ['0', 'ss'],
    ['25:00', 'HH:mm'],
    ['5 January 2024', 'Do MMMM YYYY'],
    ['5th january 2024', 'Do MMMM YYYY'],
    ['Tuesday 2024', 'dddd YYYY'],
    ['2014-01-06', ''],
    ['2014-01-06', 'q'],
    ['12/25/2020', 'L'],
    ['2020-01', 'YYYY-ww'],
    ['Invalid Date', ''],
    ['', 'YYYY-MM-DD'],
  ])('rejects %s for %s', (input, template) => {
    expect(parse(input, template)).toBeUndefined();
  });

  it('reads Unix timestamps in seconds and in milliseconds', () => {
    expect(parse('1410715640', 'X')).toEqual(new Date(1410715640000));
    expect(parse('1410715640579', 'x')).toEqual(new Date(1410715640579));
    expect(parse('-5', 'x')).toEqual(new Date(-5));
    expect(parse('1410715640.579', 'X')).toBeUndefined();
    expect(parse('1e3', 'x')).toBeUndefined();
    expect(parse('', 'x')).toBeUndefined();
  });

  it('reads a UTC offset, and accepts it only when it is the local one', () => {
    const local = new Date(2024, 0, 5, 10, 0, 0);
    expect(parse(`2024-01-05T10:00:00${zone(local, true)}`, 'YYYY-MM-DDTHH:mm:ssZ')).toEqual(local);
    expect(parse(`2024-01-05T10:00:00${zone(local, false)}`, 'YYYY-MM-DDTHH:mm:ssZZ')).toEqual(
      local
    );
    const other = zone(local, true) === '+05:45' ? '+03:00' : '+05:45';
    expect(parse(`2024-01-05T10:00:00${other}`, 'YYYY-MM-DDTHH:mm:ssZ')).toBeUndefined();
  });
});

describe('date formatting', () => {
  const date = new Date(2024, 1, 3, 15, 4, 5, 67);

  it.each([
    ['YYYY-MM-DD', '2024-02-03'],
    ['YY M D', '24 2 3'],
    ['MMM MMMM', 'Feb February'],
    ['d dd ddd dddd', '6 Sa Sat Saturday'],
    ['H HH h hh', '15 15 3 03'],
    ['m mm s ss SSS', '4 04 5 05 067'],
    ['a A', 'pm PM'],
    ['Do [of] MMMM', '3rd of February'],
    ['Q', '1'],
    ['k kk', '15 15'],
    ['W WW GGGG', '5 05 2024'],
    ['[YYYY] YYYY', 'YYYY 2024'],
    ['x', String(date.getTime())],
    ['X', String(Math.floor(date.getTime() / 1000))],
    ['Y YYY', 'Y 24Y'],
    ['S SS', 'S SS'],
  ])('writes %s as %s', (template, expected) => {
    expect(format(date, template)).toBe(expected);
  });

  it('writes the UTC offset', () => {
    expect(format(date, 'Z')).toBe(zone(date, true));
    expect(format(date, 'ZZ')).toBe(zone(date, false));
    expect(format(date, '')).toBe('2024-02-03T15:04:05' + zone(date, true));
  });

  it('writes ordinals, midnight, and ISO weeks at the edges of a year', () => {
    expect(
      [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map((d) => format(new Date(2024, 0, d), 'Do'))
    ).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st']);
    expect(format(new Date(2024, 0, 1, 0, 30), 'k h a')).toBe('24 12 am');
    expect(format(new Date(2021, 0, 3), 'GGGG-[W]WW')).toBe('2020-W53');
    expect(format(new Date(2024, 11, 30), 'GGGG-[W]WW')).toBe('2025-W01');
    expect(format(new Date(2026, 0, 1), 'W')).toBe('1');
  });

  it('has no output for tokens that need dayjs plugins Mermaid does not load', () => {
    for (const template of ['w', 'ww', 'wo', 'gggg', 'z', 'zzz', 'YYYY-ww'])
      expect(format(date, template)).toBeUndefined();
    expect(format(date, '[w] YYYY')).toBe('w 2024');
  });

  it('reports an invalid date', () => {
    expect(format(new Date(NaN), 'YYYY')).toBe('Invalid Date');
  });
});

describe('date arithmetic', () => {
  it('adds calendar days and weeks, whatever the length of the day', () => {
    expect(add(new Date(2020, 10, 1), 1, 'd')).toEqual(new Date(2020, 10, 2));
    expect(add(new Date(2024, 2, 9), 2, 'd')).toEqual(new Date(2024, 2, 11));
    expect(add(new Date(2013, 0, 1), 2, 'w')).toEqual(new Date(2013, 0, 15));
    expect(add(new Date(2013, 0, 1), 1.5, 'd')).toEqual(new Date(2013, 0, 3));
    expect(add(new Date(2013, 0, 1), 0.4, 'd')).toEqual(new Date(2013, 0, 1));
    expect(add(new Date(2013, 0, 1), 0.5, 'w')).toEqual(new Date(2013, 0, 5));
  });

  it('adds exact hours, minutes, seconds, and milliseconds', () => {
    const start = new Date(2013, 0, 1);
    expect(+add(start, 2, 'h') - +start).toBe(7200000);
    expect(+add(start, 2, 'm') - +start).toBe(120000);
    expect(+add(start, 0.005, 's') - +start).toBe(5);
    expect(+add(start, 20, 'ms') - +start).toBe(20);
  });

  it('adds months and years, keeping to the end of a shorter month', () => {
    expect(add(new Date(2024, 0, 31), 1, 'M')).toEqual(new Date(2024, 1, 29));
    expect(add(new Date(2023, 11, 31), 2, 'M')).toEqual(new Date(2024, 1, 29));
    expect(add(new Date(2024, 2, 30), 11, 'M')).toEqual(new Date(2025, 1, 28));
    expect(add(new Date(2024, 1, 29), 1, 'y')).toEqual(new Date(2025, 1, 28));
    expect(add(new Date(2024, 0, 15), 1.5, 'M')).toEqual(new Date(2024, 1, 15));
  });

  it('gives an invalid date beyond the range of dates', () => {
    expect(Number.isNaN(add(new Date(2024, 0, 1), 99999999, 'y').getTime())).toBe(true);
  });

  it('reads durations', () => {
    expect(parseDuration('1.5d')).toEqual([1.5, 'd']);
    expect(parseDuration(' 3M ')).toEqual([3, 'M']);
    expect(parseDuration('500ms')).toEqual([500, 'ms']);
    expect(parseDuration('3dX')).toEqual([NaN, 'ms']);
    expect(parseDuration('-1d')).toEqual([NaN, 'ms']);
  });
});

describe('axis formats', () => {
  const date = new Date(2024, 1, 3, 15, 4, 5, 67);

  it.each([
    ['%Y-%m-%d', '2024-02-03'],
    ['%a %A %b %B', 'Sat Saturday Feb February'],
    ['%H:%M:%S.%L', '15:04:05.067'],
    ['%I %p', '03 PM'],
    ['%e|%-d|%_d|%0e', ' 3|3| 3|03'],
    ['%j', '034'],
    ['%U %W %V', '04 05 05'],
    ['%u %w', '6 6'],
    ['%y %G %g', '24 2024 24'],
    ['%q', '1'],
    ['%x', '2/3/2024'],
    ['%X', '3:04:05 PM'],
    ['%c', '2/3/2024, 3:04:05 PM'],
    ['%f', '067000'],
    ['%%Y %k %', '%Y k '],
    ['%s', String(Math.floor(date.getTime() / 1000))],
    ['%Q', String(date.getTime())],
  ])('writes %s as %s', (specifier, expected) => {
    expect(timeFormat(specifier, date)).toBe(expected);
  });

  it('numbers weeks from the first Sunday, the first Monday, and by ISO rules', () => {
    expect(timeFormat('%U %W %V %G', new Date(2023, 0, 1))).toBe('01 00 52 2022');
    expect(timeFormat('%U %W %V %G', new Date(2024, 11, 30))).toBe('52 53 01 2025');
    expect(timeFormat('%U %W %V', new Date(2024, 0, 1))).toBe('00 01 01');
  });
});

describe('axis ticks', () => {
  const day = (y: number, m: number, d: number, h = 0, min = 0): number =>
    new Date(y, m, d, h, min).getTime();

  it('picks round steps for the span', () => {
    expect(autoTicks(day(2014, 0, 1), day(2014, 1, 20), 10)).toEqual(
      [0, 1, 2, 3, 4, 5, 6].map((k) => day(2014, 0, 5 + 7 * k))
    );
    expect(autoTicks(day(2024, 0, 10, 9), day(2024, 0, 10, 18), 10)).toEqual(
      [9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((h) => day(2024, 0, 10, h))
    );
    expect(autoTicks(day(1900, 0, 1), day(2020, 0, 1), 10)).toEqual(
      Array.from({ length: 13 }, (_, k) => day(1900 + 10 * k, 0, 1))
    );
    expect(autoTicks(day(2024, 0, 1), day(2024, 6, 31), 7)).toEqual(
      [0, 1, 2, 3, 4, 5, 6].map((m) => day(2024, m, 1))
    );
    expect(autoTicks(0, 71000, 10)).toEqual(Array.from({ length: 15 }, (_, k) => k * 5000));
    expect(autoTicks(0, 30, 10)).toEqual([
      0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30,
    ]);
  });

  it('follows a tick interval and the weekday that weeks start on', () => {
    const start = day(2024, 0, 1);
    const stop = day(2024, 0, 31);
    expect(intervalTicks('1week', 'monday', start, stop, 100)).toEqual(
      [1, 8, 15, 22, 29].map((d) => day(2024, 0, d))
    );
    expect(intervalTicks('1week', 'sunday', start, stop, 100)).toEqual(
      [7, 14, 21, 28].map((d) => day(2024, 0, d))
    );
    expect(intervalTicks('1week', 'thursday', start, stop, 100)).toEqual(
      [4, 11, 18, 25].map((d) => day(2024, 0, d))
    );
    expect(intervalTicks('10day', 'sunday', start, stop, 100)).toEqual(
      [1, 11, 21, 31].map((d) => day(2024, 0, d))
    );
    expect(intervalTicks('1month', 'sunday', start, day(2024, 3, 2), 100)).toEqual(
      [0, 1, 2, 3].map((m) => day(2024, m, 1))
    );
    expect(intervalTicks('6hour', 'sunday', start, day(2024, 0, 2), 100)).toEqual(
      [0, 6, 12, 18, 24].map((h) => day(2024, 0, 1, h))
    );
    expect(
      intervalTicks('15minute', 'sunday', day(2024, 0, 1, 9, 5), day(2024, 0, 1, 10), 100)
    ).toEqual([15, 30, 45, 60].map((m) => day(2024, 0, 1, 9, m)));
    expect(intervalTicks('2week', 'monday', start, stop, 100)!.length).toBeLessThanOrEqual(3);
  });

  it('declines intervals it does not know and ones that ask for too many ticks', () => {
    const start = day(2024, 0, 1);
    const stop = day(2024, 0, 31);
    for (const interval of [
      '',
      '1decade',
      '1year',
      '0day',
      '01day',
      '1 day',
      '1days',
      'day',
      '1.5day',
      '-1day',
    ]) {
      expect(intervalTicks(interval, 'sunday', start, stop, 100)).toBeUndefined();
    }
    expect(intervalTicks('1second', 'sunday', start, stop, 1000)).toBeUndefined();
    expect(intervalTicks('99999999second', 'sunday', start, stop, 1000)).toBeUndefined();
    expect(intervalTicks('1day', 'nonsense', start, stop, 100)!.length).toBe(31);
  });

  it('stops filtered tick searches when dates overflow', () => {
    const limit = 8.64e15;
    expect(autoTicks(-limit, -limit + 120_000, 4)).toEqual([]);
    expect(intervalTicks('2second', 'sunday', limit - 1000, limit, 10)).toEqual([limit]);
  });
});

// The zone vitest pinned with TZ (no Node types here, so not `process.env.TZ`).
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const LA = ZONE === 'America/Los_Angeles';
const HOUR = 3600000;

describe('time zone of the run', () => {
  it('is the zone the vitest project pins', () => {
    expect(['UTC', 'America/Los_Angeles']).toContain(ZONE);
    expect(new Date(2020, 0, 1).getTimezoneOffset()).toBe(LA ? 480 : 0);
    expect(new Date(2020, 6, 1).getTimezoneOffset()).toBe(LA ? 420 : 0);
  });
});

describe('v12 quirks kept (spec #293, "Dates and axis")', () => {
  it('accepts a date only when formatting it gives back the input', () => {
    expect(parse('2014-1-6', 'YYYY-M-D')).toEqual(new Date(2014, 0, 6));
    expect(parse('2014-1-6', 'YYYY-MM-DD')).toBeUndefined();
    expect(parse('2014-02-30', 'YYYY-MM-DD')).toBeUndefined();
    expect(readEndDate('2014-1-6', 'YYYY-MM-DD', NOW)).toBeUndefined();
    expect(readEndDate(' 2014-01-06 ', ' YYYY-MM-DD ', NOW)).toEqual(new Date(2014, 0, 6));
  });

  it('sends every start to the Date fallback without a dateFormat', () => {
    // ISO date-only text is UTC midnight, any other text local midnight.
    expect(readStartDate('2019-05-10', '', NOW)).toEqual(new Date(Date.UTC(2019, 4, 10)));
    expect(readStartDate('2019-09-1', '', NOW)).toEqual(new Date(2019, 8, 1));
    if (LA) expect(readStartDate('2019-05-10', '', NOW)).toEqual(new Date(2019, 4, 9, 17));
    expect(readEndDate('2019-05-10', '', NOW)).toBeUndefined();
  });

  it('rejects a fallback date beyond the year 10000', () => {
    expect(readStartDate('202304', 'YYYYMMDD', NOW)).toBeUndefined();
    expect(readStartDate('not a date', 'YYYY-MM-DD', NOW)).toBeUndefined();
    expect(readStartDate('9999-12-31', 'YYYY-MM-DD', NOW)).toEqual(new Date(9999, 11, 31));
  });

  it('reads a dateFormat X start as milliseconds and an end as seconds', () => {
    expect(readStartDate('1410715640', 'X', NOW)).toEqual(new Date(1410715640));
    expect(readEndDate('1410715640', 'X', NOW)).toEqual(new Date(1410715640000));
    expect(readStartDate('1410715640', 'x', NOW)).toEqual(new Date(1410715640));
    expect(readEndDate('1410715640', 'x', NOW)).toEqual(new Date(1410715640));
  });

  it('rounds fractional days, weeks, months and years as dayjs does, and keeps hours exact', () => {
    const start = new Date(2024, 0, 15);
    expect(add(start, 0.5, 'w')).toEqual(new Date(2024, 0, 19));
    expect(add(start, 1.5, 'd')).toEqual(new Date(2024, 0, 17));
    expect(add(start, 2.5, 'd')).toEqual(new Date(2024, 0, 18));
    expect(add(start, 1.9, 'M')).toEqual(new Date(2024, 1, 15));
    expect(add(start, 1.9, 'y')).toEqual(new Date(2025, 0, 15));
    expect(+add(start, 1.5, 'h') - +start).toBe(1.5 * HOUR);
    expect(+add(start, 0.5, 'm') - +start).toBe(30000);
    expect(add(start, ...parseDuration('0.5w'))).toEqual(new Date(2024, 0, 19));
  });
});

describe('daylight saving time', () => {
  it('adds a calendar day across the end of DST, a 25-hour day in Los Angeles', () => {
    const start = new Date(2020, 10, 1);
    const end = add(start, 1, 'd');
    expect(end).toEqual(new Date(2020, 10, 2));
    expect(+end - +start).toBe((LA ? 25 : 24) * HOUR);
    if (LA)
      expect([start.toISOString(), end.toISOString()]).toEqual([
        '2020-11-01T07:00:00.000Z',
        '2020-11-02T08:00:00.000Z',
      ]);
  });

  it('adds a calendar day across the start of DST, a 23-hour day in Los Angeles', () => {
    const start = new Date(2024, 2, 10);
    expect(+add(start, 1, 'd') - +start).toBe((LA ? 23 : 24) * HOUR);
  });

  it('adds hours as elapsed time across DST', () => {
    expect(add(new Date(2020, 10, 1), 24, 'h')).toEqual(
      LA ? new Date(2020, 10, 1, 23) : new Date(2020, 10, 2)
    );
  });

  it('puts daily ticks on local midnights across DST', () => {
    const ticks = intervalTicks(
      '1day',
      'sunday',
      +new Date(2020, 9, 30),
      +new Date(2020, 10, 4),
      100
    )!;
    expect(ticks).toEqual([30, 31, 32, 33, 34, 35].map((d) => +new Date(2020, 9, d)));
    expect(ticks.map((t, i) => (i ? t - ticks[i - 1]! : 0)).slice(1)).toEqual(
      LA ? [24, 24, 25, 24, 24].map((h) => h * HOUR) : [24, 24, 24, 24, 24].map((h) => h * HOUR)
    );
    const auto = autoTicks(+new Date(2020, 9, 25), +new Date(2020, 10, 8), 10);
    expect(auto).toHaveLength(15);
    expect(new Set(auto.map((t) => timeFormat('%H:%M', new Date(t))))).toEqual(new Set(['00:00']));
  });

  it('puts hour ticks on local hours across DST', () => {
    const ticks = intervalTicks(
      '6hour',
      'sunday',
      +new Date(2020, 10, 1),
      +new Date(2020, 10, 2),
      100
    )!;
    expect(ticks.map((t) => timeFormat('%d %H', new Date(t)))).toEqual([
      '01 00',
      '01 06',
      '01 12',
      '01 18',
      '02 00',
    ]);
    expect(ticks[1]! - ticks[0]!).toBe((LA ? 7 : 6) * HOUR);
  });

  it('formats the UTC offset of each side of the change', () => {
    expect(timeFormat('%Z', new Date(2020, 9, 31))).toBe(LA ? '-0700' : '+0000');
    expect(timeFormat('%Z', new Date(2020, 10, 2))).toBe(LA ? '-0800' : '+0000');
    expect(format(new Date(2020, 10, 2), 'Z')).toBe(LA ? '-08:00' : '+00:00');
  });
});
