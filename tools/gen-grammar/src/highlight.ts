/**
 * Syntax highlighters generated from a grammar's lexer modes (DESIGN §4.4, R-LANG-2
 * artefacts): a TextMate grammar (VS Code), a Monarch tokenizer (Monaco) and a Lezer grammar
 * with its mode tokenizer (CodeMirror). Each mode becomes a highlighter state; `push` rules
 * open one, `pop` rules close it, and the `@trivia` rules apply everywhere. Highlighters are
 * line-based and work on the source as written, so they approximate the lexer at the edges
 * (a line break that closes a mode closes it at the end of the line).
 */
import type { Grammar, LexRule } from './ebnf.ts';

export interface HighlightNames {
  /** Language id, e.g. `mermaid-flowchart`. */
  id: string;
  /** File extensions without dots, e.g. `['mmd']`. */
  extensions: string[];
}

const TEXTMATE_SCOPES: Record<string, string> = {
  keyword: 'keyword.control',
  string: 'string.quoted',
  operator: 'keyword.operator',
  number: 'constant.numeric',
  comment: 'comment.line',
  punctuation: 'punctuation.definition',
  variable: 'variable.other',
  constant: 'constant.language',
  meta: 'meta.embedded',
  function: 'entity.name.function',
};
const MONARCH_TOKENS: Record<string, string> = {
  keyword: 'keyword',
  string: 'string',
  operator: 'operator',
  number: 'number',
  comment: 'comment',
  punctuation: 'delimiter',
  variable: 'variable',
  constant: 'constant',
  meta: 'annotation',
  function: 'function',
};
/** Lezer token names per scope (`Other` for text without a scope). */
const LEZER_TOKENS: Record<string, [name: string, tag: string]> = {
  keyword: ['Keyword', 't.keyword'],
  string: ['String', 't.string'],
  operator: ['Operator', 't.operator'],
  number: ['Number', 't.number'],
  comment: ['Comment', 't.lineComment'],
  punctuation: ['Punctuation', 't.punctuation'],
  variable: ['Variable', 't.variableName'],
  constant: ['Constant', 't.constant(t.name)'],
  meta: ['Meta', 't.meta'],
  function: ['Function', 't.function(t.variableName)'],
};

const has = (r: LexRule, op: string) => r.actions.some((a) => a.op === op);
const pushTarget = (r: LexRule) =>
  r.actions.find((a) => a.op === 'push' || a.op === 'push-once')?.mode;
const matchesEmpty = (r: LexRule) => new RegExp(`^(?:${r.pattern})$`).test('');
const scopeOf = (r: LexRule) => r.scope;

/** Rules in effect in `mode`, trivia first, in priority order. */
function rulesIn(g: Grammar, mode: string): LexRule[] {
  return [
    ...g.triviaRules,
    ...g.lexRules.filter((r) => r.modes.includes('*') || r.modes.includes(mode)),
  ];
}

/**
 * A JavaScript pattern as an Oniguruma one for TextMate: capturing groups made non-capturing
 * (TextMate numbers captures) and `[` inside a class escaped (Oniguruma nests classes).
 */
export function nonCapturing(pattern: string): string {
  let out = '';
  let cls = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      out += c + (pattern[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === '[' && cls) {
      out += '\\[';
      continue;
    }
    if (c === '[') {
      cls = true;
      out += c;
      continue;
    }
    if (c === ']') cls = false;
    if (c === '(' && !cls && pattern[i + 1] !== '?') {
      out += '(?:';
      continue;
    }
    out += c;
  }
  return out;
}

// ---- TextMate --------------------------------------------------------------------------

export function textMate(g: Grammar, names: HighlightNames): object {
  const suffix = `.${names.id}`;
  const scope = (r: LexRule) => {
    const s = scopeOf(r);
    return s ? (TEXTMATE_SCOPES[s] ?? s) + suffix : undefined;
  };
  const repository: Record<string, object> = {};
  const isEnd = (mode: string, r: LexRule) => mode !== 'INITIAL' && has(r, 'pop');
  // Each rule is defined once in the repository; modes include the rules they use.
  const ruleKey = (r: LexRule) => `${g.triviaRules.includes(r) ? 'trivia' : 'rule'}-${r.index}`;
  const define = (r: LexRule): string | undefined => {
    const key = ruleKey(r);
    if (key in repository) return key;
    const target = pushTarget(r);
    const name = scope(r);
    if (target === undefined) {
      if (matchesEmpty(r)) return undefined;
      repository[key] = name
        ? { match: nonCapturing(r.pattern), name }
        : { match: nonCapturing(r.pattern) };
      return key;
    }
    const ends = rulesIn(g, target).filter((e) => isEnd(target, e) && !pushTarget(e));
    const end = ends.length > 0 ? ends.map((e) => `(${nonCapturing(e.pattern)})`).join('|') : '$';
    const endCaptures: Record<string, object> = {};
    ends.forEach((e, k) => {
      const s = scope(e);
      if (s) endCaptures[String(k + 1)] = { name: s };
    });
    const rule: Record<string, unknown> = {
      begin: nonCapturing(r.pattern),
      end,
      patterns: [{ include: `#mode-${target}` }],
    };
    if (name) rule.beginCaptures = { '0': { name } };
    if (Object.keys(endCaptures).length > 0) rule.endCaptures = endCaptures;
    repository[key] = rule;
    return key;
  };
  for (const mode of ['INITIAL', ...g.modes]) {
    const patterns: object[] = [];
    for (const r of rulesIn(g, mode)) {
      if (isEnd(mode, r)) continue;
      const key = define(r);
      if (key) patterns.push({ include: `#${key}` });
    }
    repository[`mode-${mode}`] = { patterns };
  }
  return {
    $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
    name: names.id,
    scopeName: `source${suffix}`,
    fileTypes: names.extensions,
    patterns: [{ include: '#mode-INITIAL' }],
    repository,
  };
}

// ---- Monarch ---------------------------------------------------------------------------

export function monarch(g: Grammar, names: HighlightNames): object {
  const state = (m: string) => (m === 'INITIAL' ? 'root' : m);
  const tokenizer: Record<string, unknown[]> = {};
  for (const mode of ['INITIAL', ...g.modes]) {
    const rules: unknown[] = [];
    let lineEnd = false;
    for (const r of rulesIn(g, mode)) {
      const target = pushTarget(r);
      const pop = mode !== 'INITIAL' && has(r, 'pop');
      if (matchesEmpty(r) && target === undefined && !pop) continue;
      if (pop && r.pattern.includes('\\n')) lineEnd = true;
      const action: Record<string, string> = {
        token: MONARCH_TOKENS[scopeOf(r) ?? ''] ?? '',
      };
      if (pop && target !== undefined) action.switchTo = `@${state(target)}`;
      else if (pop) action.next = '@pop';
      else if (target !== undefined) action.next = `@${state(target)}`;
      rules.push([r.pattern, action]);
    }
    // Monarch reads lines without their line break: a mode a line break closes ends here.
    if (lineEnd) rules.push(['$', { token: '', next: '@pop' }]);
    tokenizer[state(mode)] = rules;
  }
  return { tokenPostfix: `.${names.id}`, defaultToken: '', tokenizer };
}

// ---- Lezer -----------------------------------------------------------------------------

/** Token names of the Lezer grammar, in a fixed order. */
export function lezerTokenNames(): string[] {
  return [...Object.values(LEZER_TOKENS).map(([n]) => n), 'Other'];
}

/** The `.grammar` file. Build it with `lezer-generator <file> -o <base>.parser.js`. */
export function lezerGrammar(g: Grammar, names: HighlightNames, tokensModule: string): string {
  const tokens = lezerTokenNames();
  return `// Generated by tools/gen-grammar from the ${names.id} grammar file. Do not edit.
// A highlighting grammar: the document is a flat list of tokens from the mode tokenizer.

@top Document { token* }

token { ${tokens.join(' | ')} }

@context modeContext from "${tokensModule}"

@external tokens modeTokens from "${tokensModule}" { ${tokens.join(', ')} }

@external propSource highlighting from "${tokensModule}"
`;
}

/** Mode table for the Lezer tokenizer: mode -> [pattern, token, push target, pop]. */
function lezerTable(g: Grammar): Record<string, [string, string, string | null, boolean][]> {
  const table: Record<string, [string, string, string | null, boolean][]> = {};
  for (const mode of ['INITIAL', ...g.modes]) {
    table[mode] = rulesIn(g, mode).map((r) => [
      r.pattern,
      (LEZER_TOKENS[scopeOf(r) ?? ''] ?? ['Other'])[0],
      pushTarget(r) ?? null,
      mode !== 'INITIAL' && has(r, 'pop'),
    ]);
  }
  return table;
}

/**
 * The tokenizer module the Lezer grammar imports: a context tracker holding the mode stack
 * and an external tokenizer running the mode's rules (first match wins). Imports the term
 * ids from `<base>.parser.terms.js`.
 */
export function lezerTokens(g: Grammar, names: HighlightNames, termsModule: string): string {
  const tags = Object.values(LEZER_TOKENS)
    .map(([n, t]) => `  ${n}: ${t},`)
    .join('\n');
  return `// Generated by tools/gen-grammar from the ${names.id} grammar file. Do not edit.
import { ContextTracker, ExternalTokenizer } from '@lezer/lr';
import { styleTags, tags as t } from '@lezer/highlight';
import * as TERMS from '${termsModule}';

/** mode -> [pattern, token, push target, pop] in priority order. */
const TABLE = ${JSON.stringify(lezerTable(g))};
const MODES = Object.fromEntries(
  Object.entries(TABLE).map(([mode, rules]) => [
    mode,
    rules.map(([p, token, push, pop]) => ({ re: new RegExp(p, 'y'), term: TERMS[token], push, pop })),
  ])
);

/** An immutable mode stack. */
class Modes {
  constructor(stack) {
    this.stack = stack;
    let h = 0;
    for (const m of stack.join('/')) h = (h * 31 + m.charCodeAt(0)) | 0;
    this.hash = h;
  }
  get top() {
    return this.stack[this.stack.length - 1];
  }
  apply(rule) {
    let stack = this.stack;
    if (rule.pop && stack.length > 1) stack = stack.slice(0, -1);
    if (rule.push) stack = [...stack, rule.push];
    return stack === this.stack ? this : new Modes(stack);
  }
}
const START = new Modes(['INITIAL']);

function ahead(input) {
  let s = '';
  for (let i = 0; i < 4096; i++) {
    const c = input.peek(i);
    if (c < 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** The next token: [term, length, modes after it]; empty matches only change the mode. */
function next(modes, input) {
  const text = ahead(input);
  if (text.length === 0) return undefined;
  for (let guard = 0; guard < 8; guard++) {
    let changed = false;
    for (const rule of MODES[modes.top] ?? []) {
      rule.re.lastIndex = 0;
      const m = rule.re.exec(text);
      if (!m) continue;
      if (m[0].length > 0) return [rule.term, m[0].length, modes.apply(rule)];
      if (rule.push || rule.pop) {
        const after = modes.apply(rule);
        if (after !== modes) {
          modes = after;
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
  return [TERMS.Other, 1, modes];
}

export const modeContext = new ContextTracker({
  start: START,
  shift(context, term, stack, input) {
    const r = next(context, input);
    return r ? r[2] : context;
  },
  hash: (context) => context.hash,
  strict: false,
});

export const modeTokens = new ExternalTokenizer(
  (input, stack) => {
    const r = next(stack.context, input);
    if (r) input.acceptToken(r[0], r[1]);
  },
  { contextual: true }
);

export const highlighting = styleTags({
${tags}
});
`;
}
