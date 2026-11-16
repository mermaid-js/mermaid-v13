// What a corpus fixture draws, for the specs that check label text through `render()`. No
// `node:` import here (the package's import boundary): a spec hands in its `readFileSync`.
import { createMermaid, type Warning } from '../index.ts';

/** `readFileSync` of `node:fs`, as far as these helpers use it. */
export type ReadFile = (file: URL, encoding: 'utf8') => string;

const unescaped = (text: string): string =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

/** The text of every `<text>` element as a reader sees it, its lines joined by a blank. */
export function drawn(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map((m) =>
    unescaped((m[1] ?? '').replace(/<\/tspan>\s*<tspan\b[^>]*>/g, ' ').replace(/<[^>]+>/g, ''))
  );
}

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

/** One run: its text inside `<b>`, `<i>` and `<code>` for bold, italic and monospace. */
function run(tag: string, text: string): string {
  let out = unescaped(text);
  if (attr(tag, 'font-family') === 'monospace') out = `<code>${out}</code>`;
  if (attr(tag, 'font-style') === 'italic') out = `<i>${out}</i>`;
  if (attr(tag, 'font-weight') === 'bold') out = `<b>${out}</b>`;
  return out;
}

/** Every `<text>` element: its runs marked by style, its lines joined by ` / `. */
export function drawnRuns(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map((m) => {
    const body = m[1] ?? '';
    if (!body.includes('<tspan')) return run('', body);
    let out = '';
    for (const t of body.matchAll(/(<tspan\b[^>]*>)(.*?)<\/tspan>/gs)) {
      const tag = t[1] ?? '';
      if (out !== '' && attr(tag, 'y') !== undefined) out += ' / ';
      out += run(tag, t[2] ?? '');
    }
    return out;
  });
}

/** What the corpus fixtures draw, by their path under `e2e/diagrams/`. */
export interface CorpusLabels {
  /** The fixture's source. */
  fixture(path: string): string;
  /** The fixture's SVG and warnings, rendered deterministically. */
  svgOf(path: string): Promise<{ svg: string; warnings: Warning[] }>;
  /** The fixture's text output (`format: 'ascii'`) and warnings. */
  textOf(path: string): Promise<{ text: string; warnings: Warning[] }>;
  /** What the fixture draws (read by `read`, default {@link drawn}); throws if it warns. */
  drawnBy(path: string, read?: (svg: string) => string[]): Promise<string[]>;
}

export function corpusLabels(readFile: ReadFile): CorpusLabels {
  const fixture = (path: string): string =>
    readFile(new URL(`../../../../e2e/diagrams/${path}`, import.meta.url), 'utf8');
  const svgOf: CorpusLabels['svgOf'] = (path) => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    return m.render('x', fixture(path));
  };
  return {
    fixture,
    svgOf,
    textOf: (path) => createMermaid().render('x', fixture(path), { format: 'ascii' }),
    drawnBy: async (path, read = drawn) => {
      const { svg, warnings } = await svgOf(path);
      if (warnings.length > 0) throw new Error(`${path} warns: ${JSON.stringify(warnings)}`);
      return read(svg);
    },
  };
}
