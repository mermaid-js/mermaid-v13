import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core';
import { preprocess } from '@mermaid-js/core/preprocess';
import { FIXTURES } from './layout/fixtures.ts';
import { journey } from './plugin.ts';

describe('journey plugin (spec #290)', () => {
  it('is a custom-layout SVG plugin for the journey config section', () => {
    expect(journey.id).toBe('journey');
    expect(journey.layoutKind).toBe('custom');
    expect(journey.formats).toEqual(['svg']);
  });

  it("detects v12's way: leading blanks, case-sensitive, no word boundary", () => {
    expect(journey.detector('journey\n  title x')).toBe(true);
    expect(journey.detector('  \n journey')).toBe(true);
    expect(journey.detector('journeyX')).toBe(true);
    expect(journey.detector('Journey')).toBe(false);
    expect(journey.detector('flowchart\njourney')).toBe(false);
  });

  it('parses with the preprocessed text it is given (T2 #302)', () => {
    const text = '---\ntitle: Front\n---\njourney\nsection S\nT: 3: Me';
    const result = journey.parse(text, {
      preprocessed: preprocess(text),
    } as unknown as DiagramParseContext);
    expect(result.diagnostics).toEqual([]);
    expect(result.model.title).toBe('Front');
    expect(result.model.tasks.map((t) => [t.ast, t.name, t.score, t.section])).toEqual([
      ['t:1', 'T', 3, 'S'],
    ]);
  });

  it('lists the title, section, task and named actor texts as labels', () => {
    expect(journey.labels(FIXTURES['before-first-section']!.model)).toEqual([
      'Later',
      'Later',
      'Early',
      'In a repeated section',
      'A',
      'B',
    ]);
    expect(journey.labels(FIXTURES['e-commerce']!.model)).toEqual([
      'E-Commerce',
      'Order from website',
      'Checkout from website',
      'Add to cart',
      'Add payment details',
      'Me',
    ]);
  });
});
