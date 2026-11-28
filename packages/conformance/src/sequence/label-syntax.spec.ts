import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid, type MermaidConfig } from 'mermaid';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { REPO_ROOT } from '../corpus.ts';

/**
 * The sequence label fixtures through the public `render()` (#1368, #1400). In the default mode
 * every label kind reads a quoted markdown string as markdown and breaks at a written `\n`;
 * nothing else is markdown, and plain markdown gives one `MARKDOWN_NOT_READ`. With
 * `markdownAlwaysOn` every label is markdown.
 */
const fixture = (name: string): string =>
  readFileSync(join(REPO_ROOT, 'e2e/diagrams/sequence/pr-check', name), 'utf8');
const FIXTURE = fixture('label-syntax.mmd');
const COMPAT = fixture('label-syntax-compat.mmd');
/** The default fixture's diagram without its front matter. */
const BODY = FIXTURE.slice(FIXTURE.indexOf('sequenceDiagram'));

const api = (config: MermaidConfig = {}) => {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m;
};
const renderOf = async (source: string, config?: MermaidConfig) => api(config).render('s', source);
const textOf = async (source: string) => api().render('s', source, { format: 'ascii' });
const svgOf = async (source: string, config?: MermaidConfig): Promise<string> =>
  (await renderOf(source, config)).svg;

/**
 * Each `<text>` element's drawn text, its lines joined by `|`, bold `{b:…}`, italic `{i:…}`,
 * inline code `{m:…}`.
 */
const texts = (svg: string): string[] =>
  [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map((t) =>
    (t[1] ?? '')
      .replace(/<tspan font-weight="bold">([^<]*)<\/tspan>/g, '{b:$1}')
      .replace(/<tspan font-style="italic">([^<]*)<\/tspan>/g, '{i:$1}')
      .replace(/<tspan x="[^"]*" y="[^"]*" font-family="monospace">([^<]*)<\/tspan>/g, '|{m:$1}')
      .replace(/<tspan font-family="monospace">([^<]*)<\/tspan>/g, '{m:$1}')
      .replace(/<tspan x="[^"]*" y="[^"]*">/g, '|')
      .replace(/<[^>]*>/g, '')
      .replace(/^\|/, '')
      .replaceAll('&quot;', '"')
  );

/** The kinds the fixtures write every way; the title is written plain only. */
const KINDS = ['box', 'alias', 'name', 'message', 'note'] as const;

describe('sequence label syntax, default mode', () => {
  it('draws a markdown string as markdown in every label kind, without its wrapper', async () => {
    const drawn = texts(await svgOf(FIXTURE));
    for (const kind of KINDS) expect(drawn, kind).toContain(`${kind} {b:bold} {i:ital}`);
    expect(drawn).toContain('[alt {b:bold} {i:ital}]');
    expect(drawn).toContain('[critical {b:bold} {i:ital}]');
    expect(drawn.filter((t) => t.includes('"`'))).toEqual([]);
  });

  it('draws plain markers, bare backticks and code spans as written', async () => {
    const drawn = texts(await svgOf(FIXTURE));
    for (const kind of KINDS) {
      expect(drawn, kind).toContain(`${kind} **bold** _ital_`);
      expect(drawn, kind).toContain(`\`${kind} **bold** _ital_\``);
      expect(drawn, kind).toContain(`${kind} a \`code\` b`);
    }
    expect(drawn).toContain('title **bold** _ital_');
    expect(drawn).toContain('[loop **bold** _ital_]');
    expect(drawn).toContain('[`else **bold** _ital_`]');
  });

  it('breaks at a written \\n in every label kind', async () => {
    const drawn = texts(await svgOf(FIXTURE));
    for (const kind of KINDS) expect(drawn, kind).toContain(`${kind} one|two`);
    expect(drawn).toContain('[and one|two]');
    expect(drawn).toContain('[break one|two]');
    expect(drawn.filter((t) => t.includes('\\n'))).toEqual([]);
  });
});

describe('sequence label syntax, markdownAlwaysOn', () => {
  it('draws plain markers as bold and italic in every label kind (the compat fixture)', async () => {
    const drawn = texts(await svgOf(COMPAT));
    for (const kind of KINDS) expect(drawn, kind).toContain(`${kind} {b:bold} {i:ital}`);
    expect(drawn).toContain('title {b:bold} {i:ital}');
    expect(drawn).toContain('[loop {b:bold} {i:ital}]');
    expect(drawn).toContain('[option {b:bold} {i:ital}]');
    // Bare backticks are a code span now: its markers are code, drawn as written.
    for (const kind of KINDS) expect(drawn, kind).toContain(`{m:${kind} **bold** _ital_}`);
    expect(drawn.filter((t) => !t.includes('{m:') && /\*\*|_ital_/.test(t))).toEqual([]);
  });

  it('draws the plain title as markdown, set globally or in the sequence section', async () => {
    const source = 'sequenceDiagram\n  title title **bold** _ital_\n  A->>B: m **bold** _ital_';
    for (const config of [{ markdownAlwaysOn: true }, { sequence: { markdownAlwaysOn: true } }]) {
      const drawn = texts(await svgOf(source, config as MermaidConfig));
      expect(drawn).toContain('title {b:bold} {i:ital}');
      expect(drawn).toContain('m {b:bold} {i:ital}');
    }
  });

  it('draws markdown strings, tags and \\n as in the default mode', async () => {
    const [on, off] = [texts(await svgOf(COMPAT)), texts(await svgOf(FIXTURE))];
    const same = (t: string): boolean =>
      t.includes('"`') === false && (t.includes('{b:') || t.includes('|'));
    for (const t of off.filter(same)) expect(on).toContain(t);
  });

  it('draws a code span as inline code, without its backticks', async () => {
    const svg = await svgOf(COMPAT);
    expect(texts(svg)).toContain('message a {m:code} b');
    expect(svg).not.toContain('message a `code` b');
  });

  it('writes text output as drawn: emphasis and code spans without their marks', async () => {
    const { text } = await textOf(COMPAT);
    expect(text).toContain('message bold ital');
    expect(text).toContain('message a code b');
    expect(text).not.toContain('`code`');
  });
});

describe('sequence label warning', () => {
  const warnings = async (source: string, config?: MermaidConfig) =>
    (await renderOf(source, config)).warnings.filter((w) => w.code === MARKDOWN_NOT_READ.code);

  it('gives one MARKDOWN_NOT_READ for plain markdown in several label kinds', async () => {
    expect(await warnings(FIXTURE)).toHaveLength(1);
  });

  it('gives none with markdownAlwaysOn, or when the labels are markdown strings', async () => {
    expect(await warnings(BODY, { markdownAlwaysOn: true })).toEqual([]);
    const strings =
      'sequenceDiagram\n  participant A as "`a **b**`"\n  A->>B: "`m **b**`"\n  Note over A: "`n _i_`"';
    expect(await warnings(strings)).toEqual([]);
  });
});
