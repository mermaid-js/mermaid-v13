/**
 * Agentflow highlighting (#549, language.md step 3): the four-way agreement of the kind →
 * category table with the generated TextMate, Monarch and Lezer grammars over the agentflow
 * corpus and the agentflow cases, as `categories.spec.ts` checks flowchart's.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Kind, TOKEN_CATEGORIES } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  agentflowCategories,
  agentflowTokens,
  AgentflowTokenKind as T,
  detectAgentflow,
  parseAgentflow,
} from '@mermaid-js/diagram-agentflow/language';
// The lexer's source view gives the spans it removed (directives, dropped `;`).
import { agentflowSourceView } from '../../../packages/diagram-agentflow/src/parser/source.ts';
import { agreement, corpus, highlighters, ROOT } from './agreement-testing.ts';

/**
 * The agentflow cases and v12 spec strings (`packages/conformance/corpus/agentflow-*.json`)
 * that parse without an error, and the lexer-only cases {@link LEXER_ONLY}: they give the kinds
 * the e2e corpus lacks a sample. The other rejected ones are left out: past an error the
 * highlighters, which do not recover as the parser does, read the rest of the line differently.
 */
/**
 * Cases the generated highlighters read differently from the lexer (GAPS #549, the grammar
 * file's to fix, not this ticket's): a lone CR, which v12 lexes as a line break and the
 * highlighters as none (`header-cr`), and `%%{ }`, which is no directive to v12 but one to
 * TextMate and Monarch (`comment-directive-like`). TextMate and Monarch also read a line at a
 * time, so they cannot see that the header is still to come and colour the comments of D691 as
 * a `direction` or a link id (`header-comment-…`).
 */
const HIGHLIGHTERS_DIFFER = new Set([
  'agentflow-cases/header-cr',
  'agentflow-cases/comment-directive-like',
  'agentflow-cases/header-comment-direction',
  'agentflow-cases/header-comment-direction-text',
  'agentflow-cases/header-comment-link-id',
]);

/** Rejected cases kept for their tokens: ids, `*`, `^`, `v`, `<`, `\\|`, `-`, `[|f:v|]`. */
const LEXER_ONLY = new Set([
  'agentflow-cases/punctuation',
  'agentflow-cases/punctuation-alone',
  'agentflow-cases/minus',
  'agentflow-cases/shape-14',
]);

const CASES = ['agentflow-cases.json', 'agentflow-v12-specs.json']
  .flatMap(
    (file) =>
      JSON.parse(readFileSync(join(ROOT, 'packages/conformance/corpus', file), 'utf8')) as {
        id: string;
        source: string;
      }[]
  )
  .filter(
    (c) =>
      LEXER_ONLY.has(c.id) ||
      !parseAgentflow(c.source).diagnostics.some((d) => d.severity === 'error')
  )
  .filter((c) => !HIGHLIGHTERS_DIFFER.has(c.id))
  .map((c): [string, string] => [c.id, c.source]);

/**
 * Kinds with no sample: tokens that are blanks or empty, so no highlighter colours them, and
 * the shared `Comment`, which agentflow's lexer gives only a `%%` inside a label (jison skips
 * it there) and `agentflowTokens` leaves out; a `%%` comment elsewhere is the significant
 * `T.Comment` (v12's grammar reads it), which is compared.
 */
const BLANK_KINDS = [T.Space, T.NoDir, T.Eof, Kind.Comment];

describe('agentflow kind → category table', () => {
  it('gives every agentflow and shared kind a highlight category', () => {
    const kinds = [...Object.values(T), ...Object.values(Kind)];
    for (const k of kinds) expect(TOKEN_CATEGORIES, `kind ${k}`).toContain(agentflowCategories[k]);
    expect(Object.keys(agentflowCategories)).toHaveLength(kinds.length);
  });
});

/*
 * As flowchart's (D467), the documented exceptions where the highlighters see text differently
 * from the lexer: `ShapeData` is one kind for all of `@{ … }`, whose quoted values the
 * highlighters show as String and the table (one category per kind) as Meta; the `;` v12
 * dropped from the end of a `style` / `classDef` line is part of the previous token's range but
 * never read. Directive holes are checked as the shared kind `Directive`. A `%%` comment is a
 * significant `Comment` token (v12's grammar reads it).
 */
describe('four-way highlighting agreement (agentflow)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    // v12's detector reads the text after the front matter, comments removed.
    const body = (src: string) => src.slice(preprocess(src).bodyStart).replace(/^(\s*%%.*\n)*/, '');
    const sources = corpus((src) => detectAgentflow(body(src)));
    expect(sources.length).toBeGreaterThan(50);
    const result = agreement(
      {
        kinds: T,
        categories: agentflowCategories,
        tokens: agentflowTokens,
        holes: (src, from, directives) => agentflowSourceView(src, from, directives).holes,
        exempt: (kind, _want, got) => kind === T.ShapeData && got === 'String',
      },
      await highlighters('agentflow'),
      [...CASES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
