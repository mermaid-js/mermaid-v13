/**
 * The HTML labels extension over the e2e corpus, through `createMermaid().render()`, with a
 * stand-in environment that boxes every label it is asked for (Node has no DOM): each `pr-check`
 * fixture of every type draws, and what it draws stays on the allow-list (R-SEC-2, D694). So do
 * v12's XSS sources and core's payloads as label text: the label's HTML travels in the svg as
 * escaped text. The real sanitizer is checked in a browser (`e2e/dom/html-labels.spec.ts`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertInert } from '@mermaid-js/core/svg';
import { hostileLabelSources } from '@mermaid-js/core/svg/testing';
import { createMermaid, MermaidError, type Mermaid } from 'mermaid';
import { beforeAll, describe, expect, it } from 'vitest';
import { extensionWith } from './extension.ts';

const DIAGRAMS = fileURLToPath(new URL('../../../e2e/diagrams/', import.meta.url));

/** The `pr-check` fixtures of every type, as `[path, source]`. */
const corpus: [string, string][] = readdirSync(DIAGRAMS, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.mmd') && f.split(/[\\/]/).includes('pr-check'))
  .sort()
  .map((f) => [f, readFileSync(join(DIAGRAMS, f), 'utf8')]);

let boxed = 0;
let mermaid: Mermaid;

beforeAll(async () => {
  mermaid = createMermaid();
  await mermaid.registerExternalDiagrams([
    extensionWith({
      document: () => ({}) as Document,
      sanitizer: () => (() => undefined) as never,
      measure: (_document, _sanitize, { html }) => (boxed++, { width: 120, height: 42, html }),
      mount: () => 0,
    }),
  ]);
});

/** Draws `source`; a diagram v13 rejects (as it does without the extension) is `undefined`. */
async function draw(source: string): Promise<string | undefined> {
  try {
    return (await mermaid.render('x', source)).svg;
  } catch (e) {
    if (e instanceof MermaidError && e.code !== 'INTERNAL') return undefined;
    throw e;
  }
}

describe('HTML labels over the corpus', () => {
  it('has fixtures of every type', () => {
    expect(corpus.length).toBeGreaterThan(300);
  });

  it.each(corpus)('%s draws, and stays on the allow-list', async (_path, source) => {
    const svg = await draw(source);
    if (svg !== undefined) assertInert(svg);
  });

  it('boxed labels in most of them', () => {
    expect(boxed).toBeGreaterThan(1000);
  });
});

describe('hostile labels with HTML labels on', () => {
  // v12's flowchart sources as written, and every hostile text as a node and an edge label.
  it.each(hostileLabelSources())('%s', async (_id, source) => {
    const svg = await draw(source);
    if (svg !== undefined) assertInert(svg);
  });
});
