import { describe, expect, it } from 'vitest';
import { loadFixtures } from './fixtures.ts';
import { classifyFixtures, isSupported } from './support.ts';

describe('fixture support', () => {
  it('takes the supported types from the generated registry: rows with a v13 package', () => {
    expect(isSupported('flowchart-v2')).toBe(true);
    expect(isSupported('flowchart-elk')).toBe(true);
    expect(isSupported('sequence')).toBe(true);
    expect(isSupported('classDiagram')).toBe(true);
    expect(isSupported('journey')).toBe(true);
    expect(isSupported('gantt')).toBe(true);
    expect(isSupported('eventmodeling')).toBe(false);
  });

  it('runs every corpus diagram and the Pele flowcharts, sequence and class, and sets the rest aside by type', () => {
    const { supported, unsupported } = classifyFixtures(loadFixtures());
    expect(supported.filter((f) => f.set === 'corpus')).toHaveLength(158);
    expect(supported.filter((f) => f.set === 'pele').map((f) => f.id)).toEqual([
      'pele/flowchart-7',
      'pele/flowchart-50',
      'pele/flowchart-500',
      'pele/sequence',
      'pele/class',
    ]);
    expect(unsupported).toEqual([]);
  });

  it('detects through front-matter and directives, and keeps undetectable text as an error', () => {
    const fixture = (id: string, source: string) => ({ ...loadFixtures()[0]!, id, source });
    const { supported, unsupported } = classifyFixtures([
      fixture('x/front', '---\ntitle: t\n---\neventmodeling\n  tf 01 cmd Start\n'),
      fixture('x/init', '%%{init: {"theme": "dark"}}%%\ngraph TD\n  A --> B\n'),
      fixture('x/junk', 'not a diagram\n'),
    ]);
    expect(unsupported.map((u) => [u.id, u.type])).toEqual([['x/front', 'eventmodeling']]);
    // Text no detector claims still runs, so a broken fixture shows up as a render error.
    expect(supported.map((f) => f.id)).toEqual(['x/init', 'x/junk']);
  });
});
