// cspell:words verifymethod docref
import { describe, expect, it } from 'vitest';
import { parseRequirement } from './index.ts';
import type { RequirementWarning } from '../model.ts';

/**
 * The requirement parser (spec #520 T2): v12's grammar and DB semantics (values checked against
 * mermaid\@12.2.0 through the conformance oracle; model parity over the corpus is
 * `packages/conformance/src/requirement/parity.spec.ts`), the AST ids (D437) and the decided
 * changes: D431's line break after blanks, D432's direction statement, D433's styling warning and
 * cap, D434's unknown ends, duplicates and shared names.
 */
const H = 'requirementDiagram\n';
const parse = (body: string, options = {}) => parseRequirement(H + body, options);
const errors = (src: string) =>
  parse(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);
const warning = (body: string, code: string): RequirementWarning | undefined =>
  parse(body).model.warnings.find((w) => w.code === code);

describe('the model', () => {
  it('reads every field, canonical whatever the case, the first of a repeated one', () => {
    const { model, diagnostics } = parse(
      'functionalRequirement r {\n  ID: 1\n  id: 2\n  Text: "a\n  b"\n  RISK: HIGH\n  verifyMethod: TEST\n}\nelement e {\n  type: "sim"\n  docref: d\n}'
    );
    expect(diagnostics).toEqual([]);
    expect(model.requirements).toMatchObject([
      {
        ast: 'requirement:r',
        name: 'r',
        kind: 'Functional Requirement',
        requirementId: '1',
        text: 'a\n  b',
        risk: 'High',
        verifyMethod: 'Test',
        classes: ['default'],
        styles: [],
        slot: 0,
      },
    ]);
    expect(model.elements).toMatchObject([
      { ast: 'element:e', name: 'e', type: 'sim', docRef: 'd', slot: 1 },
    ]);
  });

  it('leaves fields a body does not set empty, and an empty body is fine', () => {
    const { model } = parse('requirement a {\n}\nelement b {\n}');
    expect(model.requirements[0]).toMatchObject({
      requirementId: '',
      text: '',
      risk: '',
      verifyMethod: '',
    });
    expect(model.elements[0]).toMatchObject({ type: '', docRef: '' });
  });

  it('keeps relations in source order with v12 ends, both arrow forms', () => {
    const { model } = parse('a - satisfies -> b\nb <- contains - a\n"x y" - traces -> "z"');
    expect(model.relations.map((r) => [r.kind, r.src, r.dst])).toEqual([
      ['satisfies', 'a', 'b'],
      ['contains', 'a', 'b'],
      ['traces', 'x y', 'z'],
    ]);
  });

  it('reads statements with no separator between them, as v12', () => {
    const { model, diagnostics } = parse('"a" - traces -> "b" "c" - copies -> "d"');
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(model.relations).toHaveLength(2);
  });

  it('reads the direction, the acc values and the front-matter title', () => {
    const r = parseRequirement(
      `---\ntitle: My title\n---\n${H}direction LR\naccTitle:  t \naccDescr {\n  line 1\n    line 2\n}\n`
    );
    expect(r.model).toMatchObject({
      direction: 'LR',
      accTitle: 't',
      accDescr: 'line 1\nline 2',
      title: 'My title',
    });
  });

  it('applies styles and classes in v12 order, multiplying repeats', () => {
    const { model } = parse(
      'requirement a {\n}\nclass a,a c,c\nclassDef c color:red,fill:blue\nstyle a stroke:#333\n'
    );
    expect(model.requirements[0]?.classes).toEqual(['default', 'c', 'c', 'c', 'c']);
    expect(model.requirements[0]?.styles).toEqual(['color:red', 'fill:blue', 'stroke:#333']);
    expect(model.classes).toEqual([
      { name: 'c', styles: ['color:red', 'fill:blue'], textStyles: ['color:red'] },
    ]);
  });

  it('joins style parts without the spaces between them, as v12', () => {
    const { model } = parse('requirement a {\n}\nstyle a stroke-dasharray: 5 5;\n');
    expect(model.requirements[0]?.styles).toEqual(['stroke-dasharray:55;']);
  });
});

describe('AST ids (D437)', () => {
  it('names boxes, relations and classes, with @k for repeats', () => {
    const { ast } = parse(
      'requirement a {\n}\nrequirement a {\n}\nelement a {\n}\na - traces -> b\na - copies -> b\nclassDef c,d fill:red\nclassDef c stroke:blue\nstyle a fill:red\nclass a c\na:::d\ndirection LR\n'
    );
    expect(ast.children.map((c) => c.id)).toEqual([
      'header:1',
      'requirement:a',
      'requirement:a@2',
      'element:a',
      'relation:a->b',
      'relation:a->b@2',
      'classDef:c',
      'classDef:c@2',
      'style:1',
      'class:1',
      'class:2',
      'direction:1',
    ]);
  });

  it('percent-encodes `%`, `>`, `@` and `#` in names', () => {
    const { ast } = parse('"a>b" - traces -> "c@d"\nrequirement "x#y%" {\n}');
    expect(ast.children.map((c) => c.id)).toEqual([
      'header:1',
      'relation:a%3Eb->c%40d',
      'requirement:x%23y%25',
    ]);
  });

  it('gives each box its definition range and each relation its own', () => {
    const src = 'requirement "a" {\n  id: 1\n}\nx - traces -> y';
    const { ast } = parse(src);
    const text = (k: number) => {
      const r = ast.children[k]?.range ?? { start: 0, end: 0 };
      return (H + src).slice(r.start, r.end);
    };
    expect(text(1)).toBe('requirement "a" {\n  id: 1\n}');
    expect(text(2)).toBe('x - traces -> y');
  });
});

describe('D431: a line break after blanks', () => {
  it('ends the line where the grammar needs one', () => {
    for (const body of [
      'requirement a { \n}',
      'requirement a {\n  risk: high \n  text: "x" \n}',
      'requirement a {\n}  ',
    ]) {
      expect(errors(body), body).toEqual([]);
    }
    expect(parseRequirement('requirementDiagram  \nrequirement a {\n}').diagnostics).toEqual([]);
  });

  it('is skipped elsewhere, so the forms v12 accepted keep their model', () => {
    const { model, diagnostics } = parse(
      'requirement \n a {\n  risk: \nhigh\n}\nrequirement "b" \n{\n}\na - traces \n-> b\na - \ncopies -> b\n"a" \n- derives -> b'
    );
    expect(diagnostics).toEqual([]);
    expect(model.requirements.map((r) => [r.name, r.risk])).toEqual([
      ['a', 'High'],
      ['b', ''],
    ]);
    expect(model.relations.map((r) => r.kind)).toEqual(['traces', 'copies', 'derives']);
  });
});

describe('D432: direction', () => {
  it('is a statement of its own line: what follows is one error, the direction still set', () => {
    const r = parse('direction LR a - traces -> b\nrequirement a {\n}');
    const e = r.diagnostics.filter((d) => d.severity === 'error');
    expect(e).toHaveLength(1);
    expect(e[0]?.message).toMatch(/after `direction LR`.*ends its line/);
    expect(r.model.direction).toBe('LR');
    expect(r.model.relations).toEqual([]);
    expect(r.model.requirements).toHaveLength(1);
  });

  it('is only read at a line start', () => {
    const { model } = parse('a - traces -> b direction LR');
    expect(model.direction).toBe('TB');
    expect(model.relations[0]?.dst).toBe('b direction LR');
  });
});

describe('D433: styling lost to the order of the text', () => {
  it('warns once, listing each lost statement with its AST id', () => {
    const w = warning(
      'style a fill:red\nclass a c\na:::c\nstyle x,b fill:red\nrequirement a {\n}\nrequirement b {\n}',
      'REQUIREMENT_STYLE_DROPPED'
    );
    expect(w?.astIds).toEqual(['style:1', 'class:1', 'class:2', 'style:2']);
    expect(w?.related?.map((r) => r.message)).toEqual([
      'The style for "a" is lost: "a" is defined only later, at line 6. Move the statement after the definition.',
      'The class for "a" is lost: "a" is defined only later, at line 6. Move the statement after the definition.',
      'The class for "a" is lost: "a" is defined only later, at line 6. Move the statement after the definition.',
      'The style for "x" is lost: no requirement or element is named "x". The name after it gets no style either.',
    ]);
    expect(w?.message).toMatch(/^4 styling statements are lost/);
    expect(parse('style a fill:red\nrequirement a {\n}').model.warnings).toHaveLength(1);
  });

  it('lists a `classDef default` that boxes are defined after', () => {
    const w = warning(
      'requirement a {\n}\nclassDef default fill:red\nrequirement b {\n}\nelement c {\n}',
      'REQUIREMENT_STYLE_DROPPED'
    );
    expect(w?.astIds).toEqual(['classDef:default']);
    expect(w?.message).toBe(
      'The default class reaches only the boxes defined before it: "b" (line 5) and 1 more get none of its styles. Move the `classDef default` after the last definition.'
    );
    expect(
      warning('requirement a {\n}\nclassDef default fill:red', 'REQUIREMENT_STYLE_DROPPED')
    ).toBe(undefined);
  });

  it('records style copies past the cap, with no diagnostic (R-SEC-5, `../limits.spec.ts`)', () => {
    const r = parse('requirement a {\n}\nclassDef c fill:red\nclass a,a,a c,c', {
      maxStyleCopies: 4,
    });
    expect(r.diagnostics).toEqual([]);
    expect(r.model.styleCopies).toMatchObject({ max: 4, found: 5 });
  });
});

describe('D434: unknown ends, duplicates and shared names', () => {
  it('keeps relations to unknown names, with one warning listing them', () => {
    const r = parse('requirement a {\n}\na - traces -> x\ny - copies -> a');
    expect(r.model.relations.map((x) => [x.from, x.to])).toEqual([
      ['requirement:a', undefined],
      [undefined, 'requirement:a'],
    ]);
    const w = r.model.warnings.find((x) => x.code === 'REQUIREMENT_UNKNOWN_NODE');
    expect(w?.astIds).toEqual(['relation:a->x', 'relation:y->a']);
    expect(w?.related).toHaveLength(2);
  });

  it('keeps the first of duplicate definitions; a later `:::` still classes it', () => {
    const r = parse('requirement a {\n  id: 1\n}\nrequirement a:::c {\n  id: 2\n}');
    expect(r.model.requirements).toMatchObject([{ requirementId: '1', classes: ['default', 'c'] }]);
    const w = r.model.warnings.find((x) => x.code === 'REQUIREMENT_DUPLICATE');
    expect(w?.message).toBe(
      'The requirement "a" is defined again: the definition at line 2 is kept, and this one is left out.'
    );
    expect(w?.astIds).toEqual(['requirement:a@2']);
  });

  it('keeps both boxes of a shared name; relations and styles reach the requirement', () => {
    const r = parse('element a {\n}\nrequirement a {\n}\nstyle a fill:red\na - traces -> a');
    expect(r.model.requirements[0]?.styles).toEqual(['fill:red']);
    expect(r.model.elements[0]?.styles).toEqual([]);
    expect(r.model.relations[0]).toMatchObject({ from: 'requirement:a', to: 'requirement:a' });
    const w = r.model.warnings.find((x) => x.code === 'REQUIREMENT_SHARED_NAME');
    expect(w?.astIds).toEqual(['requirement:a']);
  });
});
