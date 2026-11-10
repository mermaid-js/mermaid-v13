/**
 * The language service's corpus property and rename round-trip suites (D99 suites 3 and 4)
 * for C4, before its manifest (#543): the language service's `property.spec.ts` and
 * `rename-round-trip.spec.ts` run every type whose facet the registry loads, and c4's row has
 * no `load` until T5 (#542). These run the same checks over `e2e/diagrams/c4` with the facet as
 * an eager row; T5 deletes this spec once the shared ones cover c4 (with no known entry).
 *
 * - Property: every query at every token boundary terminates and never throws; semantic tokens
 *   are sorted and never overlap; every completion item replaces a range on the cursor's line
 *   that holds the cursor. (The shared spec's CPU-time ratio is left to it.)
 * - Round trip: every symbol renamed to a fresh name re-parses to the same model modulo the
 *   name (ranges aside) with the same diagnostic codes, and renaming it back gives the text.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { c4Language, detectC4, parseC4 } from '@mermaid-js/diagram-c4/language';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot, TextEdit } from '@mermaid-js/language-service';
import { REPO_ROOT } from '../corpus.ts';

const CORPUS = join(REPO_ROOT, 'e2e', 'diagrams', 'c4');
const FRESH = 'renamedZq7';

const files = (readdirSync(CORPUS, { recursive: true }) as string[])
  .filter((f) => f.endsWith('.mmd'))
  .sort()
  .map((f) => join(CORPUS, f));

const service = createLanguageService({
  facets: [{ type: 'c4', id: 'c4', detector: (t) => detectC4(t), facet: c4Language }],
});
beforeAll(() => service.preload());

/** Every token boundary of `text`, sorted. */
function boundaries(text: string): number[] {
  const at = new Set([0, text.length]);
  for (const m of text.matchAll(/\w+|\s+|[^\w\s]/gu)) {
    at.add(m.index);
    at.add(m.index + m[0].length);
  }
  const tokens = parseC4(text, { keepTokens: true }).tokens;
  for (let i = 0; tokens && i < tokens.length; i++) {
    at.add(tokens.start[i]!);
    at.add(tokens.end[i]!);
  }
  return [...at].sort((a, b) => a - b);
}

function apply(text: string, edits: readonly TextEdit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

const isRange = (v: unknown): v is Range =>
  typeof v === 'object' && v !== null && Object.keys(v).length === 2 && 'start' in v && 'end' in v;

/** `value` with source ranges dropped and `from` written as `to` in every string. */
function modulo(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') return value.split(from).join(to);
  if (Array.isArray(value)) return value.map((v) => modulo(v, from, to));
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => !isRange(v))
        .map(([k, v]) => [k, modulo(v, from, to)])
    );
  return value;
}

/** One position per distinct symbol: the first occurrence the service can rename. */
function symbolPositions(doc: DocumentSnapshot): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  for (const s of parseC4(doc.text).symbols) {
    const prepared = doc.prepareRename(s.range.start);
    if ('refused' in prepared) continue;
    const key = JSON.stringify(doc.references(s.range.start));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s.range.start);
  }
  return out;
}

describe('c4: every query at every token boundary of the corpus', () => {
  it('reads the corpus', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(files.map((f) => [relative(CORPUS, f), f]))(
    '%s',
    (name, file) => {
      const text = readFileSync(file, 'utf8');
      const doc = service.update(`corpus:///${name}`, text);
      expect(doc.facet?.id).toBe('c4');
      const problems: string[] = [];
      const run = (query: string, call: () => unknown, at?: number) => {
        try {
          call();
        } catch (error) {
          problems.push(`${query} @${at} threw ${(error as Error).message}`);
        }
      };
      run('diagnostics', () => doc.diagnostics());
      run('foldingRanges', () => doc.foldingRanges());
      const tokens = doc.semanticTokens();
      for (let i = 1; i < tokens.length; i++) {
        const [a, b] = [tokens[i - 1]!.range, tokens[i]!.range];
        if (b.start < a.end) problems.push(`semantic tokens ${a.start} and ${b.start} overlap`);
      }
      for (const at of boundaries(text)) {
        run('definition', () => doc.definition(at), at);
        run('references', () => doc.references(at), at);
        run('prepareRename', () => doc.prepareRename(at), at);
        run('rename', () => doc.rename(at, 'renamed1'), at);
        run('astAt', () => doc.astAt(at).map((id) => doc.rangeOf(id)), at);
        run('hover', () => doc.hover(at), at);
        run('completions', () => doc.completions(at), at);
        const bad = doc
          .completions(at)
          .find(
            ({ range: r }) =>
              r.start > at || r.end < at || /[\r\n]/.test(text.slice(r.start, r.end))
          );
        if (bad)
          problems.push(
            `completion ${bad.label} @${at} replaces [${bad.range.start},${bad.range.end})`
          );
      }
      service.close(`corpus:///${name}`);
      expect(problems).toEqual([]);
    },
    60_000
  );
});

describe('c4: rename, re-parse, same model modulo the name', () => {
  it('over the corpus', () => {
    const problems: string[] = [];
    let renamed = 0;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const name0 = relative(CORPUS, file);
      const doc = service.update(`corpus:///${name0}`, text);
      const before = modulo(parseC4(text).model, FRESH, FRESH);
      for (const at of symbolPositions(doc)) {
        const name = (doc.prepareRename(at) as { placeholder: string }).placeholder;
        const where = `${name0} ${name}@${at}`;
        const result = doc.rename(at, FRESH);
        if ('refused' in result) {
          problems.push(`${where}: refused: ${result.refused}`);
          continue;
        }
        renamed++;
        const next = service.update(`corpus:///${name0}#renamed`, apply(text, result.edits));
        const after = modulo(parseC4(next.text).model, FRESH, name);
        if (JSON.stringify(after) !== JSON.stringify(before)) problems.push(`${where}: model`);
        const codes = (d: DocumentSnapshot) => d.diagnostics().map((x) => x.code);
        if (JSON.stringify(codes(next)) !== JSON.stringify(codes(doc)))
          problems.push(`${where}: diagnostics`);
        const back = next.rename(result.edits[0]!.range.start, name);
        if ('refused' in back) problems.push(`${where}: back refused: ${back.refused}`);
        else if (apply(next.text, back.edits) !== text) problems.push(`${where}: back differs`);
      }
    }
    expect(problems).toEqual([]);
    expect(renamed).toBeGreaterThan(250);
  }, 120_000);
});
