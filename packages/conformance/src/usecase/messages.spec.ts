import { describe, expect, it } from 'vitest';
import { parseUsecase } from '@mermaid-js/diagram-usecase';
import { CHEVROTAIN_NAMES, UsecaseTokenKind } from '@mermaid-js/diagram-usecase/testing';
import { mutator, random } from '../fuzz/mutator.ts';
import { usecaseCases, usecaseCorpus } from './corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule
 * (Chevrotain's token names, v13's kind names, v12's rule names). We break every usecase corpus
 * source in seeded ways and check every message produced. What a message quotes from the
 * source (a token after `got`, a quoted id) is left out of the check.
 */
const INTERNAL = new RegExp(
  `\\b(?:${[
    ...Object.values(CHEVROTAIN_NAMES).filter((n) => n.includes('_')),
    ...Object.keys(UsecaseTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
    'actorItem',
    'actorName',
    'entityName',
    'entityStatement',
    'relationTail',
    'nodeLabel',
    'edgeLabel',
    'metadataProperty',
    'metadataSeparator',
    'systemBoundaryName',
    'systemBoundaryContent',
    'boundaryElement',
    'classSuffix',
    'styleValue',
    'styleComponent',
    'lineEnd',
  ].join('|')})\\b`
);

/** A message without what it quotes from the source. */
const withoutQuotes = (message: string): string =>
  message.replace(/`[^`\n]*`/g, '`…`').replace(/'[^'\n]*'/g, "'…'");

const FRAGMENTS = [
  ...[' ', '\n', ',', ':', '-->', '--', '---', '<--', '--o', 'o--', '--x', 'x--', '--|>'],
  ...['..>', ': include', '"', '`', '"`', '`"', '(', ')', '[', ']', '@{', '}', '@', 'e1@'],
  ...[':::', ':::c', '<<', '>>', '<<S>>', 'actor ', 'systemBoundary ', 'end', 'note for '],
  ...['json P@', '{"a": 1}', '{"a":', 'classDef ', 'class ', 'style ', 'fill:red', 'TB'],
  ...['direction ', 'accTitle: ', 'accDescr {', '%%', 'type: hollow', 'business: true'],
  ...['icon: "fa:user"', 'animate: true', 'package', '#amp;', '1.5', 'x-y', '\t', '日本'],
];

describe('usecase error messages', () => {
  it('never name a token or grammar rule', async () => {
    const corpus = [...(await usecaseCorpus()), ...usecaseCases()].map((c) => c.source);
    const next = mutator(corpus, FRAGMENTS, random(563));
    const bad: string[] = [];
    let errors = 0;
    for (let i = 0; i < 5000; i++) {
      const src = next();
      for (const d of parseUsecase(src).diagnostics) {
        if (d.severity === 'error') errors++;
        if (
          INTERNAL.test(withoutQuotes(d.message)) ||
          d.expected?.some((e) => INTERNAL.test(withoutQuotes(e)))
        ) {
          bad.push(`${JSON.stringify(src)}: ${d.message}`);
        }
      }
    }
    expect(errors).toBeGreaterThan(3000);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});
