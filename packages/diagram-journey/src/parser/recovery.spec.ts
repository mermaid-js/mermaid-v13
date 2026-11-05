import { describe, expect, it } from 'vitest';
import { parseJourney } from './parser.ts';

/** `[code, the source text the diagnostic covers, message]` of every error. */
function errors(src: string): [string, string, string][] {
  return parseJourney(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => [d.code, src.slice(d.range.start, d.range.end), d.message]);
}

describe('journey errors: one diagnostic per mistake, the rest still read (R-PARSE-4)', () => {
  it('gives N diagnostics for N bad lines and keeps the good ones', () => {
    const src = 'journey\nA\nB: 1\nC:\n;\nsection S: x\nD: 2\n: 3\njourney\nE: 4; F: 5';
    const r = parseJourney(src);
    expect(r.diagnostics.map((d) => [d.code, src.slice(d.range.start, d.range.end)])).toEqual([
      ['UNEXPECTED', ''],
      ['UNEXPECTED', ':'],
      ['UNEXPECTED', ';'],
      ['UNEXPECTED', ': x'],
      ['UNEXPECTED', ': 3'],
      ['UNEXPECTED', 'journey'],
      ['UNEXPECTED', ';'],
    ]);
    expect(r.model.tasks.map((t) => t.name)).toEqual(['B', 'D', 'E']);
    expect(r.model.sections.map((s) => s.name)).toEqual(['S']);
  });

  it('explains a task without `:` and score', () => {
    expect(errors('journey\nMake tea')).toEqual([
      [
        'UNEXPECTED',
        '',
        'Expected `:` and a score, e.g. `Make tea: 5`, got a line break; a task is written `<name>: <score>: <actors>`, e.g. `Make tea: 5: Me`.',
      ],
    ]);
    expect(errors('journey\nMake tea:')[0]?.[2]).toMatch(/got `:`; write the score after the `:`/);
    expect(errors('journey\nMake tea # c: 5')[0]?.[2]).toMatch(/the rest of the line is a comment/);
    expect(errors('journey\nTask:%% x')[0]?.[2]).toMatch(/the rest of the line is a comment/);
    expect(errors('journey\ntitle')[0]?.[2]).toMatch(/write the title after `title`/);
    expect(errors('journey\nsection\n')[0]?.[2]).toMatch(/write the name after `section`/);
  });

  it('explains what cannot start a statement', () => {
    expect(errors('journey\nsection A: b')[0]?.[2]).toBe(
      'Expected a statement such as `title`, `section` or `accTitle:` or a task such as `Make tea: 5: Me`, got `: b`; a section name cannot hold `:`.'
    );
    expect(errors('journey\n: 5')[0]?.[2]).toMatch(/a task needs a name before its `:`/);
    expect(errors('journey\nT: 5;')[0]?.[2]).toMatch(/`;` does not end a statement/);
    expect(errors('journey\njourney')[0]?.[2]).toMatch(
      /`journey` starts the diagram and comes only once/
    );
  });

  it('reports a missing header and reads on', () => {
    const r = parseJourney('section A\nT: 1');
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      'Expected `journey`, got `section A`; a user journey starts with `journey`.',
    ]);
    expect(r.model.tasks.map((t) => t.name)).toEqual(['T']);
  });

  it('rejects text that ends inside an accessibility value, as v12 does (P2)', () => {
    expect(errors('journey\nT: 1\naccTitle:  ')).toEqual([
      [
        'MISSING_ACC_TITLE',
        'accTitle:',
        'The text ends after `accTitle:` without a title. Write the accessible title after it, e.g. `accTitle: My working day`.',
      ],
    ]);
    expect(errors('journey\naccDescr:\n\n').map((e) => e.slice(0, 2))).toEqual([
      ['MISSING_ACC_DESCR', 'accDescr:'],
    ]);
    expect(errors('journey\nT: 1\naccDescr {\n  never closed')).toEqual([
      [
        'UNCLOSED_DESCRIPTION',
        'accDescr {',
        'Unclosed description: the `accDescr {` at line 3 has no closing `}`. Add `}` after the description.',
      ],
    ]);
    expect(errors('journey\naccDescr {').map((e) => e[0])).toEqual(['UNCLOSED_DESCRIPTION']);
    expect(errors('journey\naccDescr {\n%% c\n').map((e) => e[0])).toEqual([
      'UNCLOSED_DESCRIPTION',
    ]);
  });

  it('keeps an accessibility value that takes the next line or ends with the text', () => {
    const r = parseJourney('journey\naccTitle:\nsection A\naccDescr: x');
    expect(r.diagnostics).toEqual([]);
    expect([r.model.accTitle, r.model.accDescr, r.model.sections]).toEqual(['section A', 'x', []]);
  });

  it('never names a token or grammar rule', () => {
    const src = 'journey\nA\nB:\n;\nsection S: x\n: 3\njourney\naccTitle:';
    for (const d of parseJourney(src).diagnostics) {
      expect(d.message).not.toMatch(/taskName|taskData|acc_|NEWLINE|EOF|INVALID|TaskName|TaskData/);
    }
  });
});
