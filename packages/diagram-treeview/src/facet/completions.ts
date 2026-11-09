/**
 * TreeView completion (DESIGN §4.5, D95, R-LANG-7, #576): the probe's expected kinds mapped to
 * items. `treeView-beta` at the start; before the first node, as the first word of a line (after
 * its indent too), `title`, `accTitle:` and `accDescr`; after a node's name, on its line and
 * after a blank, `:::highlight`, `icon(` (the built-in `file` and `folder`, `none`, and
 * `pack:` for each icon pack the text names: in an `icon(pack:…)`, `defaultIconPack` or an icon
 * map) and `##`. Inside a quoted name, a statement's text or a description (probe modes
 * `string`, `title`, `accTitle`, `accDescr`, `description`) and outside code nothing is
 * offered.
 *
 * The cursor's word is the text from the last blank before it on its line: the lexer reads
 * an annotation still being typed (`index.js :::`, `index.js icon(`) as part of the name, so the
 * parser tests a name there, and the word after the blank is what the item replaces.
 */
import type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  ProbeResult,
  Range,
} from '@mermaid-js/core/parser-kit';
import { treeviewDocs } from '../generated/docs.ts';
import { BUILTIN_ICONS } from '../icons.ts';
import type { TreeViewModel } from '../model.ts';
import type { TreeViewDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { span } from './tables.ts';
import { treeOf } from './tree.ts';

/** Where an item is offered, besides the parser expecting its kind. */
type Place = 'header' | 'lineStart' | 'afterName';

interface Item {
  readonly kinds: readonly number[];
  readonly label: string;
  readonly item: CompletionKind;
  readonly place: Place;
  readonly insert?: string;
  readonly detail?: string;
}

/** The kinds that may follow a name on its line, or a name itself (an annotation being typed). */
const AFTER_NAME = [
  T.ClassAnnotation,
  T.IconAnnotation,
  T.DescAnnotation,
  T.BareName,
  T.QuotedName,
];

const statement = (kind: number, label: string, insert: string): Item => ({
  kinds: [kind],
  label,
  item: 'keyword',
  place: 'lineStart',
  insert,
});

/** Everything completion offers but the icon packs, in the order it is offered. */
const ITEMS: readonly Item[] = [
  { kinds: [T.TreeViewBeta], label: 'treeView-beta', item: 'keyword', place: 'header' },
  statement(T.Title, 'title', 'title '),
  statement(T.AccTitle, 'accTitle', 'accTitle: '),
  // `accDescr` takes one line or a block: both forms are offered.
  statement(T.AccDescr, 'accDescr:', 'accDescr: '),
  statement(T.AccDescr, 'accDescr {', 'accDescr { }'),
  {
    kinds: AFTER_NAME,
    label: ':::highlight',
    item: 'class',
    place: 'afterName',
    detail: 'a highlighted row',
  },
  ...[...BUILTIN_ICONS, 'none'].map(
    (name): Item => ({
      kinds: AFTER_NAME,
      label: `icon(${name})`,
      item: 'constant',
      place: 'afterName',
      detail: name === 'none' ? 'no icon' : `the built-in ${name} glyph`,
    })
  ),
  {
    kinds: AFTER_NAME,
    label: '##',
    item: 'operator',
    place: 'afterName',
    insert: '## ',
    detail: 'then a description',
  },
];

/** The kind whose docs an item shows. */
const DOC_KIND: Readonly<Record<string, number>> = { ':::highlight': T.ClassAnnotation };

const isBlank = (c: string) => c === ' ' || c === '\t';
const isBreak = (c: string) => c === '\n' || c === '\r' || c === '';

/** The word at `o`: back to the last blank or line start, on to the next blank or line end. */
function wordAt(text: string, o: number): Range {
  let start = o;
  while (start > 0 && !isBlank(text.charAt(start - 1)) && !isBreak(text.charAt(start - 1))) start--;
  let end = o;
  while (end < text.length && !isBlank(text.charAt(end)) && !isBreak(text.charAt(end))) end++;
  return span(start, end);
}

/** Whether only blanks come before `at` on its line. */
function atLineStart(text: string, at: number): boolean {
  let i = at;
  while (i > 0 && isBlank(text.charAt(i - 1))) i--;
  return i === 0 || text.charAt(i - 1) === '\n' || text.charAt(i - 1) === '\r';
}

/** The icon packs the text names, in the order it names them first. */
function iconPacks(doc: DocumentView<TreeViewDocument>): string[] {
  const { icons } = treeOf(doc.text, doc.result);
  const names = [
    ...(doc.result.model as TreeViewModel).nodes.map((n) => n.icon ?? ''),
    icons.defaultIconPack === '' ? '' : `${icons.defaultIconPack}:`,
    ...Object.values(icons.filenameIcons ?? {}),
    ...Object.values(icons.extensionIcons ?? {}),
  ];
  const packs = new Set<string>();
  for (const name of names) {
    const colon = name.indexOf(':');
    if (colon > 0) packs.add(name.slice(0, colon));
  }
  return [...packs];
}

export function treeViewCompletions(
  probe: ProbeResult,
  doc: DocumentView<TreeViewDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text } = doc;
  const expected = new Set(probe.expected);
  const range = wordAt(text, probe.offset);
  // A word never starts before the probed token's prefix (`"a"|` is past the name).
  if (range.start < probe.prefix.start) range.start = probe.prefix.start;
  const prefix = text.slice(range.start, probe.offset);
  const lineStart = atLineStart(text, range.start);
  const placed: Record<Place, boolean> = {
    header: lineStart,
    lineStart,
    afterName: !lineStart && range.start > 0 && isBlank(text.charAt(range.start - 1)),
  };
  const items: Item[] = [...ITEMS];
  for (const pack of placed.afterName ? iconPacks(doc) : []) {
    items.push({
      kinds: AFTER_NAME,
      label: `icon(${pack}:`,
      item: 'constant',
      place: 'afterName',
      detail: `an icon of the ${pack} pack`,
    });
  }
  const out: CompletionItem[] = [];
  for (const k of items) {
    if (!placed[k.place] || !k.kinds.some((kind) => expected.has(kind))) continue;
    if (!k.label.startsWith(prefix)) continue;
    // The keywords' docs, and `:::`'s for `:::highlight`; the other annotations have none.
    const docKind = DOC_KIND[k.label] ?? (k.place === 'afterName' ? undefined : k.kinds[0]);
    const documentation = docKind === undefined ? undefined : treeviewDocs[docKind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: k.insert ?? k.label,
      range,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  return out;
}
