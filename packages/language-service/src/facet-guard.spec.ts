/**
 * A facet query that throws does not fail the query (#809, R-LANG-4: "No query throws at any
 * offset"). A third-party facet's `hover`, `completions` and `isValidId` are guarded like its
 * `parse` (D157): hover gives `undefined`, completions `[]`, rename a refusal naming the
 * failure, at every offset.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flowchartLanguage } from '@mermaid-js/diagram-flowchart/language';
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from './index.ts';
import { readFixture } from './testing/goldens.ts';

const GOLDENS = join(import.meta.dirname, '..', 'goldens');
const fixture = (path: string) => readFixture(readFileSync(join(GOLDENS, path), 'utf8')).text;

/** Flowchart's facet (real parses and probes) whose queries throw, with a count of each call. */
function throwing() {
  const calls = { hover: 0, completions: 0, isValidId: 0 };
  const facet: LanguageFacet = {
    ...flowchartLanguage,
    hover: () => {
      calls.hover++;
      throw new Error('boom hover');
    },
    completions: () => {
      calls.completions++;
      throw new Error('boom completions');
    },
    isValidId: () => {
      calls.isValidId++;
      throw new Error('boom isValidId');
    },
  };
  // A third-party row in place of the first-party flowchart row (same type).
  const row = {
    type: 'flowchart-v2',
    id: 'flowchart',
    detector: (t: string) => /^\s*flowchart/.test(t),
    facet,
  };
  return { calls, service: createLanguageService({ facets: [row] }) };
}

describe('a facet whose queries throw (#809)', () => {
  it.each(['flowchart/rename/node.mmd', 'flowchart/hover/node.mmd'])(
    'gives undefined, [] and a refusal at every offset of %s',
    async (path) => {
      const { calls, service } = throwing();
      await service.preload();
      const text = fixture(path);
      const doc = service.update('guard:///doc.mmd', text);
      expect(doc.diagnostics().filter((d) => d.severity === 'error')).toEqual([]);
      for (let offset = 0; offset <= text.length; offset++) {
        expect(doc.hover(offset), `hover at ${offset}`).toBeUndefined();
        expect(doc.completions(offset), `completions at ${offset}`).toEqual([]);
        const renamed = doc.rename(offset, 'Zed');
        expect(renamed, `rename at ${offset}`).toHaveProperty('refused');
        if (!('refused' in doc.prepareRename(offset)))
          expect((renamed as { refused: string }).refused).toBe(
            'The flowchart language support failed on this rename (boom isValidId).'
          );
      }
      // Each guarded call was reached: the probes gave results, and names were there to rename.
      expect(calls.hover).toBeGreaterThan(0);
      expect(calls.completions).toBeGreaterThan(0);
      expect(calls.isValidId).toBeGreaterThan(0);
    }
  );

  it('keeps the other diagram keywords on the header line of an undetected text', async () => {
    const parse: LanguageFacet['parse'] = (text, options) => {
      if (options.probe !== undefined) throw new Error('boom probe');
      return flowchartLanguage.parse(text, options);
    };
    const service = createLanguageService({
      facets: [
        {
          type: 'boomchart',
          id: 'boomchart',
          detector: (t) => t.startsWith('boomchart'),
          facet: { ...flowchartLanguage, id: 'boomchart', parse },
        },
      ],
    });
    await service.preload();
    const labels = service
      .update('guard:///empty.mmd', 'seq')
      .completions(3)
      .map((i) => i.label);
    expect(labels).toContain('sequenceDiagram');
  });

  it('leaves first-party queries as they were', async () => {
    const service = createLanguageService();
    await service.preload();
    const text = fixture('flowchart/rename/node.mmd');
    const doc = service.update('guard:///first-party.mmd', text);
    const a = text.indexOf('A -->');
    expect(doc.hover(a)?.contents).toContain('node');
    expect(doc.completions(a + 2).length).toBeGreaterThan(0);
    expect(doc.rename(a, 'Start')).toHaveProperty('edits');
  });
});
