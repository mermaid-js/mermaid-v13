import { describe, expect, it } from 'vitest';
import type { Range } from '@mermaid-js/core/parser-kit';
import { language } from '@mermaid-js/diagram-railroad/language';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot, TextEdit } from '@mermaid-js/language-service';
import { railroadGateCorpus } from './corpus.ts';
import { RAILROAD_FACETS } from './facets.ts';

/**
 * The language service's corpus property (D99 suite 3) and rename round-trip (D99 suite 4)
 * specs, for railroad (#616), until T5 (#615) lets `packages/language-service`'s own specs reach
 * the facet (they read `e2e/diagrams/railroad/` then). Over the railroad gate corpus (e2e
 * fixtures, v12 spec strings, quirk and recovery cases, rejected ones included, with CRLF and
 * commented copies):
 * - every query at every token and word boundary terminates and never throws; semantic tokens
 *   are sorted and never overlap; every completion item replaces a range on the cursor's line
 *   that holds the cursor;
 * - every symbol renamed to a fresh name re-parses to the same model modulo the name, with the
 *   same diagnostic codes, and renaming it back gives the original text.
 *
 * The timing budget stays with the language service's property spec (ratios, D156).
 */
const FRESH = 'renamedZq7';
const service = createLanguageService({ facets: RAILROAD_FACETS });
await service.preload({ types: RAILROAD_FACETS.map((e) => e.type) });
const corpus = (await railroadGateCorpus()).filter((i) => !i.source.includes(FRESH));

/** Every token and word boundary of `doc`, sorted. */
function boundaries(doc: DocumentSnapshot): number[] {
  const at = new Set([0, doc.text.length]);
  for (const m of doc.text.matchAll(/\w+|\s+|[^\w\s]/gu)) {
    at.add(m.index);
    at.add(m.index + m[0].length);
  }
  const tokens = language.parse(doc.text, { keepTokens: true }).tokens;
  for (let i = 0; tokens && i < tokens.length; i++) {
    at.add(tokens.start[i]!);
    at.add(tokens.end[i]!);
  }
  return [...at].sort((a, b) => a - b);
}

function problemsOf(name: string, doc: DocumentSnapshot): string[] {
  const problems: string[] = [];
  const run = (query: string, call: () => unknown, offset?: number) => {
    try {
      call();
    } catch (error) {
      const where = offset === undefined ? query : `${query} @${offset}`;
      problems.push(`${name}: ${where} threw ${(error as Error).message}`);
    }
  };
  run('diagnostics', () => doc.diagnostics());
  run('foldingRanges', () => doc.foldingRanges());
  const tokens = doc.semanticTokens();
  for (let i = 1; i < tokens.length; i++) {
    const [a, b] = [tokens[i - 1]!.range, tokens[i]!.range];
    if (b.start < a.end) problems.push(`${name}: semantic tokens overlap at ${b.start}`);
  }
  for (const at of boundaries(doc)) {
    run('definition', () => doc.definition(at), at);
    run('references', () => doc.references(at), at);
    run('prepareRename', () => doc.prepareRename(at), at);
    run('rename', () => doc.rename(at, 'renamed1'), at);
    run('astAt', () => doc.astAt(at).map((id) => doc.rangeOf(id)), at);
    run('hover', () => doc.hover(at), at);
    const bad = doc
      .completions(at)
      .find(
        ({ range: r }) =>
          r.start > at || r.end < at || /[\r\n]/.test(doc.text.slice(r.start, r.end))
      );
    if (bad) problems.push(`${name}: completion ${JSON.stringify(bad.label)} @${at} off the line`);
  }
  return problems;
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

describe('railroad: every query at every boundary of the gate corpus', () => {
  it('terminates, never throws, and keeps the invariants', () => {
    expect(corpus.length).toBeGreaterThan(1000);
    const problems = corpus.flatMap(({ id, source }) => {
      const doc = service.update(`corpus:///${id}`, source);
      return doc.facet?.id === 'railroad' ? problemsOf(id, doc) : [];
    });
    expect(problems).toEqual([]);
  }, 300_000);
});

describe('railroad: rename, re-parse, same model modulo the name', () => {
  it('over the gate corpus', () => {
    const problems: string[] = [];
    let renamed = 0;
    for (const { id, source } of corpus) {
      const doc = service.update(`corpus:///${id}`, source);
      if (doc.facet?.id !== 'railroad') continue;
      const model = (text: string) => language.parse(text, { keepTokens: true }).model;
      const before = modulo(model(source), FRESH, FRESH);
      const seen = new Set<string>();
      for (const s of language.parse(source, { keepTokens: true }).symbols) {
        const prepared = doc.prepareRename(s.range.start);
        if ('refused' in prepared) continue;
        const key = JSON.stringify(doc.references(s.range.start));
        if (seen.has(key)) continue;
        seen.add(key);
        const where = `${id} ${prepared.placeholder}@${s.range.start}`;
        const result = doc.rename(s.range.start, FRESH);
        if ('refused' in result) {
          problems.push(`${where}: refused: ${result.refused}`);
          continue;
        }
        renamed++;
        const next = service.update(`corpus:///${id}#renamed`, apply(source, result.edits));
        const after = modulo(model(next.text), FRESH, prepared.placeholder);
        if (JSON.stringify(after) !== JSON.stringify(before)) problems.push(`${where}: model`);
        const codes = (d: DocumentSnapshot) => d.diagnostics().map((x) => x.code);
        if (JSON.stringify(codes(next)) !== JSON.stringify(codes(doc)))
          problems.push(`${where}: diagnostics`);
        const back = next.rename(result.edits[0]!.range.start, prepared.placeholder);
        if ('refused' in back) problems.push(`${where}: back refused: ${back.refused}`);
        else if (apply(next.text, back.edits) !== source) problems.push(`${where}: back differs`);
      }
    }
    expect(renamed).toBeGreaterThan(1000);
    expect(problems).toEqual([]);
  }, 300_000);
});
