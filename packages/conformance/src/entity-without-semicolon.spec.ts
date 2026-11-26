/**
 * A character reference without its `;` (#1313, D709), through `createMermaid().render()`: a state
 * note's `raw &lt x`, which v12's browser decoded as HTML text does. In #1313 a `;` ended the note
 * right after `&lt`, which leaves the same text. The source is the fixture.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './index.ts';

const FIXTURE = join(
  REPO_ROOT,
  'e2e/diagrams/state-diagram-v2/nightly-check/entity-without-semicolon.mmd'
);

describe('a legacy entity name without a semicolon (#1313)', () => {
  it('draws the state note "raw &lt x" as "raw < x"', async () => {
    const { svg } = await createMermaid().render('e', readFileSync(FIXTURE, 'utf8'));
    // The SVG escapes the decoded `<` once; the reference as written would be `&amp;lt`.
    expect(svg).toMatch(/>raw &lt; x</);
    expect(svg).not.toContain('&amp;lt');
  });
});
