/**
 * V8 allocates a function literal assigned straight to a property (`o.p = () => …`) in old
 * space, where it keeps the context it closes over, and all that context holds, alive through
 * every scavenge until the next full GC. The files below make such closures once per render, so
 * they build them another way (a factory, or a property of an object literal); this spec keeps
 * the direct form from coming back.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './code-size.ts';

const FILES = [
  'packages/core/src/layout/layered/compound-layer.ts',
  'packages/core/src/pipeline/extensions.ts',
];

const ASSIGN = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
]);

/** The `line: text` of each assignment of a function literal to a property in `text`. */
function propertyFunctions(text: string): string[] {
  const file = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && ASSIGN.has(node.operatorToken.kind)) {
      let right: ts.Expression = node.right;
      while (
        ts.isParenthesizedExpression(right) ||
        ts.isAsExpression(right) ||
        ts.isSatisfiesExpression(right) ||
        ts.isNonNullExpression(right)
      )
        right = right.expression;
      const left = node.left;
      if (
        (ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left)) &&
        (ts.isArrowFunction(right) || ts.isFunctionExpression(right))
      ) {
        const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
        found.push(`${line + 1}: ${left.getText(file)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('young closures', () => {
  it('finds the forms V8 allocates in old space', () => {
    expect(
      propertyFunctions(
        [
          'o.a = () => 1;',
          'o["b"] = function () {};',
          'o.c ??= (x: number) => x;',
          'o.d = (() => 2) as () => number;',
          'const f = () => 3; o.e = f;',
          'const o2 = { g: () => 4 };',
          'o.h = make(() => 5);',
        ].join('\n')
      )
    ).toEqual(['1: o.a', '2: o["b"]', '3: o.c', '4: o.d']);
  });

  it.each(FILES)('%s assigns no function literal to a property', (path) => {
    expect(propertyFunctions(readFileSync(join(REPO_ROOT, path), 'utf8'))).toEqual([]);
  });
});
