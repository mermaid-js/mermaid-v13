/**
 * What a third-party facet author gets from this package alone (R-LANG-3): every type the
 * `LanguageFacet` contract names, and the golden runner as the `./testing` subpath. And what
 * an adapter gets: the outline query and its type (D580).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLanguageService } from '@mermaid-js/language-service';
import type {
  CompletionItem,
  DocumentSnapshot,
  DocumentSymbol,
  DocumentView,
  FacetParseOptions,
  Hover,
  HoverTarget,
  LanguageFacet,
  ParseResult,
  ProbeResult,
  StatementSpan,
  SymbolOccurrence,
  TokenKind,
  TokenStream,
} from '@mermaid-js/language-service';
import * as testing from '@mermaid-js/language-service/testing';

/** A facet written against this package's types only. */
const statements: StatementSpan[] = [];
const symbols: SymbolOccurrence[] = [];
const tokens: TokenStream = {
  source: '',
  length: 0,
  kind: new Uint16Array(0),
  start: new Uint32Array(0),
  end: new Uint32Array(0),
};
const tiny: LanguageFacet = {
  id: 'tiny',
  parse: (text: string, _options: FacetParseOptions): ParseResult<unknown> => ({
    model: { text },
    ast: { id: 'root', type: 'root', range: { start: 0, end: text.length } },
    diagnostics: [],
    symbols,
    statements,
    tokens,
  }),
  categories: {} as Record<TokenKind, 'Keyword'>,
  namespaces: [],
  isValidId: () => undefined,
  completions: (_probe: ProbeResult, _doc: DocumentView): CompletionItem[] => [],
  hover: (_at: HoverTarget, _doc: DocumentView): Hover | undefined => undefined,
};

describe('the public API for facet authors', () => {
  it('types a facet with no import from core', () => {
    expect(tiny.parse('tiny', { keepTokens: true }).statements).toBe(statements);
  });

  it('ships the golden runner as ./testing, built into dist', () => {
    expect(Object.keys(testing).sort()).toEqual(
      [
        'FEATURES',
        'REQUIRED_FEATURES',
        'goldenCases',
        'missingFeatures',
        'readFixture',
        'renderGolden',
      ].sort()
    );
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')
    ) as {
      exports: Record<string, Record<string, string>>;
    };
    expect(pkg.exports['./testing']).toEqual({
      'mermaid-source': './src/testing/index.ts',
      types: './dist/testing/index.d.ts',
      default: './dist/testing/index.js',
    });
  });
});

/** An adapter's outline, written against the package entry alone. */
const outlineOf = (doc: DocumentSnapshot): string[] => {
  const walk = (list: readonly DocumentSymbol[], depth: number): string[] =>
    list.flatMap((s) => [
      `${'  '.repeat(depth)}${s.kind} ${s.name}`,
      ...walk(s.children, depth + 1),
    ]);
  return walk(doc.symbols(), 0);
};

describe('the public API for adapters', () => {
  it('lists the outline from the package entry (D580)', async () => {
    const service = createLanguageService();
    await service.preload({ types: ['flowchart'] });
    const doc = service.update(
      'file:///api.mmd',
      'flowchart LR\n  subgraph S\n    A --> B\n  end\n'
    );
    expect(outlineOf(doc)).toEqual(['subgraph S', '  node A', '  node B']);
  });
});
