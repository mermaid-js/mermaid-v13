/**
 * One label rule across types (D710, spec #1333 T9, #1230): each type's label-markup fixture is
 * rendered through `render()`, and its labels are read back from the SVG. A `<br>` gives a label
 * of two lines, a `<b>` a bold run, and a markdown string (a whole label in backticks) a bold run
 * with no backtick left; `**x**` without backticks and railroad's terminals are drawn exactly as
 * written. Each case lists only what its fixture holds, as drawn text: the sources are the
 * fixtures.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';
import { parseSvg, type SvgElement, type SvgView } from './svg-tree.ts';

/** What one fixture shows, as drawn text. A label's lines are joined with `\n`. */
interface Case {
  readonly file: string;
  /** Labels with a `<br>`: each line's text. */
  readonly br?: readonly (readonly string[])[];
  /** Plain labels with a `<b>`: the label's text and its bold run. */
  readonly tag?: readonly (readonly [string, string])[];
  /** Markdown strings: the label's text, without its backticks, and its bold run. */
  readonly md?: readonly (readonly [string, string])[];
  /** Labels drawn exactly as written: no line break, no bold or italic run. */
  readonly literal?: readonly string[];
}

const CASES: Readonly<Record<string, Case>> = {
  architecture: {
    file: 'architecture/nightly-check/label-markup.mmd',
    br: [
      ['Line one', 'Line two'],
      ['x', 'y'],
    ],
    tag: [['Bold it under', 'Bold']],
    md: [
      ['bold italic', 'bold'],
      ['Cloud group', 'Cloud'],
      ['edge\nlabel', 'edge'],
      ['T', 'T'],
    ],
    literal: ['**literal** *stars*'],
  },
  flowchart: {
    file: 'flowchart/nightly-check/html-drawn-tags.mmd',
    br: [['under ins', 'strike old del', 'both']],
  },
  journey: {
    file: 'journey/nightly-check/markdown-strings.mmd',
    br: [['Two', 'lines']],
    tag: [['Plain **task** tag', 'tag']],
    md: [
      ['Bold and italic title', 'Bold'],
      ['Markdown section', 'Markdown'],
      ['md task', 'md'],
      ['Me', 'Me'],
    ],
    literal: ['Plain **section**'],
  },
  kanban: {
    file: 'kanban/nightly-check/plain-vs-markdown.mmd',
    br: [['First', 'second & bold it']],
    tag: [['First\nsecond & bold it', 'bold']],
    md: [
      ['bold card', 'bold'],
      ['md', 'md'],
    ],
    literal: ['Use `npm ci` first', '- not a list', '1. not a list either', '**stars** stay'],
  },
  railroad: {
    file: 'railroad/nightly-check/label-markup.mmd',
    br: [['? first', 'second ?']],
    // A special sequence draws its tags and decodes its entities.
    tag: [
      ['? bold and italic ?', 'bold'],
      ['? a < b & c, <b> ?', '<b>'],
    ],
    md: [['? bold and italic ?', 'bold']],
    // Terminals stay as written, a tag and a typed entity included (D710, amending D563), and
    // so does `**x**` in a special sequence. The fixture writes its entities without `;`, which
    // the e2e page (`asHostText`) passes on unchanged.
    literal: [
      '<b>bold</b>',
      '**not bold**',
      'a<br>b',
      '`**md**`',
      '<i>&lt x&gt</i> &amp &#60',
      '? **stays literal** ?',
    ],
  },
  swimlane: {
    file: 'swimlanes/nightly-check/lane-title-markdown.mmd',
    br: [['two', 'lines bold & it']],
    tag: [['two\nlines bold & it', 'bold']],
    md: [
      ['Italic bold lane', 'bold'],
      ['Bare lane', 'Bare'],
    ],
    literal: ['**Bold** lane'],
  },
  timeline: {
    file: 'timeline/nightly-check/label-markup.mmd',
    br: [['first', 'second']],
    tag: [
      ['Label markup', 'markup'],
      ['bold and italic', 'bold'],
    ],
    md: [
      ['Markdown string', 'Markdown'],
      ['bold and italic', 'bold'],
    ],
    literal: ['**stays literal**', 'List<T> stays text'],
  },
  venn: {
    file: 'venn/nightly-check/markdown-labels.mmd',
    br: [['Plain tag', 'two lines']],
    tag: [['Plain tag\ntwo lines', 'tag']],
    md: [
      ['bold set', 'bold'],
      ['both', 'both'],
    ],
    literal: ['**literal**'],
  },
};

interface Run {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
}

/** One drawn `<text>`: its lines, each a list of runs. */
interface Label {
  readonly lines: readonly (readonly Run[])[];
  /** The lines' text, trimmed, joined with `\n`. */
  readonly text: string;
}

const own = (tree: SvgView, n: SvgElement): string =>
  tree
    .children(n)
    .map((c) => tree.textOf(c) ?? '')
    .join('');

/** Every `<text>` of the SVG; a `<tspan>` with its own `y` starts a line. */
function labels(svg: string): Label[] {
  const tree = parseSvg(svg);
  return tree.find({ tag: 'text' }).map((t) => {
    const spans = tree.children(t).filter((c) => tree.tag(c) === 'tspan');
    const lines: Run[][] = [];
    for (const n of spans.length === 0 ? [t] : spans) {
      const run: Run = {
        text: own(tree, n),
        bold: tree.getAttr(n, 'font-weight') === 'bold',
        italic: tree.getAttr(n, 'font-style') === 'italic',
      };
      if (lines.length === 0 || (n !== t && tree.getAttr(n, 'y') !== undefined)) lines.push([]);
      lines[lines.length - 1]!.push(run);
    }
    const text = lines.map((l) => l.map((r) => r.text).join('')).map((l) => l.trim());
    return { lines, text: text.join('\n') };
  });
}

const lineTexts = (l: Label): string[] => l.text.split('\n');
const runs = (l: Label): Run[] => l.lines.flat();

describe('label markup across types (D710)', () => {
  it.each(Object.entries(CASES))('%s', async (_type, c) => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const { svg } = await m.render(
      'm',
      readFileSync(join(REPO_ROOT, 'e2e/diagrams', c.file), 'utf8')
    );
    const all = labels(svg);
    const drawn = all.map((l) => l.text);
    const withText = (text: string): Label[] => all.filter((l) => l.text === text);

    for (const lines of c.br ?? []) {
      expect(drawn, `<br> breaks ${JSON.stringify(lines)}`).toContainEqual(lines.join('\n'));
      expect(lineTexts(withText(lines.join('\n'))[0]!)).toEqual(lines);
    }
    const boldIn = (text: string, bold: string, what: string): void => {
      const found = withText(text);
      expect(found, `${what}: a label ${JSON.stringify(text)}`).not.toEqual([]);
      const hit = found.some((l) => runs(l).some((r) => r.bold && r.text === bold));
      expect(hit, `${what}: ${JSON.stringify(bold)} bold in ${JSON.stringify(text)}`).toBe(true);
    };
    for (const [text, bold] of c.tag ?? []) boldIn(text, bold, '<b>');
    for (const [text, bold] of c.md ?? []) {
      expect(text).not.toContain('`');
      boldIn(text, bold, 'markdown string');
    }
    for (const text of c.literal ?? []) {
      const found = withText(text);
      expect(found, `drawn as written: ${JSON.stringify(text)}`).not.toEqual([]);
      const plain = found.some(
        (l) => l.lines.length === 1 && !runs(l).some((r) => r.bold || r.italic)
      );
      expect(plain, `no markup in ${JSON.stringify(text)}`).toBe(true);
    }
    // No markdown string leaves its wrapper behind outside the literal labels.
    const wrapped = drawn.filter((t) => /^"?`[^]*`"?$/.test(t) && !c.literal?.includes(t));
    expect(wrapped).toEqual([]);
  });
});
