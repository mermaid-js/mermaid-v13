/**
 * Table-driven lexer built from a grammar's `@lexer` section, with jison's semantics: a stack
 * of modes, rules tried in file order (first match wins, not longest), and one last attempt
 * at the end of the text, where rules that match the empty string still fire. A rule with no
 * token name emits nothing. Dev and CI only (D54): slow is fine.
 */
import type { Grammar, LexRule } from './ebnf.ts';

export interface LexToken {
  name: string;
  /** The token's image (what jison's `yytext` would be). */
  text: string;
  /** Offsets into the lexer input. */
  start: number;
  end: number;
  /** Range including the text of `attach-next` / `attach-prev` rules next to it. */
  outerStart: number;
  outerEnd: number;
}

export interface LexResult {
  tokens: LexToken[];
  /** Offset of the first character no rule matched (lexing stops there, as in jison). */
  error: number | undefined;
}

export interface ModeLexer {
  lex(text: string): LexResult;
  /** Rules that apply in `mode`, in priority order. */
  rulesFor(mode: string): LexRule[];
}

/** The first rule of `rules` that matches at `p`, with its text. */
function firstMatch(
  rules: readonly LexRule[],
  compiled: ReadonlyMap<LexRule, RegExp>,
  text: string,
  p: number
): { rule: LexRule; match: string } | undefined {
  for (const r of rules) {
    const re = compiled.get(r) as RegExp;
    re.lastIndex = p;
    const m = re.exec(text);
    if (m) return { rule: r, match: m[0] };
  }
  return undefined;
}

/** Run a rule's actions on the mode stack; the token's image (`empty` and `fold` change it). */
function runActions(rule: LexRule, match: string, stack: string[], fired: Set<LexRule>): string {
  let image = match;
  for (const a of rule.actions) {
    switch (a.op) {
      case 'push':
        stack.push(a.mode as string);
        break;
      case 'push-once':
        if (!fired.has(rule)) stack.push(a.mode as string);
        break;
      case 'pop':
        if (stack.length > 1) stack.pop();
        break;
      case 'empty':
        image = '';
        break;
      case 'fold':
        image = image.replace(/\n\s*/g, '<br/>');
        break;
      case 'attach-next':
      case 'attach-prev':
        break;
    }
  }
  return image;
}

export function buildLexer(g: Grammar): ModeLexer {
  const compiled = new Map<LexRule, RegExp>();
  const flags = g.ignoreCase ? 'iy' : 'y';
  for (const r of g.lexRules) compiled.set(r, new RegExp(r.pattern, flags));
  const byMode = new Map<string, LexRule[]>();
  for (const m of ['INITIAL', ...g.modes]) {
    byMode.set(
      m,
      g.lexRules.filter((r) => r.modes.includes('*') || r.modes.includes(m))
    );
  }
  const rulesFor = (mode: string) => byMode.get(mode) ?? [];

  return {
    rulesFor,
    lex(text) {
      const tokens: LexToken[] = [];
      const stack = ['INITIAL'];
      const fired = new Set<LexRule>();
      let p = 0;
      let done = false;
      let pendingStart: number | undefined;
      let stalls = 0;
      while (!done) {
        if (p >= text.length) done = true;
        const mode = stack[stack.length - 1] ?? 'INITIAL';
        const found = firstMatch(rulesFor(mode), compiled, text, p);
        if (!found) {
          if (p >= text.length) break;
          return { tokens, error: p };
        }
        const { rule, match } = found;
        const start = p;
        const end = p + match.length;
        const before = stack.length + stack.join();
        const image = runActions(rule, match, stack, fired);
        fired.add(rule);
        if (rule.name !== undefined) {
          tokens.push({
            name: rule.name,
            text: image,
            start,
            end,
            outerStart: pendingStart ?? start,
            outerEnd: end,
          });
          pendingStart = undefined;
        } else if (rule.actions.some((a) => a.op === 'attach-next')) {
          pendingStart ??= start;
        } else if (rule.actions.some((a) => a.op === 'attach-prev')) {
          const last = tokens[tokens.length - 1];
          if (last && last.outerEnd === start && pendingStart === undefined) last.outerEnd = end;
          pendingStart = undefined;
        }
        // An empty match that changes nothing would loop forever (jison hangs there).
        if (end === p && before === stack.length + stack.join() && !done) {
          if (++stalls > 2) return { tokens, error: p };
        } else stalls = 0;
        p = end;
      }
      return { tokens, error: undefined };
    },
  };
}
