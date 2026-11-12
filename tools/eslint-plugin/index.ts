/**
 * Local eslint plugin holding the v13 architecture in place (DESIGN §2, R-ARCH-1/5, R-PARSE-7).
 *
 * - `mermaid/import-boundaries`: diagram-* → core + shared, shared → core, mermaid → core +
 *   diagram-*, core → nothing (so nothing in `shared` is loaded before a diagram needs it);
 *   mermaid's Node-only files (the bin `src/cli.ts`, D85; the Node entry `src/node.ts` and its
 *   scan `src/node-scan.ts`, D165) may also import `node:` builtins;
 *   `core/ascii` imports no SVG code and only ASCII code imports it (DESIGN §6.3);
 *   a diagram's language-side code (`src/language*`, `src/facet/`, `src/parser/`) never imports its
 *   renderer, plugin, main entry or ASCII code (R-LANG-8, D89).
 * - `mermaid/no-global-config`: no getConfig-style global config lookup.
 * - `mermaid/no-magic-char-code`: char codes are compared with named constants, not numbers.
 * - `mermaid/no-nested-quantifier`: no quantifier nested in an unbounded/variable quantifier,
 *   and no unbounded quantifier before `$` which nothing anchors.
 */
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { RegExpParser, visitRegExpAST } from '@eslint-community/regexpp';
import type { AST } from '@eslint-community/regexpp';
import type { ESLint, Rule, Scope } from 'eslint';
import type { CallExpression, Expression, NewExpression, Node as EsNode } from 'estree';

const CORE = '@mermaid-js/core';
const SHARED = '@mermaid-js/shared';

/** Which workspace package a file belongs to, from its path. */
function packageOf(filename: string): { name: string; dir: string } | undefined {
  const parts = filename.split(sep);
  const at = parts.lastIndexOf('packages');
  const name = at === -1 ? undefined : parts[at + 1];
  if (!name) {
    return undefined;
  }
  return { name, dir: parts.slice(0, at + 2).join(sep) };
}

const isCore = (s: string) => s === CORE || s.startsWith(`${CORE}/`);
/** A `shared` subpath. The bare name is not an entry: one barrel would be one chunk. */
const isShared = (s: string) => s.startsWith(`${SHARED}/`);
const isDiagram = (s: string) => s.startsWith('@mermaid-js/diagram-');
const isCoreAscii = (s: string) => s === `${CORE}/ascii` || s.startsWith(`${CORE}/ascii/`);
/** ASCII code: a path inside the package with an `ascii` directory or an `ascii.*` file. */
const isAsciiCode = (dir: string, filename: string) =>
  relative(dir, filename)
    .split(sep)
    .some((part) => part === 'ascii' || part.startsWith('ascii.'));
const isInside = (dir: string, path: string) => {
  const rel = relative(dir, path);
  return !rel.startsWith('..') && !isAbsolute(rel);
};
/**
 * Code reachable from a diagram's `./language` entry: the entry, `src/language/`, the facet's
 * own modules in `src/facet/` (completions, hover, tables) and the parser. `src/generated/`
 * (the category table) is generated and not linted.
 */
const isLanguageCode = (src: string, filename: string) => {
  const [first] = relative(src, filename).split(sep);
  return (
    first === 'parser' ||
    first === 'facet' ||
    first === 'language' ||
    first?.startsWith('language.') === true
  );
};
/**
 * Modules that pull in rendering: the renderer and the layout (what it draws from, which the
 * language bundle specs keep out of `./language` too), as a folder (`render/`, `layout/`) or a
 * file (`render.ts`, `layout.ts`, as info's), the plugin and main entry, ASCII code.
 */
const isRenderSide = (src: string, target: string) => {
  const [first] = relative(src, target).split(sep);
  return (
    first === 'render' ||
    first?.startsWith('render.') === true ||
    first === 'layout' ||
    first?.startsWith('layout.') === true ||
    first === 'ascii' ||
    first?.startsWith('ascii.') === true ||
    /^(plugin|index)(\.[cm]?[jt]s)?$/.test(first ?? '')
  );
};
const isTestFile = (filename: string) => /\.(spec|test)\.[cm]?[jt]s$/.test(filename);
const isTestOnly = (s: string) =>
  s === 'vitest' || s.startsWith('vitest/') || s.startsWith('node:');

/** mermaid's Node-only files: the bin (D85), and the Node entry and its scan (D165). */
const NODE_ONLY = ['cli.ts', 'node.ts', 'node-scan.ts'].map((f) => join('src', f));
const isBin = (pkg: string, dir: string, filename: string) =>
  pkg === 'mermaid' && NODE_ONLY.includes(relative(dir, filename));

/** Why `specifier` may not be imported from package `pkg`, or undefined when allowed. */
function bareImportViolation(
  pkg: string,
  specifier: string,
  inTest: boolean,
  inBin = false
): string | undefined {
  if (inTest && isTestOnly(specifier)) {
    return undefined;
  }
  if (inBin && specifier.startsWith('node:')) {
    return undefined;
  }
  if (pkg === 'core') {
    return 'core imports nothing outside itself';
  }
  if (pkg === 'shared') {
    return isCore(specifier) ? undefined : `shared imports only ${CORE}`;
  }
  if (pkg.startsWith('diagram-')) {
    return diagramImportViolation(specifier);
  }
  if (pkg === 'mermaid') {
    return mermaidImportViolation(specifier);
  }
  return undefined;
}

/** Why a diagram package may not import `specifier`, or undefined when it may. */
function diagramImportViolation(specifier: string): string | undefined {
  if (isCore(specifier) || isShared(specifier)) {
    return undefined;
  }
  if (isDiagram(specifier)) {
    return 'a diagram package never imports another diagram package';
  }
  if (specifier === SHARED) {
    return `${SHARED} has no root entry; import a subpath`;
  }
  return `diagram packages import only ${CORE} and ${SHARED} subpaths`;
}

/** Why `mermaid` may not import `specifier`, or undefined when it may. */
function mermaidImportViolation(specifier: string): string | undefined {
  if (specifier === SHARED || isShared(specifier)) {
    return `mermaid never imports ${SHARED}: it loads with the diagrams that use it`;
  }
  return isCore(specifier) || isDiagram(specifier)
    ? undefined
    : `mermaid imports only ${CORE} and @mermaid-js/diagram-*`;
}

const importBoundaries: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce the v13 package dependency directions (DESIGN §2).' },
    messages: { forbidden: "'{{specifier}}' is not allowed here: {{reason}}." },
    schema: [],
  },
  create(context) {
    const filename = context.filename;
    const found = packageOf(filename);
    if (!found) {
      return {};
    }
    const pkg = found;
    const inTest = isTestFile(filename);

    function check(source: EsNode | null | undefined): void {
      if (!source || source.type !== 'Literal' || typeof source.value !== 'string') {
        return;
      }
      const specifier = source.value;
      let reason: string | undefined;
      if (specifier.startsWith('.')) {
        const target = resolve(dirname(filename), specifier);
        const src = join(pkg.dir, 'src');
        if (relative(pkg.dir, target).startsWith('..')) {
          reason = 'relative imports must stay inside the package; import its public entry';
        } else if (pkg.name === 'core' && isInside(join(src, 'ascii'), filename)) {
          if (isInside(join(src, 'svg'), target)) {
            reason = 'core/ascii never imports SVG code (DESIGN §6.3)';
          }
        } else if (pkg.name === 'core' && !inTest && isInside(join(src, 'ascii'), target)) {
          reason = 'only ASCII code imports core/ascii (DESIGN §6.3)';
        } else if (
          pkg.name.startsWith('diagram-') &&
          !inTest &&
          isLanguageCode(src, filename) &&
          isRenderSide(src, target)
        ) {
          reason = 'code reachable from ./language never imports rendering code (R-LANG-8)';
        }
      } else if (
        (isCoreAscii(specifier) || specifier === `${SHARED}/ascii`) &&
        !inTest &&
        !isAsciiCode(pkg.dir, filename)
      ) {
        reason = `only ASCII code imports ${specifier} (DESIGN §6.3)`;
      } else {
        reason = bareImportViolation(
          pkg.name,
          specifier,
          inTest,
          isBin(pkg.name, pkg.dir, filename)
        );
      }
      if (reason) {
        context.report({ node: source, messageId: 'forbidden', data: { specifier, reason } });
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};

const GLOBAL_CONFIG_NAMES = new Set([
  'getConfig',
  'getSiteConfig',
  'getUserConfig',
  'getEffectiveConfig',
  'setConfig',
  'setSiteConfig',
  'updateSiteConfig',
]);

/** The called function's name: `f` in `f()` and `a.f()`. */
function calleeName(node: CallExpression): string | undefined {
  const callee = node.callee;
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return callee.property.name;
  }
  return undefined;
}

const noGlobalConfig: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban global config lookup; config is passed explicitly (R-ARCH-5).' },
    messages: {
      forbidden:
        "'{{name}}' looks up global config. Take the frozen ResolvedConfig as a parameter instead.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = calleeName(node);
        if (name && GLOBAL_CONFIG_NAMES.has(name)) {
          context.report({ node, messageId: 'forbidden', data: { name } });
        }
      },
    };
  },
};

const CHAR_CODE_METHODS = new Set(['charCodeAt', 'codePointAt']);
const COMPARISONS = new Set(['===', '!==', '==', '!=', '<', '<=', '>', '>=']);

function isCharCodeCall(node: EsNode | null | undefined): boolean {
  if (node?.type !== 'CallExpression') {
    return false;
  }
  const name = node.callee.type === 'MemberExpression' ? calleeName(node) : undefined;
  return name !== undefined && CHAR_CODE_METHODS.has(name);
}

const noMagicCharCode: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Ban comparing char codes with bare numbers; name the character.' },
    messages: {
      magic:
        'Char code {{value}} is a bare number. Name it (`const LBRACE = 0x7b;`) or use a parser-kit helper (charTable, isDigit, isSpace, isWord).',
    },
    schema: [],
  },
  create(context) {
    /** A charCodeAt/codePointAt call, or a variable that is only ever given one. */
    function isCharCode(node: EsNode): boolean {
      if (isCharCodeCall(node)) {
        return true;
      }
      if (node.type !== 'Identifier') {
        return false;
      }
      let scope: Scope.Scope | null = context.sourceCode.getScope(node);
      for (; scope; scope = scope.upper) {
        const variable = scope.set.get(node.name);
        if (!variable) {
          continue;
        }
        const writes = variable.references.filter((r) => r.isWrite());
        return writes.length > 0 && writes.every((r) => isCharCodeCall(r.writeExpr));
      }
      return false;
    }

    function report(node: EsNode): void {
      if (node.type === 'Literal' && typeof node.value === 'number') {
        context.report({ node, messageId: 'magic', data: { value: String(node.value) } });
      }
    }

    return {
      BinaryExpression(node) {
        if (!COMPARISONS.has(node.operator)) {
          return;
        }
        if (isCharCode(node.left)) {
          report(node.right);
        }
        if (isCharCode(node.right)) {
          report(node.left);
        }
      },
      SwitchStatement(node) {
        if (!isCharCode(node.discriminant)) {
          return;
        }
        for (const c of node.cases) {
          if (c.test) {
            report(c.test);
          }
        }
      },
    };
  },
};

const parser = new RegExpParser({ ecmaVersion: 2025 });

type Finding = 'nested' | 'trailing';

/** Whether a match of `element` can end in an unbounded quantifier. */
function endsUnbounded(element: AST.Element): boolean {
  if (element.type === 'Quantifier') {
    return element.max === Infinity || endsUnbounded(element.element);
  }
  if (element.type === 'Group' || element.type === 'CapturingGroup') {
    return element.alternatives.some((a) => {
      const last = a.elements.at(-1);
      return last !== undefined && endsUnbounded(last);
    });
  }
  return false;
}

/**
 * Whether `element` pins where a match starts: a `^`, or a character every match must take
 * (`/\{\s*$/` is tried once per `{`, not once per blank).
 */
function pins(element: AST.Element): boolean {
  switch (element.type) {
    case 'Assertion':
      return element.kind === 'start';
    case 'Backreference':
      return false;
    case 'Quantifier':
      return element.min > 0 && pins(element.element);
    case 'Group':
    case 'CapturingGroup':
      return element.alternatives.every((a) => a.elements.some(pins));
    case 'Character':
    case 'CharacterClass':
    case 'CharacterSet':
    case 'ExpressionCharacterClass':
      return true;
  }
}

/** Whether something before `node`, on the way from the start of the pattern, pins it. */
function isAnchored(node: AST.Node): boolean {
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  if (parent.type === 'Alternative') {
    const before = parent.elements.slice(0, parent.elements.indexOf(node as AST.Element));
    if (before.some(pins)) {
      return true;
    }
  }
  return isAnchored(parent);
}

/**
 * What makes a pattern backtrack, if anything.
 *
 * `nested`: a quantifier sits inside another quantifier which can repeat (max > 1). The
 * inner one must itself be variable (min !== max); `(?:x{3})+` is linear and allowed.
 *
 * `trailing`: an unbounded quantifier comes right before `$` and nothing before it pins the
 * start of the match, as in `/;+$/`. On a run which does not end the text the engine retries
 * from each position of the run: quadratic. A sticky pattern starts in one place only and is
 * allowed. A required character before the quantifier counts as a pin, so `/;;+$/` and
 * `/a[a-z]*$/`, where that character can itself be part of the run, are not caught.
 */
function backtracking(pattern: string, flags: string): Finding | undefined {
  let ast;
  try {
    ast = parser.parsePattern(pattern, 0, pattern.length, {
      unicode: flags.includes('u'),
      unicodeSets: flags.includes('v'),
    });
  } catch {
    return undefined;
  }
  const sticky = flags.includes('y');
  let repeatingDepth = 0;
  let finding: Finding | undefined;
  visitRegExpAST(ast, {
    onQuantifierEnter(q) {
      if (repeatingDepth > 0 && q.min !== q.max) {
        finding = 'nested';
      }
      if (q.max > 1) {
        repeatingDepth++;
      }
    },
    onQuantifierLeave(q) {
      if (q.max > 1) {
        repeatingDepth--;
      }
    },
    onAssertionEnter(a) {
      if (a.kind !== 'end' || sticky || a.parent.type !== 'Alternative') {
        return;
      }
      const before = a.parent.elements[a.parent.elements.indexOf(a) - 1];
      if (before && endsUnbounded(before) && !isAnchored(before)) {
        finding ??= 'trailing';
      }
    },
  });
  return finding;
}

const noNestedQuantifier: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban nested quantifiers and unanchored quantifiers before `$`, which backtrack on user input (R-PARSE-7).',
    },
    messages: {
      nested:
        'Nested quantifier in /{{pattern}}/ can backtrack exponentially. Use a linear scanner or flatten the pattern.',
      trailing:
        'Unanchored quantifier before `$` in /{{pattern}}/ is retried from every position of a run: quadratic. Scan from the end, or anchor the pattern with `^`.',
    },
    schema: [],
  },
  create(context) {
    function check(node: EsNode, pattern: string, flags: string): void {
      const messageId = backtracking(pattern, flags);
      if (messageId) {
        context.report({ node, messageId, data: { pattern } });
      }
    }

    function checkConstructor(node: NewExpression | CallExpression): void {
      if (node.callee.type !== 'Identifier' || node.callee.name !== 'RegExp') {
        return;
      }
      const [source, flags] = node.arguments as (Expression | undefined)[];
      if (source?.type === 'Literal' && typeof source.value === 'string') {
        const f = flags?.type === 'Literal' && typeof flags.value === 'string' ? flags.value : '';
        check(node, source.value, f);
      }
    }

    return {
      Literal(node) {
        if ('regex' in node && node.regex) {
          check(node, node.regex.pattern, node.regex.flags);
        }
      },
      NewExpression: checkConstructor,
      CallExpression: checkConstructor,
    };
  },
};

const plugin: ESLint.Plugin = {
  meta: { name: 'eslint-plugin-mermaid' },
  rules: {
    'import-boundaries': importBoundaries,
    'no-global-config': noGlobalConfig,
    'no-magic-char-code': noMagicCharCode,
    'no-nested-quantifier': noNestedQuantifier,
  },
};

export default plugin;
