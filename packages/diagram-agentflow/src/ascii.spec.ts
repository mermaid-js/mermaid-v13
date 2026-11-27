import { describe, expect, it } from 'vitest';
import { draw, text } from './ascii/agentflow.fixtures.ts';
import { undrawnConfig } from './ascii/warnings.ts';
import { renderAgentflowForTest } from './render/harness.ts';

// The agentflow `ascii` hook (spec #523 T7, #551, D320, D469, R-ASCII-5, R-ASCII-6), called
// through the `./ascii` entry as the pipeline does (parse → the plugin's layout in cells →
// hook), with the generated `agentflow` defaults (converted to cells, as flowchart's are). The
// corpus and fuzz properties are `conformance/src/agentflow/ascii-{corpus,frames}.spec.ts`.

const H = 'agentflow-beta ';
const lines = (...rows: string[]): string => rows.join('\n');
const dropped = (warnings: readonly { code: string }[]) =>
  warnings.map((w) => [w.code, (w as { feature?: string }).feature]);

const KINDS =
  H +
  'LR\n' +
  '  a["Task"]@{ shape: task } --> b["Tool"]@{ shape: tool } --> c["In"]@{ shape: input }\n' +
  '  d["Decide"]@{ shape: decision } --x e["Doc"]@{ shape: refdoc } -.- f["Act"]@{ shape: action }';

describe('text forms per kind (D469)', () => {
  it('draws a task rounded, a tool with double sides, an input with a slant', async () => {
    const rows = (await text(KINDS)).split('\n');
    expect(rows.slice(0, 3)).toEqual([
      '  ╭──────╮      ╓──────╖      ┌────┐',
      '  │ Task ├─────►║ Tool ╟─────►/ In /',
      '  ╰──────╯      ╙──────╜      └────┘',
    ]);
  });

  it('draws a decision as a diamond, a refdoc with a folded corner, an action as a hexagon', async () => {
    const rows = (await text(KINDS)).split('\n');
    expect(rows.slice(-3)).toEqual([
      '┌───◇────┐      ┌─────╲       ┌─────┐',
      '◇ Decide ├─────✕│ Doc ├┄┄┄┄┄┄┄┤ Act >',
      '└───◇────┘      └─────┘       └─────┘',
    ]);
  });

  it('has an ascii form of every kind: --x ends in x, -.- is dotted', async () => {
    expect(await text(KINDS, { charset: 'ascii' })).toBe(
      lines(
        '  +------+      +------+      +----+',
        '  | Task +----->I Tool +----->/ In /',
        '  +------+      +------+      +----+',
        '',
        '',
        '',
        '+---*----+      +-----\\       +-----+',
        '* Decide +-----x| Doc +.......+ Act >',
        '+---*----+      +-----+       +-----+'
      )
    );
  });

  it('draws a connector as a task, and an empty label as a box of one row', async () => {
    expect(await text(H + 'LR\n  connector gh["GitHub"]\n  a --> gh')).toBe(
      lines('╭───╮      ╭────────╮', '│ a ├─────►│ GitHub │', '╰───╯      ╰────────╯')
    );
    expect(await text(H + 'LR\n  a{" "}')).toBe(lines('┌◇─┐', '◇  ◇', '└◇─┘'));
  });
});

describe('flows (D469)', () => {
  it('draws a flow as a frame with its title, and a collapsed flow as a box marked +', async () => {
    const src =
      H +
      'TB\n  flow f["Build"]\n    a --> b\n  end\n  flow g["Ship"]\n    c\n  end\n  g@{ view: "collapsed" }\n  b --> g';
    const out = (await text(src)).split('\n');
    expect(out[0]).toBe('┌ Build ┐');
    expect(out.slice(-6)).toEqual(['    │', '    │', '    ▼', '┌+─────┐', '│ Ship │', '└──────┘']);
    expect((await text(src, { charset: 'ascii' })).split('\n').slice(-3)).toEqual([
      '++-----+',
      '| Ship |',
      '+------+',
    ]);
  });

  it('ends an edge between a flow and its member on the frame, its head pointing out (#42)', async () => {
    expect(await text(H + 'LR\n  flow f["Build"]\n    a --> b\n  end\n  b --> f\n  f --> c')).toBe(
      lines(
        '┌────── Build ─▲───┐',
        '│              │   │',
        '│              │   │',
        '│ ╭───╮      ╭─┴─╮ │      ╭───╮',
        '│ │ a ├─────►│ b │ ├─────►│ c │',
        '│ ╰───╯      ╰───╯ │      ╰───╯',
        '│                  │',
        '└──────────────────┘'
      )
    );
  });
});

describe('text output', () => {
  it('puts an edge label on its line', async () => {
    expect(await text(H + 'LR\n  a -- go --> b')).toBe(
      lines('╭───╮          ╭───╮', '│ a ├─── go ──►│ b │', '╰───╯          ╰───╯')
    );
  });

  it('puts the front-matter title on the first line, wrapped to ascii.maxWidth', async () => {
    const src = '---\ntitle: A long pipeline title here\n---\n' + H + 'LR\n  a --> b';
    expect((await text(src)).split('\n')[0]).toBe('A long pipeline title here');
    expect((await text(src, { maxWidth: 10 })).split('\n').slice(0, 2)).toEqual([
      'A long pipeline',
      '   title here',
    ]);
  });

  it('pads boxes with ascii.padding: roomy', async () => {
    expect(await text(H + 'LR\n  a --> b', { padding: 'roomy' })).toBe(
      lines(
        '╭───╮      ╭───╮',
        '│   │      │   │',
        '│ a ├─────►│ b │',
        '│   │      │   │',
        '╰───╯      ╰───╯'
      )
    );
  });

  it('redoes a layout that is not in cells', async () => {
    const src = H + 'LR\n  flow f["F"]\n    a --> b\n  end\n  b --> c';
    expect(await text(src, { px: true })).toBe(await text(src));
  });

  it('is deterministic, with no trailing space', async () => {
    const src = H + 'TB\n  flow f["F"]\n    a --> b\n    b --x c\n  end\n  c -.- d\n  a --> f';
    const out = await text(src);
    expect(await text(src)).toBe(out);
    expect(out).not.toMatch(/ $/m);
  });

  it('converts the agentflow px lengths to cells: rankSpacing 160 is 20 columns', async () => {
    const far = await text(H + 'LR\n  a --> b', { config: { agentflow: { rankSpacing: 160 } } });
    expect(far).toContain(`│ a ├${'─'.repeat(19)}►│ b │`);
  });

  it('leaves the SVG layout as it was: no cell sizes, routes on the outlines', async () => {
    const src = H + 'LR\n  flow f["F"]\n    a["Task"] --> b["Tool"]@{ shape: tool }\n  end';
    const { layout } = await renderAgentflowForTest(src);
    expect(layout.agentflow.graph.grid).toBeUndefined();
    expect(layout.nodes.get('a')!.width).toBeGreaterThan(100);
  });
});

describe('warnings (D82, pitfall 22)', () => {
  it('warns once per kind for styles, curves, emphasis, links and accessibility', async () => {
    const src =
      H +
      'LR\n  accTitle: T\n  classDef hot fill:#f00\n  a:::hot --> b["`**bold**`"]\n' +
      '  linkStyle 0 interpolate basis\n  click a "https://x.y"\n  style b stroke:#0f0';
    const { warnings, text: out } = await draw(src);
    expect(dropped(warnings)).toEqual([
      ['ASCII_DROPPED', 'style'],
      ['ASCII_DROPPED', 'curve'],
      ['ASCII_DROPPED', 'emphasis'],
      ['ASCII_DROPPED', 'link'],
      ['ASCII_DROPPED', 'accessibility'],
    ]);
    expect((warnings[0] as { astIds?: string[] }).astIds).toEqual([
      'n:a',
      'n:b',
      'style:1',
      'classDef:1',
      'linkStyle:1',
    ]);
    expect(out).toContain('│ bold │');
  });

  it('warns for an edge animation', async () => {
    const { warnings } = await draw(H + 'LR\n  a e1@--> b\n  e1@{ animate: true }');
    expect(dropped(warnings)).toEqual([['ASCII_DROPPED', 'animation']]);
  });

  it('warns for the options text output cannot honour, set in the diagram or in config', async () => {
    const src =
      '---\nconfig:\n  agentflow:\n    minNodeWidth: 200\n    useMaxWidth: false\n    curve: basis\n---\n' +
      H +
      'LR\n  a --> b';
    const { warnings } = await draw(src);
    expect(dropped(warnings)).toEqual([
      ['ASCII_DROPPED', 'curve'],
      ['ASCII_DROPPED', 'config'],
    ]);
    expect(warnings[1]!.message).toContain('agentflow.useMaxWidth, agentflow.minNodeWidth');
    const site = await draw(H + 'LR\n  a --> b', {
      config: { flowchart: { padding: 30, subGraphTitleMargin: { top: 10 } } },
    });
    expect(site.warnings[0]!.message).toContain('flowchart.padding, flowchart.subGraphTitleMargin');
    expect((await draw(H + 'LR\n  a --> b')).warnings).toEqual([]);
  });

  it('warns for a curve set by agentflow.curve or curve, not for flowchart.curve (D733)', async () => {
    const curveWarnings = async (config: string) => {
      const { warnings } = await draw(`---\nconfig:\n${config}\n---\n${H}LR\n  a --> b`);
      return dropped(warnings);
    };
    expect(await curveWarnings('  agentflow:\n    curve: linear')).toEqual([
      ['ASCII_DROPPED', 'curve'],
    ]);
    expect(await curveWarnings('  curve: linear')).toEqual([['ASCII_DROPPED', 'curve']]);
    expect(await curveWarnings('  flowchart:\n    curve: linear')).toEqual([]);
  });

  it('reads a numeric string as its number, and a default as not set', async () => {
    const config = (agentflow: Record<string, unknown>) => undrawnConfig({ agentflow } as never);
    expect(config({ diagramPadding: '8', minNodeWidth: 120, useMaxWidth: true })).toEqual([]);
    expect(config({ diagramPadding: '20', titleTopMargin: 0 })).toEqual([
      'agentflow.diagramPadding',
      'agentflow.titleTopMargin',
    ]);
  });
});
