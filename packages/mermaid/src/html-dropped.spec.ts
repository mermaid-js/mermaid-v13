// HTML a label loses (R-TEXT-3, D564): one HTML_DROPPED warning per render, naming the tags.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Warning } from './index.ts';
import { corpusLabels, drawn } from './testing/labels.ts';

const { svgOf, textOf } = corpusLabels(readFileSync);

const dropped = (warnings: Warning[]): string[] =>
  warnings.filter((w) => w.code === 'HTML_DROPPED').map((w) => w.message);

/** The labels the fixture draws as SVG, its text output, and each one's `HTML_DROPPED` messages. */
async function draw(
  path: string
): Promise<{ labels: string[]; text: string; dropped: string[][] }> {
  const svg = await svgOf(path);
  const text = await textOf(path);
  return {
    labels: drawn(svg.svg),
    text: text.text,
    dropped: [dropped(svg.warnings), dropped(text.warnings)],
  };
}

describe('HTML_DROPPED (R-TEXT-3, D564)', () => {
  it('names the tags of #691 once, in SVG and in text output', async () => {
    const out = await draw('flowchart/nightly-check/html-dropped-img.mmd');
    expect(out.labels).toContain('Logo 2');
    expect(out.text).toContain('Logo 2');
    for (const messages of out.dropped) {
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('<img>, <sub>');
      expect(messages[0]).not.toContain('click');
    }
  });

  it('points the links of #354 to click, once for the whole diagram', async () => {
    const out = await draw('flowchart/nightly-check/html-dropped-links.mmd');
    expect(out.labels.join('|')).toContain('Companies');
    for (const messages of out.dropped) {
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('<a>');
      expect(messages[0]).toContain('click id "url"');
    }
  });

  it('drops <script> and <style> with their content, as v12', async () => {
    const out = await draw('flowchart/nightly-check/html-dropped-script.mmd');
    expect(out.labels.map((l) => l.trim())).toEqual(['before after', 'styled', '', '']);
    expect(out.text).not.toMatch(/alert|\{ color/);
    expect(out.text).toContain('before after');
    expect(out.text).toContain('styled');
    expect(out.dropped).toEqual([
      ['Labels do not draw <script>, <style>.'],
      ['Labels do not draw <script>, <style>.'],
    ]);
  });

  it('keeps what follows a <script> or <style> with no end tag, and drops the tag', async () => {
    const out = await draw('flowchart/nightly-check/html-dropped-unclosed.mmd');
    expect(out.labels).toEqual(['before after', 'a b c', 'x y z']);
    for (const label of out.labels) expect(out.text).toContain(label);
    expect(out.text).not.toMatch(/alert|\{ color/);
    for (const messages of out.dropped) expect(messages[0]).toContain('<script>, <style>');
  });

  it('keeps the rest of a class member whose generic type is named Style or Script', async () => {
    const { svg } = await svgOf('class-diagram/nightly-check/generics-named-style-and-script.mmd');
    expect(drawn(svg)).toEqual(['Sheet', '+List items', '+run(Map m) : void']);
  });

  it('keeps text that only starts like <script> or <style>, with what follows', async () => {
    const out = await draw('flowchart/baseline/text/tag-shaped-script-style.mmd');
    const labels = [
      'edit <style.css> then reload',
      'open <script-x> now',
      'a <scripty> tag </scripty> stays',
    ];
    expect(out.labels).toEqual(labels);
    for (const part of ['<style.css>', 'then reload', '<script-x>', 'now', '</scripty>', 'stays'])
      expect(out.text).toContain(part);
    expect(out.dropped).toEqual([[], []]);
  });

  it('is silent for <br>, the bold and italic tags and text shaped like a tag', async () => {
    const out = await draw('flowchart/baseline/text/html-kept.mmd');
    expect(out.labels).toContain('List<T> and <foo> stay');
    expect(out.dropped).toEqual([[], []]);
  });
});
