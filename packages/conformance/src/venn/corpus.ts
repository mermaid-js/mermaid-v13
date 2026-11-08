// cspell:words dedented
/**
 * The venn corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the cases
 * file, and the lexer gate's set, which adds generated variants of
 * every source. Diagrams go in as `.mmd` fixtures under `e2e/diagrams/venn/`; text that only
 * matters to the lexer or the parser (rejections, comment forms, CRs) goes in
 * `corpus/venn-cases.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JISON_NAMES, VennTokenKind } from '@mermaid-js/diagram-venn';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { body, crlf, tabs } from '../kanban/corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * Every indent removed: an indented `text` is then a plain `text` statement, which v12 parses
 * differently (or rejects), so the lexer's line-start rules see the other branch.
 */
export const dedented = (src: string): string => body(src, (b) => b.replace(/^[ \t]+/gm, ''));

/** A directive v12 removes, wherever in a line it is. */
const DIRECTIVE = '%%{init: {}}%%';

/**
 * A directive through the middle of every line after the `venn-beta` header line (pitfall 3):
 * at the middle of the line's text after its indent, moved off a surrogate pair. Lines with
 * fewer than two characters of text, `%%` lines and blank lines are left as they are.
 */
export const midLineDirective = (src: string): string =>
  body(src, (b) => {
    const lines = b.split('\n');
    const header = lines.findIndex((l) => /^\s*venn-beta/.test(l));
    return lines
      .map((line, k) => {
        const text = line.trimStart();
        if (k <= header || text.length < 2 || text.startsWith('%%')) return line;
        let at = line.length - text.length + Math.floor(text.length / 2);
        if (/[\udc00-\udfff]/.test(line.charAt(at))) at++;
        return line.slice(0, at) + DIRECTIVE + line.slice(at);
      })
      .join('\n');
  });

/** The cases (`corpus/venn-cases.json`): each corpus gap, quirk and rejection v12 has. */
export function vennCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/venn-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The venn corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function vennCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/venn'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/venn-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly [suffix: string, make: (src: string) => string][] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['tabs', tabs],
  ['dedented', dedented],
  ['mid-line directive', midLineDirective],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of {@link VARIANTS} that changes it.
 */
export async function vennGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await vennCorpus()), ...vennCases()];
  const out = [...all];
  for (const [suffix, make] of VARIANTS) {
    for (const item of all) {
      const source = make(item.source);
      if (source !== item.source) out.push({ id: `${item.id} (${suffix})`, source });
    }
  }
  return out;
}

/** The cases core reads otherwise (`UNCLOSED_DIRECTIVE`), as the lexer gate excludes them. */
export const UNCLOSED = 'venn-cases/unclosed-directive-';

/**
 * The lexer gate's set without the unclosed directives (and their variants): every source the
 * syntax gates (grammar lexer, grammar differential, generated sentences) compare.
 */
export async function vennSyntaxCorpus(): Promise<CorpusItem[]> {
  return (await vennGateCorpus()).filter((item) => !item.id.startsWith(UNCLOSED));
}

/**
 * The gate's generated variants for the parity suite (the e2e fixtures, spec strings and cases
 * themselves are in the suite's dirs and files), ids prefixed `venn-gate/`. The unclosed
 * directives are left out: the two cases are listed divergences of core's directive reading.
 */
export async function vennParityCorpus(): Promise<CorpusItem[]> {
  const listed = new Set([...(await vennCorpus()), ...vennCases()].map((c) => c.id));
  return (await vennSyntaxCorpus())
    .filter((item) => !listed.has(item.id))
    .map((item) => ({ id: `venn-gate/${item.id}`, source: item.source }));
}

/**
 * Names no message may hold (R-ERR-5): v12's jison terminals (with `_` or all capitals), v13's
 * compound kind names (`IndentText`, `HexColor`, …), and the compound rule names of v12's
 * `venn.jison` and `grammar/venn.ebnf` (`statement`, `document`, `line` and `value` are plain
 * words, and `set` and the other keywords are Mermaid syntax).
 */
export const INTERNAL_NAMES = new RegExp(
  `\\b(?:${[
    ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
    ...Object.keys(VennTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
    'optNewlines',
    'identifierList',
    'indentedTextTail',
    'stylesOpt',
    'styleField',
    'styleValue',
    'valueTokens',
    'valueToken',
    'IndentedText',
    'textId',
  ].join('|')})\\b`
);

/**
 * A message without the author's own text it quotes (what was found, a bad character, the
 * statements and text nodes a warning names), which may hold any word.
 */
export const withoutQuotes = (message: string): string =>
  message
    .replace(/got `[\s\S]*?`/g, 'got `…`')
    .replace(/character `[\s\S]*?`/g, 'character `…`')
    .replace(/`[^`]*` at line/g, '`…` at line')
    .replace(/text node `[^`]*`/g, 'text node `…`')
    .replace(/identifier: [^.]*\./g, 'identifier: ….')
    .replace(/as in `set [^`]*`/g, 'as in `set …`');
