/**
 * The four-way highlighting agreement (#28) for one diagram type: the kind → category table,
 * and the generated TextMate, Monarch and Lezer grammars, over the type's corpus (every
 * `e2e/diagrams` file its detector accepts) and fixtures. Test-only; nothing ships.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { Hole, Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { generate, generatedDir } from './generate.ts';
import { lezerCategorise, monarchCategorise, textMateCategorise } from './highlight-testing.ts';
import type { Categorise } from './highlight-testing.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

let files: Map<string, string> | undefined;
/** A generated highlighter file of `type`, e.g. `class.monarch.json`. */
function out(type: string, name: string): string {
  files ??= generate((p) => readFileSync(join(ROOT, p), 'utf8'));
  return files.get(`${generatedDir(type)}/${name}`) ?? '';
}

/** The three generated highlighters of `type`, run in their real engines. */
export async function highlighters(type: string): Promise<[string, Categorise][]> {
  return [
    [
      'TextMate',
      await textMateCategorise(out(type, `${type}.tmLanguage.json`), `source.mermaid-${type}`),
    ],
    ['Monarch', monarchCategorise(out(type, `${type}.monarch.json`))],
    [
      'Lezer',
      await lezerCategorise(
        out(type, `${type}.grammar`),
        out(type, `${type}.tokens.js`),
        type,
        join(ROOT, 'tools/gen-grammar/node_modules/.cache/lezer-categories')
      ),
    ],
  ];
}

function mmdFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return mmdFiles(join(dir, e.name));
    return e.name.endsWith('.mmd') ? [join(dir, e.name)] : [];
  });
}

/** Every corpus file `detect` accepts, as [repo path, text]. */
export function corpus(detect: (text: string) => unknown): [string, string][] {
  return mmdFiles(join(ROOT, 'e2e/diagrams'))
    .map((f) => [f.slice(ROOT.length), readFileSync(f, 'utf8')] as [string, string])
    .filter(([, src]) => Boolean(detect(src)));
}

export interface AgreementType {
  /** The type's token kinds (`ClassTokenKind`). */
  kinds: Record<string, number>;
  /** Kind → category (the generated table). */
  categories: Record<number, string>;
  /** The lexer's tokens (comments and directives left out). */
  tokens: (src: string) => readonly { kind: number; range: Range }[];
  /**
   * The spans the lexer removed (comments, directives, drops), from `bodyStart` on; core's
   * {@link sourceView} by default.
   */
  holes?: (src: string, from: number, directives: Range[]) => readonly Hole[];
  /** Whether a highlighter's `got` for a `kind` the table calls `want` is a known exception. */
  exempt?: (kind: number, want: string, got: string) => boolean;
}

/**
 * The kind of each character of `src` as the lexer sees it: its tokens, and the comments and
 * directives it removed (a directive wins over a comment hole that runs over it).
 */
function lexerKinds(t: AgreementType, src: string): Map<number, number> {
  const pre = preprocess(src);
  const directives = pre.directives.map((d) => d.range);
  const holes = t.holes
    ? t.holes(src, pre.bodyStart, directives)
    : sourceView(src, pre.bodyStart, directives).holes;
  const kinds = new Map<number, number>();
  const set = (start: number, end: number, kind: number | undefined) => {
    for (let i = start; i < end; i++) {
      if (kind === undefined) kinds.delete(i);
      else kinds.set(i, kind);
    }
  };
  for (const tok of t.tokens(src)) set(tok.range.start, tok.range.end, tok.kind);
  for (const h of holes) if (h.kind !== 'directive') set(h.start, h.end, undefined);
  for (const h of holes) if (h.kind === 'comment') set(h.start, h.end, Kind.Comment);
  for (const d of directives) set(d.start, d.end, Kind.Directive);
  return kinds;
}

export interface Agreement {
  /** `<highlighter>: <kind> is <want>, highlighted <got>` → first `file at offset`. */
  disagreements: Record<string, string>;
  /** Kinds (by name) with no non-blank sample in the sources. */
  missing: string[];
}

/** Compares every non-blank lexer character's category with each highlighter's. */
export function agreement(
  t: AgreementType,
  highlight: [string, Categorise][],
  sources: [string, string][],
  blankKinds: readonly number[] = []
): Agreement {
  const names: Record<number, string> = {
    ...Object.fromEntries(Object.entries(t.kinds).map(([k, v]) => [v, k])),
    [Kind.Comment]: 'Comment',
    [Kind.Directive]: 'Directive',
  };
  const disagreements = new Map<string, string>();
  const covered = new Set<number>();
  for (const [file, src] of sources) {
    const seen = highlight.map(([name, h]) => [name, h(src)] as const);
    for (const [i, kind] of lexerKinds(t, src)) {
      if (/\s/.test(src[i] ?? '')) continue;
      covered.add(kind);
      const want = t.categories[kind];
      for (const [name, cats] of seen) {
        const got = cats[i] ?? 'Other';
        if (got === want || t.exempt?.(kind, want ?? '', got)) continue;
        const key = `${name}: ${names[kind] ?? kind} is ${want}, highlighted ${got}`;
        if (!disagreements.has(key)) disagreements.set(key, `${file} at ${i}`);
      }
    }
  }
  const blank = new Set(blankKinds);
  const expected = [...Object.values(t.kinds), Kind.Comment, Kind.Directive].filter(
    (k) => !blank.has(k)
  );
  return {
    disagreements: Object.fromEntries(disagreements),
    missing: expected.filter((k) => !covered.has(k)).map((k) => names[k] ?? String(k)),
  };
}
