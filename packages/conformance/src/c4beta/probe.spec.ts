import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseC4Beta } from '@mermaid-js/diagram-c4/testing';

const CASES = join(import.meta.dirname, 'cases');

/** What the spec makes of a probe: the codes of its errors and of its warnings, in order. */
interface Verdict {
  errors: string[];
  warnings?: string[];
}

const ACCEPT: Verdict = { errors: [] };
const UNEXPECTED: Verdict = { errors: ['UNEXPECTED'] };
const UNEXPECTED_CHAR: Verdict = { errors: ['UNEXPECTED_CHARACTER'] };

/**
 * The 37 probes of spec #730, each with the verdict the spec gives. The `.mmd` files were run
 * on the converged v12 build (the prototype); a case where the spec's clean rule differs from
 * the prototype's result says so (`differs`).
 */
const EXPECTED: Record<string, Verdict & { differs?: string }> = {
  'b01-header-only': ACCEPT,
  'b02-basic-context': ACCEPT,
  'b03-kind-keywords-as-ids': ACCEPT,
  'b04-nesting-deployment': ACCEPT,
  'b05-empty-braces-and-group': ACCEPT,
  'b06-four-arrows': {
    ...UNEXPECTED_CHAR,
    differs: '`---` is ticket T4; accepted by the prototype',
  },
  'b07-dynamic-steps': ACCEPT,
  'b08-style-values': { errors: [], warnings: ['C4BETA_STYLE_IGNORED'] },
  'b09-multi-tags-external-boundary': ACCEPT,
  'b10-direction-legend-acc': ACCEPT,
  'b11-quotes': ACCEPT,
  'b12-comments-blank': ACCEPT,
  'b13-unknown-header-kind': { errors: ['C4BETA_UNKNOWN_DIAGRAM_KIND'] },
  'b14-relation-inside-body': UNEXPECTED,
  'b15-children-one-line': UNEXPECTED,
  'b16-arrow-without-spaces': UNEXPECTED_CHAR,
  'b17-digit-leading-id': { ...ACCEPT, differs: 'an id may start with a digit (oddity 2)' },
  'b18-keyword-ids': { errors: ['UNEXPECTED', 'UNEXPECTED'] },
  'b19-unknown-end': {
    errors: ['C4_UNKNOWN_END'],
    differs: 'an error at parse, not in the layout (oddity 5)',
  },
  'b20-duplicate-id': {
    errors: ['C4BETA_DUPLICATE_ID'],
    differs: 'an error, not two boxes (oddity 4)',
  },
  'b21-tech-on-person': {
    errors: [],
    warnings: ['C4BETA_TECHNOLOGY_DROPPED', 'C4BETA_INSTANCES_DROPPED'],
  },
  'b22-relation-without-colon': UNEXPECTED,
  'b23-element-without-name': UNEXPECTED,
  'b24-instances-unquoted': UNEXPECTED,
  'b25-step-outside-dynamic': { errors: [], warnings: ['C4BETA_STEP_IGNORED'] },
  'b26-nested-same-id': { errors: ['C4BETA_DUPLICATE_ID'] },
  'b27-boundary-to-boundary': ACCEPT,
  'b28-direction-in-body': UNEXPECTED,
  'b29-title-as-id': UNEXPECTED,
  'b30-label-with-html': ACCEPT,
  'b31-system-alias': { errors: ['C4BETA_UNKNOWN_ELEMENT_KIND'] },
  'b32-rel-before-elements': ACCEPT,
  'b33-brace-next-line': UNEXPECTED,
  'b34-accdescr-block': ACCEPT,
  'b35-instances-after-tags': UNEXPECTED,
  'b36-tags-before-name': UNEXPECTED,
  'b37-relationship-tags-and-tech-only': ACCEPT,
};

describe('c4-beta probes (spec #730)', () => {
  const files = readdirSync(CASES)
    .filter((f) => f.endsWith('.mmd'))
    .map((f) => f.slice(0, -'.mmd'.length))
    .sort();

  it('has a verdict for each of the 37 probes', () => {
    expect(files).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(files)('%s', (name) => {
    const want = EXPECTED[name];
    const { diagnostics } = parseC4Beta(readFileSync(join(CASES, `${name}.mmd`), 'utf8'));
    const codes = (severity: string) =>
      diagnostics.filter((d) => d.severity === severity).map((d) => d.code);
    expect({ errors: codes('error'), warnings: codes('warning') }).toEqual({
      errors: want?.errors,
      warnings: want?.warnings ?? [],
    });
  });
});
