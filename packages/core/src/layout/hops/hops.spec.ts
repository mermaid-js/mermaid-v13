// D537 (#78): line hops as a pure function over edge path data (`lineHops`), and the shared
// edge-path step over a writer (`hopWriter`, `hopPlugin`). Moved from the ELK plugin.
import { describe, expect, it } from 'vitest';
import type { OutlineDraw } from '../../svg/writer.ts';
import { streamWriter, treeWriter, type SvgWriter } from '../../svg/writer.ts';
import { hopStyle, hopWriter, lineHops, parsePath } from './index.ts';

/** A horizontal and a vertical line crossing at (50, 50). */
const H = 'M0,50L100,50';
const V = 'M50,0L50,100';

describe('lineHops (D537 rules)', () => {
  it('a horizontal run hops over a vertical one, whichever comes first', () => {
    expect(lineHops([H, V], 'arc')).toEqual(['M0,50L44,50A6,6 0 0,1 56,50L100,50', undefined]);
    expect(lineHops([V, H], 'arc')).toEqual([undefined, 'M0,50L44,50A6,6 0 0,1 56,50L100,50']);
  });

  it('otherwise the later edge hops', () => {
    const a = 'M0,0L100,100';
    const b = 'M100,0L0,100';
    const [first, later] = lineHops([a, b], 'arc');
    expect(first).toBeUndefined();
    expect(later).toMatch(/^M100,0L54.24,45.76A6,6 0 0,0 45.76,54.24L0,100$/);
  });

  it('`gap` breaks the line where `arc` bumps it', () => {
    expect(lineHops([H, V], 'gap')[0]).toBe('M0,50L44,50M56,50L100,50');
  });

  it('bumps horizontal runs up and vertical runs right, whichever way they go', () => {
    expect(lineHops(['M100,50L0,50', V], 'arc')[0]).toBe('M100,50L56,50A6,6 0 0,0 44,50L0,50');
  });

  it('hops only on straight runs: curves and rounded corners are left as drawn', () => {
    const curve = 'M0,50C30,50 70,50 100,50';
    expect(lineHops([curve, V], 'arc')).toEqual([undefined, undefined]);
    // The run after a rounded corner hops; the corner keeps its rounding.
    const cornered = 'M0,0L0,40Q0,50 10,50L100,50';
    expect(lineHops([cornered, V], 'arc')[0]).toBe(
      'M0,0L0,40Q0,50 10,50L44,50A6,6 0 0,1 56,50L100,50'
    );
  });

  it('draws no hop too close to a bend, and none at a join', () => {
    // 5px from the run's end: no room for a 6px arc and the 2px clearance.
    expect(lineHops(['M0,50L55,50', V], 'arc')).toEqual([undefined, undefined]);
    // Two lines that meet at an end do not cross.
    expect(lineHops(['M0,50L50,50', 'M50,50L50,100'], 'arc')).toEqual([undefined, undefined]);
  });

  it('shrinks two close hops to share the run, and drops them when there is no room', () => {
    const near = lineHops([H, 'M45,0L45,100', 'M55,0L55,100'], 'arc')[0]!;
    expect(near).toBe('M0,50L40,50A5,5 0 0,1 50,50L50,50A5,5 0 0,1 60,50L100,50');
    expect(lineHops([H, 'M48,0L48,100', 'M52,0L52,100'], 'arc')[0]).toBeUndefined();
  });

  it('ignores a line that is not plain absolute path data', () => {
    expect(parsePath('m0,0l10,10')).toBeUndefined();
    expect(lineHops([H, 'm50,0l0,100'], 'arc')).toEqual([undefined, undefined]);
  });
});

/** Draws edge lines through `w` as a diagram does: a group per edge, its line an outline. */
function drawEdges(w: SvgWriter, ds: readonly string[], transform?: string): void {
  w.open('svg', { viewBox: '0 0 100 100' } as never);
  w.open('g', { class: 'edgePaths', transform } as never);
  for (const d of ds) {
    w.open('g', { class: 'edge' });
    w.outline('edge', 'path', { d: d as never, fill: 'none' });
    w.leaf('circle', { cx: 1, cy: 1, r: 1 });
    w.close();
  }
  w.close();
  w.close();
}

function hopped(ds: readonly string[], style: 'arc' | 'gap' = 'arc', draw?: OutlineDraw) {
  const w = hopWriter(streamWriter(draw ? { outline: draw } : undefined), style);
  drawEdges(w, ds);
  return w.finish();
}

describe('hopWriter (the shared edge-path step)', () => {
  it('writes everything through, then puts the hopped line in the finished markup', () => {
    const plain = streamWriter();
    drawEdges(plain, [H, V]);
    expect(hopped([H, V])).toBe(
      plain.finish().replace(`d="${H}"`, 'd="M0,50L44,50A6,6 0 0,1 56,50L100,50"')
    );
  });

  it('writes a drawing with no crossing, or one edge line, byte for byte as without it', () => {
    for (const ds of [[H, 'M0,60L100,60'], [H]]) {
      const plain = streamWriter();
      drawEdges(plain, ds);
      expect(hopped(ds)).toBe(plain.finish());
    }
  });

  it('draws the same on the tree backing as on the stream, and keeps the tree', () => {
    const tree = treeWriter();
    const w = hopWriter(tree, 'arc');
    drawEdges(w, [H, V]);
    expect(w.tree).toBe(tree.tree);
    expect(w.finish()).toBe(hopped([H, V]));
  });

  it('finds each line after the one before, so an equal path drawn later is left alone', () => {
    const w = hopWriter(streamWriter(), 'arc');
    w.open('svg', {});
    drawEdges(w, [H, V]);
    w.leaf('path', { d: H as never }); // not an edge line, drawn after with the same data
    w.close();
    const svg = w.finish();
    expect(svg.match(/A6,6/g)).toHaveLength(1);
    expect(svg.endsWith(`<path d="${H}"/></svg>`)).toBe(true);
  });

  it('compares only lines in the same coordinate frame', () => {
    const w = hopWriter(streamWriter(), 'arc');
    w.open('svg', {});
    drawEdges(w, [H]);
    // The same numbers under a transform are somewhere else.
    drawEdges(w, [V], 'translate(500,0)');
    w.close();
    expect(w.finish()).not.toContain('A6,6');
  });

  it('leaves a line an outline drawer redrew (hand-drawn) as the drawer drew it', () => {
    const draw: OutlineDraw = (role, _tag, _attrs, sink) => {
      if (role !== 'edge') return false;
      sink.leaf('path', { d: 'M1,1L2,2' as never });
      return true;
    };
    expect(hopped([H, V], 'arc', draw)).not.toContain('A6,6');
  });
});

describe('hopStyle: the shared key and an engine section (D537)', () => {
  const config = (c: Record<string, unknown>) => c as never;
  // The resolved config carries every default; `layers` hold only what the author set.
  const defaults = { lineHops: false, elk: { lineHops: true }, swimlane: { lineHops: 'arc' } };

  it.each([
    ['nothing set, no engine section', defaults, [], 'layered', false],
    ['nothing set, a custom layout', defaults, [], undefined, false],
    ['the engine default (elk: true)', defaults, [], 'elk', 'arc'],
    ['the engine default (swimlane: arc)', defaults, [], 'swimlane', 'arc'],
    [
      'the shared key set',
      { ...defaults, lineHops: 'gap' },
      [{ lineHops: 'gap' }],
      'layered',
      'gap',
    ],
    [
      'the shared key over the engine default',
      { ...defaults, lineHops: 'gap' },
      [{ lineHops: 'gap' }],
      'elk',
      'gap',
    ],
    [
      'the engine key set over the shared key',
      { ...defaults, lineHops: 'gap' },
      [{ lineHops: 'gap' }, { elk: { lineHops: true } }],
      'elk',
      'arc',
    ],
    [
      'the engine key set off',
      { lineHops: true, elk: { lineHops: false } },
      [{ lineHops: true, elk: { lineHops: false } }],
      'elk',
      false,
    ],
    [
      'a shared false set turns hops off everywhere',
      defaults,
      [{ lineHops: false }, { elk: { lineHops: true } }],
      'elk',
      false,
    ],
    [
      'a shared false set beats the swimlane default',
      defaults,
      [{ lineHops: false }],
      'swimlane',
      false,
    ],
    [
      'an engine key under another engine is not read',
      defaults,
      [{ elk: { lineHops: true } }],
      'layered',
      false,
    ],
    [
      'swimlane gap',
      { ...defaults, swimlane: { lineHops: 'gap' } },
      [{ swimlane: { lineHops: 'gap' } }],
      'swimlane',
      'gap',
    ],
    [
      'an invalid shared value the resolver dropped is unset',
      defaults,
      [{ lineHops: 'zigzag' }],
      'elk',
      'arc',
    ],
    ['a null shared value is unset', defaults, [{ lineHops: null }], 'swimlane', 'arc'],
  ] as const)('%s', (_, c, layers, section, expected) => {
    expect(hopStyle(config(c), layers as never, section)).toBe(expected);
  });
});
