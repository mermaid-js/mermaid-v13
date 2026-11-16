import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// The parser kit must hold no module-level mutable state (ticket #6): every stateful helper
// is an instance created per parse. At module scope only `const` bindings are allowed, and
// none may be initialised with a mutable collection (`[]`, `{}` without `as const`,
// `new Map/Set/Array`). Typed lookup tables and sticky regexes are read-only by convention.
const packages = join(import.meta.dirname, '..', '..', 'packages');
// Core's parser kit and the lexer and parser families in `shared` that build on it.
const dirs = [
  join(packages, 'core', 'src', 'parser-kit'),
  join(packages, 'shared', 'src', 'parser'),
];
const sources = dirs.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => join(dir, f))
);

function mutableBindings(code: string): string[] {
  const file = ts.createSourceFile('x.ts', code, ts.ScriptTarget.ES2022, true);
  const bad: string[] = [];
  for (const stmt of file.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const isConst = (stmt.declarationList.flags & ts.NodeFlags.Const) !== 0;
    for (const decl of stmt.declarationList.declarations) {
      const name = decl.name.getText(file);
      const init = decl.initializer;
      const mutableInit =
        init !== undefined &&
        (ts.isArrayLiteralExpression(init) ||
          ts.isObjectLiteralExpression(init) ||
          (ts.isNewExpression(init) &&
            /^(?:Map|Set|WeakMap|WeakSet|Array)$/.test(init.expression.getText(file))));
      if (!isConst || mutableInit) bad.push(name);
    }
  }
  return bad;
}

describe('parser kit module state', () => {
  it('has source files to check', () => {
    expect(sources.map((f) => relative(packages, f))).toContain(
      join('core', 'src', 'parser-kit', 'index.ts')
    );
    expect(sources.length).toBeGreaterThan(5);
  });

  it.each(sources.map((f) => [relative(packages, f), f]))(
    '%s declares no mutable module-level bindings',
    (_, file) => {
      expect(mutableBindings(readFileSync(file, 'utf8'))).toEqual([]);
    }
  );

  it('the guard flags what it bans and allows what it allows', () => {
    const banned = 'let a; var b = 1; const c = new Map(); const d = []; const e = { x: 1 };';
    expect(mutableBindings(banned)).toEqual(['a', 'b', 'c', 'd', 'e']);
    const allowed =
      'const K = { a: 0 } as const; const RE = /x/y; function f() { let i = 0; return i; }';
    expect(mutableBindings(allowed)).toEqual([]);
  });
});
