/**
 * Every file generated from the grammar files: highlighters next to each grammar (separate
 * artefacts, never imported by a published package), the syntax reference pages and each
 * diagram's runtime kind → category table (D94).
 */
import { categoriesModule } from './categories.ts';
import type { KindSource } from './categories.ts';
import { parseGrammar } from './ebnf.ts';
import { lezerGrammar, lezerTokens, monarch, textMate } from './highlight.ts';
import { syntaxDoc } from './syntax-doc.ts';

export interface GrammarTarget {
  /** Diagram type, e.g. `flowchart`. */
  type: string;
  /** Page title of the syntax reference. */
  title: string;
  /** The diagram's token kinds, for its kind → category table. */
  kinds: KindSource;
}

/** Diagram types that have a grammar file, `packages/diagram-<type>/grammar/<type>.ebnf`. */
export const GRAMMARS: GrammarTarget[] = [
  {
    type: 'flowchart',
    title: 'Flowchart syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      unnamed: { ShapeDataEnd: { mode: 'shapeData', pattern: '\\}' } },
      // `@{` and the text between quotes are Meta, the quoted values String.
      mixed: ['SHAPE_DATA'],
    },
  },
];

export const grammarPath = (type: string): string =>
  `packages/diagram-${type}/grammar/${type}.ebnf`;
export const generatedDir = (type: string): string => `packages/diagram-${type}/grammar/generated`;
/** The diagram package's source dir. */
export const sourceDir = (type: string): string => `packages/diagram-${type}/src`;

/** Repo-relative path → content, for one grammar file's text and its token-kind module's. */
export function generateFor(
  target: GrammarTarget,
  text: string,
  kindsText: string
): Map<string, string> {
  const { type } = target;
  const g = parseGrammar(text);
  const names = { id: `mermaid-${type}`, extensions: ['mmd', 'mermaid'] };
  const dir = generatedDir(type);
  const json = (v: object) => `${JSON.stringify(v, null, 2)}\n`;
  return new Map([
    [`${dir}/${type}.tmLanguage.json`, json(textMate(g, names))],
    [`${dir}/${type}.monarch.json`, json(monarch(g, names))],
    [`${dir}/${type}.grammar`, lezerGrammar(g, names, `./${type}.tokens.js`)],
    [`${dir}/${type}.tokens.js`, lezerTokens(g, names, `./${type}.parser.terms.js`)],
    [`v13/docs/syntax/${type}.md`, syntaxDoc(g, target.title, grammarPath(type))],
    [
      `${sourceDir(type)}/generated/categories.ts`,
      categoriesModule(g, type, grammarPath(type), kindsText, target.kinds),
    ],
  ]);
}

export function generate(read: (path: string) => string | undefined): Map<string, string> {
  const files = new Map<string, string>();
  for (const target of GRAMMARS) {
    const text = read(grammarPath(target.type));
    if (text === undefined) throw new Error(`missing ${grammarPath(target.type)}`);
    const kindsPath = `${sourceDir(target.type)}/${target.kinds.module}`;
    const kindsText = read(kindsPath);
    if (kindsText === undefined) throw new Error(`missing ${kindsPath}`);
    for (const [k, v] of generateFor(target, text, kindsText)) files.set(k, v);
  }
  return files;
}
