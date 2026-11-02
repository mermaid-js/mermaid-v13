import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, LimitError } from '@mermaid-js/core/limits';
import { parseFlowchart } from './index.ts';
import { renderForTest } from './testing.ts';

const repeat = (count: number, line: (i: number) => string): string =>
  Array.from({ length: count }, (_, i) => line(i)).join('');
const chain = (count: number): string =>
  'flowchart LR\n' + repeat(count, (i) => `N${i} --> N${i + 1}\n`);
const nested = (depth: number): string =>
  'flowchart TD\n' + repeat(depth, (i) => `subgraph s${i}\n`) + 'A --> B\n' + 'end\n'.repeat(depth);
const ids = (count: number, prefix: string): string =>
  Array.from({ length: count }, (_, i) => prefix + i).join(' & ');
const codes = (src: string, options?: Parameters<typeof parseFlowchart>[1]): string[] =>
  parseFlowchart(src, options)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

async function limitError(text: string, options?: Parameters<typeof renderForTest>[1]) {
  try {
    await renderForTest(text, options);
  } catch (e) {
    if (e instanceof LimitError) return e;
    throw e;
  }
  throw new Error('rendered without a limit error');
}

describe('flowchart parse limits', () => {
  it('defaults to 5,000 edges (v12 stopped at 500)', () => {
    expect(codes(chain(5000))).toEqual([]);
    expect(codes(chain(5001))).toEqual(['EDGE_LIMIT']);
  });

  it('refuses a cross product over the limit with one diagnostic, before making the edges', () => {
    const started = Date.now();
    const r = parseFlowchart(`flowchart LR\n${ids(2000, 'a')} --> ${ids(2000, 'b')}\n`);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['EDGE_LIMIT']);
    expect(r.model.edges.length).toBeLessThanOrEqual(DEFAULT_LIMITS.maxEdges);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('caps the node count', () => {
    const src = 'flowchart TD\n' + repeat(11, (i) => `n${i}\n`);
    expect(codes(src, { maxNodes: 11 })).toEqual([]);
    expect(codes(src, { maxNodes: 10 })).toEqual(['NODE_LIMIT']);
  });

  it('caps subgraph nesting at 100 by default', () => {
    expect(codes(nested(100))).toEqual([]);
    const r = parseFlowchart(nested(101));
    expect(r.diagnostics.map((d) => d.code)).toEqual(['DEPTH_LIMIT']);
    expect(r.diagnostics[0]?.message).toMatch(/nested 101 deep.*limit of 100/);
    expect(codes(nested(1000), { maxDepth: 1000 })).toEqual([]);
  });
});

describe('render limits (through renderForTest until render() lands, #15)', () => {
  it('refuses source over 50,000 characters before reading it', async () => {
    const text = 'flowchart TD\n' + 'A-->B\n'.repeat(10000);
    expect(text.length).toBeGreaterThan(50_000);
    expect(await limitError(text)).toMatchObject({ code: 'LIMIT', limit: 'maxSourceLength' });
    await expect(
      renderForTest(text, { limits: { maxSourceLength: Infinity, maxEdges: Infinity } })
    ).resolves.toEqual(expect.objectContaining({ svg: expect.stringContaining('<svg') }));
  });

  it('turns each parse limit into a LimitError', async () => {
    expect(await limitError(chain(11), { limits: { maxEdges: 10 } })).toMatchObject({
      limit: 'maxEdges',
      max: 10,
    });
    expect(await limitError(chain(11), { limits: { maxNodes: 5 } })).toMatchObject({
      limit: 'maxNodes',
      max: 5,
    });
    expect(await limitError(nested(3), { limits: { maxDepth: 2 } })).toMatchObject({
      limit: 'maxDepth',
      max: 2,
    });
  });

  it("honours v12's integrator keys maxTextSize and maxEdges from initialize()", async () => {
    expect(await limitError(chain(11), { config: { maxEdges: 10 } })).toMatchObject({
      limit: 'maxEdges',
      max: 10,
    });
    expect(await limitError(chain(2), { config: { maxTextSize: 20 } })).toMatchObject({
      limit: 'maxSourceLength',
      max: 20,
    });
  });

  it('caps the size of the SVG', async () => {
    expect(await limitError(chain(3), { limits: { maxOutputLength: 100 } })).toMatchObject({
      limit: 'maxOutputLength',
      max: 100,
    });
  });

  describe('diagram text cannot raise a limit (R-SEC-5)', () => {
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
      const edges = await limitError(prefix + chain(11), { limits });
      expect(edges).toMatchObject({ limit: 'maxEdges', max: 10 });
      const depth = await limitError(prefix + nested(3), { limits });
      expect(depth).toMatchObject({ limit: 'maxDepth', max: 2 });
      // The v12 keys too, with the defaults in force.
      const product = `flowchart LR\n${ids(71, 'a')} --> ${ids(71, 'b')}\n`; // 5,041 edges
      expect(await limitError(prefix + product)).toMatchObject({ limit: 'maxEdges', max: 5000 });
      const long = prefix + 'flowchart TD\n' + '%% padding\n'.repeat(5000) + 'A\n';
      expect(await limitError(long)).toMatchObject({ limit: 'maxSourceLength', max: 50_000 });
    });

    it('and the attempt is reported as a secure-key warning', async () => {
      const r = await renderForTest(frontMatter + chain(1));
      expect(r.warnings.map((w) => w.code)).toContain('CONFIG_SECURE_KEY');
      expect(r.limits).toEqual(DEFAULT_LIMITS);
    });
  });
});
