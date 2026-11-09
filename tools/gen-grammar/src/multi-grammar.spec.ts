/**
 * A package whose manifest declares several types carries one grammar per type (D512):
 * `gen:grammar` writes highlighters, a syntax doc, and kind → category and doc tables for each.
 */
import { describe, expect, it } from 'vitest';
import { highlighters } from './agreement-testing.ts';
import { generate, targetPaths } from './generate.ts';
import type { GrammarTarget } from './generate.ts';

const grammar = (keyword: string) => `@lexer
(** \`${keyword}\`: starts a diagram. *)
HEADER  /${keyword}\\b/  :keyword ;
(** \`->\`: an arrow. *)
ARROW   /->/  :operator ;
ID      /[a-z]+/  :variable ;
-       /[ \\n]+/ ;
@grammar
(** A diagram: the header, then ids. *)
diagram = HEADER { ID | ARROW } ;
`;

const tokens = `export const T = { Header: 100, Arrow: 101, Id: 102 } as const;
export const NAMES = { [T.Header]: 'HEADER', [T.Arrow]: 'ARROW', [T.Id]: 'ID' };
`;

const sources: Record<string, string> = {
  'packages/diagram-dual/grammar/dual.ebnf': grammar('dual'),
  'packages/diagram-dual/grammar/dual-alt.ebnf': grammar('dual-alt'),
  'packages/diagram-dual/src/parser/tokens.ts': tokens,
  'packages/diagram-dual/src/parser/alt/tokens.ts': tokens,
};

const targets: GrammarTarget[] = [
  { type: 'dual', title: 'Dual syntax', kinds: { module: 'parser/tokens.ts', object: 'T' } },
  {
    type: 'dualAlt',
    package: 'dual',
    grammar: 'dual-alt',
    title: 'Dual alt syntax',
    kinds: { module: 'parser/alt/tokens.ts', object: 'T' },
  },
];

const files = generate((p) => sources[p], targets);

describe('several grammars in one package (D512)', () => {
  it('writes every file for each grammar, under the one package', () => {
    expect([...files.keys()].sort()).toEqual([
      'packages/diagram-dual/grammar/generated/dual-alt.grammar',
      'packages/diagram-dual/grammar/generated/dual-alt.monarch.json',
      'packages/diagram-dual/grammar/generated/dual-alt.tmLanguage.json',
      'packages/diagram-dual/grammar/generated/dual-alt.tokens.js',
      'packages/diagram-dual/grammar/generated/dual.grammar',
      'packages/diagram-dual/grammar/generated/dual.monarch.json',
      'packages/diagram-dual/grammar/generated/dual.tmLanguage.json',
      'packages/diagram-dual/grammar/generated/dual.tokens.js',
      'packages/diagram-dual/src/generated/categories.ts',
      'packages/diagram-dual/src/generated/docs.ts',
      'packages/diagram-dual/src/generated/dual-alt.categories.ts',
      'packages/diagram-dual/src/generated/dual-alt.docs.ts',
      'v13/docs/syntax/dual-alt.md',
      'v13/docs/syntax/dual.md',
    ]);
  });

  it('names each table after its type and each highlighter after its grammar', () => {
    const alt = targetPaths(targets[1]!);
    expect(files.get(alt.categories)).toContain('export const dualAltCategories');
    expect(files.get(alt.docs)).toContain('export const dualAltDocs');
    expect(files.get(alt.docs)).toContain("import { T } from '../parser/alt/tokens.ts';");
    expect(files.get(alt.categories)).toContain('packages/diagram-dual/grammar/dual-alt.ebnf');
    expect(files.get('packages/diagram-dual/src/generated/categories.ts')).toContain(
      'export const dualCategories'
    );
    const tm = JSON.parse(
      files.get('packages/diagram-dual/grammar/generated/dual-alt.tmLanguage.json') ?? '{}'
    ) as { scopeName?: string };
    expect(tm.scopeName).toBe('source.mermaid-dual-alt');
    expect(files.get('v13/docs/syntax/dual-alt.md')).toContain('Dual alt syntax');
  });

  it('reports a missing grammar file by path', () => {
    const { [`packages/diagram-dual/grammar/dual-alt.ebnf`]: _, ...rest } = sources;
    expect(() => generate((p) => rest[p], targets)).toThrow(
      'missing packages/diagram-dual/grammar/dual-alt.ebnf'
    );
  });

  it('runs the highlighters of a second grammar by its target', async () => {
    const sameFiles = generate((p) => sources[p], targets);
    expect(sameFiles.size).toBe(files.size);
    // The real GRAMMARS hold no second grammar yet: the lookup names the path it missed.
    await expect(highlighters(targets[1]!)).rejects.toThrowError(
      'gen:grammar writes no packages/diagram-dual/grammar/generated/dual-alt.tmLanguage.json'
    );
  });

  it('refuses a type that is not an identifier, or a second type with no grammar file', () => {
    expect(() => targetPaths({ ...targets[0]!, type: 'dual-alt' })).toThrow('not an identifier');
    expect(() => targetPaths({ ...targets[1]!, grammar: undefined })).toThrow(
      'type dualAlt of package dual names no grammar file'
    );
  });

  it("keeps the plain table names for the package's own type", () => {
    const own = targetPaths({ ...targets[0]!, grammar: 'dual-v2' });
    expect(own.categories).toBe('packages/diagram-dual/src/generated/categories.ts');
    expect(own.file).toBe('packages/diagram-dual/grammar/dual-v2.ebnf');
  });

  it('refuses two grammars that write the same file', () => {
    const clash: GrammarTarget[] = [targets[0]!, { ...targets[1]!, grammar: 'dual' }];
    const both: Record<string, string> = { ...sources };
    expect(() => generate((p) => both[p], clash)).toThrow('two grammars generate');
  });
});
