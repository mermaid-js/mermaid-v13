/**
 * #837: the mindmap and kanban grammars read a tag's `="x"` attributes as text in a string, a
 * markdown string and kanban shape data, so the generated highlighters (TextMate, Monarch,
 * CodeMirror) agree with the lexer, which reads them as `='x'` (D114). Those tag rules run in an
 * editor on every line, so each must stay linear in its input on hostile text, as the lexers do
 * (R-PARSE-7): a ratio test on CPU time, n and 8n units, linear about 8x, quadratic about 64x,
 * bar 24x (`./mindmap/stress.spec.ts`).
 *
 * The rules are read from every generated grammar file, so a regenerated grammar is what is
 * measured.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './corpus.ts';
import { linearRatio } from './linear-time.ts';

const GENERATED = ['mindmap', 'kanban'].flatMap((type) => [
  `packages/diagram-${type}/grammar/generated/${type}.monarch.json`,
  `packages/diagram-${type}/grammar/generated/${type}.tmLanguage.json`,
  `packages/diagram-${type}/grammar/generated/${type}.tokens.js`,
  `packages/language-service-monaco/src/generated/${type}.monarch.js`,
  `packages/language-service-codemirror/src/generated/${type}.tokens.js`,
]);

/** Every distinct tag rule (a pattern holding `<\w+`) of the generated files, as JS source. */
function tagRules(): string[] {
  const rules = new Set<string>();
  for (const file of GENERATED) {
    const text = readFileSync(join(REPO_ROOT, file), 'utf8');
    for (const m of text.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
      const pattern = JSON.parse(m[0]) as string;
      // TextMate's patterns carry the grammar's case-insensitive flag inline.
      if (pattern.includes('<\\w+')) rules.add(pattern.replace(/^\(\?i\)/, ''));
    }
  }
  return [...rules].sort();
}

const RULES = tagRules();

/** Hostile text inside a string, a markdown string or shape data, in about 3n characters. */
const SHAPES: [string, (n: number) => string][] = [
  ['`<a=` repeated', (n) => '<a='.repeat(n)],
  ['`<a="` repeated', (n) => '<a="'.repeat(n)],
  ['a tag of unclosed `x="`', (n) => '<a ' + 'x="'.repeat(n)],
  ['`<a` repeated, then `>`', (n) => '<a'.repeat(n) + '>'],
  ['one long tag name', (n) => '<' + 'a'.repeat(3 * n)],
  ['one unclosed value', (n) => '<a x="' + 'y'.repeat(3 * n)],
  ['a long tag body', (n) => '<a' + ' x='.repeat(n)],
  ['tags of `=` runs', (n) => ('<a ' + '='.repeat(30)).repeat(n / 33)],
];

describe('the tag rules of the generated mindmap and kanban grammars (#837)', () => {
  it('are the string, markdown string and shape-data rules, and read a tag as text', () => {
    // `"…"` and `` "`…`" `` in both, and kanban's quoted and bare shape data (the quoted one is
    // the same pattern as a string's).
    expect(RULES).toHaveLength(3);
    for (const rule of RULES) {
      const re = new RegExp(rule, 'y');
      expect(re.exec('<span class="k" style="color:red">red</span> text"')?.[0]).toBe(
        '<span class="k" style="color:red">red</span> text'
      );
      re.lastIndex = 0;
      expect(re.exec('say "hi"')?.[0]).toBe('say ');
    }
  });

  for (const rule of RULES) {
    describe(rule, () => {
      it.each(SHAPES)(
        'are linear in input size: %s',
        (_name, build) => {
          const re = new RegExp(rule, 'y');
          const run = (text: string) => () => {
            re.lastIndex = 0;
            return re.exec(text);
          };
          expect(linearRatio(run(build(1_000)), run(build(8_000)))).toBeLessThan(24);
        },
        30_000
      );
    });
  }
});
