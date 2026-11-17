import { flowchart } from '@mermaid-js/diagram-flowchart';
import { ascii } from '@mermaid-js/diagram-flowchart/ascii';
import { beforeEach, describe, expect, it } from 'vitest';
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

  describe('lazy loaders (D587)', () => {
    const PIE = 'pie\n  "a": 1\n  "b": 2\n';
    const calls: string[] = [];
    const recorded = (id: string, load: () => Promise<unknown>) => () => {
      calls.push(id);
      return load();
    };
    const flowLoader = recorded('flowchart', () => import('@mermaid-js/diagram-flowchart'));
    const pieLoader = recorded('pie', () => import('@mermaid-js/diagram-pie'));
    const seqLoader = recorded('sequence', () => import('@mermaid-js/diagram-sequence'));
    beforeEach(() => void (calls.length = 0));

    it('loads nothing at createMermaid, nor for a type that is detected but not rendered', () => {
      const m = createMermaid({ diagrams: { flowchart: flowLoader, pie: pieLoader } });
      expect(calls).toEqual([]);
      expect(m.detectType('pie\n  "a": 1')).toBe('pie');
      expect(m.detectType(FLOW)).toBe('flowchart-v2');
      expect(calls).toEqual([]);
    });

    it('loads only the module of the type rendered, once, byte for byte as mermaid', async () => {
      const m = createMermaid({ diagrams: { flowchart: flowLoader, pie: pieLoader } });
      const full = createFull();
      expect((await m.render('s', FLOW)).svg).toBe((await full.render('s', FLOW)).svg);
      expect((await m.render('s2', FLOW)).svg).toBe((await full.render('s2', FLOW)).svg);
      expect(calls).toEqual(['flowchart']);
      expect((await m.render('p', PIE)).svg).toBe((await full.render('p', PIE)).svg);
      expect(calls).toEqual(['flowchart', 'pie']);
    });

    it('rejects a type left out with UNSUPPORTED_DIAGRAM and loads nothing for it', async () => {
      const m = createMermaid({ diagrams: { pie: pieLoader } });
      const e = await rejection(m.render('s', FLOW));
      expect(e.code).toBe('UNSUPPORTED_DIAGRAM');
      expect(calls).toEqual([]);
    });

    it('mixes plugin objects and loaders', async () => {
      const m = createMermaid({ diagrams: { flowchart, sequence: seqLoader } });
      const full = createFull();
      const seq = 'sequenceDiagram\n  A->>B: hi\n';
      expect((await m.render('a', FLOW)).svg).toBe((await full.render('a', FLOW)).svg);
      expect((await m.render('b', seq)).svg).toBe((await full.render('b', seq)).svg);
      expect(calls).toEqual(['sequence']);
    });

    it('draws text when the loaded module has an ascii hook', async () => {
      const withHook = recorded('flowchart', async () => ({
        ...(await import('@mermaid-js/diagram-flowchart')),
        ascii,
      }));
      const m = createMermaid({ diagrams: { flowchart: withHook } });
      // Before the load the manifest's formats answer, and nothing has loaded.
      expect(m.supportsFormat('flowchart-v2', 'ascii')).toBe(true);
      expect(calls).toEqual([]);
      const r = await m.render('t', FLOW, { format: 'ascii' });
      expect(r.text).toBe((await createFull().render('t', FLOW, { format: 'ascii' })).text);
      expect(m.supportsFormat('flowchart-v2', 'ascii')).toBe(true);
    });

    it('rejects text output when the loaded module has no ascii hook', async () => {
      const m = createMermaid({ diagrams: { flowchart: flowLoader } });
      const e = await rejection(m.render('t', FLOW, { format: 'ascii' }));
      expect(e.code).toBe('UNSUPPORTED_FORMAT');
      expect(m.supportsFormat('flowchart-v2', 'ascii')).toBe(false);
      expect((await m.render('s', FLOW)).svg).toContain('<svg');
    });

    it('reports a rejecting loader on render, and retries it', async () => {
      let fail = true;
      const m = createMermaid({
        diagrams: {
          flowchart: () =>
            fail ? Promise.reject(new Error('chunk 404')) : import('@mermaid-js/diagram-flowchart'),
        },
      });
      const e = await rejection(m.render('s', FLOW));
      expect(e.message).toContain('chunk 404');
      fail = false;
      expect((await m.render('s', FLOW)).svg).toContain('<svg');
    });

    it('reports a module that is not the plugin for its id on render', async () => {
      const wrong = createMermaid({
        diagrams: { flowchart: () => import('@mermaid-js/diagram-pie') },
      });
      const e = await rejection(wrong.render('s', FLOW));
      expect(e.message).toContain('did not resolve to the "flowchart" diagram plugin');
      const empty = createMermaid({ diagrams: { flowchart: () => Promise.resolve(undefined) } });
      expect((await rejection(empty.render('s', FLOW))).message).toContain('"flowchart"');
    });

    it('calls a loader once for all the types of its id, and retries a failure once', async () => {
      let fail = true;
      let n = 0;
      const m = createMermaid({
        diagrams: {
          flowchart: () => {
            n++;
            return fail
              ? Promise.reject(new Error('chunk 404'))
              : import('@mermaid-js/diagram-flowchart');
          },
        },
      });
      await rejection(m.render('a', 'graph TD\n  A --> B\n'));
      expect(n).toBe(1);
      fail = false;
      const [x, y] = await Promise.all([
        m.render('b', 'graph TD\n  A --> B\n'),
        m.render('c', FLOW),
      ]);
      expect(x.svg).toContain('<svg');
      expect(y.svg).toContain('<svg');
      await m.render('d', 'flowchart LR\n  X --> Y\n');
      expect(n).toBe(2);
    });

    it('treats an undefined value as left out, and refuses any other non-diagram', async () => {
      const m = createMermaid({ diagrams: { flowchart: undefined, pie: pieLoader } });
      expect((await rejection(m.render('s', FLOW))).code).toBe('UNSUPPORTED_DIAGRAM');
      expect((await m.render('p', PIE)).svg).toContain('<svg');
      // @ts-expect-error null is neither a plugin nor a loader
      expect(() => createMermaid({ diagrams: { pie: null } })).toThrow(/plugin object or a loader/);
      // @ts-expect-error nor is a string
      expect(() => createMermaid({ diagrams: { pie: 'pie' } })).toThrow(
        /plugin object or a loader/
      );
    });

    it('refuses a key that is not first-party, and a plugin under another id', () => {
      const other = { other: () => import('@mermaid-js/diagram-flowchart') };
      // @ts-expect-error `other` is not a first-party id
      expect(() => createMermaid({ diagrams: other })).toThrow(/registerExternalDiagrams/);
      expect(() => createMermaid({ diagrams: { pie: flowchart } })).toThrow(
        /has the id "flowchart"/
      );
    });
  });

  // spec #730 T7: c4beta shares the c4 plugin, and its text output is the plugin's ascii entry.
  describe('c4beta text output through the c4 plugin', () => {
    const c4Ascii = () => import('@mermaid-js/diagram-c4/ascii').then((m) => m.ascii);
    const BETA = 'c4-beta\nperson a "A"\n';

    it('draws c4beta as text, given c4 as an object or a loader', async () => {
      const { c4 } = await import('@mermaid-js/diagram-c4');
      const c4Text = await c4Ascii();
      const loader = async () => ({
        ...(await import('@mermaid-js/diagram-c4')),
        ascii: c4Text,
      });
      for (const c4Given of [{ ...c4, ascii: c4Text }, loader]) {
        const m = createMermaid({ diagrams: { c4: c4Given } });
        expect((await m.render('b', BETA)).svg).toContain('aria-roledescription="c4beta"');
        expect(m.supportsFormat('c4beta', 'ascii')).toBe(true);
        expect(m.supportsFormat('c4', 'ascii')).toBe(true);
        await m.prepare(BETA, { format: 'ascii' });
        expect(m.renderSync(BETA, { format: 'ascii' }).text).toContain('[Person]');
        const legacy = 'C4Context\nPerson(a, "A")\n';
        await m.prepare(legacy, { format: 'ascii' });
        expect(m.renderSync(legacy, { format: 'ascii' }).text).toContain('A');
      }
    });
  });
});
