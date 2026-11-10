/**
 * The cynefin facet's completion table and shared helpers (DESIGN §4.5, D95). Keyword docs are
 * not here: they come from the grammar file (`generated/docs.ts`); the domain texts come from
 * `domains.ts`, as v12 drew them.
 */
import type { CompletionKind, Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { DOMAIN_META } from '../domains.ts';
import { CYNEFIN_DOMAIN_NAMES } from '../model.ts';
import type { CynefinDomainName } from '../model.ts';
import { T } from '../parser/tokens.ts';
import type { KindedKeywordItem as KeywordItem } from '@mermaid-js/core/parser-kit/facet';
export type { KindedKeywordItem as KeywordItem } from '@mermaid-js/core/parser-kit/facet';
export { tokenBefore } from '@mermaid-js/core/parser-kit/facet';
export { span } from '@mermaid-js/core/parser-kit/facet';
export { code } from '@mermaid-js/core/parser-kit/facet';

/**
 * What each domain means, as v12's syntax page (`docs/syntax/cynefin.md` at `mermaid@12.2.0`,
 * "Introduction") puts it. Hover shows it above the decision model and practice.
 */
export const DOMAIN_MEANING: Readonly<Record<CynefinDomainName, string>> = {
  complex: 'Cause and effect can only be deduced in retrospect.',
  complicated: 'Cause and effect require analysis or expertise.',
  clear: 'Cause and effect are obvious.',
  chaotic: 'No perceivable cause and effect.',
  confusion:
    'You do not know which domain you are in. The goal is to move items out of this state into one of the other four.',
};

/** The text v12 drew under a domain's name: `Probe → Sense → Respond · Emergent Practices`. */
export function domainLine(name: CynefinDomainName): string {
  const { model, practice } = DOMAIN_META[name];
  return model ? `${model} · ${practice}` : practice;
}

/** Everything completion offers, in the order it is offered. */
export const ITEMS: readonly KeywordItem[] = [
  { kind: T.Header, label: 'cynefin-beta', item: 'keyword' },
  ...CYNEFIN_DOMAIN_NAMES.map(
    (name): KeywordItem => ({
      kind: T.DomainName,
      label: name,
      item: 'keyword',
      detail: domainLine(name),
    })
  ),
  { kind: T.Title, label: 'title', item: 'keyword', insert: 'title ' },
  { kind: T.AccTitle, label: 'accTitle', item: 'keyword', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', item: 'keyword', insert: 'accDescr: ' },
  { kind: T.Arrow, label: '-->', item: 'operator', insert: '--> ', detail: 'then a domain' },
  { kind: T.Colon, label: ':', item: 'operator', insert: ': ', detail: 'then the label' },
  { kind: T.String, label: '"', item: 'value', detail: 'an item such as "Probe"' },
];

/** What completion offers only at the start of a line (a domain also after `-->`). */
export const LINE_START = new Set<number>([T.DomainName, T.Title, T.AccTitle, T.AccDescr]);
