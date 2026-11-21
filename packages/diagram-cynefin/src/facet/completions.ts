/**
 * Cynefin completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items.
 * An item is offered only when the parser tests its kind at the cursor: `cynefin-beta` at the
 * start; the five domains, `title`, `accTitle:` and `accDescr` at the start of a line; `-->`
 * after a domain name; the domains after `-->`, but not the source (a self-loop is not drawn,
 * D365); `:` after a transition's target; `"` inside a
 * block and after `:`. Inside an item, a label or a statement's text (probe modes `string`,
 * `title`, `accTitle`, `accDescr`) and outside code nothing is offered.
 */
import type { CompletionItem, DocumentView, ProbeResult } from '@mermaid-js/core/parser-kit';
import { cynefinDocs } from '../generated/docs.ts';
import type { CynefinDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { ITEMS, LINE_START } from './tables.ts';
import {
  atLineStart,
  keywordCompletions,
  lineBefore,
  wordRange,
} from '@mermaid-js/shared/parser/facet';

export function cynefinCompletions(
  probe: ProbeResult,
  doc: DocumentView<CynefinDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text, result } = doc;
  const expected = new Set(probe.expected);
  const range = wordRange(text, result.tokens, probe, /[\s"':]/);
  const prefix = text.slice(range.start, probe.offset);
  const before = lineBefore(text, range.start);
  const lineStart = atLineStart(text, range.start);
  // After `-->`: the source domain, which completion leaves out.
  const source = /([a-z]+)[\t ]*-->[\t ]*$/.exec(before)?.[1];
  const afterArrow = source !== undefined;
  return keywordCompletions(
    ITEMS,
    expected,
    prefix,
    range,
    cynefinDocs,
    (k) =>
      !(k.kind === T.DomainName && k.label === source) &&
      (!LINE_START.has(k.kind) || lineStart || (k.kind === T.DomainName && afterArrow))
  );
}
