/**
 * Wardley completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items.
 * An item is offered only when the parser tests its kind at the cursor: `wardley-beta` at the
 * start; the statements as the first word of a line (`component` alone inside a pipeline's
 * braces); after a component's coordinates `label`, the strategies and `inertia`, in v12's
 * order (a strategy only before one is written); the strategies and `inertia` inside its `(`;
 * the arrows and flows after a link's first name, the flows after its second; and the declared
 * node names after an arrow or flow, `evolve`, `pipeline`, `accelerator` and `deaccelerator`,
 * quoted where they must be (D423), but no pipeline component's name after `evolve` and
 * `pipeline`, which the parser resolves by node id only. Inside a quoted name, a note's or annotation's text, a
 * statement's text (probe modes `string`, `title`, `accTitle`, `accDescr`) and outside code
 * nothing is offered.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { wardleyDocs } from '../generated/docs.ts';
import type { WardleyDocument } from '../parser/ast.ts';
import { NAME_SET } from '../parser/tables.ts';
import { T, WARDLEY_TRIVIA } from '../parser/tokens.ts';
import { nameReason, quoteName } from './names.ts';
import { declarationKind, declaredNodes, ITEMS, span, tokenBefore } from './tables.ts';

/** Tokens after which a node name is a reference: arrows, flows and the referring keywords. */
const BEFORE_REFERENCE = new Set<number>([
  T.Arrow,
  T.LinkArrow,
  T.LinkPort,
  T.Evolve,
  T.Pipeline,
  T.Accelerator,
  T.Deaccelerator,
]);

/**
 * The probed word's range: the prefix, plus the rest of the word after the cursor, to the
 * first blank, line break, quote or punctuation (a name's inner blanks are part of it).
 */
function wordRange(text: string, tokens: TokenStream | undefined, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  if (tokens && i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0)) {
    end = tokens.end[i] ?? o;
    const stop = (tokens.kind[i] === T.Name ? /[\r\n]/ : /[\s"':;,()[\]{}]/).exec(
      text.slice(o, end)
    );
    if (stop) end = o + stop.index;
  }
  return span(probe.prefix.start, end);
}

/** Whether only blanks come before `at` on its line. */
function atLineStart(text: string, at: number): boolean {
  let i = at;
  while (i > 0 && (text.charAt(i - 1) === ' ' || text.charAt(i - 1) === '\t')) i--;
  return i === 0 || text.charAt(i - 1) === '\n' || text.charAt(i - 1) === '\r';
}

/**
 * The significant tokens of the line before `at`, last first: the kinds that decide which
 * items fit (the token just before, and the statement's first).
 */
function lineBefore(tokens: TokenStream | undefined, at: number): number[] {
  const out: number[] = [];
  if (!tokens) return out;
  for (let j = tokenBefore(tokens, at); j >= 0; j--) {
    if ((tokens.end[j] ?? 0) > at || (tokens.start[j] ?? 0) >= at) continue;
    const k = tokens.kind[j] ?? Kind.EOF;
    if (k === Kind.Newline) break;
    if (WARDLEY_TRIVIA[k] !== 1) out.push(k);
  }
  return out;
}

export function wardleyCompletions(
  probe: ProbeResult,
  doc: DocumentView<WardleyDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text, result } = doc;
  const expected = new Set(probe.expected);
  const range = wordRange(text, result.tokens, probe);
  const prefix = text.slice(range.start, probe.offset);
  const lineStart = atLineStart(text, range.start);
  const before = lineBefore(result.tokens, range.start);
  const strategyWritten = before.includes(T.Strategy);
  const out: CompletionItem[] = [];
  for (const k of ITEMS) {
    if (!expected.has(k.kind) || (k.lineStart && !lineStart)) continue;
    if (k.strategy && strategyWritten) continue;
    if (!k.label.startsWith(prefix)) continue;
    const documentation = wardleyDocs[k.kind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: k.insert ?? k.label,
      range,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  // A reference: after an arrow or flow (not in `evolution`, whose stages are no nodes), or
  // after a keyword that names a node.
  const last = before[0] ?? Kind.EOF;
  const reference =
    BEFORE_REFERENCE.has(last) && before[before.length - 1] !== T.Evolution && !lineStart;
  if (reference && [...expected].some((k) => NAME_SET[k] === 1)) {
    // After `evolve` and `pipeline` a node id, as the parser reads it: no pipeline component.
    const idOnly = last === T.Evolve || last === T.Pipeline;
    for (const [name, declared] of declaredNodes(result.ast)) {
      const first = idOnly ? declared.find((d) => d.type !== 'PipelineComponent') : declared[0];
      if (!first || !name.startsWith(prefix)) continue;
      const insertText = nameReason(name) === undefined ? name : quoteName(name);
      if (insertText === undefined) continue;
      out.push({ label: name, kind: 'node', insertText, range, detail: declarationKind(first) });
    }
  }
  return out;
}
