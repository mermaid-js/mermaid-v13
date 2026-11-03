// @ts-check
/**
 * Local eslint plugin holding the v13 architecture in place (DESIGN §2, R-ARCH-1/5, R-PARSE-7).
 *
 * - `mermaid/import-boundaries`: diagram-* → core, mermaid → core + diagram-*, core → nothing.
 * - `mermaid/no-global-config`: no getConfig-style global config lookup.
 * - `mermaid/no-nested-quantifier`: no quantifier nested in an unbounded/variable quantifier.
 */
import { dirname, relative, resolve, sep } from 'node:path';
import { RegExpParser, visitRegExpAST } from '@eslint-community/regexpp';

/** @typedef {import('eslint').Rule.RuleModule} RuleModule */
/** @typedef {import('eslint').Rule.RuleContext} RuleContext */
/** @typedef {import('estree').Node} EsNode */

const CORE = '@mermaid-js/core';

/**
 * Which workspace package a file belongs to, from its path.
 *
 * @param {string} filename
 * @returns {{ name: string, dir: string } | undefined}
 */
function packageOf(filename) {
  const parts = filename.split(sep);
  const at = parts.lastIndexOf('packages');
  const name = at === -1 ? undefined : parts[at + 1];
  if (!name) {
    return undefined;
  }
  return { name, dir: parts.slice(0, at + 2).join(sep) };
}

/** @param {string} s */
const isCore = (s) => s === CORE || s.startsWith(`${CORE}/`);
/** @param {string} s */
const isDiagram = (s) => s.startsWith('@mermaid-js/diagram-');
/** @param {string} filename */
const isTestFile = (filename) => /\.(spec|test)\.[cm]?[jt]s$/.test(filename);
/** @param {string} s */
const isTestOnly = (s) => s === 'vitest' || s.startsWith('vitest/') || s.startsWith('node:');

/**
 * Why `specifier` may not be imported from package `pkg`, or undefined when allowed.
 *
 * @param {string} pkg
 * @param {string} specifier
 * @param {boolean} inTest
 * @returns {string | undefined}
 */
function bareImportViolation(pkg, specifier, inTest) {
  if (inTest && isTestOnly(specifier)) {
    return undefined;
  }
  if (pkg === 'core') {
    return 'core imports nothing outside itself';
  }
  if (pkg.startsWith('diagram-')) {
    if (isCore(specifier)) {
      return undefined;
    }
    if (isDiagram(specifier)) {
      return 'a diagram package never imports another diagram package';
    }
    return `diagram packages import only ${CORE}`;
  }
  if (pkg === 'mermaid') {
    return isCore(specifier) || isDiagram(specifier)
      ? undefined
      : `mermaid imports only ${CORE} and @mermaid-js/diagram-*`;
  }
  return undefined;
}

/** @type {RuleModule} */
const importBoundaries = {
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

    /** @param {EsNode | null | undefined} source */
    function check(source) {
      if (!source || source.type !== 'Literal' || typeof source.value !== 'string') {
        return;
      }
      const specifier = source.value;
      let reason;
      if (specifier.startsWith('.')) {
        const target = resolve(dirname(filename), specifier);
        if (relative(pkg.dir, target).startsWith('..')) {
          reason = 'relative imports must stay inside the package; import its public entry';
        }
      } else {
        reason = bareImportViolation(pkg.name, specifier, inTest);
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

/** @type {RuleModule} */
const noGlobalConfig = {
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
        const callee = node.callee;
        const name =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
              ? callee.property.name
              : undefined;
        if (name && GLOBAL_CONFIG_NAMES.has(name)) {
          context.report({ node, messageId: 'forbidden', data: { name } });
        }
      },
    };
  },
};

const parser = new RegExpParser({ ecmaVersion: 2025 });

/**
 * Whether a quantifier sits inside another quantifier which can repeat (max > 1). The
 * inner one must itself be variable (min !== max); `(?:x{3})+` is linear and allowed.
 *
 * @param {string} pattern
 * @param {string} flags
 * @returns {boolean}
 */
function hasNestedQuantifier(pattern, flags) {
  let ast;
  try {
    ast = parser.parsePattern(pattern, 0, pattern.length, {
      unicode: flags.includes('u'),
      unicodeSets: flags.includes('v'),
    });
  } catch {
    return false;
  }
  let repeatingDepth = 0;
  let found = false;
  visitRegExpAST(ast, {
    onQuantifierEnter(q) {
      if (repeatingDepth > 0 && q.min !== q.max) {
        found = true;
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
  });
  return found;
}

/** @type {RuleModule} */
const noNestedQuantifier = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban nested quantifiers, which backtrack on user input (R-PARSE-7).' },
    messages: {
      nested:
        'Nested quantifier in /{{pattern}}/ can backtrack exponentially. Use a linear scanner or flatten the pattern.',
    },
    schema: [],
  },
  create(context) {
    /**
     * @param {EsNode} node
     * @param {string} pattern
     * @param {string} flags
     */
    function check(node, pattern, flags) {
      if (hasNestedQuantifier(pattern, flags)) {
        context.report({ node, messageId: 'nested', data: { pattern } });
      }
    }
    /** @param {import('estree').NewExpression | import('estree').CallExpression} node */
    function checkConstructor(node) {
      if (node.callee.type !== 'Identifier' || node.callee.name !== 'RegExp') {
        return;
      }
      const [source, flags] = node.arguments;
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

const CHAR_CODE_METHODS = new Set(['charCodeAt', 'codePointAt']);
const COMPARISONS = new Set(['===', '!==', '==', '!=', '<', '<=', '>', '>=']);

/** @param {EsNode | null | undefined} node */
function isCharCodeCall(node) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier' &&
    CHAR_CODE_METHODS.has(node.callee.property.name)
  );
}

/** @type {RuleModule} */
const noMagicCharCode = {
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
    /**
     * Whether a node is a char code: a charCodeAt/codePointAt call, or a variable that is
     * only ever given one.
     *
     * @param {EsNode} node
     */
    function isCharCode(node) {
      if (isCharCodeCall(node)) return true;
      if (node.type !== 'Identifier') return false;
      /** @type {import('eslint').Scope.Scope | null} */
      let scope = context.sourceCode.getScope(node);
      for (; scope; scope = scope.upper) {
        const variable = scope.set.get(node.name);
        if (!variable) continue;
        const writes = variable.references.filter((r) => r.isWrite());
        return writes.length > 0 && writes.every((r) => isCharCodeCall(r.writeExpr));
      }
      return false;
    }
    /** @param {EsNode} node */
    function report(node) {
      if (node.type === 'Literal' && typeof node.value === 'number') {
        context.report({ node, messageId: 'magic', data: { value: String(node.value) } });
      }
    }
    return {
      BinaryExpression(node) {
        if (!COMPARISONS.has(node.operator)) return;
        if (isCharCode(node.left)) report(node.right);
        if (isCharCode(node.right)) report(node.left);
      },
      SwitchStatement(node) {
        if (!isCharCode(node.discriminant)) return;
        for (const c of node.cases) if (c.test) report(c.test);
      },
    };
  },
};

export default {
  meta: { name: 'eslint-plugin-mermaid' },
  rules: {
    'import-boundaries': importBoundaries,
    'no-global-config': noGlobalConfig,
    'no-magic-char-code': noMagicCharCode,
    'no-nested-quantifier': noNestedQuantifier,
  },
};
