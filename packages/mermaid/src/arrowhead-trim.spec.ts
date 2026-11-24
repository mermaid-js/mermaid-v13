import { describe, expect, it } from 'vitest';
import { createMermaid, type InitializeConfig } from './index.ts';

/**
 * Flowchart arrowheads and the rank gap they hold open (D601, #399): the layout keeps a point
 * head's gap and length (less one) and its lead between ranks, and the drawing trims each line
 * under its own head: point, circle or cross. Pinned with the theme's heads, with an override of
 * the point head's gap and length, and with a zero length, at a rank spacing small enough for the
 * head to set the gap.
 */
const HEADS = 'flowchart TD\n  A --> B\n  A --o C\n  A --x D\n  B --> E\n';

async function drawn(config: InitializeConfig): Promise<{ viewBox: string; parts: string[] }> {
  const m = createMermaid();
  m.initialize(config);
  const { svg } = await m.render('heads', HEADS);
  const viewBox = /viewBox="([^"]+)"/.exec(svg)![1]!;
  // Each line, and each head: a point head is a path, the circle a circle, the cross a path.
  const parts = [...svg.matchAll(/<(path|circle)\b[^>]*?(?:\bd="([^"]+)"|\bcx="([^"]+)")[^>]*>/g)]
    .filter((x) => !/class="(?:node|label)/.test(x[0]))
    .map((x) => `${x[1]} ${x[2] ?? `${x[3]} ${/cy="([^"]+)"/.exec(x[0])?.[1]}`}`);
  return { viewBox, parts };
}

const TIGHT = { flowchart: { rankSpacing: 1 } };

describe('flowchart: arrowhead trim and rank gap', () => {
  it.each([
    ['theme heads', {}],
    ['a longer point head with a gap', { arrowheadGap: 4, arrowheadLength: 14 }],
    ['a zero-length point head', { arrowheadGap: 0, arrowheadLength: 0 }],
    ['circle and cross heads overridden too', { circleArrowheadSize: 12, crossArrowheadGap: 3 }],
  ])('%s', async (_, themeVariables) => {
    const loose = await drawn({ themeVariables });
    const tight = await drawn({ ...TIGHT, themeVariables });
    expect({ loose, tight }).toMatchSnapshot();
  });

  it('a tight rank gap grows with the point head', async () => {
    const height = async (themeVariables: Record<string, number>) =>
      Number((await drawn({ ...TIGHT, themeVariables })).viewBox.split(' ')[3]);
    const small = await height({ arrowheadGap: 0, arrowheadLength: 1 });
    const large = await height({ arrowheadGap: 5, arrowheadLength: 11 });
    expect(large).toBeGreaterThan(small);
    expect({ small, large }).toMatchSnapshot();
  });
});
