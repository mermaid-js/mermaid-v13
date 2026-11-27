/**
 * Reads the labels of a rendered SVG for the label-syntax specs of spec #1368: each `<text>` as
 * its lines, each line its runs with their style written as tags (`<b>`, `<i>`, `<code>` for a
 * monospace run), the blanks around a run outside its tags. Text drawn as written stays as the
 * SVG holds it (`&lt;` for a written `<`), so a drawn tag and a written one cannot be confused.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid, type MermaidConfig } from 'mermaid';
import { REPO_ROOT } from './index.ts';

/** One drawn `<text>`: its lines, and the lines joined with a blank. */
interface DrawnText {
  readonly lines: readonly string[];
  readonly flat: string;
}

const RE_TEXT = /<text[^>]*>([\s\S]*?)<\/text>/g;
const RE_RUN = /<tspan([^>]*)>([^<]*)<\/tspan>|([^<]+)/g;
const RE_SPLIT_RUN = /<\/(b|i|code)>(\s*)<\1>/g;

const styled = (attrs: string, text: string): string => {
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  if (!core) return text;
  let out = core;
  if (/font-family="[^"]*mono/.test(attrs)) out = `<code>${out}</code>`;
  if (attrs.includes('font-style="italic"')) out = `<i>${out}</i>`;
  if (attrs.includes('font-weight="bold"')) out = `<b>${out}</b>`;
  return `${lead}${out}${trail}`;
};

/** Every `<text>` of `svg`, in document order. */
function drawnTexts(svg: string): DrawnText[] {
  const out: DrawnText[] = [];
  for (const [, body] of svg.matchAll(RE_TEXT)) {
    const lines: string[] = [];
    let line = '';
    for (const [, attrs = '', inner, bare] of body!.matchAll(RE_RUN)) {
      if (attrs.includes(' y="') && line !== '') {
        lines.push(line.trim());
        line = '';
      }
      line += styled(attrs, inner ?? bare ?? '');
    }
    lines.push(line.trim());
    // A run split over lines, or into words, is one run.
    out.push({ lines, flat: lines.join(' ').replace(RE_SPLIT_RUN, '$2') });
  }
  return out;
}

/** A fixture of `e2e/diagrams/<path>`, as written. */
export const fixture = (path: string): string =>
  readFileSync(join(REPO_ROOT, 'e2e/diagrams', path), 'utf8');

/** `source` rendered through the public API: its drawn texts and its warning codes. */
export async function renderLabels(
  source: string,
  config: MermaidConfig = {}
): Promise<{ texts: DrawnText[]; flat: string[]; codes: string[] }> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  const { svg, warnings } = await m.render('labels', source);
  const texts = drawnTexts(svg);
  return { texts, flat: texts.map((t) => t.flat), codes: warnings.map((w) => w.code) };
}

/**
 * What the label-syntax fixtures draw for the label kind `kind` (#1368): the six ways of
 * writing, in the default mode and with `markdownAlwaysOn`. Whole labels, as `flat` holds them;
 * a label may be wrapped, so a spec compares them with blanks folded.
 */
function expectedLabels(
  kind: string,
  alwaysOn: boolean,
  wrap: (label: string) => string = (label) => label
): Record<string, string> {
  const md = `${kind} <b>bold</b> <i>ital</i>`;
  const labels: Record<string, string> = {
    plain: alwaysOn ? md : `${kind} **bold** _ital_`,
    quoted: md,
    bare: alwaysOn ? `<code>${kind} **bold** _ital_</code>` : `\`${kind} **bold** _ital_\``,
    code: alwaysOn ? `${kind} a <code>code</code> b` : `${kind} a \`code\` b`,
    tags: `${kind} <b>bold</b> <i>ital</i> next H2O`,
    newline: `${kind} one two`,
  };
  for (const way of Object.keys(labels)) labels[way] = wrap(labels[way]!);
  return labels;
}

/** A type's label-syntax fixtures and how its labels read (#1368). */
interface LabelSyntaxSuite {
  /** The fixtures' folder under `e2e/diagrams`. */
  readonly folder: string;
  /** The config section that may set `markdownAlwaysOn` for the type. */
  readonly section: string;
  /** The label kinds the fixtures name, as each label starts. */
  readonly kinds: readonly string[];
  /** Ways of writing a kind leaves out, where its syntax has none (`quoted`, `bare`, …). */
  readonly without?: Readonly<Record<string, readonly string[]>>;
  /** How a label is drawn around its text (a railroad special's `? … ?`). */
  readonly wrap?: (label: string) => string;
  /** A diagram whose labels of every kind are quoted markdown strings: it gives no warning. */
  readonly quoted: string;
}

/**
 * The label rule over a type's `pr-check/label-syntax.mmd` and its `markdownAlwaysOn` twin
 * (#1368): every label kind, each written the six ways, drawn as the rule says in both modes;
 * the setting from the front matter, from the top level and from the type's section; one
 * `MARKDOWN_NOT_READ` per render in the default mode, none with the setting or for markdown
 * strings alone.
 */
export function labelSyntaxSuite(suite: LabelSyntaxSuite): void {
  const source = fixture(`${suite.folder}/pr-check/label-syntax.mmd`);
  const twin = fixture(`${suite.folder}/pr-check/label-syntax-compat.mmd`);
  const drawsAll = (flat: readonly string[], alwaysOn: boolean): void => {
    for (const kind of suite.kinds)
      for (const [way, label] of Object.entries(expectedLabels(kind, alwaysOn, suite.wrap)))
        if (!suite.without?.[kind]?.includes(way))
          expect([kind, way, flat.includes(label) ? label : flat]).toEqual([kind, way, label]);
  };

  describe(`${suite.folder} labels (#1368)`, () => {
    it('reads markdown only in a quoted markdown string, and warns once', async () => {
      const { flat, codes } = await renderLabels(source);
      drawsAll(flat, false);
      expect(codes.filter((c) => c === 'MARKDOWN_NOT_READ')).toEqual(['MARKDOWN_NOT_READ']);
    });

    it('breaks a label at a written \\n', async () => {
      const { texts } = await renderLabels(source);
      for (const kind of suite.kinds) {
        const text = texts.find((t) => t.flat.includes(`${kind} one two`));
        expect(text?.lines.length, kind).toBeGreaterThan(1);
        expect(
          text?.lines.findIndex((l) => l.endsWith(`${kind} one`)),
          kind
        ).toBeGreaterThan(-1);
      }
    });

    for (const [how, text, config] of [
      ['in the front matter', twin, {}],
      ['globally', source, { markdownAlwaysOn: true }],
      [`in the ${suite.section} section`, source, { [suite.section]: { markdownAlwaysOn: true } }],
    ] as const)
      it(`reads every label as markdown with markdownAlwaysOn set ${how}`, async () => {
        const { flat, codes } = await renderLabels(text, config);
        drawsAll(flat, true);
        expect(codes).not.toContain('MARKDOWN_NOT_READ');
      });

    it('gives no warning for markdown strings', async () => {
      const { codes } = await renderLabels(suite.quoted);
      expect(codes).not.toContain('MARKDOWN_NOT_READ');
    });
  });
}
