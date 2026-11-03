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

export function buildLexer(g: Grammar): ModeLexer {
  const compiled = new Map<LexRule, RegExp>();
  for (const r of g.lexRules) compiled.set(r, new RegExp(r.pattern, 'y'));
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
        let rule: LexRule | undefined;
        let match = '';
        for (const r of rulesFor(mode)) {
          const re = compiled.get(r) as RegExp;
          re.lastIndex = p;
          const m = re.exec(text);
          if (m) {
            rule = r;
            match = m[0];
            break;
          }
        }
        if (!rule) {
          if (p >= text.length) break;
          return { tokens, error: p };
        }
        const start = p;
        const end = p + match.length;
        let image = match;
        const before = stack.length + stack.join();
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
