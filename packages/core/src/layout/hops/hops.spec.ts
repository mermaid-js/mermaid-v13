// D537 (#78): line hops as a pure function over edge path data (`hopPaths`), and the shared
// edge-path step over a writer (`hopWriter`, `hopPlugin`). Moved from the ELK plugin.
import { describe, expect, it } from 'vitest';
import type { OutlineDraw } from '../../svg/writer.ts';
import { streamWriter, treeWriter, type SvgWriter } from '../../svg/writer.ts';
import { hopPaths, hopStyle, hopWriter, parsePath } from './index.ts';

/** A horizontal and a vertical line crossing at (50, 50). */
const H = 'M0,50L100,50';
const V = 'M50,0L50,100';

describe('hopPaths (D537 rules)', () => {
  it('a horizontal run hops over a vertical one, whichever comes first', () => {
    expect(hopPaths([H, V], 'arc')).toEqual(['M0,50L44,50A6,6 0 0,1 56,50L100,50', undefined]);
    expect(hopPaths([V, H], 'arc')).toEqual([undefined, 'M0,50L44,50A6,6 0 0,1 56,50L100,50']);
  });

  it('otherwise the later edge hops', () => {
    const a = 'M0,0L100,100';
    const b = 'M100,0L0,100';
    const [first, later] = hopPaths([a, b], 'arc');
    expect(first).toBeUndefined();
    expect(later).toMatch(/^M100,0L54.24,45.76A6,6 0 0,0 45.76,54.24L0,100$/);
  });

  it('`gap` breaks the line where `arc` bumps it', () => {
    expect(hopPaths([H, V], 'gap')[0]).toBe('M0,50L44,50M56,50L100,50');
  });

  it('bumps horizontal runs up and vertical runs right, whichever way they go', () => {
    expect(hopPaths(['M100,50L0,50', V], 'arc')[0]).toBe('M100,50L56,50A6,6 0 0,0 44,50L0,50');
  });

  it('hops only on straight runs: curves and rounded corners are left as drawn', () => {
    const curve = 'M0,50C30,50 70,50 100,50';
    expect(hopPaths([curve, V], 'arc')).toEqual([undefined, undefined]);
    // The run after a rounded corner hops; the corner keeps its rounding.
    const cornered = 'M0,0L0,40Q0,50 10,50L100,50';
    expect(hopPaths([cornered, V], 'arc')[0]).toBe(
      'M0,0L0,40Q0,50 10,50L44,50A6,6 0 0,1 56,50L100,50'
    );
  });

  it('draws no hop too close to a bend, and none at a join', () => {
    // 5px from the run's end: no room for a 6px arc and the 2px clearance.
    expect(hopPaths(['M0,50L55,50', V], 'arc')).toEqual([undefined, undefined]);
    // Two lines that meet at an end do not cross.
    expect(hopPaths(['M0,50L50,50', 'M50,50L50,100'], 'arc')).toEqual([undefined, undefined]);
  });

  it('shrinks two close hops to share the run', () => {
    const near = hopPaths([H, 'M45,0L45,100', 'M55,0L55,100'], 'arc')[0]!;
    expect(near).toBe('M0,50L40,50A5,5 0 0,1 50,50L50,50A5,5 0 0,1 60,50L100,50');
  });

  it('ignores a line that is not plain absolute path data', () => {
    expect(parsePath('m0,0l10,10')).toBeUndefined();
    expect(hopPaths([H, 'm50,0l0,100'], 'arc')).toEqual([undefined, undefined]);
  });
});

/** Vertical lines at each `x`, for crossings on `H`. */
const verticals = (...xs: number[]): string[] => xs.map((x) => `M${x},0L${x},100`);

describe('hopPaths: crossings too close for a hop each (D656, #793)', () => {
  it('draws one hop over both, a radius beyond each, as tall as any other', () => {
    expect(hopPaths([H, ...verticals(48, 52)], 'arc')[0]).toBe(
      'M0,50L42,50A8,6 0 0,1 58,50L100,50'
    );
    expect(hopPaths([H, ...verticals(48, 52)], 'gap')[0]).toBe('M0,50L42,50M58,50L100,50');
  });

  it('merges every crossing of the cluster, however many', () => {
    expect(hopPaths([H, ...verticals(46, 50, 54)], 'arc')[0]).toBe(
      'M0,50L40,50A10,6 0 0,1 60,50L100,50'
    );
  });

  it('turns the merged hop with its run', () => {
    // Two steep lines crossing a later vertical run at y 48 and 52: the vertical one hops.
    const steep = ['M45,23L55,73', 'M45,27L55,77'];
    expect(hopPaths([...steep, V], 'arc')[2]).toBe('M50,0L50,42A8,6 90 0,1 50,58L50,100');
  });

  it('keeps the hops that fit as they are, and fits the merged hop between them', () => {
    // The hop at 38 shrinks to 5 for its neighbour at 48, as without merging.
    expect(hopPaths([H, ...verticals(38, 48, 52)], 'arc')[0]).toBe(
      'M0,50L33,50A5,5 0 0,1 43,50L43,50A7,5 0 0,1 57,50L100,50'
    );
    // No room beside the hop at 60: the close pair stays bare, the hop at 60 is drawn.
    expect(hopPaths([H, ...verticals(48, 52, 60)], 'arc')[0]).toBe(
      'M0,50L54,50A6,6 0 0,1 66,50L100,50'
    );
  });

  it('takes its radius from the room left at the run end', () => {
    expect(hopPaths(['M0,50L58,50', ...verticals(48, 52)], 'arc')[0]).toBe(
      'M0,50L44,50A6,4 0 0,1 56,50L58,50'
    );
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

  it('hops a plain edge line (#655), which no outline drawer is given, with or without one', () => {
    const asked: string[] = [];
    const draw: OutlineDraw = (role, _tag, _attrs, sink) => {
      asked.push(role);
      sink.leaf('path', { d: 'M1,1L2,2' as never });
      return true;
    };
    const plainEdges = (w: SvgWriter): void => {
      w.open('svg', {});
      w.plainEdge({ class: 'edge', d: H as never, fill: 'none' });
      w.plainEdge({ class: 'edge', d: V as never, fill: 'none' });
      w.close();
    };
    const plain = streamWriter();
    plainEdges(plain);
    const leaves = streamWriter();
    leaves.open('svg', {});
    leaves.leaf('path', { class: 'edge', d: H as never, fill: 'none' });
    leaves.leaf('path', { class: 'edge', d: V as never, fill: 'none' });
    leaves.close();
    // Exactly the leaves, on either backing, without the step.
    expect(plain.finish()).toBe(leaves.finish());
    const tree = treeWriter();
    plainEdges(tree);
    expect(tree.finish()).toBe(plain.finish());
    for (const options of [undefined, { outline: draw }]) {
      const w = hopWriter(streamWriter(options), 'arc');
      plainEdges(w);
      expect(w.finish()).toBe(
        plain.finish().replace(`d="${H}"`, 'd="M0,50L44,50A6,6 0 0,1 56,50L100,50"')
      );
    }
    expect(asked).toEqual([]);
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
