import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, UnsupportedFormatError } from './index.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The timeline is a first-party type (#315): `timeline` goes to `@mermaid-js/diagram-timeline`
// through the generated registry, after `flowchart-v2` and before `gitGraph` as in v12.
const TEXT = [
  'timeline',
  '  title History of Social Media Platform',
  '  section 2002 - 2004',
  '    2002 : LinkedIn',
  '    2004 : Facebook : Google',
  '  section 2005 - 2006',
  '    2005 : YouTube',
  '    2006 : Twitter',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const count = (svg: string, re: RegExp): number => svg.match(re)?.length ?? 0;

describe('timelines through the public API (#315)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('t1', TEXT);
    expect(result.diagramType).toBe('timeline');
    expect(result.svg).toContain('aria-roledescription="timeline"');
    expect(result.svg).toContain('class="mermaid mermaid-timeline"');
    expect(count(result.svg, /class="taskWrapper"/g)).toBe(4);
    expect(count(result.svg, /class="eventWrapper"/g)).toBe(5);
    expect(result.svg).toContain('History of Social Media Platform');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders synchronously once prepared, both directions', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('timeline');
    const td = TEXT.replace('timeline', 'timeline TD');
    const { svg } = m.renderSync(td);
    expect(count(svg, /class="taskWrapper"/g)).toBe(4);
    expect(svg).not.toBe(m.renderSync(TEXT).svg);
  });

  it('keeps v12’s detector place, after flowchart-v2 and before gitGraph', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('timeline')).toBe(types.indexOf('flowchart-v2') + 1);
    expect(types.indexOf('gitGraph')).toBe(types.indexOf('timeline') + 1);
    const m = createMermaid();
    expect(m.detectType('  timeline TD\n  2002 : a')).toBe('timeline');
    // Case-sensitive, as v12's detector.
    expect(() => m.detectType('Timeline\n  2002 : a')).toThrow();
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D216)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('timeline', 'svg')).toBe(true);
    expect(m.supportsFormat('timeline', 'ascii')).toBe(false);
    const e = await rejection(m.render('t5', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('timeline');
  });
});

/** The SVG of `text` with `config` in an init directive, and its warnings. */
async function withInit(
  config: object,
  text = TEXT
): Promise<{ svg: string; warnings: unknown[] }> {
  const r = await createMermaid().render('tc', `%%{init: ${JSON.stringify(config)}}%%\n${text}`);
  return { svg: r.svg, warnings: [...r.warnings] };
}

/** The heights of the period boxes (`taskWrapper` paths). */
function periodHeights(svg: string): number[] {
  return [
    ...svg.matchAll(/class="taskWrapper"[^>]*><g[^>]*><path class="node-bkg" d="([^"]*)"/g),
  ].map((m) => {
    const ys = [...m[1]!.matchAll(/,(-?[\d.]+)/g)].map((n) => Number(n[1]));
    return Math.round((Math.max(...ys) - Math.min(...ys)) * 100) / 100;
  });
}

const viewBox = (svg: string): number[] =>
  (/viewBox="([^"]*)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);

describe('timeline config (#315, spec #291 "Config")', () => {
  it('takes v12’s effective values when a key is unset', async () => {
    const { svg } = await withInit({});
    // v12 12.2.0 with its default config merged: leftMargin 150, padding 50 (the renderer's
    // fallback; the schema has no default), useMaxWidth true, disableMulticolor false.
    const explicit = await withInit({
      timeline: { leftMargin: 150, padding: 50, useMaxWidth: true, disableMulticolor: false },
      fontSize: 16,
    });
    expect(explicit.svg).toBe(svg);
    expect(svg).toContain('width="100%"');
  });

  it('honours leftMargin, padding and useMaxWidth', async () => {
    const base = (await withInit({})).svg;
    const margin = (await withInit({ timeline: { leftMargin: 300 } })).svg;
    expect(margin).not.toBe(base);
    const [x, y, w, h] = viewBox(base);
    const padded = viewBox((await withInit({ timeline: { padding: 10 } })).svg);
    [x! + 40, y! + 40, w! - 80, h! - 80].forEach((v, i) => expect(padded[i]).toBeCloseTo(v, 6));
    const fixed = (await withInit({ timeline: { useMaxWidth: false } })).svg;
    expect(fixed).not.toContain('width="100%"');
    expect(fixed).toContain(`width="${w}"`);
  });

  it('honours disableMulticolor: periods with no sections share slot 0', async () => {
    const plain = 'timeline\n  2002 : a\n  2004 : b\n  2006 : c\n';
    const slots = (svg: string): string[] =>
      [...svg.matchAll(/data-color-id="([^"]*)"/g)].map((m) => m[1]!);
    expect(new Set(slots((await withInit({}, plain)).svg)).size).toBe(3);
    expect(
      new Set(slots((await withInit({ timeline: { disableMulticolor: true } }, plain)).svg))
    ).toEqual(new Set(['color-0']));
  });

  it('honours the top-level fontSize as v12 did: it adds 0.55 font sizes to every box', async () => {
    // v12 `drawNode`: height = text + conf.fontSize × 1.1 × 0.5 + padding; the text itself is
    // drawn at themeVariables.fontSize.
    const base = periodHeights((await withInit({ theme: 'default' })).svg);
    const big = periodHeights((await withInit({ theme: 'default', fontSize: 36 })).svg);
    expect(big.map((h, i) => Math.round((h - base[i]!) * 100) / 100)).toEqual([11, 11, 11, 11]);
  });

  it.each([
    ['diagramMarginX', 7],
    ['diagramMarginY', 7],
    ['width', 999],
    ['height', 999],
    ['boxMargin', 99],
    ['boxTextMargin', 99],
    ['noteMargin', 99],
    ['messageMargin', 99],
    ['messageAlign', 'left'],
    ['bottomMarginAdj', 99],
    ['rightAngles', true],
    ['taskFontSize', 40],
    ['taskFontFamily', 'serif'],
    ['taskMargin', 99],
    ['activationWidth', 99],
    ['textPlacement', 'tspan'],
    ['actorColours', ['#123456']],
    ['sectionFills', ['#123456']],
    ['sectionColours', ['#123456']],
    ['useWidth', 99],
  ])('ignores %s, which v12’s timeline never read', async (key, value) => {
    const base = await withInit({});
    const set = await withInit({ timeline: { [key]: value } });
    expect(set.svg).toBe(base.svg);
    expect(set.warnings).toEqual([]);
  });

  it('takes a numbered cScale override', async () => {
    const { svg } = await withInit({ theme: 'default', themeVariables: { cScale0: '#123456' } });
    expect(svg).toContain('#123456');
  });
});
