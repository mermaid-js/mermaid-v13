import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

async function ascii(text: string, options?: { maxWidth?: number; charset?: 'ascii' | 'unicode' }) {
  const m = createMermaid();
  await m.prepare(text, { format: 'ascii', ...(options ? { ascii: options } : {}) });
  return m.renderSync(text, { format: 'ascii', ...(options ? { ascii: options } : {}) });
}

describe('edges between a group and its own member (D82, #42)', () => {
  it('keeps the group title and corners when such an edge has a label', async () => {
    const { text } = await ascii('flowchart TB\nsubgraph SG [Grp]\nA\nend\nSG -->|lbl| A');
    const [top, second] = text.split('\n');
    expect(top).toMatch(/^┌.*Grp.*┐$/);
    expect(second).toContain('lbl');
  });

  // #198: the labels sit inside the frame, whole, clear of each other and of the member.
  it.each([
    ['flowchart TB\nsubgraph SG [Grp]\nA\nend\nSG -->|lbl| A', ['lbl']],
    [
      'flowchart TB\nsubgraph SG [Grp]\nA --> B\nend\nSG -->|a label| A\nB -->|back| SG',
      ['a label', 'back'],
    ],
    ['erDiagram\nsubgraph G [Grp]\nA\nend\nG ||--o{ A : has', ['has']],
  ])('keeps the frame whole round such labels: %s', async (input, labels) => {
    const rows = (await ascii(input)).text.split('\n');
    const frame = rows.slice(1, -1);
    for (const row of frame) expect(row).toMatch(/^│.*│$/);
    for (const label of labels) {
      expect(
        frame.some((r) => r.includes(` ${label} `)),
        label
      ).toBe(true);
    }
  });

  it('points the arrowhead towards the frame for an edge from a member to its group', async () => {
    expect(
      (await ascii('flowchart TB\nsubgraph S [Group]\nA\nend\nA --> S')).text.split('\n')[0]
    ).toContain('▲');
    expect(
      (
        await ascii('flowchart TB\nsubgraph S [Group]\nA\nend\nA --> S', { charset: 'ascii' })
      ).text.split('\n')[0]
    ).toContain('^');
    expect((await ascii('flowchart TB\nsubgraph S [Group]\nA\nend\nS --> A')).text).toContain('▼');
  });
});

describe('warnings', () => {
  it('warns about a curve set in config (R-ASCII-5)', async () => {
    const { warnings } = await ascii(
      '%%{init: {"flowchart": {"curve": "basis"}}}%%\nflowchart LR\nA --> B'
    );
    expect(
      warnings.some((w) => w.code === 'ASCII_DROPPED' && 'feature' in w && w.feature === 'curve')
    ).toBe(true);
  });

  it('does not warn about the default curve', async () => {
    const { warnings } = await ascii('flowchart LR\nA --> B');
    expect(warnings).toEqual([]);
  });
});

describe('text details', () => {
  it('keeps a bullet written in the label text', async () => {
    expect((await ascii('flowchart LR\nA["a • b"]', { charset: 'ascii' })).text).toContain('a • b');
  });

  it('wraps a long front-matter title to maxWidth instead of overflowing', async () => {
    const title = 'A rather long title that is much wider than the diagram below it';
    const r = await ascii(`---\ntitle: ${title}\n---\nflowchart LR\na --> b`, { maxWidth: 30 });
    expect(r.columns).toBeLessThanOrEqual(30);
    expect(r.warnings.map((w) => w.code)).not.toContain('ASCII_TOO_WIDE');
    expect(r.text.replace(/\s+/g, ' ')).toContain(title);
  });
});
