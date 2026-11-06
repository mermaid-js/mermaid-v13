import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, UnsupportedFormatError } from './index.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The gantt chart is a first-party type (#385): `gantt` goes to `@mermaid-js/diagram-gantt`
// through the generated registry, after `er` and before `info` as in v12. Every render passes a
// fixed `now` (D270, D275), so the today line and today-relative dates do not move.
const NOW = Date.UTC(2024, 0, 10, 12);
const TEXT = [
  'gantt',
  '  title A plan',
  '  dateFormat YYYY-MM-DD',
  '  section Design',
  '    Sketch      :done, a1, 2024-01-01, 3d',
  '    Review      :active, a2, after a1, 2d',
  '  section Build',
  '    Code        :crit, b1, 2024-01-08, 5d',
  '    Ship        :milestone, b2, after b1, 0d',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const count = (svg: string, re: RegExp): number => svg.match(re)?.length ?? 0;

describe('gantt charts through the public API (#385)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('g1', TEXT, { now: NOW });
    expect(result.diagramType).toBe('gantt');
    expect(result.svg).toContain('aria-roledescription="gantt"');
    expect(result.svg).toContain('class="mermaid mermaid-gantt"');
    expect(count(result.svg, /<rect[^>]* class="task[ "]/g)).toBe(4);
    expect(count(result.svg, /class="sectionTitle /g)).toBe(2);
    expect(result.svg).toContain('A plan');
    expect(result.svg).toContain('class="today"');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders synchronously once prepared, the same as render', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    const sync = m.renderSync(TEXT, { now: NOW });
    expect(sync.diagramType).toBe('gantt');
    expect(sync.svg).toBe((await m.render('mermaid-0', TEXT, { now: NOW })).svg);
  });

  it('keeps v12’s detector place, after er and before info', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('gantt')).toBe(types.indexOf('er') + 1);
    expect(types.indexOf('info')).toBe(types.indexOf('gantt') + 1);
    const m = createMermaid();
    // No word boundary, as v12's detector; case-sensitive.
    expect(m.detectType('  ganttish\n')).toBe('gantt');
    expect(() => m.detectType('Gantt\n  title x')).toThrow();
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D216)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('gantt', 'svg')).toBe(true);
    expect(m.supportsFormat('gantt', 'ascii')).toBe(false);
    const e = await rejection(m.render('g5', TEXT, { format: 'ascii', now: NOW }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('gantt');
  });
});

/** The SVG of `text` with `config` in an init directive, and its warnings, at {@link NOW}. */
async function withInit(
  config: object,
  text = TEXT
): Promise<{ svg: string; warnings: unknown[] }> {
  const src = `%%{init: ${JSON.stringify(config)}}%%\n${text}`;
  const r = await createMermaid().render('gc', src, { now: NOW });
  return { svg: r.svg, warnings: [...r.warnings] };
}

const viewBox = (svg: string): number[] =>
  (/viewBox="([^"]*)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);

describe('gantt config (#385, spec #293 "Config")', () => {
  it('takes v12’s effective values when a key is unset', async () => {
    const { svg } = await withInit({});
    // mermaid@12.2.0's merged defaults; useWidth has none (the width is then 1200, D272).
    const explicit = await withInit({
      gantt: {
        titleTopMargin: 25,
        barHeight: 20,
        barGap: 4,
        topPadding: 50,
        rightPadding: 75,
        leftPadding: 75,
        gridLineStartPadding: 35,
        fontSize: 11,
        sectionFontSize: 11,
        numberSectionStyles: 4,
        axisFormat: '%Y-%m-%d',
        topAxis: false,
        displayMode: '',
        useMaxWidth: true,
      },
    });
    expect(explicit.svg).toBe(svg);
    expect(explicit.warnings).toEqual([]);
    expect(viewBox(svg)[2]).toBe(1200);
    expect(svg).toContain('width="100%"');
  });

  it.each([
    ['titleTopMargin', 60],
    ['barHeight', 30],
    ['barGap', 12],
    ['topPadding', 80],
    ['rightPadding', 150],
    ['leftPadding', 150],
    ['gridLineStartPadding', 60],
    ['fontSize', 18],
    ['sectionFontSize', 18],
    ['numberSectionStyles', 1],
    ['axisFormat', '%d %b'],
    ['tickInterval', '3day'],
    ['topAxis', true],
    ['displayMode', 'compact'],
  ])('honours %s', async (key, value) => {
    const set = await withInit({ gantt: { [key]: value } });
    expect(set.svg).not.toBe((await withInit({})).svg);
    expect(set.warnings).toEqual([]);
  });

  it('honours useWidth (D272) and useMaxWidth', async () => {
    expect(viewBox((await withInit({ gantt: { useWidth: 800 } })).svg)[2]).toBe(800);
    const fixed = (await withInit({ gantt: { useMaxWidth: false } })).svg;
    expect(fixed).not.toContain('width="100%"');
    expect(fixed).toContain('width="1200"');
  });

  it('honours gantt.weekday, which v12 never read; the statement wins (D279)', async () => {
    const weekly = TEXT.replace(
      'dateFormat YYYY-MM-DD',
      'dateFormat YYYY-MM-DD\n  tickInterval 1week'
    );
    const sunday = (await withInit({}, weekly)).svg;
    const monday = (await withInit({ gantt: { weekday: 'monday' } }, weekly)).svg;
    expect(monday).not.toBe(sunday);
    const statement = weekly.replace('tickInterval 1week', 'tickInterval 1week\n  weekday sunday');
    expect((await withInit({ gantt: { weekday: 'monday' } }, statement)).svg).toBe(sunday);
  });

  it('ignores look with LOOK_REMOVED (D153)', async () => {
    const set = await withInit({ gantt: { look: 'neo' } });
    expect(set.svg).toBe((await withInit({})).svg);
    expect(set.warnings).toEqual([expect.objectContaining({ code: 'LOOK_REMOVED' })]);
  });
});
