// #837 (D114): a quoted mindmap or kanban label that holds a tag with a double-quoted attribute
// parses as in v12, whose `cleanupText` turned `="x"` into `='x'` inside a tag before lexing.
// What it draws is what flowchart draws for the same label: the tag and its attributes are
// dropped with one HTML_DROPPED, the text is kept, and nothing of the tag reaches the SVG.
// Each type's `nightly-check/html-attribute-in-quoted-label.mmd` holds the cases (nightly-check,
// not baseline, because it warns by design, as the other HTML_DROPPED fixtures do).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, type Warning } from './index.ts';
import { drawn } from './testing/labels.ts';

const fixture = (dir: string): string =>
  readFileSync(
    new URL(
      `../../../e2e/diagrams/${dir}/nightly-check/html-attribute-in-quoted-label.mmd`,
      import.meta.url
    ),
    'utf8'
  );

/** The fixture with every `<span …>` and `</span>` taken out: the labels as plain text. */
const plain = (text: string): string => text.replace(/<\/?span\b[^>]*>/g, '');

async function render(text: string): Promise<{ svg: string; warnings: Warning[] }> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m.render('d', text);
}

const dropped = (warnings: Warning[]): string[] =>
  warnings.filter((w) => w.code === 'HTML_DROPPED').map((w) => w.message);

/** What each `<text>` draws, its runs joined and its blanks collapsed. */
const texts = (svg: string): string[] => drawn(svg).map((l) => l.replace(/\s+/g, ' ').trim());

interface Element {
  readonly name: string;
  readonly attrs: ReadonlyMap<string, string>;
  /** The names of the elements it is in, outermost first. */
  readonly path: readonly string[];
}

const NAME = /<([A-Za-z][\w:-]*)/y;
const ATTR = /\s+([\w:-]+)="([^"]*)"/y;
const CLOSE = /\s*(\/?)>/y;
const END = /<\/([A-Za-z][\w:-]*)\s*>/y;

/** The start tag at `i`: its name, attributes, whether it closes itself, and where it ends. */
function startTag(
  svg: string,
  i: number
): { name: string; attrs: Map<string, string>; empty: boolean; end: number } | undefined {
  NAME.lastIndex = i;
  const name = NAME.exec(svg);
  if (!name) return undefined;
  const attrs = new Map<string, string>();
  let at = NAME.lastIndex;
  for (;;) {
    ATTR.lastIndex = at;
    const a = ATTR.exec(svg);
    if (!a) break;
    attrs.set(a[1]!, a[2]!);
    at = ATTR.lastIndex;
  }
  CLOSE.lastIndex = at;
  const close = CLOSE.exec(svg);
  if (!close) return undefined;
  return { name: name[1]!, attrs, empty: close[1] === '/', end: CLOSE.lastIndex };
}

/**
 * Every element of the markup with its attributes, read tag by tag. Throws on a `<` that starts
 * neither a start nor an end tag, so no markup is left unread (a `<style>` sheet holds no `<`).
 */
function elements(svg: string): Element[] {
  const out: Element[] = [];
  const stack: string[] = [];
  for (let i = svg.indexOf('<'); i !== -1; i = svg.indexOf('<', i)) {
    END.lastIndex = i;
    const end = END.exec(svg);
    if (end) {
      expect(stack.pop()).toBe(end[1]);
      i = END.lastIndex;
      continue;
    }
    const start = startTag(svg, i);
    if (!start) throw new Error(`unread markup at ${i}: ${svg.slice(i, i + 40)}`);
    out.push({ name: start.name, attrs: start.attrs, path: [...stack] });
    if (!start.empty) stack.push(start.name);
    i = start.end;
  }
  expect(stack).toEqual([]);
  return out;
}

const LABEL = new Set(['text', 'tspan']);
const isLabel = (e: Element) => LABEL.has(e.name) || e.path.some((p) => LABEL.has(p));

/** Every label element's name, attribute names (`text@x`) and classes (`text.c`). */
const labelShape = (svg: string): Set<string> =>
  new Set(
    elements(svg)
      .filter(isLabel)
      .flatMap((e) => [
        e.name,
        ...[...e.attrs.keys()].map((k) => `${e.name}@${k}`),
        ...(e.attrs.get('class') ?? '').split(/\s+/).map((c) => `${e.name}.${c}`),
      ])
  );

/**
 * No raw tag, no `<foreignObject>`, no event handler anywhere; on a label no `style`, no event
 * handler, and only the classes the renderer gives the same label as plain text (`own`). The
 * root's custom properties are the only inline style.
 */
function assertNoTagReachesTheSvg(svg: string, own: Set<string>): void {
  assertInert(svg);
  const all = elements(svg);
  const names = new Set(all.map((e) => e.name));
  expect(names.has('span')).toBe(false);
  expect(names.has('foreignObject')).toBe(false);
  for (const e of all.filter(isLabel)) {
    expect(LABEL.has(e.name), e.name).toBe(true);
    for (const [k, v] of e.attrs) {
      expect(k === 'style' || /^on/i.test(k), `${e.name}@${k}`).toBe(false);
      if (k === 'class')
        for (const c of v.split(/\s+/)) expect(own.has(`${e.name}.${c}`), c).toBe(true);
    }
  }
  expect(all.filter((e) => e.attrs.has('style')).map((e) => e.path.length)).toEqual([0]);
  expect(all.some((e) => [...e.attrs.keys()].some((k) => /^on/i.test(k)))).toBe(false);
  // The tag's attribute values are nowhere in what is drawn.
  expect(texts(svg).join('|')).not.toMatch(/alert|color:|span/);
}

/** The quoted labels of the fixture (not its data), as a flowchart drawing each in a node. */
function asFlowchart(text: string): string {
  const labels = [...text.matchAll(/(?<![@:] *)"(`?<span[^\n]*?`?)"(?=[\])}(]|$)/gm)].map(
    (m) => m[1]!
  );
  expect(labels.length).toBeGreaterThan(3);
  return ['flowchart LR', ...labels.map((l, k) => `  n${k}["${l}"]`)].join('\n');
}

describe.each([
  {
    type: 'mindmap',
    labels: [...Array<string>(7).fill('red text'), 'no id', 'two attributes', 'click handler'],
  },
  {
    type: 'kanban',
    labels: [...Array<string>(3).fill('red text'), 'two attributes', 'click handler', 'T-1'],
  },
])('a double-quoted attribute in a quoted $type label (#837, D114)', ({ type, labels }) => {
  it('parses, draws the text and drops the tag with one HTML_DROPPED', async () => {
    const { svg, warnings } = await render(fixture(type));
    expect(warnings.filter((w) => w.code !== 'HTML_DROPPED')).toEqual([]);
    expect(dropped(warnings)).toEqual(['Labels do not draw <span>.']);
    const drawnTexts = texts(svg);
    for (const label of labels) expect(drawnTexts).toContain(label);
    expect(drawnTexts.filter((l) => l === 'red text')).toHaveLength(
      labels.filter((l) => l === 'red text').length
    );
    // The same text as the labels written without the tags.
    expect(drawnTexts).toEqual(texts((await render(plain(fixture(type)))).svg));
  });

  it('lets no tag, style, class or event handler reach the SVG', async () => {
    const { svg } = await render(fixture(type));
    const own = labelShape((await render(plain(fixture(type)))).svg);
    assertNoTagReachesTheSvg(svg, own);
  });

  it('is no looser than flowchart drawing the same labels', async () => {
    const own = await render(fixture(type));
    const flow = await render(asFlowchart(fixture(type)));
    assertNoTagReachesTheSvg(flow.svg, new Set());
    expect(dropped(own.warnings)).toEqual(dropped(flow.warnings));
    // Every label flowchart draws is drawn the same.
    for (const label of texts(flow.svg)) expect(texts(own.svg)).toContain(label);
    // The tags add no markup to a label: nothing beyond what the plain labels have.
    const plainShape = labelShape((await render(plain(fixture(type)))).svg);
    for (const k of labelShape(own.svg)) expect(plainShape.has(k), k).toBe(true);
  });
});
