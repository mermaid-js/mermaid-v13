import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { agentflow, agentflowConfigDefaults, parseAgentflow } from '@mermaid-js/diagram-agentflow';
import { createMermaid, MermaidError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The agentflow diagram is a first-party type (#550): `agentflow-beta` goes to
// `@mermaid-js/diagram-agentflow` through the generated registry, fourth, after architecture and
// before c4, as in v12's detector order.
const TEXT = [
  'agentflow-beta LR',
  '  connector llm["LLM API"]',
  '  flow triage["Triage"]',
  '    ticket["ticket"]@{ shape: input }',
  '    classify["classify"]@{ shape: tool }',
  '    severity["Severity?"]@{ shape: decision }',
  '    ticket --> classify --> severity',
  '  end',
  '  flow audit["Audit"]',
  '    record["record"]@{ shape: task }',
  '  end',
  '  audit@{ view: "collapsed" }',
  '  policy["Policy"]@{ shape: refdoc }',
  '  severity -->|"low"| audit',
  '  severity --x act["act"]@{ shape: action }',
  '  classify -.- policy',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const box = (svg: string): string | undefined => /viewBox="([^"]*)"/.exec(svg)?.[1];
const count = (svg: string, re: RegExp): number => svg.match(re)?.length ?? 0;
const codes = (r: { readonly warnings: readonly { readonly code: string }[] }) =>
  r.warnings.map((w) => w.code);
const init = (config: string, text = TEXT) => `%%{init: ${config}}%%\n${text}`;

describe('agentflow diagrams through the public API (#550)', () => {
  it('renders agentflow-beta, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('a1', TEXT);
    expect(result.diagramType).toBe('agentflow');
    expect(result.svg).toContain('aria-roledescription="agentflow"');
    expect(result.svg).toContain('class="mermaid mermaid-agentflow"');
    // ticket, classify, severity, policy, act and llm; the collapsed audit is a card.
    expect(count(result.svg, /<g class="node default af-kind-/g)).toBe(6);
    expect(count(result.svg, /<rect class="flow-collapsed"/g)).toBe(1);
    expect(count(result.svg, /<g class="cluster flow-cluster"/g)).toBe(1);
    expect(count(result.svg, /<path class="flowchart-link /g)).toBe(5);
    expect(result.svg).toContain('>Triage</text>');
    expect(result.svg).not.toContain('foreignObject');
    expect(result.svg).not.toContain('<style');
    expect(result.svg).not.toContain('<marker');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders through mermaid/slim, byte for byte as mermaid does', async () => {
    const slim = createSlim({ diagrams: [agentflow] });
    expect((await slim.render('a2', TEXT)).svg).toBe(
      (await createMermaid().render('a2', TEXT)).svg
    );
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('agentflow');
  });

  it('keeps v12’s detector pattern and place, fourth, after architecture and before c4', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('agentflow')).toBe(3);
    expect(types.indexOf('agentflow')).toBe(types.indexOf('architecture') + 1);
    expect(types.indexOf('c4')).toBe(types.indexOf('agentflow') + 1);
    expect(DETECTORS.find((d) => d.type === 'agentflow')?.pattern.source).toBe(
      '^\\s*agentflow-beta\\b'
    );
    const m = createMermaid();
    // Case-sensitive, with a word boundary, as v12's `/^\s*agentflow-beta\b/`.
    expect(m.detectType('  agentflow-beta LR\n  a')).toBe('agentflow');
    expect(m.detectType('agentflow-beta\n  a')).toBe('agentflow');
    expect(() => m.detectType('agentflow-betas\n  a')).toThrow();
    expect(() => m.detectType('agentflow\n  a')).toThrow();
    expect(() => m.detectType('Agentflow-beta\n  a')).toThrow();
  });

  it('rejects what v12 rejects; a removed shape still renders, with a warning (D461)', async () => {
    const m = createMermaid();
    for (const text of ['agentflow-beta\n  a["x"\n', 'agentflow-beta\n  flow f\n    a\n']) {
      const e = await rejection(m.render('a3', text));
      expect(e, text).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code, text).toBe('SYNTAX');
    }
    const e = await rejection(m.render('a3', 'agentflow-betas\n  a\n'));
    expect((e as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
    const removed = await m.render('a3', 'agentflow-beta\n  a(("x"))\n');
    expect(codes(removed)).toEqual(['SHAPE_REMOVED']);
  });

  it('has the generated agentflow defaults, the schema’s', async () => {
    expect(agentflow.configDefaults).toBe(agentflowConfigDefaults);
    expect(agentflowConfigDefaults).toEqual({
      useMaxWidth: true,
      theme: 'redux-color',
      titleTopMargin: 25,
      diagramPadding: 8,
      nodeSpacing: 50,
      rankSpacing: 50,
      wrappingWidth: 120,
      minNodeWidth: 120,
    });
    const m = createMermaid();
    const plain = await m.render('a4', TEXT);
    const all = await m.render('a4', init(JSON.stringify({ agentflow: agentflowConfigDefaults })));
    expect(all.svg).toBe(plain.svg);
  });

  it.each([
    ['nodeSpacing', 120],
    ['rankSpacing', 140],
    ['diagramPadding', 40],
    ['wrappingWidth', 30],
    ['minNodeWidth', 300],
  ])('honours agentflow.%s', async (key, value) => {
    const m = createMermaid();
    const plain = await m.render('a5', TEXT);
    const set = await m.render('a5', init(`{"agentflow": {"${key}": ${value}}}`));
    expect(set.warnings).toEqual([]);
    expect(box(set.svg)).not.toBe(box(plain.svg));
    // The flowchart section's key of the same name does not move an agentflow.
    const other = await m.render('a5', init(`{"flowchart": {"${key}": ${value}}}`));
    expect(other.svg).toBe(plain.svg);
    m.initialize({ agentflow: { [key]: value } });
    expect((await m.render('a5', TEXT)).svg).toBe(set.svg);
  });

  it('honours agentflow.titleTopMargin for the front-matter title (D218)', async () => {
    const m = createMermaid();
    const plain = await m.render('a6', `---\ntitle: Support\n---\n${TEXT}`);
    expect(plain.svg).toContain('class="agentflowTitleText"');
    const far = await m.render(
      'a6',
      `---\ntitle: Support\nconfig:\n  agentflow:\n    titleTopMargin: 80\n---\n${TEXT}`
    );
    expect(far.warnings).toEqual([]);
    const top = (svg: string) => Number(box(svg)!.split(' ')[1]);
    expect(top(far.svg)).toBeLessThan(top(plain.svg) - 50);
  });

  it('draws an invalid length with its default, warning AGENTFLOW_CONFIG_INVALID once', async () => {
    const m = createMermaid();
    const plain = await m.render('a7', TEXT);
    for (const value of ['-5', '"20px"', 'true', '1e9']) {
      const r = await m.render('a7', init(`{"agentflow": {"nodeSpacing": ${value}}}`));
      expect(r.svg, value).toBe(plain.svg);
      expect(codes(r), value).toEqual(['AGENTFLOW_CONFIG_INVALID']);
      expect((r.warnings[0] as { path?: string }).path, value).toBe('agentflow.nodeSpacing');
    }
  });

  it('reads flowchart.padding, inheritDir and subGraphTitleMargin, as v12 (D466)', async () => {
    const m = createMermaid();
    const plain = await m.render('a8', TEXT);
    for (const config of [
      '{"flowchart": {"padding": 40}}',
      '{"flowchart": {"subGraphTitleMargin": {"top": 20, "bottom": 20}}}',
    ]) {
      const r = await m.render('a8', init(config));
      expect(r.warnings, config).toEqual([]);
      expect(box(r.svg), config).not.toBe(box(plain.svg));
    }
    // A flow without a direction of its own lays out as the flow around it (TB here) unless it
    // inherits the header's LR.
    const flows = [
      'agentflow-beta LR',
      '  flow outer["Outer"]',
      '    direction TB',
      '    flow inner["Inner"]',
      '      a --> b --> c',
      '    end',
      '  end',
      '',
    ].join('\n');
    const own = await m.render('a8', flows);
    const inherited = await m.render('a8', init('{"flowchart": {"inheritDir": true}}', flows));
    expect(box(inherited.svg)).not.toBe(box(own.svg));
  });

  it('honours agentflow.useMaxWidth: false draws the diagram at its own size', async () => {
    const m = createMermaid();
    const plain = (await m.render('a9', TEXT)).svg;
    expect(plain).toMatch(/<svg [^>]*width="100%"/);
    expect(plain).toContain('max-width:');
    const fixed = (
      await m.render('a9', `---\nconfig:\n  agentflow:\n    useMaxWidth: false\n---\n${TEXT}`)
    ).svg;
    const [, , w, h] = box(fixed)!.split(' ');
    expect(fixed).toMatch(new RegExp(`<svg [^>]*width="${w}" height="${h}"`));
    expect(fixed).not.toContain('max-width');
  });

  it('honours an agentflow-scoped theme over the top level, as 12.2.0', async () => {
    const m = createMermaid();
    m.initialize({ theme: 'default' });
    const dark = await m.render('a10', `---\nconfig:\n  theme: dark\n---\n${TEXT}`);
    const scoped = await m.render('a10', init('{"agentflow": {"theme": "dark"}}'));
    expect(scoped.svg).toBe(dark.svg);
    expect(scoped.svg).not.toBe((await m.render('a10', TEXT)).svg);
  });

  it('lays out with layered by default, not v12’s elk (D127), and takes a layout by name', async () => {
    const m = createMermaid();
    const plain = await m.render('a11', TEXT);
    for (const config of ['{"layout": "dagre"}', '{"agentflow": {"layout": "layered"}}']) {
      const r = await m.render('a11', init(config));
      expect(r.svg, config).toBe(plain.svg);
      expect(r.warnings, config).toEqual([]);
    }
    // ELK without its plugin draws with layered and says so once (D173).
    const elk = await m.render('a11', init('{"agentflow": {"layout": "elk"}}'));
    expect(elk.svg).toBe(plain.svg);
    expect(codes(elk)).toEqual(['ELK_NOT_INSTALLED']);
  });

  it('ignores agentflow.useWidth and warns LOOK_REMOVED for agentflow.look (D153)', async () => {
    const m = createMermaid();
    const base = await m.render('a12', TEXT);
    const width = await m.render('a12', init('{"agentflow": {"useWidth": 99}}'));
    expect(width.svg).toBe(base.svg);
    expect(width.warnings).toEqual([]);
    const look = await m.render('a12', init('{"agentflow": {"look": "neo"}}'));
    expect(look.svg).toBe(base.svg);
    expect(codes(look)).toEqual(['LOOK_REMOVED']);
  });

  it('passes the integrator’s limits to the parser (R-SEC-5), not raisable from the text', async () => {
    const m = createMermaid();
    m.initialize({ maxEdges: 2 });
    const e = await rejection(m.render('a13', TEXT));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).message).toMatch(/Edge limit exceeded/);
    const raised = await rejection(m.render('a13', init('{"maxEdges": 50}')));
    expect((raised as MermaidError).message).toMatch(/Edge limit exceeded/);
  });

  it('lists the labels it draws for extensions', () => {
    const { model } = parseAgentflow(
      'agentflow-beta\n  flow f["F $$x$$"]\n    a["A"] -- "to b" --> b\n  end\n'
    );
    expect(agentflow.labels(model)).toEqual(expect.arrayContaining(['F $$x$$', 'A', 'to b']));
  });

  it('draws as text (#551, D469): kinds as text forms, flows as frames, both charsets', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('agentflow', 'svg')).toBe(true);
    expect(m.supportsFormat('agentflow', 'ascii')).toBe(true);
    const result = await m.render('a14', TEXT, { format: 'ascii' });
    expect(result).toMatchObject({
      format: 'ascii',
      diagramType: 'agentflow',
      columns: 76,
      rows: 19,
    });
    expect(result.warnings).toEqual([]);
    expect(result.text).toBe(
      [
        '                                          ╭─────────╮',
        '                                          │ LLM API │',
        '                                          ╰─────────╯',
        '                                                                  ┌+──────┐',
        '                                                               ┌─►│ Audit │',
        '                                                               │  └───────┘',
        '                                                               │',
        '                                                               │',
        '┌────────────────────── Triage ─────────────────────┐          │',
        '│                                                   │          │  ┌─────┐',
        '│                                   ┌─────◇─────┐   │          │┌✕< act >',
        '│                 ╓──────────╖      │           ├───┼─── low ──┘│ └─────┘',
        '│ ┌────────┐      ║          ╟─────►◇ Severity? ◇   │           │',
        '│ / ticket ├─────►║ classify ║      │           ├───┼───────────┘',
        '│ └────────┘      ║          ╟┄┄┄┐  └─────◇─────┘   │',
        '│                 ╙──────────╜   ┆                  │             ┌────────╲',
        '│                                └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┼┄┄┄┄┄┄┄┄┄┄┄┄┄┤ Policy │',
        '│                                                   │             └────────┘',
        '└───────────────────────────────────────────────────┘',
      ].join('\n')
    );
    const ascii = m.renderSync(TEXT, { format: 'ascii', config: { ascii: { charset: 'ascii' } } });
    expect(ascii.text).toContain(
      '| / ticket +----->I classify I      |           +---+-----------+'
    );
    expect(ascii.text).toContain('|           +---+--- low --+| +-----+');
    expect(ascii.text).not.toMatch(/[\u2500-\u25ff\u2715]/u);
    // A text render leaves the instance's SVG render as a fresh one draws it.
    expect((await m.render('a14', TEXT)).svg).toBe((await createMermaid().render('a14', TEXT)).svg);
  });

  it('never crops: wider than ascii.maxWidth turns LR to TB, then warns ASCII_TOO_WIDE (R-ASCII-8)', async () => {
    const m = createMermaid();
    const turned = await m.render('a15', TEXT, { format: 'ascii', ascii: { maxWidth: 40 } });
    expect(turned.columns).toBe(39);
    expect(turned.warnings).toEqual([]);
    const wide = await m.render('a15', TEXT, { format: 'ascii', ascii: { maxWidth: 20 } });
    expect(wide.text).toBe(turned.text);
    expect(codes(wide)).toEqual(['ASCII_TOO_WIDE']);
  });

  it('warns for what text output cannot honour: another engine, SVG-only options (pitfall 22)', async () => {
    const text = '---\nconfig:\n  layout: elk\n  agentflow:\n    useMaxWidth: false\n---\n' + TEXT;
    const m = createMermaid();
    const r = await m.render('a16', text, { format: 'ascii' });
    expect(r.warnings.map((w) => [w.code, (w as { feature?: string }).feature])).toEqual([
      ['ASCII_DROPPED', 'layout'],
      ['ASCII_DROPPED', 'config'],
    ]);
    expect(r.warnings[1]!.message).toContain('agentflow.useMaxWidth');
    expect(r.text).toBe((await m.render('a16', TEXT, { format: 'ascii' })).text);
  });
});
