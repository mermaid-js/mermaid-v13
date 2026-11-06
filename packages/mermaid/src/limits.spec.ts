import { describe, expect, it } from 'vitest';
import { createMermaid, MermaidError, type InitializeConfig } from './index.ts';

/**
 * R-SEC-5 through the public API: every limit is a `LIMIT` MermaidError, limits come from
 * the integrator only (initialize(), per-call config), and diagram text cannot raise them.
 */
const repeat = (count: number, line: (i: number) => string): string =>
  Array.from({ length: count }, (_, i) => line(i)).join('');
const chain = (count: number): string =>
  'flowchart LR\n' + repeat(count, (i) => `N${i} --> N${i + 1}\n`);
const nested = (depth: number): string =>
  'flowchart TD\n' + repeat(depth, (i) => `subgraph s${i}\n`) + 'A --> B\n' + 'end\n'.repeat(depth);
const ids = (count: number, prefix: string): string =>
  Array.from({ length: count }, (_, i) => prefix + i).join(' & ');

async function outcome(text: string, config?: InitializeConfig): Promise<MermaidError | string> {
  const m = createMermaid();
  if (config) m.initialize(config);
  try {
    return (await m.render('limits', text)).svg;
  } catch (e) {
    expect(e).toBeInstanceOf(MermaidError);
    return e as MermaidError;
  }
}

async function limit(text: string, config?: InitializeConfig): Promise<MermaidError> {
  const r = await outcome(text, config);
  if (typeof r === 'string') throw new Error('rendered without a limit error');
  expect(r.code, r.message).toBe('LIMIT');
  return r;
}

describe('render limits (R-SEC-5)', () => {
  it('refuses source over 50,000 characters before reading it', async () => {
    const text = 'flowchart TD\n' + 'A-->B\n'.repeat(10000);
    expect(text.length).toBeGreaterThan(50_000);
    expect((await limit(text)).message).toMatch(
      /is 60013 characters long, over the limit of 50000/
    );
    const lifted = await outcome(text, {
      limits: { maxSourceLength: Infinity, maxEdges: Infinity },
    });
    expect(lifted).toContain('<svg');
  });

  it('refuses the source limit even for text that is not a diagram', async () => {
    await limit('x'.repeat(50_001));
  });

  it('turns each parse limit into LIMIT', async () => {
    expect((await limit(chain(11), { limits: { maxEdges: 10 } })).message).toMatch(/limit is 10\b/);
    expect((await limit(chain(11), { limits: { maxNodes: 5 } })).message).toMatch(
      /more than 5 nodes/
    );
    expect((await limit(nested(3), { limits: { maxDepth: 2 } })).message).toMatch(
      /nested 3 deep here, over the limit of 2/
    );
  });

  it('names the breached limit on the error', async () => {
    const text = 'flowchart TD\n' + 'A-->B\n'.repeat(10000);
    expect((await limit(text)).limit).toBe('maxSourceLength');
    expect((await limit(chain(11), { limits: { maxEdges: 10 } })).limit).toBe('maxEdges');
    expect((await limit(chain(11), { limits: { maxNodes: 5 } })).limit).toBe('maxNodes');
    expect((await limit(nested(3), { limits: { maxDepth: 2 } })).limit).toBe('maxDepth');
    expect((await limit(chain(3), { limits: { maxOutputLength: 100 } })).limit).toBe(
      'maxOutputLength'
    );
    const other = await outcome('flowchart TD\nA[unclosed\n');
    expect(typeof other !== 'string' && other.limit).toBeUndefined();
  });

  it('reports a limit before other errors in the same text', async () => {
    const e = await limit(chain(11) + 'A[unclosed\n', { limits: { maxEdges: 10 } });
    expect(e.diagnostics[0]?.code).toBe('EDGE_LIMIT');
  });

  it('caps the size of the SVG', async () => {
    expect((await limit(chain(3), { limits: { maxOutputLength: 100 } })).message).toMatch(
      /over the limit of 100\./
    );
  });

  it("honours v12's integrator keys maxTextSize and maxEdges, and limits wins over them", async () => {
    await limit(chain(11), { maxEdges: 10 });
    await limit(chain(2), { maxTextSize: 20 });
    expect(await outcome(chain(11), { maxEdges: 10, limits: { maxEdges: 11 } })).toContain('<svg');
  });

  it('takes per-call limits from renderSync/prepare options', async () => {
    const m = createMermaid();
    const config = { limits: { maxEdges: 1 } };
    const text = chain(2);
    await expect(m.prepare(text, { config })).rejects.toMatchObject({ code: 'LIMIT' });
    await m.prepare(text);
    expect(m.renderSync(text).svg).toContain('<svg');
    expect(() => m.renderSync(text, { config })).toThrow(/limit is 1\b/);
  });

  it('rejects a limit that is not a non-negative number', () => {
    expect(() => createMermaid().initialize({ limits: { maxEdges: -1 } })).toThrow(TypeError);
  });

  describe('diagram text cannot raise a limit', () => {
    const raise = {
      maxTextSize: 1e9,
      maxEdges: 1e9,
      secure: [],
      limits: { maxEdges: 1e9, maxNodes: 1e9, maxDepth: 1e9, maxOutputLength: 1e9 },
      flowchart: { maxEdges: 1e9 },
    };
    const json = JSON.stringify(raise);
    const frontMatter = `---\nconfig: ${json}\n---\n`;
    const directive = `%%{init: ${json}}%%\n`;

    it.each([
      ['front matter', frontMatter],
      ['an init directive', directive],
      ['both', frontMatter + directive],
    ])('from %s', async (_, prefix) => {
      const limits = { maxEdges: 10, maxNodes: 50, maxDepth: 2, maxOutputLength: 1e6 };
      expect((await limit(prefix + chain(11), { limits })).message).toMatch(/limit is 10\b/);
      expect((await limit(prefix + nested(3), { limits })).message).toMatch(/limit of 2\./);
      // The defaults hold too.
      const product = `flowchart LR\n${ids(71, 'a')} --> ${ids(71, 'b')}\n`; // 5,041 edges
      expect((await limit(prefix + product)).message).toMatch(/limit is 5000\b/);
      const long = prefix + 'flowchart TD\n' + '%% padding\n'.repeat(5000) + 'A\n';
      expect((await limit(long)).message).toMatch(/over the limit of 50000/);
    });

    it('and the attempt is reported as a secure-key warning', async () => {
      const r = await createMermaid().render('x', frontMatter + chain(1));
      expect(r.warnings.map((w) => w.code)).toContain('CONFIG_SECURE_KEY');
    });
  });
});

describe('the layout work limit (R-SEC-5, D542)', () => {
  // Every day of a 100-year task is walked once for its excluded days: 36,525 steps.
  const gantt = 'gantt\ndateFormat YYYY-MM-DD\nexcludes 1999-01-01\na :a, 2000-01-01, 100y\n';

  it('refuses gantt scheduling past maxLayoutWork, naming the steps', async () => {
    const e = await limit(gantt, { limits: { maxLayoutWork: 10_000 } });
    expect(e.limit).toBe('maxLayoutWork');
    expect(e.message).toMatch(/gantt chart's schedule.*more than 10000 steps/);
  });

  it('draws the chart under the default, or a raised limit', async () => {
    expect(await outcome(gantt)).toContain('<svg');
    expect(await outcome(gantt, { limits: { maxLayoutWork: 1e12 } })).toContain('<svg');
  });

  it('cannot be raised from front matter', async () => {
    const text = `---\nconfig:\n  limits:\n    maxLayoutWork: 1e12\n---\n${gantt}`;
    expect((await limit(text, { limits: { maxLayoutWork: 10_000 } })).limit).toBe('maxLayoutWork');
  });
});
