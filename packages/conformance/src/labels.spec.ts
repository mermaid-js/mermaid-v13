import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_FONT_FAMILY,
  Style,
  layoutLabel,
  tableMeasurer,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import {
  FLOWCHART_V12_TYPES,
  REPO_ROOT,
  corpusFromDir,
  loadOracle,
  v12DecodeEntities,
} from './index.ts';

/**
 * Label layout (#10) over the real labels of the e2e flowchart fixtures, as mermaid@12 parses
 * them: no label overflows its box at the default font, and labels without markdown bullets
 * keep v12's lines, words and emphasis.
 */

interface CorpusLabel {
  id: string;
  text: string;
  markdown: boolean;
}

interface V12Word {
  content: string;
  type: 'normal' | 'strong' | 'em';
}
interface V12Text {
  markdownToLines(markdown: string): V12Word[][];
}

const FONT: FontKey = { family: DEFAULT_FONT_FAMILY, size: 16, weight: 400 };
// v12's flowchart `wrappingWidth` default.
const WRAPPING_WIDTH = 200;
const RE_BULLET_LINE = /^[ \t]*[-*] +\S/m;
// An HTML tag other than `<br>`: v12's markdownToLines keeps it as words, and its HTML label
// then draws it. What v13 does with it (R-TEXT-3, D564) is in core's label.spec.ts.
const RE_HTML = /<\/?(?!br\b)[a-zA-Z][^<>]*>/i;
// v12's sanitiser removes these with what they hold, to the end of the label with no end tag.
const RE_RAW = /<(script|style)(?=[\s/>])[^>]*>[^]*?(<\/\1\s*>|$)/gi;
// Labels v13 draws otherwise on purpose, by the start of their id.
const BY_DESIGN = [
  // v12's browser drops an element it does not know; v13 shows `List<T>`, `<foo>` and
  // `<style.css>` as written (R-TEXT-3, MIGRATION "Labels and text").
  'flowchart/baseline/text/html-kept.mmd node A',
  'flowchart/baseline/text/tag-shaped-script-style.mmd',
  // v12 lost the rest of a label after a `<script>` or `<style>` with no end tag; v13 drops the
  // tag and keeps the text (D564).
  'flowchart/nightly-check/html-dropped-unclosed.mmd',
];

const labels: CorpusLabel[] = [];
let v12: V12Text;

/** v12's own markdown splitter, from the chunk of its core build that exports it. */
async function loadV12Text(): Promise<V12Text> {
  const require = createRequire(import.meta.url);
  const pkgDir = realpathSync(dirname(require.resolve('mermaid-v12/package.json')));
  const dir = join(pkgDir, 'dist', 'chunks', 'mermaid.core');
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.mjs')) continue;
    if (!/^\s*markdownToLines,$/m.test(readFileSync(join(dir, file), 'utf8'))) continue;
    return (await import(pathToFileURL(join(dir, file)).href)) as V12Text;
  }
  throw new Error('markdownToLines not found in mermaid@12');
}

beforeAll(async () => {
  const oracle = await loadOracle();
  v12 = await loadV12Text();
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/flowchart'), 'flowchart')) {
    const result = await oracle.parse(item.source);
    if (!result.accepted || !FLOWCHART_V12_TYPES.includes(result.diagramType)) continue;
    const db = result.db as {
      getVertices(): Map<string, { text?: unknown; labelType?: unknown }>;
      getEdges(): { text?: unknown; labelType?: unknown }[];
      getSubGraphs(): { title?: unknown; labelType?: unknown }[];
    };
    const add = (where: string, text: unknown, labelType: unknown): void => {
      if (typeof text !== 'string' || text === '') return;
      labels.push({
        id: `${item.id} ${where}`,
        text: v12DecodeEntities(text),
        markdown: labelType === 'markdown',
      });
    };
    for (const [id, v] of db.getVertices()) add(`node ${id}`, v.text, v.labelType);
    db.getEdges().forEach((e, i) => add(`edge ${i}`, e.text, e.labelType));
    db.getSubGraphs().forEach((s, i) => add(`subgraph ${i}`, s.title, s.labelType));
  }
}, 120_000);

const layout = (label: CorpusLabel, maxWidth: number): MeasuredLabel =>
  layoutLabel(label.text, FONT, maxWidth, tableMeasurer, { markdown: label.markdown });

describe('label layout over the e2e flowchart labels', () => {
  it('finds plain and markdown labels', () => {
    expect(labels.length).toBeGreaterThan(1000);
    expect(labels.filter((l) => l.markdown).length).toBeGreaterThan(20);
  });

  it('never lets a line overflow its box at the default font and wrapping width', () => {
    const overflows: string[] = [];
    for (const label of labels) {
      const box = layout(label, WRAPPING_WIDTH);
      if (box.width > WRAPPING_WIDTH) overflows.push(`${label.id}: box ${box.width}`);
      box.lines.forEach((line, i) => {
        // Re-measure every run, so a stale width cannot hide an overflow.
        let w = box.indents[i] ?? 0;
        for (const run of line) w += tableMeasurer.width(run.text, FONT, run.style);
        if (w > box.width + 1e-9) overflows.push(`${label.id}: line ${i} ${w} > ${box.width}`);
      });
      if (box.height !== box.lines.length * box.lineHeight) overflows.push(`${label.id}: height`);
    }
    expect(overflows).toEqual([]);
  });

  it('keeps v12 lines, words and emphasis for markdown labels without bullets', () => {
    const STYLE = { normal: 0, strong: Style.Bold, em: Style.Italic };
    const changed: string[] = [];
    for (const label of labels) {
      if (!label.markdown || RE_BULLET_LINE.test(label.text) || RE_HTML.test(label.text)) continue;
      // v12's createText turns the first <br> into <br/> before splitting markdown.
      const expected = v12
        .markdownToLines(label.text.replace('<br>', '<br/>'))
        .map((line) => line.map((w) => `${w.content}:${STYLE[w.type]}`).join(' '))
        .filter((line) => line !== '');
      const actual = layout(label, Infinity).lines.map((line) =>
        line
          .flatMap((run) =>
            run.text
              .split(' ')
              .filter((w) => w !== '')
              .map((w) => `${w}:${run.style}`)
          )
          .join(' ')
      );
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        changed.push(
          `${label.id}\n  v12: ${JSON.stringify(expected)}\n  v13: ${JSON.stringify(actual)}`
        );
      }
    }
    expect(changed).toEqual([]);
  });

  it('keeps the text v12 shows for plain labels', () => {
    // v12 draws plain labels as HTML: lines break at \n, the two characters \n and <br>, tags
    // are elements and character references are decoded. v13 keeps that text; an <img> shows
    // nothing (labels are text only, R-TEXT-1).
    const ENTITIES: Record<string, string> = {
      quot: '"',
      amp: '&',
      lt: '<',
      gt: '>',
      nbsp: '\u00a0',
      colon: ':',
      semi: ';',
      dollar: '$',
      vert: '|',
      lpar: '(',
      rpar: ')',
      lsqb: '[',
      rsqb: ']',
      lcub: '{',
      rcub: '}',
      percnt: '%',
      plus: '+',
    };
    const changed: string[] = [];
    for (const label of labels) {
      if (label.markdown || BY_DESIGN.some((id) => label.id.startsWith(id))) continue;
      const expected = label.text
        .replace(RE_RAW, '')
        .split(/\\n|\n|<br\s*\/?>/gi)
        .map((line) =>
          line
            .replace(/<\/?[a-zA-Z][^<>]*>/g, '')
            .replace(/&(\w+);/g, (all, name: string) => ENTITIES[name] ?? all)
            .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .join(' ')
        );
      const actual = layout(label, Infinity).lines.map((line) => line.map((r) => r.text).join(''));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        changed.push(
          `${label.id}\n  v12: ${JSON.stringify(expected)}\n  v13: ${JSON.stringify(actual)}`
        );
      }
    }
    expect(changed).toEqual([]);
  });
});
