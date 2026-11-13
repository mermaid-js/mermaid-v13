import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMermaid, type Warning } from './index.ts';

// HTML a label loses (R-TEXT-3, D564): one HTML_DROPPED warning per render, naming the tags.
const fixture = (name: string): string =>
  readFileSync(
    new URL(`../../../e2e/diagrams/flowchart/baseline/text/${name}.mmd`, import.meta.url),
    'utf8'
  );

async function draw(name: string): Promise<{ svg: string; text: string; warnings: Warning[][] }> {
  const mermaid = createMermaid();
  const source = fixture(name);
  await mermaid.prepare(source);
  const svg = mermaid.renderSync(source);
  await mermaid.prepare(source, { format: 'ascii' });
  const text = mermaid.renderSync(source, { format: 'ascii' });
  return { svg: svg.svg, text: text.text, warnings: [svg.warnings, text.warnings] };
}

const dropped = (warnings: Warning[]): string[] =>
  warnings.filter((w) => w.code === 'HTML_DROPPED').map((w) => w.message);

describe('HTML_DROPPED (R-TEXT-3, D564)', () => {
  it('names the tags of #691 once, in SVG and in text output', async () => {
    const { svg, text, warnings } = await draw('html-dropped-img');
    expect(svg).toContain('Logo 2');
    expect(text).toContain('Logo 2');
    for (const w of warnings) {
      expect(dropped(w)).toHaveLength(1);
      expect(dropped(w)[0]).toContain('<img>, <sub>');
      expect(dropped(w)[0]).not.toContain('click');
    }
  });

  it('points the links of #354 to click, once for the whole diagram', async () => {
    const { svg, warnings } = await draw('html-dropped-links');
    expect(svg).toContain('Companies');
    for (const w of warnings) {
      expect(dropped(w)).toHaveLength(1);
      expect(dropped(w)[0]).toContain('<a>');
      expect(dropped(w)[0]).toContain('click id "url"');
    }
  });

  it('drops <script> and <style> with their content, as v12', async () => {
    const { svg, text, warnings } = await draw('html-dropped-script');
    for (const out of [svg, text]) {
      expect(out).not.toMatch(/alert|\{ color/);
      expect(out).toContain('before after');
      expect(out).toContain('styled');
    }
    for (const w of warnings) {
      expect(dropped(w)).toHaveLength(1);
      expect(dropped(w)[0]).toContain('<script>, <style>');
    }
  });

  it('is silent for <br>, the bold and italic tags and text shaped like a tag', async () => {
    const { svg, warnings } = await draw('html-kept');
    expect(svg).toContain('List&lt;T&gt; and &lt;foo&gt;');
    expect(warnings.map(dropped)).toEqual([[], []]);
  });
});
