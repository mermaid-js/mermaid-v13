/**
 * No invalid item at the probe-spec offsets (#32 acceptance): at every cursor of the
 * completion goldens, applying any item offered leaves no error inside the inserted text. An
 * item the parser would not accept there (`end` outside a subgraph, an arrow in a label)
 * fails here. Errors after the inserted text are the rest of the statement still to be
 * written, and an `UNCLOSED_*` error is a block opened whose end is still to be written.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from './index.ts';
import { goldenCases, readFixture } from './testing/goldens.ts';
import { PENDING_FACETS } from './testing/pending-facets.ts';

const ROOT = join(import.meta.dirname, '..', 'goldens');
const service = createLanguageService({ facets: PENDING_FACETS });
beforeAll(() => service.preload());

const cases = goldenCases(ROOT).filter((c) => c.feature === 'completions');

describe('completion items are valid where they are offered', () => {
  it('reads the completion goldens', () => {
    expect(cases.length).toBeGreaterThan(10);
  });

  it.each(cases.map((c) => [`${c.diagram}/${c.name}`, c.input]))('%s', (_, input) => {
    const fixture = readFixture(readFileSync(input, 'utf8'));
    const doc = service.update('file:///valid.mmd', fixture.text);
    const problems: string[] = [];
    let offered = 0;
    for (const at of fixture.markers) {
      for (const item of doc.completions(at)) {
        offered++;
        const { start, end } = item.range;
        const text = fixture.text.slice(0, start) + item.insertText + fixture.text.slice(end);
        const after = service.update('file:///valid-after.mmd', text);
        const stop = start + item.insertText.length;
        const bad = after
          .diagnostics()
          .filter(
            (d) =>
              d.severity === 'error' &&
              !d.code.startsWith('UNCLOSED_') &&
              d.range.start >= start &&
              d.range.start < stop
          );
        for (const d of bad) problems.push(`@${at} ${item.label}: ${d.code} ${d.message}`);
      }
    }
    expect(problems).toEqual([]);
    if (fixture.markers.length > 0 && !input.includes('not-code')) {
      expect(offered).toBeGreaterThan(0);
    }
  });
});
