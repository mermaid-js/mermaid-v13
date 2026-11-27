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
    // ZenUML: a v12 diagram (external there) with no v13 package.
    expect(isSupported('zenuml')).toBe(false);
  });

  it('runs every corpus diagram and the compare flowcharts, sequence and class, and sets the rest aside by type', () => {
    const { supported, unsupported } = classifyFixtures(loadFixtures());
    expect(supported.filter((f) => f.set === 'corpus')).toHaveLength(158);
    expect(supported.filter((f) => f.set === 'compare').map((f) => f.id)).toEqual([
      'compare/flowchart-7',
      'compare/flowchart-50',
      'compare/flowchart-500',
      'compare/sequence',
      'compare/class',
    ]);
    expect(unsupported).toEqual([]);
  });

  it('detects through front-matter and directives, and keeps undetectable text as an error', () => {
    const fixture = (id: string, source: string) => ({ ...loadFixtures()[0]!, id, source });
    // Every v12 type has a package now, so the spec takes sequence as the unsupported one.
    const { supported, unsupported } = classifyFixtures(
      [
        fixture('x/front', `---\ntitle: t\n---\nsequenceDiagram\n  A->>B: hi\n`),
        fixture('x/init', '%%{init: {"theme": "dark"}}%%\ngraph TD\n  A --> B\n'),
        fixture('x/junk', 'not a diagram\n'),
      ],
      (type) => type !== 'sequence'
    );
    expect(unsupported.map((u) => [u.id, u.type])).toEqual([['x/front', 'sequence']]);
    // Text no detector claims still runs, so a broken fixture shows up as a render error.
    expect(supported.map((f) => f.id)).toEqual(['x/init', 'x/junk']);
  });
});
