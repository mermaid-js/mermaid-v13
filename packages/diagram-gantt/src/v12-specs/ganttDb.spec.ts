// Ported from mermaid v12 `packages/mermaid/src/diagrams/gantt/ganttDb.spec.ts` at fa796a943
// (spec #293 T3, R-TEST-3), through `./db-adapter.ts`. Changes from v12, each marked below:
// - `convert` tables are written as arrays of rows;
// - `dayjs(s, fmt).toDate()` is `day(s)`, the same local date;
// - `new Date()` (today) is the fixed `NOW` the adapter schedules at (D270);
// - `log.warn` spies read the schedule's warning lists (D276: `GANTT_UNKNOWN_TASK`,
//   `GANTT_BAD_DURATION`), which the layout turns into warnings;
// - the 25-hour-day case runs in the gantt-la project instead of under a manual `TZ=`.
import { beforeEach, describe, expect, it } from 'vitest';
import { GanttDbAdapter } from './db-adapter.ts';

const NOW = new Date(2031, 4, 6, 9, 30).getTime();
const ganttDb = new GanttDbAdapter(NOW);
/** A local date from `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss` (v12 `dayjs(s, fmt).toDate()`). */
function day(s: string): Date {
  const [y, m, d, h = 0, min = 0, sec = 0] = s.split(/[-: ]/).map(Number);
  return new Date(y!, m! - 1, d, h, min, sec);
}

describe('when using the ganttDb', function () {
  beforeEach(function () {
    ganttDb.clear();
  });

  describe('when using duration', function () {
    it.each([{ str: '1d', expected: [1, 'd'] }])(
      'should %s resulting in $o duration',
      ({ str, expected }) => {
        expect(ganttDb.parseDuration(str)).toEqual(expected);
      }
    );

    it.each([
      { str: '1d', expected: [1, 'd'] },
      { str: '2w', expected: [2, 'w'] },
      { str: '1ms', expected: [1, 'ms'] },
      { str: '0.1s', expected: [0.1, 's'] },
      { str: '1f', expected: [NaN, 'ms'] },
    ])('should $str resulting in $expected duration', ({ str, expected }) => {
      expect(ganttDb.parseDuration(str)).toEqual(expected);
    });
  });

  describe('when calling the clear function', function () {
    beforeEach(function () {
      ganttDb.setDateFormat('YYYY-MM-DD');
      ganttDb.enableInclusiveEndDates();
      ganttDb.setDisplayMode('compact');
      ganttDb.setTodayMarker('off');
      ganttDb.setExcludes('weekends 2019-02-06,friday');
      ganttDb.addSection('weekends skip test');
      ganttDb.addTask('test1', 'id1,2019-02-01,1d');
      ganttDb.addTask('test2', 'id2,after id1,2d');
      ganttDb.clear();
    });

    it.each([
      { fn: 'getTasks', expected: [] },
      { fn: 'getAccTitle', expected: '' },
      { fn: 'getAccDescription', expected: '' },
      { fn: 'getDateFormat', expected: '' },
      { fn: 'getAxisFormat', expected: '' },
      { fn: 'getTodayMarker', expected: '' },
      { fn: 'getExcludes', expected: [] },
      { fn: 'getSections', expected: [] },
      { fn: 'endDatesAreInclusive', expected: false },
      { fn: 'getDisplayMode', expected: '' },
    ] as const)('should clear $fn', ({ fn, expected }) => {
      expect(ganttDb[fn]()).toEqual(expected);
    });
  });

  // prettier-ignore
  it.each([
    { testName: 'should handle fixed dates', section: 'testa1', taskName: 'test1', taskData: 'id1,2013-01-01,2013-01-12', expStartDate: new Date(2013, 0, 1), expEndDate: new Date(2013, 0, 12), expId: 'id1', expTask: 'test1' },
    { testName: 'should handle duration (days) instead of fixed date to determine end date', section: 'testa1', taskName: 'test1', taskData: 'id1,2013-01-01,2d', expStartDate: new Date(2013, 0, 1), expEndDate: new Date(2013, 0, 3), expId: 'id1', expTask: 'test1' },
    { testName: 'should handle duration (hours) instead of fixed date to determine end date', section: 'testa1', taskName: 'test1', taskData: 'id1,2013-01-01,2h', expStartDate: new Date(2013, 0, 1), expEndDate: new Date(2013, 0, 1, 2), expId: 'id1', expTask: 'test1' },
    { testName: 'should handle duration (minutes) instead of fixed date to determine end date', section: 'testa1', taskName: 'test1', taskData: 'id1,2013-01-01,2m', expStartDate: new Date(2013, 0, 1), expEndDate: new Date(2013, 0, 1, 0, 2), expId: 'id1', expTask: 'test1' },
    { testName: 'should handle duration (seconds) instead of fixed date to determine end date', section: 'testa1', taskName: 'test1', taskData: 'id1,2013-01-01,2s', expStartDate: new Date(2013, 0, 1), expEndDate: new Date(2013, 0, 1, 0, 0, 2), expId: 'id1', expTask: 'test1' },
    { testName: 'should handle duration (weeks) instead of fixed date to determine end date', section: 'testa1', taskName: 'test1', taskData: 'id1,2013-01-01,2w', expStartDate: new Date(2013, 0, 1), expEndDate: new Date(2013, 0, 15), expId: 'id1', expTask: 'test1' },
    { testName: 'should handle fixed dates without id', section: 'testa1', taskName: 'test1', taskData: '2013-01-01,2013-01-12', expStartDate: new Date(2013, 0, 1), expEndDate: new Date(2013, 0, 12), expId: 'task1', expTask: 'test1' },
    { testName: 'should handle duration instead of a fixed date to determine end date without id', section: 'testa1', taskName: 'test1', taskData: '2013-01-01,4d', expStartDate: new Date(2013, 0, 1), expEndDate: new Date(2013, 0, 5), expId: 'task1', expTask: 'test1' },
  ])('$testName', ({ section, taskName, taskData, expStartDate, expEndDate, expId, expTask }) => {
    ganttDb.setDateFormat('YYYY-MM-DD');
    ganttDb.addSection(section);
    ganttDb.addTask(taskName, taskData);
    const tasks = ganttDb.getTasks();
    expect(tasks[0]!.startTime).toEqual(expStartDate);
    expect(tasks[0]!.endTime).toEqual(expEndDate);
    expect(tasks[0]!.id).toEqual(expId);
    expect(tasks[0]!.task).toEqual(expTask);
  });

  // v12: `new Date(new Date().setHours(0, 0, 0, 0))`; here midnight of NOW.
  // prettier-ignore
  it.each([
    { section: 'testa1', taskName1: 'test1', taskName2: 'test2', taskData1: 'id1,2013-01-01,2w', taskData2: 'id2,after id1,1d', expStartDate2: new Date(2013, 0, 15), expEndDate2: undefined, expId2: 'id2', expTask2: 'test2' },
    { section: 'testa1', taskName1: 'test1', taskName2: 'test2', taskData1: 'id1,2013-01-01,2w', taskData2: 'id2,after id3,1d', expStartDate2: new Date(new Date(NOW).setHours(0, 0, 0, 0)), expEndDate2: undefined, expId2: 'id2', expTask2: 'test2' },
    { section: 'testa1', taskName1: 'test1', taskName2: 'test2', taskData1: 'id1,2013-01-01,2w', taskData2: 'after id1,1d', expStartDate2: new Date(2013, 0, 15), expEndDate2: undefined, expId2: 'task1', expTask2: 'test2' },
    { section: 'testa1', taskName1: 'test1', taskName2: 'test2', taskData1: 'id1,2013-01-01,2w', taskData2: '2013-01-26', expStartDate2: new Date(2013, 0, 15), expEndDate2: new Date(2013, 0, 26), expId2: 'task1', expTask2: 'test2' },
    { section: 'testa1', taskName1: 'test1', taskName2: 'test2', taskData1: 'id1,2013-01-01,2w', taskData2: '2d', expStartDate2: new Date(2013, 0, 15), expEndDate2: new Date(2013, 0, 17), expId2: 'task1', expTask2: 'test2' },
  ])(
    '$testName',
    ({ section, taskName1, taskName2, taskData1, taskData2, expStartDate2, expEndDate2, expId2, expTask2 }) => {
      ganttDb.setDateFormat('YYYY-MM-DD');
      ganttDb.addSection(section);
      ganttDb.addTask(taskName1, taskData1);
      ganttDb.addTask(taskName2, taskData2);
      const tasks = ganttDb.getTasks();
      expect(tasks[1]!.startTime).toEqual(expStartDate2);
      if (expEndDate2) {
        expect(tasks[1]!.endTime).toEqual(expEndDate2);
      }
      expect(tasks[1]!.id).toEqual(expId2);
      expect(tasks[1]!.task).toEqual(expTask2);
    }
  );

  it('should handle milliseconds', function () {
    ganttDb.setDateFormat('x');
    ganttDb.addSection('testa1');
    ganttDb.addTask('test1', 'id1,0,20ms');
    ganttDb.addTask('test2', 'id2,after id1,5ms');
    ganttDb.addSection('testa2');
    ganttDb.addTask('test3', 'id3,20,10ms');
    ganttDb.addTask('test4', 'id4,after id3,0.005s');

    const tasks = ganttDb.getTasks();

    expect(tasks[0]!.startTime!.toISOString()).toEqual('1970-01-01T00:00:00.000Z');
    expect(tasks[0]!.endTime!.toISOString()).toEqual('1970-01-01T00:00:00.020Z');
    expect(tasks[1]!.startTime!.toISOString()).toEqual('1970-01-01T00:00:00.020Z');
    expect(tasks[1]!.endTime!.toISOString()).toEqual('1970-01-01T00:00:00.025Z');
    expect(tasks[2]!.startTime!.toISOString()).toEqual('1970-01-01T00:00:00.020Z');
    expect(tasks[2]!.endTime!.toISOString()).toEqual('1970-01-01T00:00:00.030Z');
    expect(tasks[3]!.startTime!.toISOString()).toEqual('1970-01-01T00:00:00.030Z');
    expect(tasks[3]!.endTime!.toISOString()).toEqual('1970-01-01T00:00:00.035Z');
  });

  it('should handle relative start date based on id regardless of sections', function () {
    ganttDb.setDateFormat('YYYY-MM-DD');
    ganttDb.addSection('sec1');
    ganttDb.addTask('test1', 'id1,2013-01-01,2w');
    ganttDb.addTask('test2', 'id2,after id3,1d');
    ganttDb.addSection('sec2');
    ganttDb.addTask('test3', 'id3,after id1,2d');

    const tasks = ganttDb.getTasks();

    expect(tasks[1]!.startTime).toEqual(new Date(2013, 0, 17));
    expect(tasks[1]!.endTime).toEqual(new Date(2013, 0, 18));
    expect(tasks[1]!.id).toEqual('id2');
    expect(tasks[1]!.task).toEqual('test2');

    expect(tasks[2]!.id).toEqual('id3');
    expect(tasks[2]!.task).toEqual('test3');
    expect(tasks[2]!.startTime).toEqual(new Date(2013, 0, 15));
    expect(tasks[2]!.endTime).toEqual(new Date(2013, 0, 17));
  });

  it('should handle relative end date based on id regardless of sections', function () {
    ganttDb.setDateFormat('YYYY-MM-DD');
    ganttDb.addSection('sec1');
    ganttDb.addTask('task1', 'id1,2013-01-01,until id3');
    ganttDb.addSection('sec2');
    ganttDb.addTask('task2', 'id2,2013-01-10,until id3');
    ganttDb.addTask('task3', 'id3,2013-02-01,2d');

    const tasks = ganttDb.getTasks();

    expect(tasks[0]!.startTime).toEqual(new Date(2013, 0, 1));
    expect(tasks[0]!.endTime).toEqual(new Date(2013, 1, 1));
    expect(tasks[0]!.id).toEqual('id1');
    expect(tasks[0]!.task).toEqual('task1');

    expect(tasks[1]!.id).toEqual('id2');
    expect(tasks[1]!.task).toEqual('task2');
    expect(tasks[1]!.startTime).toEqual(new Date(2013, 0, 10));
    expect(tasks[1]!.endTime).toEqual(new Date(2013, 1, 1));
  });

  it('should handle relative start date based on multiple id', function () {
    ganttDb.setDateFormat('YYYY-MM-DD');
    ganttDb.addSection('sec1');
    ganttDb.addTask('task1', 'id1,after id2 id3 id4,1d');
    ganttDb.addTask('task2', 'id2,2013-01-01,1d');
    ganttDb.addTask('task3', 'id3,2013-02-01,3d');
    ganttDb.addTask('task4', 'id4,2013-02-01,2d');

    const tasks = ganttDb.getTasks();

    expect(tasks[0]!.endTime).toEqual(new Date(2013, 1, 5));
    expect(tasks[0]!.id).toEqual('id1');
    expect(tasks[0]!.task).toEqual('task1');
  });

  it('should handle relative end date based on multiple id', function () {
    ganttDb.setDateFormat('YYYY-MM-DD');
    ganttDb.addSection('sec1');
    ganttDb.addTask('task1', 'id1,2013-01-01,until id2 id3 id4');
    ganttDb.addTask('task2', 'id2,2013-01-11,1d');
    ganttDb.addTask('task3', 'id3,2013-02-10,1d');
    ganttDb.addTask('task4', 'id4,2013-02-12,1d');

    const tasks = ganttDb.getTasks();

    expect(tasks[0]!.endTime).toEqual(new Date(2013, 0, 11));
    expect(tasks[0]!.id).toEqual('id1');
    expect(tasks[0]!.task).toEqual('task1');
  });

  it('should ignore weekends', function () {
    ganttDb.setDateFormat('YYYY-MM-DD');
    ganttDb.setExcludes('weekends 2019-02-06,friday');
    ganttDb.addSection('weekends skip test');
    ganttDb.addTask('test1', 'id1,2019-02-01,1d');
    ganttDb.addTask('test2', 'id2,after id1,2d');
    ganttDb.addTask('test3', 'id3,after id2,7d');
    ganttDb.addTask('test4', 'id4,2019-02-01,2019-02-20'); // Fixed endTime
    ganttDb.addTask('test5', 'id5,after id4,1d');
    ganttDb.addSection('full ending task on last day');
    ganttDb.addTask('test6', 'id6,2019-02-13,2d');
    ganttDb.addTask('test7', 'id7,after id6,1d');

    const tasks = ganttDb.getTasks();

    expect(tasks[0]!.startTime).toEqual(day('2019-02-01'));
    expect(tasks[0]!.endTime).toEqual(day('2019-02-04'));
    expect(tasks[0]!.renderEndTime).toEqual(day('2019-02-02'));
    expect(tasks[0]!.id).toEqual('id1');
    expect(tasks[0]!.task).toEqual('test1');

    expect(tasks[1]!.startTime).toEqual(day('2019-02-04'));
    expect(tasks[1]!.endTime).toEqual(day('2019-02-07'));
    expect(tasks[1]!.renderEndTime).toEqual(day('2019-02-06'));
    expect(tasks[1]!.id).toEqual('id2');
    expect(tasks[1]!.task).toEqual('test2');

    expect(tasks[2]!.startTime).toEqual(day('2019-02-07'));
    expect(tasks[2]!.endTime).toEqual(day('2019-02-20'));
    expect(tasks[2]!.renderEndTime).toEqual(day('2019-02-20'));
    expect(tasks[2]!.id).toEqual('id3');
    expect(tasks[2]!.task).toEqual('test3');

    expect(tasks[3]!.startTime).toEqual(day('2019-02-01'));
    expect(tasks[3]!.endTime).toEqual(day('2019-02-20'));
    expect(tasks[3]!.renderEndTime).toBeNull(); // Fixed end
    expect(tasks[3]!.id).toEqual('id4');
    expect(tasks[3]!.task).toEqual('test4');

    expect(tasks[4]!.startTime).toEqual(day('2019-02-20'));
    expect(tasks[4]!.endTime).toEqual(day('2019-02-21'));
    expect(tasks[4]!.renderEndTime).toEqual(day('2019-02-21'));
    expect(tasks[4]!.id).toEqual('id5');
    expect(tasks[4]!.task).toEqual('test5');

    expect(tasks[5]!.startTime).toEqual(day('2019-02-13'));
    expect(tasks[5]!.endTime).toEqual(day('2019-02-18'));
    expect(tasks[5]!.renderEndTime).toEqual(day('2019-02-15'));
    expect(tasks[5]!.id).toEqual('id6');
    expect(tasks[5]!.task).toEqual('test6');

    expect(tasks[6]!.startTime).toEqual(day('2019-02-18'));
    expect(tasks[6]!.endTime).toEqual(day('2019-02-19'));
    expect(tasks[6]!.id).toEqual('id7');
    expect(tasks[6]!.task).toEqual('test7');
  });

  it('should ignore weekends starting on friday', function () {
    ganttDb.setDateFormat('YYYY-MM-DD');
    ganttDb.setExcludes('weekends');
    ganttDb.setWeekend('friday');
    ganttDb.addSection('friday-saturday weekends skip test');
    ganttDb.addTask('test1', 'id1,2024-02-28, 3d');

    const tasks = ganttDb.getTasks();

    expect(tasks[0]!.startTime).toEqual(day('2024-02-28'));
    expect(tasks[0]!.endTime).toEqual(day('2024-03-04'));
    expect(tasks[0]!.id).toEqual('id1');
    expect(tasks[0]!.task).toEqual('test1');
  });

  it('should not infinite loop when excluding everything', function () {
    ganttDb.setDateFormat('YYYY-MM-DD');
    ganttDb.setExcludes('weekends,monday,tuesday,wednesday,thursday,friday');
    ganttDb.setWeekend('saturday');
    ganttDb.addSection('weekends skip test');
    ganttDb.addTask('test1', 'id1,2019-02-01,7d');

    expect(() => ganttDb.getTasks()).toThrowError('Failed to find a valid date');

    // Fridays are now allowed, so it should not throw an error
    ganttDb.clear();
    ganttDb.setDateFormat('YYYY-MM-DD');
    ganttDb.setExcludes('weekends,monday,tuesday,wednesday,thursday');
    ganttDb.setWeekend('saturday');
    ganttDb.addSection('weekends skip test');
    ganttDb.addTask('test1', 'id1,2019-02-01,7d');
    expect(() => ganttDb.getTasks()).not.toThrow();
  });

  it('should merge tokens across multiple setExcludes calls (issue #6270)', function () {
    ganttDb.setExcludes('weekends');
    ganttDb.setExcludes('2019-02-06');
    ganttDb.setExcludes('friday, monday');
    expect(ganttDb.getExcludes()).toEqual(['weekends', '2019-02-06', 'friday', 'monday']);
  });

  it('should dedupe tokens across multiple setExcludes calls (issue #6270)', function () {
    ganttDb.setExcludes('weekends,2019-02-06');
    ganttDb.setExcludes('weekends 2019-02-07');
    expect(ganttDb.getExcludes()).toEqual(['weekends', '2019-02-06', '2019-02-07']);
  });

  it('should merge tokens across multiple setIncludes calls (issue #6270)', function () {
    ganttDb.setIncludes('2019-02-06');
    ganttDb.setIncludes('2019-02-07,2019-02-08');
    expect(ganttDb.getIncludes()).toEqual(['2019-02-06', '2019-02-07', '2019-02-08']);
  });

  it('should maintain the order in which tasks are created', function () {
    ganttDb.setAccTitle('Project Execution');
    ganttDb.setDateFormat('YYYY-MM-DD');
    ganttDb.addSection('section A section');
    ganttDb.addTask('Completed task', 'done,    des1, 2014-01-06,2014-01-08');
    ganttDb.addTask('Active task', 'active,  des2, 2014-01-09, 3d');
    ganttDb.addTask('Future task', 'des3, after des2, 5d');
    ganttDb.addTask('Future task2', 'des4, after des3, 5d');

    ganttDb.addSection('section Critical tasks');
    ganttDb.addTask('Completed task in the critical line', 'crit, done, 2014-01-06,24h');
    ganttDb.addTask('Implement parser and jison', 'crit, done, after des1, 2d');
    ganttDb.addTask('Create tests for parser', 'crit, active, 3d');
    ganttDb.addTask('Future task in critical line', 'crit, 5d');
    ganttDb.addTask('Create tests for renderer', '2d');
    ganttDb.addTask('Add to mermaid', '1d');

    ganttDb.addSection('section Documentation');
    ganttDb.addTask('Describe gantt syntax', 'active, a1, after des1, 3d');
    ganttDb.addTask('Add gantt diagram to demo page', 'after a1  , 20h');
    ganttDb.addTask('Add another diagram to demo page', 'doc1, after a1  , 48h');

    ganttDb.addSection('section Last section');
    ganttDb.addTask('Describe gantt syntax', 'after doc1, 3d');
    ganttDb.addTask('Add gantt diagram to demo page', '20h');
    ganttDb.addTask('Add another diagram to demo page', '48h');

    const tasks = ganttDb.getTasks();

    // prettier-ignore
    const expected: [string, string, number, string, string][] = [
      // Section - A section
      ['2014-01-06', '2014-01-08', 0, 'des1', 'Completed task'],
      ['2014-01-09', '2014-01-12', 1, 'des2', 'Active task'],
      ['2014-01-12', '2014-01-17', 2, 'des3', 'Future task'],
      ['2014-01-17', '2014-01-22', 3, 'des4', 'Future task2'],
      // Section - Critical tasks
      ['2014-01-06', '2014-01-07', 4, 'task1', 'Completed task in the critical line'],
      ['2014-01-08', '2014-01-10', 5, 'task2', 'Implement parser and jison'],
      ['2014-01-10', '2014-01-13', 6, 'task3', 'Create tests for parser'],
      ['2014-01-13', '2014-01-18', 7, 'task4', 'Future task in critical line'],
      ['2014-01-18', '2014-01-20', 8, 'task5', 'Create tests for renderer'],
      ['2014-01-20', '2014-01-21', 9, 'task6', 'Add to mermaid'],
      // Section - Documentation
      ['2014-01-08', '2014-01-11', 10, 'a1', 'Describe gantt syntax'],
      ['2014-01-11', '2014-01-11 20:00:00', 11, 'task7', 'Add gantt diagram to demo page'],
      ['2014-01-11', '2014-01-13', 12, 'doc1', 'Add another diagram to demo page'],
      // Section - Last section
      ['2014-01-13', '2014-01-16', 13, 'task8', 'Describe gantt syntax'],
      ['2014-01-16', '2014-01-16 20:00:00', 14, 'task9', 'Add gantt diagram to demo page'],
      ['2014-01-16 20:00:00', '2014-01-18 20:00:00', 15, 'task10', 'Add another diagram to demo page'],
    ];
    // v12 wrote one `expect` per field; the table holds the same values.
    expect(tasks.map((t) => [t.startTime, t.endTime, t.order, t.id, t.task])).toEqual(
      expected.map(([s, e, order, id, task]) => [day(s), day(e), order, id, task])
    );
  });

  it('should work when end date is the 31st', function () {
    ganttDb.setDateFormat('YYYY-MM-DD');
    ganttDb.addSection('Task endTime is on the 31st day of the month');
    ganttDb.addTask('test1', 'id1,2019-09-30,11d');
    ganttDb.addTask('test2', 'id2,after id1,20d');
    const tasks = ganttDb.getTasks();

    expect(tasks[0]!.startTime).toEqual(day('2019-09-30'));
    expect(tasks[0]!.endTime).toEqual(day('2019-10-11'));
    expect(tasks[1]!.renderEndTime).toBeNull(); // Fixed end
    expect(tasks[0]!.id).toEqual('id1');
    expect(tasks[0]!.task).toEqual('test1');

    expect(tasks[1]!.startTime).toEqual(day('2019-10-11'));
    expect(tasks[1]!.endTime).toEqual(day('2019-10-31'));
    expect(tasks[1]!.renderEndTime).toBeNull(); // Fixed end
    expect(tasks[1]!.id).toEqual('id2');
    expect(tasks[1]!.task).toEqual('test2');
  });

  // v12 skipped this unless run by hand under TZ=America/Los_Angeles; the gantt-la project runs it.
  describe.runIf(Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/Los_Angeles')(
    'when using a timezone with daylight savings (only run if TZ="America/Los_Angeles")',
    () => {
      it('should add 1 day even on days with 25 hours', function () {
        const startTime = new Date(2020, 10, 1);
        expect(startTime.toISOString()).toBe('2020-11-01T07:00:00.000Z');

        const endTime = new Date(2020, 10, 2);
        expect(endTime.toISOString()).toBe('2020-11-02T08:00:00.000Z');

        ganttDb.setDateFormat('YYYY-MM-DD');
        ganttDb.addSection('Task handles 25 hour day');
        ganttDb.addTask('daylight savings day', 'id1,2020-11-01,1d');
        const tasks = ganttDb.getTasks();
        expect(tasks[0]!.startTime).toEqual(startTime);
        expect(tasks[0]!.endTime).toEqual(endTime);

        // In USA states that use daylight savings, 2020-11-01 had 25 hours
        const millisecondsIn25Hours = 25 * 60 * 60 * 1000;
        expect(endTime.getTime() - startTime.getTime()).toEqual(millisecondsIn25Hours);
      });
    }
  );

  describe('when setting inclusive end dates', function () {
    beforeEach(function () {
      ganttDb.setDateFormat('YYYY-MM-DD');
      ganttDb.enableInclusiveEndDates();
      ganttDb.addTask('test1', 'id1,2019-02-01,1d');
      ganttDb.addTask('test2', 'id2,2019-02-01,2019-02-03');
    });
    it('should automatically add one day to all end dates', function () {
      const tasks = ganttDb.getTasks();
      expect(tasks[0]!.startTime).toEqual(day('2019-02-01'));
      expect(tasks[0]!.endTime).toEqual(day('2019-02-02'));
      expect(tasks[0]!.id).toEqual('id1');
      expect(tasks[0]!.task).toEqual('test1');

      expect(tasks[1]!.startTime).toEqual(day('2019-02-01'));
      expect(tasks[1]!.endTime).toEqual(day('2019-02-04'));
      expect(tasks[1]!.renderEndTime).toBeNull(); // Fixed end
      expect(tasks[1]!.manualEndTime).toBeTruthy();
      expect(tasks[1]!.id).toEqual('id2');
      expect(tasks[1]!.task).toEqual('test2');
    });
  });

  it.each([
    { type: 'hide', expected: 'off' },
    { type: 'style', expected: 'stoke:stroke-width:5px,stroke:#00f,opacity:0.5' },
  ])('should ${type} today marker', ({ expected }) => {
    ganttDb.setTodayMarker(expected);
    expect(ganttDb.getTodayMarker()).toEqual(expected);
  });

  it('should reject dates with ridiculous years', function () {
    ganttDb.setDateFormat('YYYYMMDD');
    ganttDb.addTask('test1', 'id1,202304,1d');
    expect(() => ganttDb.getTasks()).toThrowError('Invalid date:202304');
  });

  it('should handle seconds-only format with valid numeric values (issue #5496)', function () {
    ganttDb.setDateFormat('ss');
    ganttDb.addSection('Network Request');
    ganttDb.addTask('RTT', 'rtt, 0, 20');
    const tasks = ganttDb.getTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.task).toBe('RTT');
    expect(tasks[0]!.id).toBe('rtt');
  });

  it('should handle dates with year typo like 202 instead of 2024 (issue #5496)', function () {
    ganttDb.setDateFormat('YYYY-MM-DD');
    ganttDb.addSection('Vacation');
    ganttDb.addTask('London Trip 1', '2024-12-01, 7d');
    ganttDb.addTask('London Trip 2', '202-12-01, 7d');
    const tasks = ganttDb.getTasks();
    expect(tasks).toHaveLength(2);
    // First task should be in year 2024
    expect(tasks[0]!.startTime!.getFullYear()).toBe(2024);
    // Second task will be parsed as year 202 (fallback to new Date())
    expect(tasks[1]!.startTime!.getFullYear()).toBe(202);
  });

  // v12 spied on `log.warn`; the schedule lists what the layout warns about (D276).
  describe('when a task references a task id that does not exist', function () {
    it('should warn about unknown ids in an "after" statement (issue #4121)', function () {
      ganttDb.setDateFormat('YYYY-MM-DD');
      ganttDb.addTask('task1', 'id1,2013-01-01,2d');
      ganttDb.addTask('task2', 'id2,after m1,1d');

      ganttDb.getTasks();

      expect(ganttDb.last!.unknownIds).toContain('m1');
    });

    it('should warn about unknown ids in an "until" statement', function () {
      ganttDb.setDateFormat('YYYY-MM-DD');
      ganttDb.addTask('task1', 'id1,2013-01-01,until m1');

      ganttDb.getTasks();

      expect(ganttDb.last!.unknownIds).toContain('m1');
    });

    it('should not warn when every referenced id exists', function () {
      ganttDb.setDateFormat('YYYY-MM-DD');
      ganttDb.addTask('task1', 'id1,2013-01-01,2d');
      ganttDb.addTask('task2', 'id2,after id1,1d');

      ganttDb.getTasks();

      expect(ganttDb.last!.unknownIds).toEqual([]);
      expect(ganttDb.last!.badDurations).toEqual([]);
    });

    it('should warn when a milestone is declared without a duration (issue #4121)', function () {
      ganttDb.setDateFormat('YYYY-MM-DD');
      // Without a duration, `m1` is parsed as the duration instead of as the id
      ganttDb.addTask('M1', 'milestone, 2023-01-01, m1');

      const tasks = ganttDb.getTasks();

      expect(tasks[0]!.endTime).toEqual(tasks[0]!.startTime);
      expect(ganttDb.last!.badDurations).toContain('m1');
    });
  });
});
