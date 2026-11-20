/**
 * Sentence generator for fuzzing and the grammar differential (DESIGN §4.4): random
 * derivations of the reference grammar, depth-bounded, with production weights and token
 * texts learnt from a corpus. Deterministic for a given seed. Dev and CI only.
 */
import { seededRandom } from '@mermaid-js/shared/random';
import type { ParseNode, Production, ReferenceParser } from './earley.ts';

/** What a corpus teaches the generator. */
export interface SentenceModel {
  /** Times each production (by index) was used in the corpus derivations. */
  uses: number[];
  /**
   * Source text for a token given the token before it: `"PREV TOKEN"` and `" TOKEN"` (no
   * previous token) → texts seen, with repeats (so sampling follows frequency).
   */
  texts: Map<string, string[]>;
}

export function emptyModel(parser: ReferenceParser): SentenceModel {
  return { uses: parser.productions.map(() => 0), texts: new Map() };
}

/** Count the productions of a derivation into `model`. */
export function learnDerivation(model: SentenceModel, tree: ParseNode): void {
  const stack = [tree];
  while (stack.length > 0) {
    const n = stack.pop() as ParseNode;
    if (n.production) model.uses[n.production.index] = (model.uses[n.production.index] ?? 0) + 1;
    stack.push(...n.children);
  }
}

/** Record that `text` was the source of a `name` token that followed `prev`. */
export function learnToken(model: SentenceModel, prev: string, name: string, text: string): void {
  for (const k of [`${prev} ${name}`, ` ${name}`]) {
    const list = model.texts.get(k) ?? [];
    if (list.length < 400) list.push(text);
    model.texts.set(k, list);
  }
}

export interface Sentence {
  tokens: string[];
  text: string;
}

export interface GenerateOptions {
  seed: number;
}

/** Nesting depth after which only the shortest productions are chosen. */
const MAX_DEPTH = 12;
/** Cap on tokens per sentence (later productions take the shortest way out). */
const MAX_TOKENS = 400;

export interface SentenceGenerator {
  generate(options: GenerateOptions): Sentence;
}

export function buildGenerator(parser: ReferenceParser, model: SentenceModel): SentenceGenerator {
  const byLhs = new Map<string, Production[]>();
  for (const p of parser.productions) {
    const list = byLhs.get(p.lhs) ?? [];
    list.push(p);
    byLhs.set(p.lhs, list);
  }
  // Height of the shortest derivation of each symbol / production (tokens: 0).
  const height = new Map<string, number>();
  const prodHeight = (p: Production): number =>
    1 + Math.max(0, ...p.rhs.map((s) => (parser.tokens.has(s) ? 0 : (height.get(s) ?? Infinity))));
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of parser.productions) {
      const h = prodHeight(p);
      if (h < (height.get(p.lhs) ?? Infinity)) {
        height.set(p.lhs, h);
        changed = true;
      }
    }
  }
  const start = parser.start;

  return {
    generate({ seed }) {
      const random = seededRandom(seed);
      const out: string[] = [];
      let steps = 0;
      const pick = <T>(items: T[], weight: (x: T) => number): T => {
        const total = items.reduce((s, x) => s + weight(x), 0);
        let r = random() * total;
        for (const x of items) {
          r -= weight(x);
          if (r <= 0) return x;
        }
        return items[items.length - 1] as T;
      };
      const expand = (sym: string, depth: number): void => {
        if (parser.tokens.has(sym)) {
          out.push(sym);
          return;
        }
        const prods = byLhs.get(sym) ?? [];
        let choices = prods;
        steps++;
        if (depth > MAX_DEPTH || out.length > MAX_TOKENS || steps > MAX_TOKENS * 4) {
          const best = Math.min(...prods.map(prodHeight));
          choices = prods.filter((p) => prodHeight(p) === best);
        }
        // Weighted by corpus use; unseen productions keep a small chance.
        const p = pick(choices, (q) => (model.uses[q.index] ?? 0) + 0.2);
        // Repetition (`X = X item`) does not count as nesting; the step budget bounds it.
        for (const s of p.rhs) expand(s, s === sym ? depth : depth + 1);
      };
      expand(start, 0);
      let text = '';
      let prev = '';
      for (const name of out) {
        const seen = model.texts.get(`${prev} ${name}`) ?? model.texts.get(` ${name}`) ?? [''];
        text += seen[Math.floor(random() * seen.length)] ?? '';
        prev = name;
      }
      return { tokens: out, text };
    },
  };
}
