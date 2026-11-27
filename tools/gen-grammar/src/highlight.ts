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

/**
 * The highlight category of a `:scope` (D94): the Lezer token name, `Other` for none. The
 * kind → category table and all three highlighters derive from it.
 */
export function categoryOf(scope = ''): string {
  return (LEZER_TOKENS[scope] ?? ['Other'])[0];
}

const has = (r: LexRule, op: string) => r.actions.some((a) => a.op === op);
const pushTarget = (r: LexRule) =>
  r.actions.find((a) => a.op === 'push' || a.op === 'push-once')?.mode;
const matchesEmpty = (pattern: string) => new RegExp(`^(?:${pattern})$`).test('');

/**
 * The pattern a highlighter uses for a rule that changes no mode. TextMate and Monarch cannot
 * take a rule that matches empty text (it makes no progress): `atom*` becomes `atom+`, which
 * matches the same non-empty text (an atom: one character, escape or class, or a `(?:…)`
 * group with no group inside that cannot match empty); any other pattern that can match
 * empty is left out.
 */
function progressPattern(r: LexRule): string | undefined {
  const pattern = lineBased(r.pattern);
  if (!matchesEmpty(pattern)) return pattern;
  const star =
    /^(?:\\.|\[(?:\\.|[^\]\\])*\]|[^\\[\](){}|*+?]|\(\?:(?:\\.|\[(?:\\.|[^\]\\])*\]|[^\\[\]()])*\))\*$/;
  // `atom+` makes progress only if the atom cannot match empty (a group may: `(?:a?)`).
  const atom = pattern.slice(0, -1);
  return star.test(pattern) && !matchesEmpty(atom) ? `${atom}+` : undefined;
}
const scopeOf = (r: LexRule) => r.scope;

/** What a rule whose text may run over line breaks, `begin[\s\S]*?end`, is made of. */
const ANY_LAZY = '[\\s\\S]*?';
/**
 * A rule that may span lines (a multi-line directive): TextMate and Monarch read lines one at
 * a time, so they read it as a scope from `begin` to the first `end`. Lezer runs the pattern.
 */
function spanOf(r: LexRule): { begin: string; end: string } | undefined {
  const i = r.pattern.indexOf(ANY_LAZY);
  if (i <= 0 || pushTarget(r) !== undefined || has(r, 'pop')) return undefined;
  const begin = r.pattern.slice(0, i);
  if (matchesEmpty(begin)) return undefined;
  return { begin, end: r.pattern.slice(i + ANY_LAZY.length) };
}

/**
 * `(?:[^"\n]|\n(?!…))*`, or with `+`: the characters of a negated class, and a line break not
 * followed by something. Group 1 is the class without its `\n`, group 2 the quantifier.
 */
const LINE_BREAK_UNLESS = /^\(\?:(\[\^(?:\\.|[^\]\\])*?)\\n\]\|\\n\(\?!.*\)\)([*+])$/s;

/**
 * A pattern as a line-based highlighter (TextMate, Monarch) runs it: one that starts with a
 * line break and blanks (`\n\s*end note`) cannot match there, as the line break ends the line
 * before; it matches at the start of the next line instead (`^\s*end note`). Text up to such
 * a line break is read a line at a time.
 */
function lineBased(pattern: string): string {
  // Text up to a line break before something (`[\s\S]*?(?=\n\s*end note)`): whole lines.
  if (pattern.startsWith(`${ANY_LAZY}(?=\\n`)) return '.+';
  // Text that goes on over a line break unless something follows it (`(?:[^"\n]|\n(?!end))*`):
  // a line never holds the break, so it is the class without it (`[^"]*`).
  const unlessFollowed = LINE_BREAK_UNLESS.exec(pattern);
  if (unlessFollowed) return `${unlessFollowed[1]}]${unlessFollowed[2]}`;
  const lead = '\\n\\s*';
  return pattern.startsWith(lead) && pattern.length > lead.length
    ? `^\\s*${pattern.slice(lead.length)}`
    : pattern;
}

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

/** A pattern as TextMate runs it, and a rule's TextMate scope name. */
interface TextMateText {
  tm: (pattern: string) => string;
  scope: (r: LexRule) => string | undefined;
}

const isEnd = (mode: string, r: LexRule) => mode !== 'INITIAL' && has(r, 'pop');
const endsIn = (g: Grammar, mode: string) => rulesIn(g, mode).filter((e) => isEnd(mode, e));
/** Rules that pop `mode` and push another (Monarch's switchTo), in priority order. */
const switchesIn = (g: Grammar, mode: string) =>
  endsIn(g, mode).filter((e) => pushTarget(e) !== undefined);
/** Rules that pop `mode` and push none, in priority order. */
const popsIn = (g: Grammar, mode: string) =>
  endsIn(g, mode).filter((e) => pushTarget(e) === undefined);

/**
 * The pops that end a chain holding `mode`: its own, and those of the modes its
 * pop-then-push rules reach (`mode` too, if a cycle of them does), once each. Where the
 * chain's last scope ends, one of them follows.
 */
function terminalsIn(g: Grammar, mode: string) {
  const deeper = new Set<LexRule>();
  const seen = new Set<string>();
  const visit = (m: string): void => {
    for (const next of switchesIn(g, m).map((e) => pushTarget(e)!)) {
      if (seen.has(next)) continue;
      seen.add(next);
      for (const e of popsIn(g, next)) deeper.add(e);
      visit(next);
    }
  };
  visit(mode);
  return { own: popsIn(g, mode), deeper: [...deeper] };
}

/**
 * The end of a chain holding `mode`. The outermost chain (`take`) takes the text of a pop
 * of a mode its switches reached (with its scope), where such a scope ended before it;
 * `mode`'s own pops end its phase, and the chain ends after it (`(?!\G)`). A chain inside
 * a switch ends before either, for the outermost to take. A pop that matches only empty
 * text is tried last, as it takes nothing; a pop of a reached mode never ends the chain
 * where it opened (`\G`), where the lexer is still in `mode`.
 */
function chainEnd(g: Grammar, { tm, scope }: TextMateText, mode: string, take: boolean) {
  const { own, deeper } = terminalsIn(g, mode);
  const onlyEmpty = (r: LexRule) => r.pattern.replaceAll('(?:)', '') === '';
  const reached = [...deeper.filter((r) => !onlyEmpty(r)), ...deeper.filter(onlyEmpty)];
  if (!take) {
    const end = [
      ...own.map((e) => `(?=${tm(e.pattern)})`),
      ...reached.map((e) => `(?!\\G)(?=${tm(e.pattern)})`),
    ];
    return { end: end.join('|') || '(?!\\G)', endCaptures: {} };
  }
  const endCaptures: Record<string, object> = {};
  const end = reached.map((e, i) => {
    const s = scope(e);
    if (s) endCaptures[String(i + 1)] = { name: s };
    return `(?!\\G)(${tm(e.pattern)})`;
  });
  return { end: [...end, '(?!\\G)'].join('|'), endCaptures };
}

/**
 * Where the switch `e` of `mode` may open in a chain: where the chain's begin or its phase
 * ended, so not before a pop of `mode` the lexer tries first, nor (after `\G`) before a
 * pop of a mode the chain reached, where a switch's scope ended and the chain ends (#1356).
 * A pop that matches empty text follows everywhere, so it is no sign of either.
 */
function opensAt(g: Grammar, tm: (p: string) => string, e: LexRule, mode: string) {
  const { own, deeper } = terminalsIn(g, mode);
  const first = own.filter((r) => r.index < e.index).map((r) => tm(r.pattern));
  const after = deeper.filter((r) => !matchesEmpty(lineBased(r.pattern))).map((r) => tm(r.pattern));
  return (
    (first.length > 0 ? `(?!${first.join('|')})` : '') +
    (after.length > 0 ? `(?:\\G|(?!${after.join('|')}))` : '')
  );
}

export function textMate(g: Grammar, names: HighlightNames): object {
  const suffix = `.${names.id}`;
  // Oniguruma's `(?i)` makes the rest of the (group of the) pattern ignore case.
  const tm = (p: string) => {
    const pattern = nonCapturing(lineBased(p));
    return g.ignoreCase ? `(?i)${pattern}` : pattern;
  };
  const scope = (r: LexRule) => {
    const s = scopeOf(r);
    return s ? (TEXTMATE_SCOPES[s] ?? s) + suffix : undefined;
  };
  const repository: Record<string, object> = {};
  /**
   * The end of a scope holding `mode`, its alternatives in priority order: a plain pop takes
   * its text (and scope), a pop-then-push ends the scope before its text; with `ahead`, every
   * end does (the scope is in a chain, which takes the text). TextMate tries the end before
   * the mode's other rules at a position; `byPriority` makes an end give way where a rule the
   * lexer tries before it matches, as the lexer does.
   */
  const endOf = (mode: string, byPriority = false, ahead = false) => {
    const endCaptures: Record<string, object> = {};
    let group = 0;
    const before: string[] = [];
    const end: string[] = [];
    const switches: string[] = [];
    for (const e of rulesIn(g, mode)) {
      if (!isEnd(mode, e)) {
        const pattern =
          spanOf(e)?.begin ?? (pushTarget(e) === undefined ? progressPattern(e) : e.pattern);
        if (byPriority && pattern !== undefined) before.push(tm(pattern));
        continue;
      }
      const guard = before.length > 0 ? `(?!${before.join('|')})` : '';
      if (ahead || pushTarget(e) !== undefined) {
        end.push(`${guard}(?=${tm(e.pattern)})`);
        if (pushTarget(e) !== undefined) switches.push(end.at(-1)!);
        continue;
      }
      group++;
      const s = scope(e);
      if (s) endCaptures[String(group)] = { name: s };
      end.push(`${guard}(${tm(e.pattern)})`);
    }
    return { end: end.join('|') || '$', endCaptures, switches };
  };
  /** A scope that opens at `r` and holds `mode` up to one of its ends. */
  const scoped = (r: LexRule, mode: string) => {
    const { end, endCaptures } = endOf(mode);
    const name = scope(r);
    const rule: Record<string, unknown> = {
      begin: tm(r.pattern),
      end,
      patterns: [{ include: `#mode-${mode}` }],
    };
    if (name) rule.beginCaptures = { '0': { name } };
    if (Object.keys(endCaptures).length > 0) rule.endCaptures = endCaptures;
    return rule;
  };
  /**
   * A rule that pushes `mode` when `mode` has pop-then-push rules (Monarch's switchTo).
   * TextMate pops a scope only back to its parent, so the rule opens a chain scope. Its phase
   * opens at once (`\G`, where the chain's begin ended; not where an end matches, as TextMate
   * stops a line at a scope that opens and ends without progress) and holds `mode` until one
   * of its ends, which keep the lexer's priority among the mode's rules. A pop-then-push ends
   * it before the rule's text, where the chain opens that rule's own scope for the next mode
   * (a chain again if that mode switches too). That scope ends before the next mode's pops,
   * and the outermost chain takes their text as its end (`take`; a chain inside a switch
   * ends before it too), so the chain ends where the lexer leaves the modes: a scope cannot
   * end right after one inside it ended. The outermost chain's phase takes `mode`'s own pops,
   * and the chain ends after it (`(?!\G)`). A switch whose scope ended is not opened again
   * ({@link opensAt}).
   */
  const chain = (begin: string, name: string | undefined, mode: string, take = true) => {
    // The outermost chain's phase takes `mode`'s own pops; one inside a switch ends before them.
    const phase = take ? `phase-${mode}` : `phase-${mode}-ahead`;
    if (!(phase in repository)) {
      const { end, endCaptures, switches } = endOf(mode, true, !take);
      const opens = take ? switches.join('|') : end;
      const rule: Record<string, unknown> = {
        begin: `\\G(?!${opens})`,
        end,
        patterns: [{ include: `#mode-${mode}` }],
      };
      if (Object.keys(endCaptures).length > 0) rule.endCaptures = endCaptures;
      repository[phase] = rule;
    }
    const { end, endCaptures } = chainEnd(g, { tm, scope }, mode, take);
    const switches = switchesIn(g, mode);
    // Where a switch opens depends on `mode` ({@link opensAt}), so its scope is `mode`'s.
    const keyOf = (e: LexRule) => `switch-${mode}-${e.index}`;
    for (const e of switches) {
      const key = keyOf(e);
      if (key in repository) continue;
      repository[key] = {}; // a cycle of switches includes it before it is built
      const next = pushTarget(e)!;
      const at = `${opensAt(g, tm, e, mode)}${tm(e.pattern)}`;
      const label = scope(e);
      const rule: Record<string, unknown> = {
        begin: at,
        end: endOf(next, true, true).end,
        patterns: [{ include: `#mode-${next}` }],
      };
      if (label) rule.beginCaptures = { '0': { name: label } };
      repository[key] = switchesIn(g, next).length > 0 ? chain(at, label, next, false) : rule;
    }
    const rule: Record<string, unknown> = {
      begin,
      end,
      applyEndPatternLast: 1,
      patterns: [{ include: `#${phase}` }, ...switches.map((e) => ({ include: `#${keyOf(e)}` }))],
    };
    if (name) rule.beginCaptures = { '0': { name } };
    if (Object.keys(endCaptures).length > 0) rule.endCaptures = endCaptures;
    return rule;
  };
  // Each rule is defined once in the repository; modes include the rules they use.
  const ruleKey = (r: LexRule) => `${g.triviaRules.includes(r) ? 'trivia' : 'rule'}-${r.index}`;
  const define = (r: LexRule): string | undefined => {
    const key = ruleKey(r);
    if (key in repository) return key;
    const target = pushTarget(r);
    const name = scope(r);
    const span = spanOf(r);
    if (span) {
      const rule = { begin: tm(span.begin), end: tm(span.end) };
      repository[key] = name ? { ...rule, name } : rule;
      return key;
    }
    if (target === undefined) {
      const pattern = progressPattern(r);
      if (pattern === undefined) return undefined;
      repository[key] = name ? { match: tm(pattern), name } : { match: tm(pattern) };
      return key;
    }
    repository[key] =
      switchesIn(g, target).length > 0 ? chain(tm(r.pattern), scope(r), target) : scoped(r, target);
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
  Object.assign(repository, textMateFrontMatter(suffix));
  return {
    $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
    name: names.id,
    scopeName: `source${suffix}`,
    fileTypes: names.extensions,
    patterns: [{ include: '#front-matter-start' }, { include: '#mode-INITIAL' }],
    repository,
  };
}

/** A YAML key up to its `:` (a list item's `- ` included), as front matter colours it. */
const YAML_KEY = '[^\\S\\n]*(?:- )?[^\\s#:\'"-][^:#\\n]*(?=:(?:\\s|$))';

/**
 * Front matter as Monarch reads it (`MONARCH_FRONT_MATTER`): a `---` fence on the first
 * non-blank line, at any indent, up to the next `---` line. `front-matter-start` opens at the
 * start of the text when the first line is blank or a fence, passes blank lines and ends before
 * any other text. An opening fence inside it starts `front-matter` (fences meta, YAML keys
 * variables, `#` comments comments); the closing fence starts `front-matter-body`, which holds
 * the diagram to the end of the text, so a later `---` line opens nothing. Neither ends (`(?!)`
 * never matches): an unclosed block runs to the end of the text, as in Monarch.
 */
function textMateFrontMatter(suffix: string): Record<string, object> {
  const fence = '^[^\\S\\n]*---[^\\S\\n]*$';
  const meta = { '0': { name: `${TEXTMATE_SCOPES.meta}${suffix}` } };
  return {
    'front-matter-start': {
      begin: '\\A(?=[^\\S\\n]*(?:---[^\\S\\n]*)?$)',
      end: '(?=\\S)',
      // The opening fence wins over the end at the same position.
      applyEndPatternLast: 1,
      patterns: [{ include: '#front-matter' }],
    },
    'front-matter': {
      begin: fence,
      beginCaptures: meta,
      end: '(?!)',
      patterns: [
        { include: '#front-matter-body' },
        { match: '#.*', name: `${TEXTMATE_SCOPES.comment}${suffix}` },
        {
          match: `^${YAML_KEY}`,
          name: `${TEXTMATE_SCOPES.variable}${suffix}`,
        },
      ],
    },
    'front-matter-body': {
      begin: fence,
      beginCaptures: meta,
      end: '(?!)',
      patterns: [{ include: '#mode-INITIAL' }],
    },
  };
}

// ---- Monarch ---------------------------------------------------------------------------

export function monarch(g: Grammar, names: HighlightNames): object {
  const state = (m: string) => (m === 'INITIAL' ? 'root' : m);
  const tokenizer: Record<string, unknown[]> = {};
  for (const mode of ['INITIAL', ...g.modes]) {
    const rules: unknown[] = [];
    for (const r of rulesIn(g, mode)) {
      const target = pushTarget(r);
      const pop = mode !== 'INITIAL' && has(r, 'pop');
      const token = MONARCH_TOKENS[scopeOf(r) ?? ''] ?? '';
      const span = spanOf(r);
      if (span) {
        const inside = `span${g.triviaRules.includes(r) ? 'Trivia' : 'Rule'}${r.index}`;
        rules.push([span.begin, { token, next: `@${inside}` }]);
        tokenizer[inside] = [
          [span.end, { token, next: '@pop' }],
          [`(?:(?!${span.end})[\\s\\S])+`, { token }],
        ];
        continue;
      }
      const pattern = target === undefined && !pop ? progressPattern(r) : r.pattern;
      if (pattern === undefined) continue;
      const action: Record<string, string> = { token };
      if (pop && target !== undefined) action.switchTo = `@${state(target)}`;
      else if (pop) action.next = '@pop';
      else if (target !== undefined) action.next = `@${state(target)}`;
      rules.push([lineBased(pattern), action]);
    }
    tokenizer[state(mode)] = rules;
  }
  Object.assign(tokenizer, MONARCH_FRONT_MATTER);
  // `includeLF`: each line is read with its line break, so a rule that ends a mode at a line
  // break matches it as in v12. (Monaco runs no rule at the end of a line, so a `$` rule never
  // fires there.)
  return {
    tokenPostfix: `.${names.id}`,
    defaultToken: '',
    ...(g.ignoreCase ? { ignoreCase: true } : {}),
    includeLF: true,
    start: 'frontMatterStart',
    tokenizer,
  };
}

/**
 * Front matter, as core's preprocess finds it: a `---` fence on the first non-blank line, at
 * any indent, up to the next `---` line. The tokenizer starts in `frontMatterStart`, which
 * passes blank lines, reads an opening fence, or moves to `root` without reading anything.
 * Inside, fences are meta, YAML keys variables and `#` comments comments, so no YAML quote or
 * bracket opens a diagram mode. Limits (Monarch keeps no indent and cannot look ahead): a
 * closing fence at another indent than the opening one also closes, and an unclosed block
 * runs to the end of the text, as it does while being typed.
 */
const FENCE = '^[^\\S\\n]*---[^\\S\\n]*(?:\\n|$)';
const MONARCH_FRONT_MATTER = {
  frontMatterStart: [
    [FENCE, { token: 'annotation', switchTo: '@frontMatter' }],
    // A blank line (Monaco evaluates the rules once on an empty line too).
    ['[^\\S\\n]*(?:\\n|$)', { token: '' }],
    ['', { token: '', switchTo: '@root' }],
  ],
  frontMatter: [
    [FENCE, { token: 'annotation', switchTo: '@root' }],
    ['[^\\S\\n]*#.*', { token: 'comment' }],
    [YAML_KEY, { token: 'variable' }],
    ['[^#]+', { token: '' }],
  ],
};

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

type LezerRow = [pattern: string, token: string, push: string | null, pop: boolean];

/**
 * Front matter for the Lezer tokenizer, read as Monarch and TextMate read it: a `---` fence
 * on the first non-blank line, at any indent, up to the next `---` line; an unclosed block
 * runs to the end of the text. The tokenizer starts in `@frontMatterStart` above `INITIAL`
 * (grammar modes have no `@`): it pops at once unless a fence follows blank lines, so a text
 * without front matter tokenizes as before. After the closing fence the stack is `INITIAL`
 * alone, as for a text with none. No trivia rule runs in these modes.
 */
const LEZER_FRONT_MATTER: Record<string, LezerRow[]> = {
  '@frontMatterStart': [
    ['(?=(?:[^\\S\\n]*\\n)*[^\\S\\n]*---[^\\S\\n]*(?:\\n|$))', 'Other', '@frontMatterOpen', true],
    ['', 'Other', null, true],
  ],
  '@frontMatterOpen': [
    [FENCE, 'Meta', '@frontMatter', true],
    ['[^\\S\\n]*\\n', 'Other', null, false],
  ],
  '@frontMatter': [
    [FENCE, 'Meta', null, true],
    ['[^\\S\\n]*#[^\\n]*', 'Comment', null, false],
    [`^${YAML_KEY}`, 'Variable', null, false],
    ['[^#\\n]+|\\n', 'Other', null, false],
  ],
};

/** Mode table for the Lezer tokenizer: mode -> [pattern, token, push target, pop]. */
function lezerTable(g: Grammar): Record<string, LezerRow[]> {
  const table: Record<string, LezerRow[]> = { ...LEZER_FRONT_MATTER };
  for (const mode of ['INITIAL', ...g.modes]) {
    table[mode] = rulesIn(g, mode).map((r) => [
      r.pattern,
      categoryOf(scopeOf(r)),
      pushTarget(r) ?? null,
      mode !== 'INITIAL' && has(r, 'pop'),
    ]);
  }
  return table;
}

/** The part of the Lezer tokenizer module that does not depend on the grammar. */
const LEZER_TOKENIZER_BODY = `/** An immutable mode stack. */
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
/** Front matter modes (\`@…\`) sit above INITIAL and pop back to it. */
const START = new Modes(['INITIAL', '@frontMatterStart']);

/** How far a token may look ahead. Each token depends on this much text (incremental reuse). */
const LOOKAHEAD = 4096;

/** The first trivia match at or after \`from\` in \`s\`, at most \`limit\` ends; -1 if none. */
function triviaCut(s, from, limit) {
  let cut = -1;
  for (const re of TRIVIA) {
    re.lastIndex = from;
    const m = re.exec(s);
    if (m && m.index + m[0].length <= limit && (cut < 0 || m.index < cut)) cut = m.index;
  }
  return cut;
}

/**
 * Per Lezer input (immutable while it is parsed): its text and, per trivia rule, the last
 * match found, so a token's trivia search reuses the one before. Matches do not depend on
 * where the search starts, so a match found from \`a\` is the first one from any \`b\` in
 * [a, match]. Single-range inputs only; others read char by char (\`aheadSlow\`).
 */
const texts = new WeakMap();
function textOf(input) {
  const inner = input.input;
  const range = input.ranges[0];
  let entry = texts.get(inner);
  if (!entry || entry.from !== range.from || entry.to !== range.to) {
    entry = {
      from: range.from,
      to: range.to,
      text: inner.read(range.from, range.to),
      found: TRIVIA.map(() => ({ from: Infinity, at: -1, end: -1 })),
    };
    texts.set(inner, entry);
  }
  return entry;
}

/** The first trivia start in (from, end) whose match ends by \`end\`; \`end\` if none. */
function nextTrivia(entry, from, end) {
  let cut = end;
  let exact = true;
  for (let i = 0; i < TRIVIA.length; i++) {
    const f = entry.found[i];
    if (!(f.from <= from && (f.at < 0 || from <= f.at))) {
      const re = TRIVIA[i];
      re.lastIndex = from;
      const m = re.exec(entry.text);
      f.from = from;
      f.at = m ? m.index : -1;
      f.end = m ? m.index + m[0].length : -1;
    }
    if (f.at >= 0 && f.at < cut) {
      if (f.end <= end) cut = f.at;
      else exact = false; // runs past the lookahead: the window may hold another match
    }
  }
  return exact ? cut : -1;
}

/**
 * The text a token is matched against: the lookahead, cut at the next trivia unless \`whole\`
 * (front matter, where no trivia rule runs).
 */
function ahead(input, whole) {
  if (!input.input || !input.ranges || input.ranges.length !== 1) return aheadSlow(input, whole);
  const entry = textOf(input);
  const at = input.pos - entry.from;
  const end = Math.min(at + LOOKAHEAD, entry.text.length);
  if (end <= at) return '';
  input.peek(end - at - 1); // record the lookahead, as reading each character would
  if (whole) return entry.text.slice(at, end);
  const cut = nextTrivia(entry, at + 1, end);
  if (cut >= 0) return entry.text.slice(at, cut);
  const s = entry.text.slice(at, end);
  const c = triviaCut(s, 1, s.length);
  return c < 0 ? s : s.slice(0, c);
}

function aheadSlow(input, whole) {
  let s = '';
  for (let i = 0; i < LOOKAHEAD; i++) {
    const c = input.peek(i);
    if (c < 0) break;
    s += String.fromCharCode(c);
  }
  if (whole) return s;
  const cut = triviaCut(s, 1, s.length);
  return cut < 0 ? s : s.slice(0, cut);
}

/** Whether only blanks stand between the line start and the input position. */
function atLineStart(input) {
  let k = -1;
  while (input.peek(k) === 32 || input.peek(k) === 9) k--;
  const c = input.peek(k);
  return c < 0 || c === 10 || c === 13;
}

/** The next token: [term, length, modes after it]; empty matches only change the mode. */
function next(modes, input) {
  const text = ahead(input, inFrontMatter(modes));
  if (text.length === 0) return undefined;
  // The tokenizer and then the context tracker's shift ask for the same token.
  // The key is the (immutable) Lezer input when there is one, else the text.
  const key = input.input && input.ranges ? input.input : text;
  if (
    last.modes === modes &&
    last.pos === input.pos &&
    last.key === key &&
    last.ranges === input.ranges
  )
    return last.result;
  const result = match(modes, input, text);
  last = { modes, pos: input.pos, key, ranges: input.ranges, result };
  return result;
}
let last = { modes: undefined, pos: -1, key: undefined, ranges: undefined, result: undefined };

/** Whether the top mode is a front matter one (\`@…\`), where no trivia cuts the text. */
const inFrontMatter = (modes) => modes.top.charCodeAt(0) === 64;

function match(modes, input, text) {
  // A \`^\` rule matches only at a line start (the regex sees the text from here on).
  const bol = atLineStart(input);
  let whole = inFrontMatter(modes);
  for (let guard = 0; guard < 8; guard++) {
    // Left the front matter without reading anything: the diagram's rules see trivia cuts.
    if (whole && !inFrontMatter(modes)) {
      text = ahead(input, false);
      whole = false;
    }
    let changed = false;
    for (const rule of MODES[modes.top] ?? []) {
      if (rule.bol && !bol) continue;
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

`;

/** The head of the tokenizer module: the imports and the tables built from the grammar. */
function lezerTokensHead(g: Grammar, names: HighlightNames, termsModule: string): string {
  return `// Generated by tools/gen-grammar from the ${names.id} grammar file. Do not edit.
import { ContextTracker, ExternalTokenizer } from '@lezer/lr';
import { styleTags, tags as t } from '@lezer/highlight';
import * as TERMS from '${termsModule}';

/** mode -> [pattern, token, push target, pop] in priority order. */
const TABLE = ${JSON.stringify(lezerTable(g))};
/** Trivia (comments, directives): no other token runs into one (the lexer never sees them). */
const TRIVIA = ${JSON.stringify(g.triviaRules.map((r) => r.pattern))}.map(
  (p) => new RegExp(p, p.startsWith('^') ? 'gm' : 'g')
);
const MODES = Object.fromEntries(
  Object.entries(TABLE).map(([mode, rules]) => [
    mode,
    rules.map(([p, token, push, pop]) => ({
      re: new RegExp(p, '${g.ignoreCase ? 'iy' : 'y'}'),
      term: TERMS[token],
      push,
      pop,
      bol: p.startsWith('^'),
    })),
  ])
);`;
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
  return `${lezerTokensHead(g, names, termsModule)}

${LEZER_TOKENIZER_BODY}export const highlighting = styleTags({
${tags}
});
`;
}
