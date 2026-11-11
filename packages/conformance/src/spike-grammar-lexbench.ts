// Spike: can a lexer generated from grammar/<type>.ebnf replace the hand-written one?
// Compares, per diagram type: the hand-written lexer, the dev-only reference lexer
// (tools/gen-grammar mode-lexer: one sticky regex per rule), and a tuned variant of it (one
// combined sticky regex per mode). Speed over the e2e corpus, and scaling on the stress shapes.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';
import type { Grammar, LexResult, LexRule, LexToken, ModeLexer } from '@mermaid-js/gen-grammar';
import { sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';

const ROOT = join(import.meta.dirname, '../../..');
const outFile = process.argv[2]!;
const only = process.argv[3]?.split(',');

/** `(` that opens a capturing group made `(?:`; undefined when the pattern needs its groups. */
function uncaptured(pattern: string): string | undefined {
  if (/\\[1-9]|\(\?<[A-Za-z]/.test(pattern)) return undefined;
  let out = '';
  let cls = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '\\') { out += c + (pattern[i + 1] ?? ''); i++; continue; }
    if (cls) { if (c === ']') cls = false; out += c; continue; }
    if (c === '[') { cls = true; out += c; continue; }
    if (c === '(' && pattern[i + 1] !== '?') { out += '(?:'; continue; }
    out += c;
  }
  return out;
}

/** mode-lexer's semantics with one combined sticky regex per mode. */
function buildFast(g: Grammar): { lex(text: string): LexResult; combined: boolean } {
  const flags = g.ignoreCase ? 'iy' : 'y';
  let combined = true;
  const modes = new Map<string, { re?: RegExp; rules: LexRule[]; each: RegExp[] }>();
  for (const m of ['INITIAL', ...g.modes]) {
    const rules = g.lexRules.filter((r) => r.modes.includes('*') || r.modes.includes(m));
    const parts = rules.map((r) => uncaptured(r.pattern));
    const each = rules.map((r) => new RegExp(r.pattern, flags));
    let re: RegExp | undefined;
    if (parts.every((p) => p !== undefined)) re = new RegExp(parts.map((p) => `(${p})`).join('|'), flags);
    else combined = false;
    modes.set(m, { re, rules, each });
  }
  const meta = new Map<LexRule, { attachNext: boolean; attachPrev: boolean }>();
  for (const r of g.lexRules)
    meta.set(r, { attachNext: r.actions.some((a) => a.op === 'attach-next'), attachPrev: r.actions.some((a) => a.op === 'attach-prev') });
  return {
    combined,
    lex(text) {
      const tokens: LexToken[] = [];
      const stack = ['INITIAL'];
      const fired = new Set<LexRule>();
      let p = 0, done = false, stalls = 0;
      let pendingStart: number | undefined;
      while (!done) {
        if (p >= text.length) done = true;
        const mode = modes.get(stack[stack.length - 1] ?? 'INITIAL')!;
        let rule: LexRule | undefined;
        let match = '';
        if (mode.re) {
          mode.re.lastIndex = p;
          const m = mode.re.exec(text);
          if (m) {
            match = m[0];
            for (let k = 1; k < m.length; k++) if (m[k] !== undefined) { rule = mode.rules[k - 1]; break; }
          }
        } else {
          for (let k = 0; k < mode.each.length; k++) {
            const re = mode.each[k]!;
            re.lastIndex = p;
            const m = re.exec(text);
            if (m) { rule = mode.rules[k]; match = m[0]; break; }
          }
        }
        if (!rule) { if (p >= text.length) break; return { tokens, error: p }; }
        const start = p, end = p + match.length;
        let image = match;
        const before = end === p ? stack.length + stack.join() : undefined;
        for (const a of rule.actions) {
          switch (a.op) {
            case 'push': stack.push(a.mode as string); break;
            case 'push-once': if (!fired.has(rule)) stack.push(a.mode as string); break;
            case 'pop': if (stack.length > 1) stack.pop(); break;
            case 'empty': image = ''; break;
            case 'fold': image = image.replace(/\n\s*/g, '<br/>'); break;
            default: break;
          }
        }
        fired.add(rule);
        const mt = meta.get(rule)!;
        if (rule.name !== undefined) {
          tokens.push({ name: rule.name, text: image, start, end, outerStart: pendingStart ?? start, outerEnd: end });
          pendingStart = undefined;
        } else if (mt.attachNext) pendingStart ??= start;
        else if (mt.attachPrev) {
          const last = tokens[tokens.length - 1];
          if (last && last.outerEnd === start && pendingStart === undefined) last.outerEnd = end;
          pendingStart = undefined;
        }
        if (before !== undefined && before === stack.length + stack.join() && !done) {
          if (++stalls > 2) return { tokens, error: p };
        } else stalls = 0;
        p = end;
      }
      return { tokens, error: undefined };
    },
  };
}

const DIR: Record<string, string[]> = { class: ['class-diagram'], er: ['er-diagram'], gitgraph: ['git'], quadrant: ['quadrant-chart'], state: ['state-diagram-v2', 'state-diagram'], treeview: ['tree-view'] };
const PKG: Record<string, string> = { treeView: 'treeview' };
const walk = (d: string): string[] => existsSync(d) ? readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.mmd') ? [p] : []; }) : [];
const best = (run: () => unknown, rounds: number, reps = 1): number => {
  let b = Infinity;
  for (let i = 0; i < rounds; i++) { const t0 = performance.now(); for (let r = 0; r < reps; r++) run(); b = Math.min(b, (performance.now() - t0) / reps); }
  return b;
};

const res: Record<string, unknown> = {};
const dirs = readdirSync(join(ROOT, 'packages/conformance/src')).filter((d) => existsSync(join(ROOT, 'packages/conformance/src', d, 'grammar')));
for (const dir of dirs) {
  const gfile = readdirSync(join(ROOT, 'packages/conformance/src', dir, 'grammar')).find((f) => f.endsWith('-grammar.ts'));
  if (!gfile) continue;
  const gmod = (await import(pathToFileURL(join(ROOT, 'packages/conformance/src', dir, 'grammar', gfile)).href)) as Record<string, unknown>;
  const accessor = Object.entries(gmod).find(([k, v]) => /Grammar$/.test(k) && typeof v === 'function')?.[1] as (() => { grammar: Grammar; lexer: ModeLexer }) | undefined;
  const grammarTokens = gmod.grammarTokens as ((s: string) => { input: { text: string }; tokens: LexToken[]; error: number | undefined }) | undefined;
  if (!accessor || !grammarTokens) continue;
  const type = PKG[dir] ?? dir.toLowerCase();
  if (only && !only.includes(type)) continue;
  const pdir = join(ROOT, 'packages', `diagram-${type}`, 'src/parser');
  let hand: ((s: string) => unknown) | undefined;
  for (const f of ['index.ts', 'tokens-api.ts']) {
    if (!existsSync(join(pdir, f))) continue;
    const m = (await import(pathToFileURL(join(pdir, f)).href)) as Record<string, unknown>;
    hand ??= Object.entries(m).find(([k, v]) => /Tokens$/.test(k) && typeof v === 'function')?.[1] as (s: string) => unknown;
  }
  if (!hand) continue;
  const { grammar, lexer } = accessor();
  const fast = buildFast(grammar);
  const srcs = (DIR[type] ?? [type]).flatMap((d) => walk(join(ROOT, 'e2e/diagrams', d))).sort().map((f) => readFileSync(f, 'utf8'))
    .filter((s) => { try { hand!(s); grammarTokens(s); return true; } catch { return false; } });
  const inputs = srcs.map((s) => grammarTokens(s).input.text);
  // The tuned lexer must give the reference lexer's tokens.
  let same = 0;
  for (const text of inputs) if (JSON.stringify(fast.lex(text)) === JSON.stringify(lexer.lex(text))) same++;
  const chars = srcs.reduce((n, s) => n + s.length, 0);
  const reps = Math.max(1, Math.ceil(300_000 / Math.max(1, chars)));
  const all = (fn: (s: string) => unknown, list: string[]) => () => { for (const s of list) fn(s); };
  for (const [fn, list] of [[hand, srcs], [grammarTokens, srcs], [(t: string) => lexer.lex(t), inputs], [(t: string) => fast.lex(t), inputs]] as const) best(all(fn, list as string[]), 4, reps);
  // Hand lexer alone, where the package follows the standard `lex(src, from, view)` shape.
  let handLex: number | undefined;
  try {
    const idx = ['index.ts', 'tokens-api.ts'].map((f) => join(pdir, f)).filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n');
    const lm = (await import(pathToFileURL(join(pdir, 'lexer.ts')).href)) as { lex?: (...a: unknown[]) => { length: number } };
    if (lm.lex && /= sourceView\(\s*src,\s*pre\.bodyStart/.test(idx) && /lex\(src, pre\.bodyStart, view\)/.test(idx)) {
      const prepared = srcs.map((src) => { const pre = preprocess(src); return [src, pre.bodyStart, sourceView(src, pre.bodyStart, pre.directives.map((d) => d.range))] as const; });
      const run = (): void => { for (const [src, from, view] of prepared) lm.lex!(src, from, view); };
      best(run, 4, reps);
      handLex = best(run, 10, reps);
    }
  } catch { /* not the standard shape */ }
  const speed = {
    handLex,
    hand: best(all(hand, srcs), 10, reps),
    refWhole: best(all(grammarTokens, srcs), 10, reps),
    refLex: best(all((t) => lexer.lex(t), inputs), 10, reps),
    fastLex: best(all((t) => fast.lex(t), inputs), 10, reps),
  };
  // Scaling on the type's own stress shapes (n and 8n; linear is ~8, the specs' bar is 24).
  const stress: { shape: string; hand: number; ref: number; fast: number }[] = [];
  const spec = join(ROOT, 'packages/conformance/src', dir, 'stress.spec.ts');
  if (existsSync(spec)) {
    try {
      const text = readFileSync(spec, 'utf8');
      const head = text.slice(0, text.search(/\ndescribe\(/)).replace(/^import[\s\S]*?;\n/gm, '');
      const js = transformSync(head, { loader: 'ts' }).code;
      const shapes = new Function(`${js}\nreturn typeof SHAPES === 'undefined' ? [] : SHAPES;`)() as [string, (n: number) => string][];
      for (const [name, build] of shapes) {
        const small = build(4_000), large = build(32_000);
        const ratio = (fn: (s: string) => unknown, a: string, b: string): number => {
          const ts = best(() => fn(a), 3);
          if (ts > 250) return Infinity; // already far off linear at the small size
          const tl = best(() => fn(b), 3);
          return tl / Math.max(ts, 0.02);
        };
        let sIn = '', lIn = '';
        try { sIn = grammarTokens(small).input.text; lIn = grammarTokens(large).input.text; } catch { /* input builder failed */ }
        stress.push({ shape: name, hand: ratio(hand, small, large), ref: ratio((t) => lexer.lex(t), sIn, lIn), fast: ratio((t) => fast.lex(t), sIn, lIn) });
      }
    } catch (e) { stress.push({ shape: `could not load shapes: ${String(e).slice(0, 80)}`, hand: 0, ref: 0, fast: 0 }); }
  }
  res[type] = { files: srcs.length, chars, rules: grammar.lexRules.length, modes: grammar.modes.length, combined: fast.combined, same, speed, stress };
  console.error(type, JSON.stringify(speed), 'same', same, '/', inputs.length, 'shapes', stress.length);
}
writeFileSync(outFile, JSON.stringify(res, (_k, v) => (v === Infinity ? 'inf' : v)));
