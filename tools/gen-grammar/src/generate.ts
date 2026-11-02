/**
 * Every file generated from the grammar files: highlighters next to each grammar (separate
 * artefacts, never imported by a published package) and the syntax reference pages.
 */
import { parseGrammar } from './ebnf.ts';
import { lezerGrammar, lezerTokens, monarch, textMate } from './highlight.ts';
import { syntaxDoc } from './syntax-doc.ts';

export interface GrammarTarget {
  /** Diagram type, e.g. `flowchart`. */
  type: string;
  /** Page title of the syntax reference. */
  title: string;
}

/** Diagram types that have a grammar file, `packages/diagram-<type>/grammar/<type>.ebnf`. */
export const GRAMMARS: GrammarTarget[] = [{ type: 'flowchart', title: 'Flowchart syntax' }];

export const grammarPath = (type: string) => `packages/diagram-${type}/grammar/${type}.ebnf`;
export const generatedDir = (type: string) => `packages/diagram-${type}/grammar/generated`;

/** Repo-relative path → content, for one grammar file's text. */
export function generateFor(target: GrammarTarget, text: string): Map<string, string> {
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
  ]);
}

export function generate(read: (path: string) => string | undefined): Map<string, string> {
  const files = new Map<string, string>();
  for (const target of GRAMMARS) {
    const text = read(grammarPath(target.type));
    if (text === undefined) throw new Error(`missing ${grammarPath(target.type)}`);
    for (const [k, v] of generateFor(target, text)) files.set(k, v);
  }
  return files;
}
