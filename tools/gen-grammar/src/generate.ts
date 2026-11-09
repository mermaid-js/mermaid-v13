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
  /**
   * Diagram type, e.g. `flowchart`: names the generated tables (`flowchartCategories`), so it
   * is an identifier (`railroadEbnf`).
   */
  type: string;
  /**
   * The package, `packages/diagram-<package>`, when it is not `type`: a package whose manifest
   * declares several types carries one grammar per type (D512).
   */
  package?: string;
  /**
   * The grammar file's base name, `grammar/<grammar>.ebnf`, when it is not `type`
   * (`railroad-ebnf`). It also names the highlighters, the syntax doc and, when it is not the
   * package's name, the category and doc tables (`src/generated/<grammar>.categories.ts`).
   */
  grammar?: string;
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
    type: 'treemap',
    title: 'Treemap syntax',
    kinds: { module: 'parser/tokens.ts', object: 'T' },
  },
  {
    type: 'wardley',
    title: 'Wardley map syntax',
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
    type: 'sankey',
    title: 'Sankey diagram syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'SankeyKind',
      // One kind per rule where jison names two rules alike (`DQUOTE`) or the kind is named
      // after what it holds (`Text` for `NON_ESCAPED_TEXT`).
      unnamed: {
        OpenQuote: { mode: 'csv', pattern: '"', terminal: 'DQUOTE' },
        CloseQuote: { mode: 'escaped_text', pattern: '"(?!")', terminal: 'DQUOTE' },
        Text: {
          mode: 'csv',
          pattern: '[\\x20-\\x21\\x23-\\x2B\\x2D-\\x7E]*',
          terminal: 'NON_ESCAPED_TEXT',
        },
      },
    },
  },
  {
    type: 'xychart',
    title: 'XY chart syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      // Text jison matches without returning a token; the hand-written lexer keeps one for it.
      unnamed: {
        AccDescrMultiline: { mode: 'INITIAL', pattern: 'accDescr\\s*\\{\\s*' },
        AccDescrMultilineEnd: { mode: 'acc_descr_multiline', pattern: '\\}' },
        StringStart: { mode: 'INITIAL', pattern: '"' },
        StringEnd: { mode: 'string', pattern: '"' },
        DeadMdRule: {
          mode: 'INITIAL',
          pattern:
            '`\\)[ ]{36}\\{ this\\.pushState\\(md_string\\); \\}\\n<md_string>\\(\\?:\\(\\?!`"\\)\\.\\)\\+[ ]{18}\\{ return MD_STR; \\}\\n<md_string>\\(\\?:`',
        },
        Blanks: { mode: 'INITIAL', pattern: '\\s+' },
      },
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
        QuotedLabel: { mode: 'quotedLabel', pattern: '[^"]*(?="\\])', terminal: 'BRACKET_LABEL' },
        Label: { mode: 'label', pattern: '[^\\]"]*?(?=\\s*\\])', terminal: 'BRACKET_LABEL' },
      },
    },
  },
  {
    type: 'c4',
    title: 'C4 diagram syntax',
    kinds: {
      module: 'parser/tokens.ts',
      object: 'T',
      unnamed: {
        // Text jison matches without returning a token; the hand-written lexer keeps one for it.
        AccDescrBlockStart: {
          mode: 'INITIAL',
          pattern: 'accDescr\\s*\\{\\s*',
          docOf: 'acc_descr_multiline_value',
        },
        AccDescrBlockEnd: {
          mode: 'acc_descr_multiline',
          pattern: '\\}',
          docOf: 'acc_descr_multiline_value',
        },
        ArgsOpen: { mode: 'macro', pattern: '\\(' },
        Comma: { mode: 'attribute', pattern: ',' },
        QuoteOpen: { mode: 'attribute', pattern: '[ ]*"' },
        QuoteClose: { mode: 'string', pattern: '"' },
        KeyStart: { mode: 'attribute', pattern: '[ ]*\\$' },
        KeyEquals: { mode: 'string_kv_key', pattern: '=[ ]*"' },
        ValueClose: { mode: 'string_kv_value', pattern: '"' },
        // Kinds named apart from their jison terminal (`SYSTEM_EXT_QUEUE` is `SystemQueue_Ext`).
        AccDescrBlockValue: {
          mode: 'acc_descr_multiline',
          pattern: '[^\\}]*',
          terminal: 'acc_descr_multiline_value',
        },
        SystemQueueExt: {
          mode: 'INITIAL',
          pattern: 'SystemQueue_Ext\\b',
          terminal: 'SYSTEM_EXT_QUEUE',
          docOf: 'SYSTEM_EXT_QUEUE',
        },
        SystemDbExt: {
          mode: 'INITIAL',
          pattern: 'SystemDb_Ext\\b',
          terminal: 'SYSTEM_EXT_DB',
          docOf: 'SYSTEM_EXT_DB',
        },
        ContainerQueueExt: {
          mode: 'INITIAL',
          pattern: 'ContainerQueue_Ext\\b',
          terminal: 'CONTAINER_EXT_QUEUE',
          docOf: 'CONTAINER_EXT_QUEUE',
        },
        ContainerDbExt: {
          mode: 'INITIAL',
          pattern: 'ContainerDb_Ext\\b',
          terminal: 'CONTAINER_EXT_DB',
          docOf: 'CONTAINER_EXT_DB',
        },
        ComponentQueueExt: {
          mode: 'INITIAL',
          pattern: 'ComponentQueue_Ext\\b',
          terminal: 'COMPONENT_EXT_QUEUE',
          docOf: 'COMPONENT_EXT_QUEUE',
        },
        ComponentDbExt: {
          mode: 'INITIAL',
          pattern: 'ComponentDb_Ext\\b',
          terminal: 'COMPONENT_EXT_DB',
          docOf: 'COMPONENT_EXT_DB',
        },
        UpdateElementStyle: {
          mode: 'INITIAL',
          pattern: 'UpdateElementStyle\\b',
          terminal: 'UPDATE_EL_STYLE',
          docOf: 'UPDATE_EL_STYLE',
        },
      },
    },
  },
];

/** The grammar file of `grammar` in `packages/diagram-<pkg>`. */
export const grammarPath = (grammar: string, pkg: string = grammar): string =>
  `packages/diagram-${pkg}/grammar/${grammar}.ebnf`;
/** The highlighters' folder of `packages/diagram-<pkg>`. */
export const generatedDir = (pkg: string): string => `packages/diagram-${pkg}/grammar/generated`;
/** The diagram package's source dir. */
export const sourceDir = (pkg: string): string => `packages/diagram-${pkg}/src`;

/** Where one target's grammar file is, and what it generates (repo-relative paths). */
export interface TargetPaths {
  /** The package, `packages/diagram-<pkg>`. */
  pkg: string;
  /** The grammar file's base name. */
  grammar: string;
  /** The grammar file. */
  file: string;
  /** The token-kind module. */
  kinds: string;
  /** The folder of the highlighters. */
  highlighters: string;
  syntaxDoc: string;
  categories: string;
  docs: string;
}

/** Where one target's grammar file is, and what it generates. */
export function targetPaths(target: GrammarTarget): TargetPaths {
  const { type } = target;
  const pkg = target.package ?? type;
  if (!/^[A-Za-z_$][\w$]*$/.test(type)) throw new Error(`type ${type} is not an identifier`);
  // A second type of a package names its grammar file (`railroad-ebnf`, not `railroadEbnf`).
  if (type !== pkg && target.grammar === undefined) {
    throw new Error(`type ${type} of package ${pkg} names no grammar file`);
  }
  const grammar = target.grammar ?? type;
  // The package's own type keeps the plain table names; each other one prefixes them.
  const table = type === pkg ? '' : `${grammar}.`;
  const generated = `${sourceDir(pkg)}/generated`;
  return {
    pkg,
    grammar,
    file: grammarPath(grammar, pkg),
    kinds: `${sourceDir(pkg)}/${target.kinds.module}`,
    highlighters: generatedDir(pkg),
    syntaxDoc: `v13/docs/syntax/${grammar}.md`,
    categories: `${generated}/${table}categories.ts`,
    docs: `${generated}/${table}docs.ts`,
  };
}

/** Repo-relative path → content, for one grammar file's text and its token-kind module's. */
export function generateFor(
  target: GrammarTarget,
  text: string,
  kindsText: string
): Map<string, string> {
  const { type } = target;
  const paths = targetPaths(target);
  const { grammar } = paths;
  const g = parseGrammar(text);
  const names = { id: `mermaid-${grammar}`, extensions: ['mmd', 'mermaid'] };
  const dir = paths.highlighters;
  const json = (v: object) => `${JSON.stringify(v, null, 2)}\n`;
  return new Map([
    [`${dir}/${grammar}.tmLanguage.json`, json(textMate(g, names))],
    [`${dir}/${grammar}.monarch.json`, json(monarch(g, names))],
    [`${dir}/${grammar}.grammar`, lezerGrammar(g, names, `./${grammar}.tokens.js`)],
    [`${dir}/${grammar}.tokens.js`, lezerTokens(g, names, `./${grammar}.parser.terms.js`)],
    [paths.syntaxDoc, syntaxDoc(g, target.title, paths.file)],
    [paths.categories, categoriesModule(g, type, paths.file, kindsText, target.kinds)],
    [
      paths.docs,
      docsModule(g, type, paths.file, kindKeys(kindsText, target.kinds.object), target.kinds),
    ],
  ]);
}

export function generate(
  read: (path: string) => string | undefined,
  targets: readonly GrammarTarget[] = GRAMMARS
): Map<string, string> {
  const files = new Map<string, string>();
  for (const target of targets) {
    const paths = targetPaths(target);
    const text = read(paths.file);
    if (text === undefined) throw new Error(`missing ${paths.file}`);
    const kindsText = read(paths.kinds);
    if (kindsText === undefined) throw new Error(`missing ${paths.kinds}`);
    for (const [k, v] of generateFor(target, text, kindsText)) {
      if (files.has(k)) throw new Error(`two grammars generate ${k}`);
      files.set(k, v);
    }
  }
  return files;
}
