/**
 * A character reference without its `;` (#1313, D709), through `createMermaid().render()`: in a
 * state note the `;` ends the statement, so `raw &lt; x` leaves `raw &lt`, which v12's browser
 * decoded as HTML text does. The source is the fixture.
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
  it('draws the state note "raw &lt" as "raw <"', async () => {
    const { svg } = await createMermaid().render('e', readFileSync(FIXTURE, 'utf8'));
    // The SVG escapes the decoded `<` once; the reference as written would be `&amp;lt`.
    expect(svg).toMatch(/>raw &lt;</);
    expect(svg).not.toContain('&amp;lt');
  });
});
