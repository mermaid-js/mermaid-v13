/**
 * The runtime keyword doc table of a diagram (D93): a one-line doc for every keyword and
 * operator token kind, taken from the grammar file's `(** … *)` rule docs, the same text the
 * syntax reference page prints. Hover shows it; nothing is written twice.
 *
 * A terminal's doc is that of, in order: the documented rule it starts with the fewest other
 * terminals, counting only rules that start with keywords and operators (`header` for `GRAPH`;
 * not `Chain`, whose ids may be `default`); else the first documented rule that names it
 * (`end` → `Subgraph`); else the first that holds it through rules with no doc of their own
 * (`&` → `Chain`). The doc is the rule doc's first paragraph, on one line.
 */
import type { Expr, Grammar, LexRule } from './ebnf.ts';
import { symbolsOf } from './ebnf.ts';
import { categoryOf } from './highlight.ts';

/** A kind key or grammar terminal name reduced for matching: `acc_title` ~ `AccTitle`. */
const fold = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Categories whose kinds get a doc: what hover explains (keywords and arrows). */
const DOCUMENTED = new Set(['Keyword', 'Operator']);

export interface DocTable {
  /** Kind key → one-line doc, in kind order. */
  entries: [key: string, doc: string][];
  /** Keyword or operator kinds no documented rule mentions. */
  missing: string[];
}

/** First paragraph of a rule doc, on one line. */
const oneLine = (doc: string) => (doc.split(/\n\s*\n/)[0] ?? '').replace(/\s+/g, ' ').trim();

/** Terminals each rule can start with, and whether it can match nothing. */
function firstSets(g: Grammar): Map<string, Set<string>> {
  const rules = new Map(g.rules.map((r) => [r.name, r]));
  const first = new Map(g.rules.map((r) => [r.name, new Set<string>()]));
  const nullable = new Set<string>();
  const walk = (e: Expr, into: Set<string>): boolean => {
    switch (e.t) {
      case 'sym': {
        if (!rules.has(e.name)) {
          into.add(e.name);
          return false;
        }
        for (const t of first.get(e.name) ?? []) into.add(t);
        return nullable.has(e.name);
      }
      case 'seq':
        for (const x of e.items) if (!walk(x, into)) return false;
        return true;
      case 'alt': {
        let any = false;
        for (const x of e.alts) any = walk(x, into) || any;
        return any;
      }
      case 'opt':
        walk(e.e, into);
        return true;
      case 'rep':
        return walk(e.e, into) || e.min === 0;
    }
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of g.rules) {
      const set = first.get(r.name)!;
      const before = set.size;
      const empty = walk(r.body, set);
      if (set.size !== before || (empty && !nullable.has(r.name))) changed = true;
      if (empty) nullable.add(r.name);
    }
  }
  return first;
}

/** The doc of every keyword and operator kind in `keys`, matched to terminals by name. */
export function docTable(g: Grammar, keys: string[]): DocTable {
  const byName = new Map<string, LexRule>();
  for (const r of g.lexRules) {
    if (r.name !== undefined && !byName.has(fold(r.name))) byName.set(fold(r.name), r);
  }
  const first = firstSets(g);
  const rules = new Map(g.rules.map((r) => [r.name, r]));
  const documented = g.rules.filter((r) => r.doc !== undefined);
  const isDocumented = (t: string) => DOCUMENTED.has(categoryOf(byName.get(fold(t))?.scope));
  /** Terminals a documented rule holds, through rules without a doc of their own. */
  const reach = (start: string): Set<string> => {
    const out = new Set<string>();
    const seen = new Set([start]);
    const todo = [start];
    while (todo.length > 0) {
      for (const s of symbolsOf(rules.get(todo.pop()!)!.body)) {
        const r = rules.get(s);
        if (!r) out.add(s);
        else if (r.doc === undefined && !seen.has(s)) {
          seen.add(s);
          todo.push(s);
        }
      }
    }
    return out;
  };
  const docOf = (terminal: string): string | undefined => {
    // 1. The rule it starts, of those that start with keywords and operators only.
    let best: { size: number; doc: string } | undefined;
    for (const r of documented) {
      const set = first.get(r.name)!;
      if (!set.has(terminal) || ![...set].every(isDocumented)) continue;
      if (best === undefined || set.size < best.size) best = { size: set.size, doc: r.doc! };
    }
    // 2. The first rule that names it; 3. the first that holds it through undocumented rules.
    const doc =
      best?.doc ??
      documented.find((r) => symbolsOf(r.body).includes(terminal))?.doc ??
      documented.find((r) => reach(r.name).has(terminal))?.doc;
    return doc === undefined ? undefined : oneLine(doc);
  };
  const entries: [string, string][] = [];
  const missing: string[] = [];
  for (const key of keys) {
    const rule = byName.get(fold(key));
    if (!rule?.name || !DOCUMENTED.has(categoryOf(rule.scope))) continue;
    const doc = docOf(rule.name);
    if (doc === undefined) missing.push(key);
    else entries.push([key, doc]);
  }
  return { entries, missing };
}

/** The generated `src/generated/docs.ts` of a diagram package. */
export function docsModule(
  g: Grammar,
  type: string,
  grammarFile: string,
  keys: string[],
  source: { module: string; object: string }
): string {
  const { entries, missing } = docTable(g, keys);
  const missingDoc =
    missing.length === 0
      ? ''
      : ` *\n * No documented rule mentions: ${missing.map((m) => `\`${m}\``).join(', ')}.\n`;
  return `// Generated by tools/gen-grammar from ${grammarFile}.
// Do not edit: run \`pnpm gen:grammar\`.
import { ${source.object} } from '../${source.module}';

/**
 * One-line doc of each ${type} keyword and operator kind (D93), from the grammar file's rule
 * docs: the text the syntax reference page shows. Hover reads it.
${missingDoc} */
export const ${type}Docs: Readonly<Partial<Record<number, string>>> = {
${entries.map(([k, d]) => `  [${source.object}.${k}]: ${JSON.stringify(d)},\n`).join('')}};
`;
}
