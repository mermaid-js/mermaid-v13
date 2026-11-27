// #836, D610: a v12 Markdown label (mindmap, requirement, class) that holds a code span
// still reads the bold and italic outside the span, and draws the span, with the stars inside it,
// as written. Each type's `baseline/text/emphasis-beside-code-span.mmd` holds the cases.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid } from './index.ts';

const fixture = (dir: string): string =>
  readFileSync(
    new URL(
      `../../../e2e/diagrams/${dir}/baseline/text/emphasis-beside-code-span.mmd`,
      import.meta.url
    ),
    'utf8'
  );

/** Each `<tspan>`'s text with whether it is bold or italic, in document order. */
const spans = (svg: string): string[] =>
  [...svg.matchAll(/<tspan([^>]*)>([^<]*)<\/tspan>/g)].map(([, attrs, text]) => {
    const bold = attrs!.includes('font-weight="bold"') ? 'b:' : '';
    const italic = attrs!.includes('font-style="italic"') ? 'i:' : '';
    return `${bold}${italic}${text!}`;
  });

describe.each([
  { type: 'mindmap', dir: 'mindmap' },
  { type: 'requirement', dir: 'requirement' },
  { type: 'class', dir: 'class-diagram' },
])('emphasis beside a code span in $type (#836, D610)', ({ dir }) => {
  it('reads the emphasis outside the span and draws the span as written', async () => {
    const { svg, warnings } = await createMermaid().render('d', fixture(dir));
    expect(warnings).toEqual([]);
    assertInert(svg);
    const drawn = spans(svg);
    expect(drawn).toContain('b:bold');
    expect(drawn.some((s) => s.includes(' and `code`'))).toBe(true);
    // A requirement's name is bold as a whole.
    expect(drawn.some((s) => s.endsWith('i:italic'))).toBe(true);
    expect(drawn.some((s) => s.includes('`**not bold**`'))).toBe(true);
    expect(drawn.some((s) => s.includes('`x_1`'))).toBe(true);
    // The character references the label reader adds are drawn as the characters.
    expect(svg).not.toMatch(/&amp;#(42|95);|&#(42|95);/);
    expect(svg).not.toContain('**bold**');
  });
});

// State's fixture sets markdownAlwaysOn (#1368): its labels are markdown, so the span is inline
// code, without its backticks, and the stars inside it are text.
describe('emphasis beside a code span in state, with markdownAlwaysOn (#836, #1368)', () => {
  it('reads the emphasis outside the span and draws the span as inline code', async () => {
    const { svg, warnings } = await createMermaid().render('d', fixture('state-diagram-v2'));
    expect(warnings).toEqual([]);
    assertInert(svg);
    const drawn = spans(svg);
    expect(drawn).toContain('b:bold');
    expect(drawn).toContain('i:italic');
    expect(drawn).toContain('**not bold**');
    expect(drawn).toContain('x_1');
    expect(svg).not.toContain('`');
    expect(svg).not.toContain('**bold**');
  });
});
