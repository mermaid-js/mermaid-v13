// cspell:words Aycock Horspool nonterminals
/**
 * Reference parser built from a grammar's `@grammar` section: the EBNF is flattened to BNF
 * productions and run by an Earley recogniser (a chart of item tables, so any context-free
 * grammar works and ambiguity is harmless), then one derivation is read back from the chart.
 * Dev and CI only (D54): it is slow and that is fine.
 */
import type { Expr, Grammar } from './ebnf.ts';

export interface Production {
  index: number;
  lhs: string;
  rhs: string[];
  /** AST node type, on the productions of a rule declared `name @Type = …`. */
  ast: string | undefined;
  /** The grammar rule the production came from (generated helper rules name their parent). */
  rule: string;
}

export interface ParseNode {
  /** Grammar symbol: a rule, a generated helper (`rule$n`) or a token name. */
  symbol: string;
  production: Production | undefined;
  /** Token index range `[start, end)`. */
  start: number;
  end: number;
  children: ParseNode[];
}

export interface ReferenceParser {
  productions: Production[];
  tokens: ReadonlySet<string>;
  /** Parse a token-name sequence; undefined when the grammar rejects it. */
  parse(names: readonly string[]): ParseNode | undefined;
}

export function flatten(g: Grammar): Production[] {
  const out: Production[] = [];
  const tokens = new Set(g.tokens);
  let gen = 0;
  const add = (lhs: string, rhs: string[], ast: string | undefined, rule: string) => {
    out.push({ index: out.length, lhs, rhs, ast, rule });
  };
  const symbol = (e: Expr, rule: string): string => {
    if (e.t === 'sym') return e.name;
    const name = `${rule}$${++gen}`;
    lower(name, e, undefined, rule);
    return name;
  };
  const sequence = (e: Expr, rule: string): string[] =>
    e.t === 'seq' ? e.items.map((x) => symbol(x, rule)) : [symbol(e, rule)];
  const lower = (lhs: string, e: Expr, ast: string | undefined, rule: string): void => {
    switch (e.t) {
      case 'alt':
        for (const a of e.alts) add(lhs, sequence(a, rule), ast, rule);
        return;
      case 'opt':
        add(lhs, [], ast, rule);
        for (const a of e.e.t === 'alt' ? e.e.alts : [e.e]) add(lhs, sequence(a, rule), ast, rule);
        return;
      case 'rep': {
        const item = symbol(e.e, rule);
        add(lhs, e.min === 0 ? [] : [item], ast, rule);
        add(lhs, [lhs, item], ast, rule);
        return;
      }
      default:
        add(lhs, sequence(e, rule), ast, rule);
    }
  };
  for (const r of g.rules) {
    if (tokens.has(r.name)) throw new SyntaxError(`grammar: rule ${r.name} shadows a token`);
    lower(r.name, r.body, r.ast, r.name);
  }
  return out;
}

export function buildParser(g: Grammar): ReferenceParser {
  const productions = flatten(g);
  const tokens = new Set(g.tokens);
  const byLhs = new Map<string, Production[]>();
  for (const p of productions) {
    const list = byLhs.get(p.lhs) ?? [];
    list.push(p);
    byLhs.set(p.lhs, list);
  }
  // Nullable nonterminals (Aycock & Horspool: prediction also steps over them).
  const nullable = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of productions) {
      if (!nullable.has(p.lhs) && p.rhs.every((s) => nullable.has(s))) {
        nullable.add(p.lhs);
        changed = true;
      }
    }
  }

  const parse = (names: readonly string[]): ParseNode | undefined => {
    const n = names.length;
    // sets[k]: items as [production, dot, origin]; keys dedupe them.
    const sets: [Production, number, number][][] = [];
    const keys: Set<number>[] = [];
    const P = productions.length + 1;
    const key = (p: Production, dot: number, origin: number) => (origin * 64 + dot) * P + p.index;
    // completed[k]: nonterminal -> origins of its items completed at k.
    const completed: Map<string, Set<number>>[] = [];
    for (let k = 0; k <= n; k++) {
      sets.push([]);
      keys.push(new Set());
      completed.push(new Map());
    }
    const addItem = (k: number, p: Production, dot: number, origin: number) => {
      const id = key(p, dot, origin);
      const ks = keys[k] as Set<number>;
      if (ks.has(id)) return;
      ks.add(id);
      (sets[k] as [Production, number, number][]).push([p, dot, origin]);
    };
    for (const p of byLhs.get(g.start) ?? []) addItem(0, p, 0, 0);
    for (let k = 0; k <= n; k++) {
      const set = sets[k] as [Production, number, number][];
      for (let x = 0; x < set.length; x++) {
        const [p, dot, origin] = set[x] as [Production, number, number];
        const next = p.rhs[dot];
        if (next === undefined) {
          // complete
          const done = completed[k] as Map<string, Set<number>>;
          const origins = done.get(p.lhs) ?? new Set<number>();
          origins.add(origin);
          done.set(p.lhs, origins);
          for (const [q, qd, qo] of sets[origin] as [Production, number, number][]) {
            if (q.rhs[qd] === p.lhs) addItem(k, q, qd + 1, qo);
          }
        } else if (tokens.has(next)) {
          if (k < n && names[k] === next) addItem(k + 1, p, dot + 1, origin);
        } else {
          for (const q of byLhs.get(next) ?? []) addItem(k, q, 0, k);
          if (nullable.has(next)) addItem(k, p, dot + 1, origin);
        }
      }
    }
    const hasItem = (k: number, p: Production, dot: number, origin: number) =>
      (keys[k] as Set<number>).has(key(p, dot, origin));

    // Read one derivation back: right to left over each production's symbols.
    const failed = new Set<string>();
    const derive = (p: Production, i: number, j: number): ParseNode[] | undefined => {
      const memo = `${p.index}:${i}:${j}`;
      if (failed.has(memo)) return undefined;
      const walk = (k: number, pos: number): ParseNode[] | undefined => {
        if (k < 0) return pos === i ? [] : undefined;
        const sym = p.rhs[k] as string;
        if (tokens.has(sym)) {
          if (pos - 1 < i || names[pos - 1] !== sym || !hasItem(pos - 1, p, k, i)) return undefined;
          const rest = walk(k - 1, pos - 1);
          return (
            rest && [
              ...rest,
              { symbol: sym, production: undefined, start: pos - 1, end: pos, children: [] },
            ]
          );
        }
        const origins = [...((completed[pos] as Map<string, Set<number>>).get(sym) ?? [])].sort(
          (a, b) => a - b
        );
        for (const s of origins) {
          if (s < i || !hasItem(s, p, k, i)) continue;
          const child = node(sym, s, pos);
          if (!child) continue;
          const rest = walk(k - 1, s);
          if (rest) return [...rest, child];
        }
        return undefined;
      };
      const out = walk(p.rhs.length - 1, j);
      if (!out) failed.add(memo);
      return out;
    };
    const nodes = new Map<string, ParseNode | undefined>();
    const node = (sym: string, i: number, j: number): ParseNode | undefined => {
      const memo = `${sym}:${i}:${j}`;
      if (nodes.has(memo)) return nodes.get(memo);
      let found: ParseNode | undefined;
      for (const p of byLhs.get(sym) ?? []) {
        if (!hasItem(j, p, p.rhs.length, i)) continue;
        const children = derive(p, i, j);
        if (children) {
          found = { symbol: sym, production: p, start: i, end: j, children };
          break;
        }
      }
      nodes.set(memo, found);
      return found;
    };
    if (!(completed[n] as Map<string, Set<number>>).get(g.start)?.has(0)) return undefined;
    return node(g.start, 0, n);
  };

  return { productions, tokens, parse };
}

export interface AstShape {
  type: string;
  /** Token index range. */
  start: number;
  end: number;
  children: AstShape[];
}

/** The AST-typed nodes of a parse tree, nested as in the tree. */
export function astOf(tree: ParseNode): AstShape[] {
  const out: AstShape[] = [];
  const visit = (n: ParseNode, into: AstShape[]) => {
    const ast = n.production?.ast;
    if (ast && n.production?.lhs === n.production?.rule && n.end > n.start) {
      const shape: AstShape = { type: ast, start: n.start, end: n.end, children: [] };
      into.push(shape);
      for (const c of n.children) visit(c, shape.children);
    } else for (const c of n.children) visit(c, into);
  };
  visit(tree, out);
  return out;
}
