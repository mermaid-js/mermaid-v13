import { describe, expect, it, vi } from 'vitest';
import { ganttDb, parser } from './adapter.ts';

// The ported spec's adapter replays the DB calls v12's grammar made (#378 review, #379).
describe('the v12 spec adapter', () => {
  it('does not replay setAccDescription for an empty accDescr { }, as v12 never called it', () => {
    ganttDb.clear();
    const spy = vi.spyOn(ganttDb, 'setAccDescription');
    parser.parse('gantt\naccDescr {  }\naccDescr: x');
    expect(spy.mock.calls).toEqual([['x']]);
    spy.mockRestore();
  });

  it('gives raw.data as the parser read it, a directive cut out', () => {
    ganttDb.clear();
    parser.parse('gantt\ndateFormat YYYY-MM-DD\na :a, 2024-01-01%%{init: {}}%%, 1d');
    expect(ganttDb.getTasks()[0]!.raw.data).toBe(':a, 2024-01-01, 1d');
  });
});
