import { describe, expect, it } from 'vitest';
import { createMermaid, UnsupportedFormatError } from './index.ts';

// User journey is a first-party type (#327): `journey` goes to `@mermaid-js/diagram-journey`
// through the generated registry, between stateDiagram and quadrantChart as in v12.
const TEXT = 'journey\n  title My day\n  section Work\n    Make tea: 5: Me\n';

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

describe('user journeys through the public API (#327)', () => {
  it('supports svg only: ascii is refused with UnsupportedFormatError (D216)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('journey', 'svg')).toBe(true);
    expect(m.supportsFormat('journey', 'ascii')).toBe(false);
    const e = await rejection(m.render('j', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('journey');
  });
});
