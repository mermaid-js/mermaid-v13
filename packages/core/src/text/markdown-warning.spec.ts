import { describe, expect, it } from 'vitest';
import type { Warning } from '../pipeline/types.ts';
import { inlineSpans, labelSource, layoutLabel, tableMeasurer, type FontKey } from './index.ts';
import type { LabelConfig, LabelSourceOptions } from './label-source.ts';
import {
  MARKDOWN_NOT_READ,
  markdownOutside,
  warnMarkdownOutside,
  type MarkdownWarningContext,
} from './markdown-warning.ts';

const FLAGGED: LabelSourceOptions = { v12Markdown: true };
const DEFAULT: LabelConfig = { legacyMarkdown: false };
const LEGACY: LabelConfig = { legacyMarkdown: true };

const outside = (label: string): boolean => markdownOutside(label, FLAGGED, DEFAULT);

const font: FontKey = { family: 'Arial', size: 10, weight: 400 };
/** The label's runs, `[text, style]` per run, per line, drawn with `config`. */
const drawn = (label: string, config: LabelConfig): [string, number][][] => {
  const source = labelSource(label, FLAGGED, config);
  return layoutLabel(source.text, font, Infinity, tableMeasurer, source).lines.map((line) =>
    line.map((r): [string, number] => [r.text, r.style])
  );
};
/** Whether the compatibility mode draws the label otherwise than the default mode. */
const drawnOtherwise = (label: string): boolean =>
  JSON.stringify(drawn(label, LEGACY)) !== JSON.stringify(drawn(label, DEFAULT));

const COUNTED = ['**b**', '__b__', '*i*', '_i_', 'a **bold** b', 'x _i_ y', '**a** and _b_'];
const NOT_COUNTED = [
  'snake_case',
  'a_b_c',
  '*',
  '"*"',
  '[*]',
  'a * b * c',
  '** b **',
  '**b',
  'a `**b**` c',
  'a `_i_` c',
  '- *item*',
  '<b>b</b> <i>i</i>',
  'plain text',
];

describe('markdownOutside (D732)', () => {
  it.each(COUNTED)('counts a pair of marks around text: %s', (label) => {
    expect(outside(label)).toBe(true);
  });

  it.each(NOT_COUNTED)('does not count %s', (label) => {
    expect(outside(label)).toBe(false);
  });

  it('counts exactly the labels the compatibility mode draws otherwise', () => {
    for (const label of [...COUNTED, ...NOT_COUNTED])
      expect([label, outside(label)]).toEqual([label, drawnOtherwise(label)]);
  });

  it('counts a pair only: a mark that opens and never closes does not count', () => {
    // Core's emphasis reader draws the rest of the line italic here; v12 (marked) drew none.
    expect(drawnOtherwise('_a snake_case')).toBe(true);
    expect(outside('_a snake_case')).toBe(false);
  });

  it('keeps emphasis in its line: a pair split by a break does not count', () => {
    expect(outside('*a<br>b*')).toBe(false);
    expect(outside('*a\\nb*')).toBe(false);
    expect(outside('a<br>*b*')).toBe(true);
  });

  it('does not count a markdown string, quoted or marked by a parser', () => {
    expect(outside('"`**b**`"')).toBe(false);
    expect(markdownOutside('**b**', { markdown: true, v12Markdown: true }, DEFAULT)).toBe(false);
  });

  it('does not count a label kind without the flag', () => {
    expect(markdownOutside('**b**', { v12Markdown: false }, DEFAULT)).toBe(false);
    expect(markdownOutside('**b**', {}, DEFAULT)).toBe(false);
    expect(markdownOutside('**b**')).toBe(false);
  });

  it('does not count with legacyMarkdown set: the markdown is drawn as v12 drew it', () => {
    expect(markdownOutside('**b**', FLAGGED, LEGACY)).toBe(false);
  });

  it('counts with no config, as the default mode', () => {
    expect(markdownOutside('**b**', FLAGGED)).toBe(true);
  });
});

describe('warnMarkdownOutside (D732)', () => {
  /** A context as the API builds it: `inline.warn` gives each warning once per render. */
  const render = (
    config = DEFAULT,
    withInline = true
  ): { ctx: MarkdownWarningContext; warnings: Warning[] } => {
    const warnings: Warning[] = [];
    const warn = (w: Warning): void => void warnings.push(w);
    const ctx = { config, warn, inline: withInline ? inlineSpans([], warn) : undefined };
    return { ctx: ctx as unknown as MarkdownWarningContext, warnings };
  };

  it('gives one warning per render, however many labels hold markdown', () => {
    const { ctx, warnings } = render();
    for (const label of ['**a**', '_b_', 'plain', '*c*', '__d__'])
      warnMarkdownOutside(label, FLAGGED, ctx);
    expect(warnings).toEqual([MARKDOWN_NOT_READ]);
  });

  it('gives it again in the next render', () => {
    for (let i = 0; i < 2; i++) {
      const { ctx, warnings } = render();
      warnMarkdownOutside('**a**', FLAGGED, ctx);
      warnMarkdownOutside('**b**', FLAGGED, ctx);
      expect(warnings).toHaveLength(1);
    }
  });

  it('names both ways back', () => {
    expect(MARKDOWN_NOT_READ.code).toBe('MARKDOWN_NOT_READ');
    expect(MARKDOWN_NOT_READ.message).toContain('"`…`"');
    expect(MARKDOWN_NOT_READ.message).toContain('legacyMarkdown: true');
  });

  it('gives none for a label that does not count, a markdown string or an unflagged kind', () => {
    const { ctx, warnings } = render();
    for (const label of ['snake_case', '[*]', '"*"', 'a `*b*` c'])
      warnMarkdownOutside(label, FLAGGED, ctx);
    warnMarkdownOutside('"`**b**`"', FLAGGED, ctx);
    warnMarkdownOutside('**b**', { markdown: true, v12Markdown: true }, ctx);
    warnMarkdownOutside('**b**', { v12Markdown: false }, ctx);
    expect(warnings).toEqual([]);
  });

  it('gives none with legacyMarkdown set', () => {
    const { ctx, warnings } = render(LEGACY);
    warnMarkdownOutside('**b**', FLAGGED, ctx);
    expect(warnings).toEqual([]);
  });

  it('warns through ctx.warn when the context has no inline spans', () => {
    const { ctx, warnings } = render(DEFAULT, false);
    warnMarkdownOutside('**b**', FLAGGED, ctx);
    expect(warnings).toEqual([MARKDOWN_NOT_READ]);
  });
});
