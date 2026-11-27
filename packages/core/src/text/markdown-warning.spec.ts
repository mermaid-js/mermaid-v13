import { describe, expect, it } from 'vitest';
import { CORE_DEFAULTS } from '../config/index.ts';
import { resolveConfig } from '../config/resolve.ts';
import type { Warning } from '../pipeline/types.ts';
import { inlineSpans, labelSource } from './index.ts';
import type { LabelConfig } from './label-source.ts';
import {
  MARKDOWN_NOT_READ,
  markdownOutside,
  readLabel,
  warnMarkdownOutside,
  type MarkdownWarningContext,
} from './markdown-warning.ts';

const ON: LabelConfig = { markdownAlwaysOn: true };

const COUNTED = [
  '**b**',
  '__b__',
  '*i*',
  '_i_',
  'a **bold** b',
  'x _i_ y',
  '**a** and _b_',
  '**Note**.',
  '(*i*)',
  'line one\\n**two**',
  'a<br>*b*',
];
const NOT_COUNTED = [
  'snake_case',
  'a_b_c',
  'my_file_name.ts',
  '__init__.py',
  'run __main__.py now',
  '*',
  '"*"',
  '[*]',
  '**',
  '***',
  'a * b * c',
  '2*3*4',
  '** b **',
  '**b',
  '_a snake_case',
  'x_1 + y_2',
  'a `**b**` c',
  'a `_i_` c',
  'a lone ` backtick',
  '$$a_b + c_d$$',
  '$$x*y*z$$',
  '- a note that starts like a list',
  '<b>b</b> <i>i</i>',
  'plain text',
];

describe('markdownOutside (D732)', () => {
  it.each(COUNTED)('counts a pair of marks around text, with no options: %s', (label) => {
    expect(markdownOutside(label)).toBe(true);
  });

  it.each(NOT_COUNTED)('does not count %s', (label) => {
    expect(markdownOutside(label)).toBe(false);
  });

  it('counts in any label kind: the deprecated v12Markdown flag changes nothing', () => {
    expect(markdownOutside('**b**', { v12Markdown: false })).toBe(true);
    expect(markdownOutside('**b**', { v12Markdown: true })).toBe(true);
  });

  it('does not count a markdown string, quoted or marked by a parser', () => {
    expect(markdownOutside('"`**b**`"')).toBe(false);
    expect(markdownOutside('**b**', { markdown: true })).toBe(false);
  });

  it('does not count with markdownAlwaysOn: every label is read as markdown', () => {
    expect(markdownOutside('**b**', {}, ON)).toBe(false);
    expect(markdownOutside('**b**', {}, { markdownAlwaysOn: false })).toBe(true);
  });

  it('does not count when a diagram section sets markdownAlwaysOn', () => {
    const folded = resolveConfig(
      CORE_DEFAULTS,
      undefined,
      { class: { markdownAlwaysOn: true } },
      [],
      undefined,
      {
        section: 'class',
      }
    );
    expect(folded.markdownAlwaysOn).toBe(true);
    expect(markdownOutside('**b**', {}, folded)).toBe(false);
  });
});

describe('readLabel and warnMarkdownOutside (D732)', () => {
  /** A context as the API builds it: `inline.warn` gives each warning once per render. */
  const render = (
    config: LabelConfig = {},
    withInline = true
  ): { ctx: MarkdownWarningContext; warnings: Warning[] } => {
    const warnings: Warning[] = [];
    const warn = (w: Warning): void => void warnings.push(w);
    const ctx = { config, warn, inline: withInline ? inlineSpans([], warn) : undefined };
    return { ctx: ctx as unknown as MarkdownWarningContext, warnings };
  };

  it('returns what labelSource returns', () => {
    const { ctx } = render();
    for (const label of ['**a**', '"`**a**`"', 'a\\nb'])
      expect(readLabel(label, {}, ctx)).toEqual(labelSource(label));
    expect(readLabel('**a**', {}, render(ON).ctx)).toEqual(labelSource('**a**', {}, ON));
  });

  it('gives one warning per render, however many labels hold markdown', () => {
    const { ctx, warnings } = render();
    for (const label of ['**a**', '_b_', 'plain', '*c*', '__d__']) readLabel(label, {}, ctx);
    warnMarkdownOutside('**e**', { markdown: false, v12Markdown: true }, ctx);
    expect(warnings).toEqual([MARKDOWN_NOT_READ]);
  });

  it('gives it again in the next render', () => {
    for (let i = 0; i < 2; i++) {
      const { ctx, warnings } = render();
      warnMarkdownOutside('**a**', undefined, ctx);
      warnMarkdownOutside('**b**', undefined, ctx);
      expect(warnings).toHaveLength(1);
    }
  });

  it('names both ways back', () => {
    expect(MARKDOWN_NOT_READ.code).toBe('MARKDOWN_NOT_READ');
    expect(MARKDOWN_NOT_READ.message).toContain('"`…`"');
    expect(MARKDOWN_NOT_READ.message).toContain('markdownAlwaysOn: true');
  });

  it('gives none for ordinary text or a markdown string', () => {
    const { ctx, warnings } = render();
    for (const label of NOT_COUNTED) readLabel(label, {}, ctx);
    readLabel('"`**b**`"', {}, ctx);
    readLabel('**b**', { markdown: true }, ctx);
    expect(warnings).toEqual([]);
  });

  it('gives none with markdownAlwaysOn', () => {
    const { ctx, warnings } = render(ON);
    readLabel('**b**', {}, ctx);
    warnMarkdownOutside('_i_', {}, ctx);
    expect(warnings).toEqual([]);
  });

  it('warns through ctx.warn when the context has no inline spans', () => {
    const { ctx, warnings } = render({}, false);
    warnMarkdownOutside('**b**', {}, ctx);
    expect(warnings).toEqual([MARKDOWN_NOT_READ]);
  });
});
