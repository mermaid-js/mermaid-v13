/**
 * Every file generated from the grammar files: highlighters next to each grammar (separate
 * artefacts, never imported by a published package), the syntax reference pages and each
 * diagram's runtime kind → category table (D94) and keyword doc table (D93).
 */
import { categoriesModule, kindKeys } from './categories.ts';
import type { KindSource } from './categories.ts';
import { docsModule } from './docs.ts';
import { parseGrammar } from './ebnf.ts';
import { lezerGrammar, lezerTokens, monarch, textMate } from './highlight.ts';
import { syntaxDoc } from './syntax-doc.ts';

export interface GrammarTarget {
  /** Diagram type, e.g. `flowchart`. */
  type: string;
  /** Page title of the syntax reference. */
  title: string;
  /** The diagram's token kinds, for its kind → category table. */
  kinds: KindSource;
}

/** Diagram types that have a grammar file, `packages/diagram-<type>/grammar/<type>.ebnf`. */
export const GRAMMARS: GrammarTarget[] = [
  {
    type: 'flowchart',
    title: 'Flowchart syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      unnamed: {
        ShapeDataEnd: { mode: 'shapeData', pattern: '\\}' },
        // jison returns no token for `click`; the lexer does, with the click statement's doc.
        ClickKeyword: { mode: 'INITIAL', pattern: 'click\\s+', docOf: 'CLICK' },
      },
      // `@{` and the text between quotes are Meta, the quoted values String.
      mixed: ['SHAPE_DATA'],
      // `call <name>`: the keyword is not a token of its own. `click` is offered as a
      // completion for the node id the parser expects (`Click`).
      documented: ['Click', 'CallbackName'],
    },
  },
  {
    type: 'class',
    title: 'Class diagram syntax',
    kinds: { module: 'parser/tokens.ts', object: 'T', documented: ['CallbackName'] },
  },
  {
    type: 'sequence',
    title: 'Sequence diagram syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      // `accDescr {` and its `}`: jison returns no token for them, the lexer does.
      unnamed: {
        AccDescrMultiline: { mode: 'INITIAL', pattern: '(?i:accDescr)\\s*\\{\\s*' },
        AccDescrMultilineEnd: { mode: 'acc_descr_multiline', pattern: '\\}' },
      },
    },
  },
  {
    type: 'state',
    title: 'State diagram syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      // Text jison consumes without a terminal; the hand-written lexer keeps a token for it.
      unnamed: {
        State: { mode: 'struct', pattern: '(?i:state)\\s+' },
        Quote: { mode: 'STATE', pattern: '"' },
        Marker: {
          mode: 'STATE',
          pattern: '(?i:<<(?:fork|join|choice)>>|\\[\\[(?:fork|join|choice)\\]\\])',
        },
        EndNote: { mode: 'NOTE_TEXT', pattern: '\\n\\s*(?i:end note)\\b' },
        AccDescrOpen: { mode: 'INITIAL', pattern: '(?i:accDescr)\\s*\\{\\s*' },
        AccDescrClose: { mode: 'acc_descr_multiline', pattern: '\\}' },
        ScaleWidth: { mode: 'SCALE', pattern: '\\s+(?i:width)\\b' },
      },
      // A pseudo-state's name: the `state` keyword before it is not a token of its own.
      documented: ['Fork', 'Join', 'Choice'],
    },
  },
  {
    type: 'er',
    title: 'Entity relationship diagram syntax',
    kinds: { module: 'parser/tokens.ts', object: 'T' },
  },
  {
    type: 'journey',
    title: 'User journey syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      // `accDescr {` and its `}`: jison returns no token for them, the lexer does.
      unnamed: {
        AccDescrMultiline: { mode: 'INITIAL', pattern: 'accDescr\\s*\\{\\s*' },
        AccDescrMultilineEnd: { mode: 'acc_descr_multiline', pattern: '\\}' },
      },
    },
  },
  {
    type: 'timeline',
    title: 'Timeline syntax',
    // `accDescr {` and its `}` are named in the grammar file (jison returns no token for them).
    kinds: { module: 'parser/tokens.ts', object: 'T' },
  },
  {
    type: 'mindmap',
    title: 'Mindmap syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      // Text jison matches without returning a token; the hand-written lexer keeps one for it.
      unnamed: {
        ClassStart: { mode: 'INITIAL', pattern: ':::', docOf: 'CLASS' },
        ClassEnd: { mode: 'class', pattern: '\\n' },
        IconStart: { mode: 'INITIAL', pattern: '::icon\\(', docOf: 'ICON' },
        IconEnd: { mode: 'icon', pattern: '\\)' },
        MdStringStart: { mode: 'node', pattern: '["][`]' },
        MdStringEnd: { mode: 'nstr2', pattern: '[`]["]' },
        StringStart: { mode: 'node', pattern: '["]' },
        StringEnd: { mode: 'nstr', pattern: '["]' },
      },
      // A `%%` comment v12 left and a blank run are both SPACELINE.
      mixed: ['SPACELINE'],
    },
  },
  {
    type: 'gantt',
    title: 'Gantt chart syntax',
    // The openers and closers of jison's start conditions are named in the grammar file.
    kinds: { module: 'parser/tokens.ts', object: 'T' },
  },
  {
    type: 'pie',
    title: 'Pie chart syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      // A label starts a section and `:` follows it: completion offers both, with the doc.
      documented: ['String', 'Colon'],
    },
  },
  {
    type: 'gitgraph',
    title: 'Git graph syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      // A quoted text and a name follow keywords: completion offers them, with the doc.
      documented: ['String', 'Reference'],
    },
  },
  {
    type: 'packet',
    title: 'Packet diagram syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      // A field's label: `"` is offered after `:` (T6), with the doc.
      documented: ['String', 'Colon'],
    },
  },
  {
    type: 'cynefin',
    title: 'Cynefin diagram syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      // An item starts with its quote; completion offers it after a domain, with the doc.
      documented: ['String', 'Colon'],
    },
  },
  {
    type: 'info',
    title: 'Info diagram syntax',
    kinds: { module: 'parser/tokens.ts', object: 'T' },
  },
  {
    type: 'radar',
    title: 'Radar chart syntax',
    kinds: { module: 'parser/tokens.ts', object: 'T' },
  },
  {
    type: 'quadrant',
    title: 'Quadrant chart syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      // Text jison matches without returning a token; the hand-written lexer keeps one for it.
      unnamed: {
        AccDescrMultiline: { mode: 'INITIAL', pattern: 'accDescr\\s*\\{\\s*' },
        AccDescrMultilineEnd: { mode: 'acc_descr_multiline', pattern: '\\}' },
        MdStringStart: { mode: 'INITIAL', pattern: '"`' },
        MdStringEnd: { mode: 'md_string', pattern: '`"' },
        StringStart: { mode: 'INITIAL', pattern: '"' },
        StringEnd: { mode: 'string', pattern: '"' },
        ClassMarker: { mode: 'INITIAL', pattern: ':::' },
        PointComma: { mode: 'point_x', pattern: '\\s*,\\s*' },
        PointEnd: { mode: 'point_start', pattern: '\\s*\\][ ]*' },
      },
    },
  },
  {
    type: 'kanban',
    title: 'Kanban syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      unnamed: {
        // Text jison matches without returning a token; the hand-written lexer keeps one for it.
        ClassStart: { mode: 'INITIAL', pattern: ':::', docOf: 'CLASS' },
        ClassEnd: { mode: 'class', pattern: '\\n' },
        IconStart: { mode: 'INITIAL', pattern: '::icon\\(', docOf: 'ICON' },
        IconEnd: { mode: 'icon', pattern: '\\)' },
        MdStringStart: { mode: 'node', pattern: '["][`]' },
        MdStringEnd: { mode: 'nstr2', pattern: '[`]["]' },
        StringStart: { mode: 'node', pattern: '["]' },
        StringEnd: { mode: 'nstr', pattern: '["]' },
        ShapeDataEnd: { mode: 'shapeData', pattern: '\\}' },
        // One `SHAPE_DATA` rule each: the lexer keeps a kind per rule.
        ShapeDataStart: { mode: 'INITIAL', pattern: '@\\{', terminal: 'SHAPE_DATA' },
        ShapeDataQuote: { mode: 'shapeData', pattern: '"', terminal: 'SHAPE_DATA' },
        ShapeDataStr: { mode: 'shapeDataStr', pattern: '[^"]+', terminal: 'SHAPE_DATA' },
      },
      // A `%%` comment v12 left and a blank run are both SPACELINE; `@{` and the text between
      // quotes are Meta, the quoted values String.
      mixed: ['SPACELINE', 'SHAPE_DATA'],
    },
  },
  {
    type: 'venn',
    title: 'Venn diagram syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      unnamed: {
        // The `text` after an indent: jison returns no token for it; the lexer keeps one.
        IndentTextKeyword: { mode: 'indentText', pattern: 'text\\b', docOf: 'INDENT_TEXT' },
        // Both `BRACKET_LABEL` rules: the lexer keeps a kind per rule.
        QuotedLabel: { mode: 'quotedLabel', pattern: '[^"]*', terminal: 'BRACKET_LABEL' },
        Label: { mode: 'label', pattern: '[^\\]"]*?(?=\\s*\\])', terminal: 'BRACKET_LABEL' },
      },
    },
  },
];

export const grammarPath = (type: string): string =>
  `packages/diagram-${type}/grammar/${type}.ebnf`;
export const generatedDir = (type: string): string => `packages/diagram-${type}/grammar/generated`;
/** The diagram package's source dir. */
export const sourceDir = (type: string): string => `packages/diagram-${type}/src`;

/** Repo-relative path → content, for one grammar file's text and its token-kind module's. */
export function generateFor(
  target: GrammarTarget,
  text: string,
  kindsText: string
): Map<string, string> {
  const { type } = target;
  const g = parseGrammar(text);
  const names = { id: `mermaid-${type}`, extensions: ['mmd', 'mermaid'] };
  const dir = generatedDir(type);
  const json = (v: object) => `${JSON.stringify(v, null, 2)}\n`;
  return new Map([
    [`${dir}/${type}.tmLanguage.json`, json(textMate(g, names))],
    [`${dir}/${type}.monarch.json`, json(monarch(g, names))],
    [`${dir}/${type}.grammar`, lezerGrammar(g, names, `./${type}.tokens.js`)],
    [`${dir}/${type}.tokens.js`, lezerTokens(g, names, `./${type}.parser.terms.js`)],
    [`v13/docs/syntax/${type}.md`, syntaxDoc(g, target.title, grammarPath(type))],
    [
      `${sourceDir(type)}/generated/categories.ts`,
      categoriesModule(g, type, grammarPath(type), kindsText, target.kinds),
    ],
    [
      `${sourceDir(type)}/generated/docs.ts`,
      docsModule(
        g,
        type,
        grammarPath(type),
        kindKeys(kindsText, target.kinds.object),
        target.kinds
      ),
    ],
  ]);
}

export function generate(read: (path: string) => string | undefined): Map<string, string> {
  const files = new Map<string, string>();
  for (const target of GRAMMARS) {
    const text = read(grammarPath(target.type));
    if (text === undefined) throw new Error(`missing ${grammarPath(target.type)}`);
    const kindsPath = `${sourceDir(target.type)}/${target.kinds.module}`;
    const kindsText = read(kindsPath);
    if (kindsText === undefined) throw new Error(`missing ${kindsPath}`);
    for (const [k, v] of generateFor(target, text, kindsText)) files.set(k, v);
  }
  return files;
}
