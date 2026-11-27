import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { architecture, ARCHITECTURE_SETTINGS_IGNORED } from '@mermaid-js/diagram-architecture';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// cspell:words betax
// The architecture diagram is a first-party type (#618): `architecture-beta` goes to
// `@mermaid-js/diagram-architecture` through the generated registry, after `mindmap` and before
// `agentflow`, as in v12's detector order, and lays out with `compass` (D284, D326).
const TEXT = [
  'architecture-beta',
  '  group api(cloud)[API]',
  '  service db(database)[Database] in api',
  '  service server(server)[Server] in api',
  '  junction j',
  '  db:L -[reads]-> R:server',
  '  server:B -- T:j',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const box = (svg: string): string | undefined => /viewBox="([^"]*)"/.exec(svg)?.[1];
const withInit = (init: object): string => `%%{init: ${JSON.stringify(init)}}%%\n${TEXT}`;

describe('architecture diagrams through the public API (#618)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('a1', TEXT);
    expect(result.diagramType).toBe('architecture');
    expect(result.svg).toContain('aria-roledescription="architecture"');
    expect(result.svg).toContain('class="mermaid mermaid-architecture"');
    expect(result.svg.match(/<g class="architecture-service"/g)).toHaveLength(2);
    expect(result.svg.match(/<g class="architecture-junction"/g)).toHaveLength(1);
    expect(result.svg.match(/<g class="architecture-group"/g)).toHaveLength(1);
    expect(result.svg.match(/<path class="edge"/g)).toHaveLength(2);
    expect(result.svg).not.toContain('foreignObject');
    expect(result.svg).not.toContain('<style');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders through mermaid/slim, byte for byte as mermaid does', async () => {
    const slim = createSlim({ diagrams: [architecture] });
    expect((await slim.render('a2', TEXT)).svg).toBe(
      (await createMermaid().render('a2', TEXT)).svg
    );
  });

  it('renders synchronously once prepared (compass loaded with the diagram)', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    const sync = m.renderSync(TEXT);
    expect(sync.diagramType).toBe('architecture');
    expect(sync.svg).toBe((await m.render('mermaid', TEXT)).svg);
  });

  it('lays out with compass unless a config layer names another engine (D284)', async () => {
    const m = createMermaid();
    const plain = await m.render('a3', TEXT);
    const named = await m.render('a3', withInit({ layout: 'compass' }));
    expect(named.svg).toBe(plain.svg);
    expect(named.warnings).toEqual([]);
  });

  it('lays out with layered for layered and dagre, with one warning on what they ignore (D560)', async () => {
    const plain = await createMermaid().render('a3', TEXT);
    const svgs: string[] = [];
    for (const layout of ['layered', 'dagre']) {
      const m = createMermaid();
      m.initialize({ layout });
      const r = await m.render('a3', TEXT);
      expect(r.svg, layout).not.toBe(plain.svg);
      svgs.push(r.svg);
      expect(
        r.warnings.map((w) => w.code),
        layout
      ).toEqual(['ARCHITECTURE_PLACEMENT_IGNORED']);
    }
    expect(svgs[1]).toBe(svgs[0]);
  });

  it('honours architecture.layout and architecture.theme over the top level', async () => {
    const m = createMermaid();
    const plain = await m.render('a9', TEXT);
    const swimlane = await m.render('a9', withInit({ layout: 'swimlane' }));
    expect(swimlane.svg).not.toBe(plain.svg);
    const scopedLayout = await m.render('a9', withInit({ architecture: { layout: 'swimlane' } }));
    expect(scopedLayout.svg).toBe(swimlane.svg);
    const beatsTop = withInit({ layout: 'compass', architecture: { layout: 'swimlane' } });
    expect((await m.render('a9', beatsTop)).svg).toBe(swimlane.svg);
    const dark = await m.render('a9', withInit({ theme: 'dark' }));
    expect(dark.svg).not.toBe(plain.svg);
    const scopedTheme = await m.render('a9', withInit({ architecture: { theme: 'dark' } }));
    expect(scopedTheme.svg).toBe(dark.svg);
    const themeBeatsTop = withInit({ theme: 'forest', architecture: { theme: 'dark' } });
    expect((await m.render('a9', themeBeatsTop)).svg).toBe(dark.svg);
  });

  it('keeps v12’s detector pattern and place, after mindmap and before agentflow', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('architecture')).toBe(types.indexOf('mindmap') + 1);
    expect(types.indexOf('agentflow')).toBe(types.indexOf('architecture') + 1);
    const m = createMermaid();
    // Case-sensitive, with no word boundary, as v12's `/^\s*architecture/`.
    expect(m.detectType('  architecture-beta\n  service a')).toBe('architecture');
    expect(m.detectType('architecture-betax\n  service a')).toBe('architecture');
    expect(m.detectType('architecture\n  service a')).toBe('architecture');
    expect(() => m.detectType('ARCHITECTURE-BETA\n  service a')).toThrow();
  });

  it('rejects what v12 rejects, detected headers included', async () => {
    const m = createMermaid();
    for (const text of [
      'architecture-betax\n  service a\n',
      'architecture\n  service a\n',
      'architecture-beta\n  service a\n  service a\n',
      'architecture-beta\n  a:L -- R:b\n',
    ]) {
      const e = await rejection(m.render('a4', text));
      expect(e, text).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code, text).toBe('SYNTAX');
    }
    const e = await rejection(m.render('a4', 'ARCHITECTURE-BETA\n  service a\n'));
    expect((e as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
  });

  it('honours padding, iconSize and useMaxWidth over the generated defaults', async () => {
    const m = createMermaid();
    const plain = await m.render('a5', TEXT);
    const defaults = await m.render(
      'a5',
      withInit({ architecture: { padding: 40, iconSize: 80, useMaxWidth: true } })
    );
    expect(defaults.svg).toBe(plain.svg);
    for (const section of [{ padding: 10 }, { iconSize: 120 }]) {
      const r = await m.render('a5', withInit({ architecture: section }));
      expect(box(r.svg), JSON.stringify(section)).not.toBe(box(plain.svg));
      expect(r.warnings).toEqual([]);
    }
    expect(plain.svg).toMatch(/<svg [^>]*width="100%"/);
    const fixed = await m.render('a5', withInit({ architecture: { useMaxWidth: false } }));
    const [, , w, h] = box(fixed.svg)!.split(' ');
    expect(fixed.svg).toMatch(new RegExp(`<svg [^>]*width="${w}" height="${h}"`));
  });

  it('draws a length it cannot use at the default, with ARCHITECTURE_CONFIG_IGNORED', async () => {
    const m = createMermaid();
    const plain = await m.render('a6', TEXT);
    const r = await m.render('a6', withInit({ architecture: { padding: '20px', iconSize: -5 } }));
    expect(r.svg).toBe(plain.svg);
    expect(r.warnings.map((w) => w.code)).toEqual([
      'ARCHITECTURE_CONFIG_IGNORED',
      'ARCHITECTURE_CONFIG_IGNORED',
    ]);
  });

  it('ignores the six fcose keys (D328), useWidth and fontSize (D507), with one warning (D763)', async () => {
    const m = createMermaid();
    const plain = await m.render('a7', TEXT);
    const ignored = {
      randomize: true,
      nodeSeparation: 300,
      idealEdgeLengthMultiplier: 4,
      edgeElasticity: 0.9,
      numIter: 5,
      seed: 42,
      useWidth: 99,
      fontSize: 40,
    };
    for (const [key, value] of Object.entries(ignored)) {
      // A directive, then `initialize`: each key arrives as set, and only it is named.
      const r = await m.render('a7', withInit({ architecture: { [key]: value } }));
      expect(r.svg, key).toBe(plain.svg);
      expect(
        r.warnings.map((w) => [w.code, w.path]),
        key
      ).toEqual([[ARCHITECTURE_SETTINGS_IGNORED, `architecture.${key}`]]);
      const site = createMermaid();
      site.initialize({ architecture: { [key]: value } });
      const s = await site.render('a7', TEXT);
      expect(s.svg, key).toBe(plain.svg);
      expect(
        s.warnings.map((w) => w.code),
        key
      ).toEqual([ARCHITECTURE_SETTINGS_IGNORED]);
    }
  });

  it('warns once for the fcose keys and fontSize set in front matter, naming each (#1222)', async () => {
    const m = createMermaid();
    const plain = await m.render('a8', TEXT);
    const r = await m.render(
      'a8',
      [
        '---',
        'config:',
        '  architecture:',
        '    idealEdgeLengthMultiplier: 3',
        '    seed: 7',
        '    fontSize: 20',
        '---',
        TEXT,
      ].join('\n')
    );
    expect(r.svg).toBe(plain.svg);
    expect(r.warnings).toHaveLength(1);
    const [w] = r.warnings;
    expect(w!.code).toBe(ARCHITECTURE_SETTINGS_IGNORED);
    expect(w!.message).toMatch(
      /architecture\.idealEdgeLengthMultiplier.*architecture\.seed.*architecture\.fontSize/
    );
    expect(w!.message).toContain('v13 has no fcose layout');
    expect(w!.message).toContain('themeVariables.fontSize');
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D320, R-ASCII-5)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('architecture', 'svg')).toBe(true);
    expect(m.supportsFormat('architecture', 'ascii')).toBe(false);
    const e = await rejection(m.render('a8', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('architecture');
  });
});
