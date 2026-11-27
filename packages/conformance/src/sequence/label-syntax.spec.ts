import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from '../corpus.ts';

/**
 * The sequence label fixture through the public `render()` (#1368, #1400): every label kind
 * reads a quoted markdown string as markdown and breaks at a written `\n`; nothing else is
 * markdown. No sequence label kind read markdown in v12, so `legacyMarkdown` draws the same.
 */
const FIXTURE = readFileSync(
  join(REPO_ROOT, 'e2e/diagrams/sequence/pr-check/label-syntax.mmd'),
  'utf8'
);

const svgOf = async (legacyMarkdown: boolean): Promise<string> => {
  const m = createMermaid();
  m.initialize({ deterministic: true, legacyMarkdown });
  return (await m.render('s', FIXTURE)).svg;
};

/** Each `<text>` element's drawn text, its lines joined by `|`, bold runs in `**`. */
const texts = (svg: string): string[] =>
  [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map((t) =>
    (t[1] ?? '')
      .replace(/<tspan font-weight="bold">([^<]*)<\/tspan>/g, '**$1**')
      .replace(/<tspan x="[^"]*" y="[^"]*">/g, '|')
      .replace(/<[^>]*>/g, '')
      .replace(/^\|/, '')
      .replaceAll('&quot;', '"')
  );

describe('sequence label syntax', () => {
  it('draws a markdown string as markdown in every label kind, without its wrapper', async () => {
    const drawn = texts(await svgOf(false));
    for (const kind of ['title', 'box', 'alias', 'name', 'message', 'note'])
      expect(drawn, kind).toContain(`${kind} **bold** ital`);
    expect(drawn).toContain('[alt **bold** ital]');
    expect(drawn).toContain('[critical **bold** ital]');
    expect(drawn.filter((t) => t.includes('"`'))).toEqual([]);
  });

  it('draws plain markers, bare backticks and code spans as written', async () => {
    const drawn = texts(await svgOf(false));
    for (const kind of ['box', 'alias', 'name', 'message', 'note']) {
      expect(drawn, kind).toContain(`${kind} **bold** _ital_`);
      expect(drawn, kind).toContain(`\`${kind} **bold** _ital_\``);
      expect(drawn, kind).toContain(`${kind} a \`code\` b`);
    }
    expect(drawn).toContain('[`else **bold** _ital_`]');
  });

  it('breaks at a written \\n in every label kind', async () => {
    const drawn = texts(await svgOf(false));
    for (const kind of ['box', 'alias', 'name', 'message', 'note'])
      expect(drawn, kind).toContain(`${kind} one|two`);
    expect(drawn).toContain('[and one|two]');
    expect(drawn).toContain('[break one|two]');
    expect(drawn.filter((t) => t.includes('\\n'))).toEqual([]);
  });

  it('draws the same with legacyMarkdown: no sequence label read markdown in v12', async () => {
    expect(await svgOf(true)).toBe(await svgOf(false));
  });

  it('draws the compatibility-mode twin fixture as the default one', async () => {
    const twin = readFileSync(
      join(REPO_ROOT, 'e2e/diagrams/sequence/pr-check/label-syntax-compat.mmd'),
      'utf8'
    );
    const m = createMermaid();
    m.initialize({ deterministic: true });
    expect((await m.render('s', twin)).svg).toBe(await svgOf(false));
  });
});
