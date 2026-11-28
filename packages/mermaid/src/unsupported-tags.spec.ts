// A tag labels do not draw is drawn as written text, in SVG and in text output, in every diagram
// type and mode (R-TEXT-3, #1440, #1368). Nothing is dropped, so no render warns about tags.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Warning } from './index.ts';
import { corpusLabels, drawn, drawnRuns } from './testing/labels.ts';

const { svgOf, textOf } = corpusLabels(readFileSync);

/** The codes of `warnings` that speak of HTML. */
const html = (warnings: Warning[]): string[] =>
  warnings.map((w) => w.code).filter((c) => c.startsWith('HTML'));

/** The fixture's SVG, its labels, its text output, and the HTML warnings of both. */
async function draw(path: string): Promise<{
  svg: string;
  labels: string[];
  text: string;
  warned: string[];
}> {
  const svg = await svgOf(path);
  const text = await textOf(path);
  return {
    svg: svg.svg,
    labels: drawn(svg.svg),
    text: text.text,
    warned: [...html(svg.warnings), ...html(text.warnings)],
  };
}

/** No element of the label's markup reaches the SVG: every `<` of a label is escaped. */
const noElement = (svg: string, ...names: string[]): void => {
  for (const name of names) expect(svg).not.toMatch(new RegExp(`<${name}\\b`, 'i'));
};

describe('tags labels do not draw (R-TEXT-3, #1440)', () => {
  it('draws <img> as written, with its attributes (#691)', async () => {
    const out = await draw('flowchart/nightly-check/html-dropped-img.mmd');
    expect(out.labels.join(' ').replace(/\s+/g, '')).toBe(
      "<imgsrc='https://example.com/a.png'/>Logo2B"
    );
    for (const part of ['<img', "'/> Logo 2"]) expect(out.text).toContain(part);
    noElement(out.svg, 'img');
    expect(out.warned).toEqual([]);
  });

  it('draws <a> as written, with its text (#354)', async () => {
    const out = await draw('flowchart/nightly-check/html-dropped-links.mmd');
    const labels = out.labels.join('|').replace(/\s+/g, '');
    expect(labels).toContain(
      '<ahref=https://trello.com/c/m0kNPToP/173-investment-process>Source</a>'
    );
    expect(labels).toContain('Companies</a>(generatedorprepopulated)');
    for (const part of ['<a href=https://trello.com', 'Source</a>', 'Companies</a>'])
      expect(out.text).toContain(part);
    // The one link is the one `click` makes.
    expect(out.svg.match(/<a\b[^>]*>/g)).toEqual(['<a href="aaa.com">']);
    expect(out.warned).toEqual([]);
  });

  it('draws <script> and <style> as written, with what they hold', async () => {
    const out = await draw('flowchart/nightly-check/html-dropped-script.mmd');
    expect(out.labels.map((l) => l.replace(/\s+/g, ''))).toEqual([
      'before<script>alert(1)</script>after',
      '<style>.x{color:red}</style>styled',
      // `<br>` still breaks the line inside them.
      "<SCRIPTtype='text/javascript'>alert(2)alert(3)</SCRIPT>",
      '<script>alert(4)</script>',
    ]);
    for (const part of ['<script>alert(4', ')</script>', 'alert(3)</SCRIP'])
      expect(out.text).toContain(part);
    noElement(out.svg, 'script', 'style');
    expect(out.warned).toEqual([]);
  });

  it('keeps what follows a <script> or <style> with no end tag, and the tag', async () => {
    const out = await draw('flowchart/nightly-check/html-dropped-unclosed.mmd');
    expect(out.labels.map((l) => l.replace(/\s+/g, ''))).toEqual([
      'before<script>after',
      'a<style>.x{color:red}</style>b<script>c',
      'x<style>y<script>alert(1)</script>z',
    ]);
    for (const part of ['before <script>', '<script> c', ')</script> z'])
      expect(out.text).toContain(part);
    expect(out.warned).toEqual([]);
  });

  it('draws <span> with attributes as written, in a plain and a markdown string', async () => {
    const out = await draw('kanban/nightly-check/html-attribute-in-quoted-label.mmd');
    // Without white space: where a card wraps depends on the measurer, not on how tags are read.
    const flat = (l: string): string => l.replace(/ \/ /g, '').replace(/\s+/g, '');
    expect(out.labels.slice(0, 3).map(flat)).toEqual(
      Array(3).fill("<spanstyle='color:red'>red</span>text")
    );
    // The markdown string reads its emphasis and draws the tags as written.
    const markdown = drawnRuns(out.svg).filter((r) => r.includes('<b>text</b>'));
    expect(markdown.map(flat)).toEqual(["<spanstyle='color:red'>red</span><b>text</b>"]);
    for (const part of ["onclick='alert(1)", "'>click</span>", '>red</span> text'])
      expect(out.text).toContain(part);
    noElement(out.svg, 'span');
    expect(out.warned).toEqual([]);
  });

  it('draws <span> in a title, a railroad special and a mindmap icon text', async () => {
    const title = await svgOf('requirement/nightly-check/html-dropped-title.mmd');
    expect(drawn(title.svg)).toContain('A <span>styled</span> title');
    const railroad = await draw('railroad/nightly-check/label-markup.mmd');
    expect(railroad.labels).toContain('? <span>kept</span> text ?');
    expect(railroad.text).toContain('? <span>kept</span> bold ?');
    const icon = await svgOf('mindmap/nightly-check/html-dropped-icon-text.mmd');
    expect(drawn(icon.svg).join('|')).toContain('<span>fa</span> fa-book');
    for (const { warnings } of [title, icon]) expect(html(warnings)).toEqual([]);
    expect(railroad.warned).toEqual([]);
  });

  it('draws a class member whose generic type is named Style or Script as written (D619)', async () => {
    const { svg, warnings } = await svgOf(
      'class-diagram/nightly-check/generics-named-style-and-script.mmd'
    );
    expect(drawn(svg)).toEqual(['Sheet', '+List<Style> items', '+run(Map<Script> m) : void']);
    expect(html(warnings)).toEqual([]);
  });

  it('keeps text that only starts like <script> or <style>, with what follows', async () => {
    const out = await draw('flowchart/baseline/text/tag-shaped-script-style.mmd');
    expect(out.labels).toEqual([
      'edit <style.css> then reload',
      'open <script-x> now',
      'a <scripty> tag </scripty> stays',
    ]);
    for (const part of ['<style.css>', 'then reload', '<script-x>', 'now', '</scripty>', 'stays'])
      expect(out.text).toContain(part);
    expect(out.warned).toEqual([]);
  });

  it('draws <br>, the style tags and text shaped like a tag as before', async () => {
    const out = await draw('flowchart/baseline/text/html-kept.mmd');
    expect(out.labels).toContain('List<T> and <foo> stay');
    expect(out.warned).toEqual([]);
  });
});
