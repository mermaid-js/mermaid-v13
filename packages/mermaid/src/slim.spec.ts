import { flowchart } from '@mermaid-js/diagram-flowchart';
import { ascii } from '@mermaid-js/diagram-flowchart/ascii';
import { describe, expect, it } from 'vitest';
import { createMermaid as createFull } from './index.ts';
import { createMermaid, MermaidError, type DiagramPlugin } from './slim.ts';

const FLOW = 'flowchart LR\n  A[Start] --> B(End)\n';

async function rejection(p: Promise<unknown>): Promise<MermaidError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(MermaidError);
    return e as MermaidError;
  }
  throw new Error('expected a rejection');
}

describe('mermaid/slim', () => {
  it('renders a diagram passed in, byte for byte as mermaid does', async () => {
    const m = createMermaid({ diagrams: [flowchart] });
    expect((await m.render('s', FLOW)).svg).toBe((await createFull().render('s', FLOW)).svg);
  });

  it('rejects a first-party type that was not passed with UNSUPPORTED_DIAGRAM', async () => {
    const e = await rejection(createMermaid().render('s', FLOW));
    expect(e.code).toBe('UNSUPPORTED_DIAGRAM');
    expect(e.message).toContain('"flowchart-v2"');
  });

  it('still detects every v12 type, in v12 order', () => {
    const m = createMermaid();
    expect(m.detectType('flowchart-elk TD\n  A')).toBe('flowchart-elk');
    expect(m.detectType('sequenceDiagram\n  A->>B: hi')).toBe('sequence');
  });

  it('draws text only when the ascii hook is passed with the plugin', async () => {
    const svgOnly = createMermaid({ diagrams: [flowchart] });
    expect(svgOnly.supportsFormat('flowchart-v2', 'ascii')).toBe(false);
    const withText = createMermaid({
      diagrams: [{ ...flowchart, ascii } as DiagramPlugin<unknown, unknown>],
    });
    expect(withText.supportsFormat('flowchart-v2', 'ascii')).toBe(true);
    const r = await withText.render('t', FLOW, { format: 'ascii' });
    expect(r.text).toBe((await createFull().render('t', FLOW, { format: 'ascii' })).text);
  });

  it('refuses a diagram that is not first-party', () => {
    const other = { ...flowchart, id: 'other' };
    expect(() => createMermaid({ diagrams: [other] })).toThrow(/registerExternalDiagrams/);
  });
});
