import { describe, expect, it } from 'vitest';
import { c4TestConfig, c4TestContext, c4TestTheme } from '../test-context.ts';
import { prepareC4Beta } from './prepare.ts';
import { parseC4Beta } from './parser.ts';

// D682: the layered engine sets a label midway along the line that shows, so it is told which
// ends of a relation carry an arrowhead. Without `heads` it takes the target alone.
type RawGlob = (
  pattern: string,
  options: { query: '?raw'; import: 'default'; eager: true }
) => Readonly<Record<string, string>>;

// Vite's `import.meta.glob` reads the fixture, so the package needs no Node types.
const FIXTURE = Object.values(
  (import.meta as ImportMeta & { glob: RawGlob }).glob(
    '../../../../e2e/diagrams/c4beta/pr-check/undirected-relation.mmd',
    { query: '?raw', import: 'default', eager: true }
  )
)[0]!;

describe('a c4-beta relation', () => {
  it('tells the engine its arrowheads: none for `---`, both for `<-->`', async () => {
    const source = FIXTURE.replace(/^---\n[\s\S]*?\n---\n/, '');
    const theme = await c4TestTheme('default');
    const { model } = parseC4Beta(source);
    const { graph } = prepareC4Beta(model, c4TestContext(c4TestConfig(undefined, {}, true), theme));
    const none = { source: false, target: false };
    expect(graph.edges.map((e) => e.heads)).toEqual([
      none,
      none,
      undefined,
      { source: true, target: true },
    ]);
  });
});
