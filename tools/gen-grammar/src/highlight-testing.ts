// cspell:words Onig onig vsctm
/**
 * Test helpers: run the generated highlighters in their real engines (vscode-textmate with
 * Oniguruma, a Monarch interpreter, the Lezer parser built by lezer-generator) and read back
 * the highlight category of every character of a text. Test-only; nothing ships.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildParserFile } from '@lezer/generator';
import type { LRParser } from '@lezer/lr';
import * as oniguruma from 'vscode-oniguruma';
import * as vsctm from 'vscode-textmate';
import { preprocess } from '@mermaid-js/core/preprocess';

/** Category of each UTF-16 unit of a text (`Other` where a highlighter styles nothing). */
export type Categorise = (text: string) => string[];

/** TextMate scope (without the language suffix) → category. */
const TEXTMATE: [prefix: string, category: string][] = [
  ['keyword.control', 'Keyword'],
  ['keyword.operator', 'Operator'],
  ['string', 'String'],
  ['constant.numeric', 'Number'],
  ['constant.language', 'Constant'],
  ['comment', 'Comment'],
  ['punctuation', 'Punctuation'],
  ['variable', 'Variable'],
  ['meta', 'Meta'],
  ['entity.name.function', 'Function'],
];
const MONARCH: Record<string, string> = {
  keyword: 'Keyword',
  string: 'String',
  operator: 'Operator',
  number: 'Number',
  comment: 'Comment',
  delimiter: 'Punctuation',
  variable: 'Variable',
  constant: 'Constant',
  annotation: 'Meta',
  function: 'Function',
};

const lines = (text: string) => text.split('\n');

let onigReady: Promise<void> | undefined;

/** Highlights with a TextMate grammar (JSON text) whose root scope is `scopeName`. */
export async function textMateCategorise(json: string, scopeName: string): Promise<Categorise> {
  const require = createRequire(import.meta.url);
  onigReady ??= (async () => {
    const wasm = readFileSync(join(dirname(require.resolve('vscode-oniguruma')), 'onig.wasm'));
    await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  })();
  await onigReady;
  const registry = new vsctm.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (p: string[]) => new oniguruma.OnigScanner(p),
      createOnigString: (s: string) => new oniguruma.OnigString(s),
    }),
    loadGrammar: () => Promise.resolve(vsctm.parseRawGrammar(json, 'x.json')),
  });
  const grammar = await registry.loadGrammar(scopeName);
  if (!grammar) throw new Error(`TextMate grammar ${scopeName} did not load`);
  const category = (scopes: string[]) => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const hit = TEXTMATE.find(([p]) => scopes[i]?.startsWith(p));
      if (hit) return hit[1];
    }
    return 'Other';
  };
  return (text) => {
    const out: string[] = [];
    let state = vsctm.INITIAL;
    for (const line of lines(text)) {
      const r = grammar.tokenizeLine(line, state);
      for (const t of r.tokens) {
        const c = category(t.scopes);
        for (let i = t.startIndex; i < Math.min(t.endIndex, line.length); i++) out.push(c);
      }
      out.push('Other'); // the line break
      state = r.ruleStack;
    }
    return out.slice(0, text.length);
  };
}

type MonarchRule = [string, { token: string; next?: string; switchTo?: string }];

/** Highlights with a Monarch definition (JSON text), interpreted as Monaco runs it per line. */
export function monarchCategorise(json: string): Categorise {
  const def = JSON.parse(json) as {
    start?: string;
    includeLF?: boolean;
    tokenizer: Record<string, MonarchRule[]>;
  };
  const states = def.tokenizer;
  const compiled = Object.fromEntries(
    Object.entries(states).map(([s, rules]) => [
      s,
      rules.map(([p, a]) => [new RegExp(p, 'y'), a] as const),
    ])
  );
  return (text) => {
    const out: string[] = [];
    let stack = [def.start ?? 'root'];
    const all = lines(text);
    for (const [n, raw] of all.entries()) {
      // `includeLF`: every line but the last is read with its line break, as Monaco does.
      const line = def.includeLF && n < all.length - 1 ? `${raw}\n` : raw;
      const cats: string[] = Array.from({ length: line.length }, () => 'Other');
      // As Monaco's Monarch lexer: rules run while there is text left, and once on an empty
      // line; nothing runs at the end of a non-empty line. A zero-width match only changes
      // the state; a few in a row at one offset end there.
      for (let p = 0, still = 0, once = true; (once || p < line.length) && still < 8; ) {
        once = false;
        const rules = compiled[stack[stack.length - 1] ?? 'root'] ?? [];
        let width = -1;
        for (const [re, action] of rules) {
          re.lastIndex = p;
          const m = re.exec(line);
          if (!m) continue;
          const next = action.switchTo ?? action.next;
          // As Monaco: an empty match that changes no state only counts on an empty line.
          if (m[0].length === 0 && !next && line.length > 0) continue;
          const c = MONARCH[action.token] ?? 'Other';
          for (let i = p; i < p + m[0].length; i++) cats[i] = c;
          if (next === '@pop') stack = stack.length > 1 ? stack.slice(0, -1) : stack;
          else if (action.switchTo) stack = [...stack.slice(0, -1), next?.slice(1) ?? 'root'];
          else if (next) stack = [...stack, next.slice(1)];
          width = m[0].length;
          break;
        }
        if (width > 0) {
          p += width;
          still = 0;
        } else if (width === 0) still++;
        else if (p < line.length) p++;
      }
      out.push(...cats.slice(0, raw.length), 'Other');
    }
    return out.slice(0, text.length);
  };
}

/**
 * Builds a Lezer highlighting grammar and its tokenizer module (as generated) with
 * lezer-generator into `cacheDir`, where `@lezer/*` resolves, and highlights with it: a
 * character's category is the name of the token node covering it.
 */
export async function lezerCategorise(
  grammar: string,
  tokens: string,
  base: string,
  cacheDir: string
): Promise<Categorise> {
  const built = buildParserFile(grammar, { fileName: `${base}.grammar`, moduleStyle: 'es' });
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, `${base}.parser.js`), built.parser);
  writeFileSync(join(cacheDir, `${base}.parser.terms.js`), built.terms);
  writeFileSync(join(cacheDir, `${base}.tokens.js`), tokens);
  const { parser } = (await import(pathToFileURL(join(cacheDir, `${base}.parser.js`)).href)) as {
    parser: LRParser;
  };
  return (text) => {
    const out: string[] = Array.from({ length: text.length }, () => 'Other');
    parser.parse(text).iterate({
      enter: (n) => {
        if (n.type.isTop || n.name === 'token') return;
        for (let i = n.from; i < n.to; i++) out[i] = n.name;
      },
    });
    return out;
  };
}

/**
 * A highlighter as the CodeMirror adapter runs the Lezer grammar
 * (`language-service-codemirror/src/language.ts`): the generated grammar has no front-matter
 * state, so the adapter hides the block (core's `bodyStart`) from it as blanks, line breaks kept.
 */
export function hidingFrontMatter(categorise: Categorise): Categorise {
  return (text) => {
    const end = preprocess(text).bodyStart;
    return categorise(text.slice(0, end).replace(/[^\n\r]/g, ' ') + text.slice(end));
  };
}
