import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, UnsupportedFormatError } from './index.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// gitGraph is a first-party type (#374): `gitGraph` goes to `@mermaid-js/diagram-gitgraph`
// through the generated registry, after `timeline` and before `stateDiagram` as in v12.
const TEXT = [
  'gitGraph',
  '  commit id: "A"',
  '  branch develop',
  '  commit id: "B" tag: "v1"',
  '  checkout main',
  '  commit id: "C" type: HIGHLIGHT',
  '  cherry-pick id: "B"',
  '  merge develop id: "M"',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const count = (svg: string, re: RegExp): number => svg.match(re)?.length ?? 0;

/** The SVG of `text` with literal colours (`cssVariables: false`) under `config`. */
async function literal(config: object, text = TEXT): Promise<string> {
  const m = createMermaid();
  m.initialize({ ...config, output: { cssVariables: false } } as never);
  return (await m.render('l', text)).svg;
}

/** The SVG of `text` with `config` in an init directive, and its warnings. */
async function withInit(
  config: object,
  text = TEXT
): Promise<{ svg: string; warnings: unknown[] }> {
  const r = await createMermaid().render('g', `%%{init: ${JSON.stringify(config)}}%%\n${text}`);
  return { svg: r.svg, warnings: [...r.warnings] };
}

const viewBox = (svg: string): number[] =>
  (/viewBox="([^"]*)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);
/** The radius of each normal bullet. */
const radii = (svg: string): string[] =>
  [...svg.matchAll(/class="commit-bullet commit-normal"[^>]*><circle [^>]* r="([^"]*)"/g)].map(
    (m) => m[1]!
  );

describe('git graphs through the public API (#374)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('g1', TEXT);
    expect(result.diagramType).toBe('gitGraph');
    expect(result.svg).toContain('aria-roledescription="gitGraph"');
    expect(result.svg).toContain('class="mermaid mermaid-gitGraph"');
    expect(count(result.svg, /class="commit-bullet /g)).toBe(5);
    expect(count(result.svg, /class="branch-lane"/g)).toBe(2);
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders synchronously once prepared, every direction', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    const lr = m.renderSync(TEXT).svg;
    const tb = m.renderSync(TEXT.replace('gitGraph', 'gitGraph TB:')).svg;
    const bt = m.renderSync(TEXT.replace('gitGraph', 'gitGraph BT:')).svg;
    expect(new Set([lr, tb, bt]).size).toBe(3);
    for (const svg of [lr, tb, bt]) expect(count(svg, /class="commit-bullet /g)).toBe(5);
  });

  it('keeps v12’s detector place, after timeline and before stateDiagram', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('gitGraph')).toBe(types.indexOf('timeline') + 1);
    expect(types.indexOf('stateDiagram')).toBe(types.indexOf('gitGraph') + 1);
    const m = createMermaid();
    expect(m.detectType('  gitGraph TB:\n  commit')).toBe('gitGraph');
    // Case-sensitive, as v12's detector.
    expect(() => m.detectType('gitgraph\n  commit')).toThrow();
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D216)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('gitGraph', 'svg')).toBe(true);
    expect(m.supportsFormat('gitGraph', 'ascii')).toBe(false);
    const e = await rejection(m.render('g2', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('gitGraph');
  });
});

describe('gitGraph config (#374, spec #292 "Config")', () => {
  it('honours gitGraph.theme, over the top-level theme', async () => {
    const plain = await withInit({ theme: 'default' });
    expect(plain.svg).not.toBe((await withInit({})).svg);
    expect((await withInit({ gitGraph: { theme: 'default' } })).svg).toBe(plain.svg);
    expect((await withInit({ theme: 'dark', gitGraph: { theme: 'default' } })).svg).toBe(plain.svg);
  });
  it('takes v12’s defaults when a key is unset', async () => {
    const { svg } = await withInit({});
    const explicit = await withInit({
      gitGraph: {
        titleTopMargin: 25,
        diagramPadding: 8,
        mainBranchName: 'main',
        mainBranchOrder: 0,
        showCommitLabel: true,
        showBranches: true,
        rotateCommitLabel: true,
        parallelCommits: false,
        useMaxWidth: true,
      },
    });
    expect(explicit.svg).toBe(svg);
    expect(svg).toContain('width="100%"');
  });

  it('honours diagramPadding and titleTopMargin', async () => {
    const [x, y, w, h] = viewBox((await withInit({})).svg);
    const padded = viewBox((await withInit({ gitGraph: { diagramPadding: 20 } })).svg);
    [x! - 12, y! - 12, w! + 24, h! + 24].forEach((v, i) => expect(padded[i]).toBeCloseTo(v, 6));
    const titled = async (config: string): Promise<number[]> =>
      viewBox(
        (await createMermaid().render('t', `---\ntitle: History\n${config}---\n${TEXT}`)).svg
      );
    const near = await titled('');
    const far = await titled('config:\n  gitGraph:\n    titleTopMargin: 75\n');
    expect(far[1]).toBeCloseTo(near[1]! - 50, 6);
  });

  it('honours mainBranchName and mainBranchOrder', async () => {
    const trunk = TEXT.replace('checkout main', 'checkout trunk');
    const renamed = (await withInit({ gitGraph: { mainBranchName: 'trunk' } }, trunk)).svg;
    expect(renamed).toContain('data-id="trunk"');
    expect(renamed).not.toContain('data-id="main"');
    const lanes = (svg: string): string[] =>
      [...svg.matchAll(/class="branch-lane" data-id="([^"]*)"/g)].map((m) => m[1]!);
    expect(lanes((await withInit({})).svg)).toEqual(['main', 'develop']);
    expect(lanes((await withInit({ gitGraph: { mainBranchOrder: 2 } })).svg)).toEqual([
      'develop',
      'main',
    ]);
  });

  it('honours showCommitLabel, showBranches, rotateCommitLabel and parallelCommits', async () => {
    const base = (await withInit({})).svg;
    const noLabels = (await withInit({ gitGraph: { showCommitLabel: false } })).svg;
    expect(count(base, />A<\/text>/g)).toBe(1);
    expect(count(noLabels, />A<\/text>/g)).toBe(0);
    const noBranches = (await withInit({ gitGraph: { showBranches: false } })).svg;
    expect(count(base, /class="branch branch\d/g)).toBe(2);
    expect(count(noBranches, /class="branch branch\d/g)).toBe(0);
    const flat = (await withInit({ gitGraph: { rotateCommitLabel: false } })).svg;
    expect(base).toContain('rotate(-45');
    expect(flat).not.toContain('rotate(-45');
    const parallel = (await withInit({ gitGraph: { parallelCommits: true } })).svg;
    expect(parallel).not.toBe(base);
  });

  it('honours useMaxWidth: false with the drawing’s own size', async () => {
    const { svg } = await withInit({ gitGraph: { useMaxWidth: false } });
    const [, , w, h] = viewBox(svg);
    expect(svg).not.toContain('width="100%"');
    expect(svg).toContain(`width="${w}"`);
    expect(svg).toContain(`height="${h}"`);
  });

  it.each([
    ['nodeLabel', { width: 1, height: 1, x: 9, y: 9 }],
    ['arrowMarkerAbsolute', true],
    ['useWidth', 99],
  ])('ignores %s, which v12’s gitGraph never read', async (key, value) => {
    const base = await withInit({});
    const set = await withInit({ gitGraph: { [key]: value } });
    expect(set.svg).toBe(base.svg);
    expect(set.warnings).toEqual([]);
  });
});

describe('gitGraph theme variables (#374, D152, D266)', () => {
  it('draws classic geometry in the classic and neo themes and redux geometry in the redux ones', async () => {
    for (const [theme, r] of [
      ['default', '10'],
      ['neo', '10'],
      ['redux', '7'],
      ['redux-dark-color', '7'],
    ] as const)
      expect(new Set(radii((await withInit({ theme })).svg)), theme).toEqual(new Set([r]));
  });

  it('takes a geometry override in any theme', async () => {
    const { svg } = await withInit({ theme: 'default', themeVariables: { gitCommitRadius: 4 } });
    expect(new Set(radii(svg))).toEqual(new Set(['4']));
  });

  it('switches the cherry-pick ink with the scheme under theme auto', async () => {
    const { svg } = await withInit({ theme: 'auto' });
    expect(svg).toContain('--mermaid-gitCherryPickInk');
    expect(svg).toMatch(/--_gci:var\(--mermaid-gitCherryPickInk,#ffffff\)/);
    expect(svg).toMatch(
      /prefers-color-scheme: ?dark[^}]*--_gci:var\(--mermaid-gitCherryPickInk,#000000\)/
    );
  });

  it('draws lineColor where a theme sets no commitLineColor, as v12’s `??`', async () => {
    const line = (svg: string) =>
      /<line class="branch branch0"[^>]* stroke="([^"]*)"/.exec(svg)?.[1]?.toLowerCase();
    expect(line(await literal({ theme: 'default' }))).toBe('#333333');
    expect(line(await literal({ theme: 'redux' }))).toBe('#bdbccc');
    const set = { theme: 'default', themeVariables: { commitLineColor: '#123456' } };
    expect(line(await literal(set))).toBe('#123456');
  });

  it('keeps the cherry-pick ink white under darkMode on a light theme, as v12', async () => {
    // The dots only (r 2.75 in the classic themes); the body is textColor (#1287).
    const ink = (svg: string) => [
      ...new Set(
        [...svg.matchAll(/commit-cherry-pick"[^>]* r="2\.75" fill="([^"]*)"/g)].map((m) => m[1])
      ),
    ];
    const light = await literal({ theme: 'default', themeVariables: { darkMode: true } });
    expect(ink(light)).toEqual(['#ffffff']);
    expect(ink(await literal({ theme: 'dark' }))).toEqual(['#000000']);
  });
});
