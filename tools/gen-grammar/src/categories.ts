/**
 * The runtime kind → category table of a diagram (D94, R-LANG-1): for every key of the
 * diagram's token-kind object, the highlight category its grammar-file rule has, so semantic
 * tokens agree with the generated TextMate, Monarch and Lezer grammars. The shared kinds
 * (comments, directives, line breaks, …) come from `SHARED_CATEGORIES` in the parser kit.
 */
import type { Grammar, LexRule } from './ebnf.ts';
import { categoryOf } from './highlight.ts';

/** Where a diagram declares its token kinds, and how they match the grammar file's rules. */
export interface KindSource {
  /** Module declaring the kinds, relative to the diagram package's `src/`. */
  module: string;
  /** Name of the exported `as const` kind object. */
  object: string;
  /**
   * Kinds the hand-written lexer emits for an unnamed (`-`) grammar rule: kind key → the
   * rule's mode and pattern source, and for a keyword the terminal whose doc it shares (an
   * unnamed rule names no terminal for the doc table to look up). With `terminal`, the kind is
   * one of that terminal's rules instead, when the lexer keeps a kind per rule.
   */
  unnamed?: Record<string, { mode: string; pattern: string; docOf?: string; terminal?: string }>;
  /**
   * Terminals whose rules have different scopes; the first rule's scope is used. Any other
   * mixed terminal fails generation.
   */
  mixed?: string[];
  /**
   * Kinds that get a hover doc (D93) although their category is not keyword or operator: the
   * text before them is a keyword the lexer emits no token for (`call`), or a keyword
   * completion is offered for them (`click`, whose node id the parser expects).
   */
  documented?: string[];
}

/**
 * Keys of `export const <object> = { … }` in a token-kind module, in declaration order. Every
 * top-level entry must be `key: value` (identifier or quoted key), or reading fails. The
 * generated table is also type-checked against the object, so a key missed here fails
 * `pnpm typecheck`.
 */
export function kindKeys(moduleText: string, object: string): string[] {
  const head = new RegExp(`export const ${object} = \\{`).exec(moduleText);
  if (!head) throw new Error(`no \`export const ${object} = {\` found`);
  const text = moduleText
    .slice(head.index + head[0].length)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const entries: string[] = [];
  let depth = 0;
  let from = 0;
  let i = 0;
  for (; i < text.length && depth >= 0; i++) {
    const c = text[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    if ((c === ',' && depth === 0) || depth < 0) {
      entries.push(text.slice(from, i));
      from = i + 1;
    }
  }
  if (depth >= 0) throw new Error(`\`${object}\` is not closed`);
  const keys = entries
    .filter((e) => e.trim() !== '')
    .map((e) => {
      const m = /^\s*(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*))\s*:/.exec(e);
      const key = m?.[2] ?? m?.[3];
      if (key === undefined) throw new Error(`cannot read the \`${object}\` entry \`${e.trim()}\``);
      return key;
    });
  if (keys.length === 0) throw new Error(`\`${object}\` declares no kinds`);
  return keys;
}

/** A kind key or grammar terminal name reduced for matching: `acc_title` ~ `AccTitle`. */
const fold = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface CategoryTable {
  /** Kind key → category, in kind order. */
  entries: [key: string, category: string][];
  /** Terminals whose rules have different scopes: the first rule's scope is used. */
  mixed: string[];
}

/** The category of every kind in `keys`, matched to grammar rules by name. */
export function categoryTable(g: Grammar, keys: string[], source: KindSource): CategoryTable {
  const byName = new Map<string, LexRule[]>();
  for (const r of g.lexRules) {
    if (r.name === undefined) continue;
    const k = fold(r.name);
    byName.set(k, [...(byName.get(k) ?? []), r]);
  }
  const mixed: string[] = [];
  const entries = keys.map((key): [string, string] => {
    const unnamed = source.unnamed?.[key];
    if (unnamed) {
      const rule = g.lexRules.find(
        (r) =>
          r.name === unnamed.terminal &&
          r.modes.includes(unnamed.mode) &&
          r.pattern === unnamed.pattern
      );
      if (!rule) {
        const what = unnamed.terminal ?? 'unnamed';
        throw new Error(`${key}: no ${what} rule /${unnamed.pattern}/ in ${unnamed.mode}`);
      }
      return [key, categoryOf(rule.scope)];
    }
    const rules = byName.get(fold(key));
    if (!rules) throw new Error(`kind ${key} matches no token rule of the grammar file`);
    const categories = new Set(rules.map((r) => categoryOf(r.scope)));
    if (categories.size > 1) {
      const name = rules[0]?.name ?? key;
      const list = [...categories].join(', ');
      if (!source.mixed?.includes(name)) {
        throw new Error(`${name} has rules of different scopes (${list}); list it in kinds.mixed`);
      }
      mixed.push(`${name} (${list})`);
    }
    return [key, categoryOf(rules[0]?.scope)];
  });
  return { entries, mixed };
}

/** The generated `src/generated/categories.ts` of a diagram package. */
export function categoriesModule(
  g: Grammar,
  type: string,
  grammarFile: string,
  kindsText: string,
  source: KindSource
): string {
  const { entries, mixed } = categoryTable(g, kindKeys(kindsText, source.object), source);
  const name = `${type}Categories`;
  const mixedDoc =
    mixed.length === 0
      ? ''
      : ` *\n * Terminals with rules of different scopes take the first rule's category:\n${mixed
          .map((m) => ` * - ${m}\n`)
          .join('')}`;
  return `// Generated by tools/gen-grammar from ${grammarFile}.
// Do not edit: run \`pnpm gen:grammar\`.
import { kindCategories } from '@mermaid-js/core/parser-kit';
import { ${source.object} } from '../${source.module}';

/**
 * Highlight category of every ${type} token kind (D94), from the grammar file's \`:scope\`s,
 * the same categories the generated TextMate, Monarch and Lezer grammars use. The shared kinds
 * come from the parser kit; a kind of \`${source.object}\` missing here fails the type check.
${mixedDoc} */
export const ${name} = /* @__PURE__ */ kindCategories(${source.object}, {
${entries.map(([k, c]) => `  ${k}: '${c}',\n`).join('')}});
`;
}
