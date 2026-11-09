import { describe, expect, it } from 'vitest';
import { RequirementBuilder } from './builder.ts';
import type { At, DefAt, Ref } from './builder.ts';
import { NameIds } from './ids.ts';

/**
 * v12's `requirementDb.spec.ts` (mermaid\@12.2.0, 10 tests of DB calls), ported as tests of the
 * model builder that replays those calls (R-TEST-3): each v12 call is the builder's method of
 * the same name, with the AST ids and ranges the parser passes along. v12's `getData()` edge ids
 * (`src-dst-0`, `src-dst-1`) are v13's relation AST ids (D437).
 */
const R = { start: 0, end: 0 };
const def = (ast: string): DefAt => ({ ast, range: R, nameRange: R });
const at = (ast: string): At => ({ ast, range: R });
const refs = (...names: string[]): Ref[] => names.map((name) => ({ name, range: R }));

function builder(): RequirementBuilder {
  return new RequirementBuilder({ error: () => undefined });
}

const built = (db: RequirementBuilder) => db.model(undefined, () => 1).model;

describe('requirementDb (v12) as the model builder', () => {
  it('should add a requirement', () => {
    const db = builder();
    db.addRequirement('requirement', 'Requirement', def('requirement:requirement'));
    expect(built(db).requirements.map((r) => r.name)).toEqual(['requirement']);
  });

  it('should add an element', () => {
    const db = builder();
    db.addElement('element', def('element:element'));
    expect(built(db).elements.map((e) => e.name)).toEqual(['element']);
  });

  it('should add a relationship', () => {
    const db = builder();
    db.addRelationship('contains', 'src', 'dst', at('relation:src->dst'));
    const relation = built(db).relations.find(
      (r) => r.kind === 'contains' && r.src === 'src' && r.dst === 'dst'
    );
    expect(relation).toBeDefined();
  });

  it('should create unique edge ids for parallel relationships', () => {
    const db = builder();
    const ids = new NameIds();
    db.addRequirement('src', 'Requirement', def(ids.named('requirement', 'src')));
    db.addRequirement('dst', 'Requirement', def(ids.named('requirement', 'dst')));
    db.addRelationship('traces', 'src', 'dst', at(ids.relation('src', 'dst')));
    db.addRelationship('contains', 'src', 'dst', at(ids.relation('src', 'dst')));
    expect(built(db).relations.map((r) => r.ast)).toEqual([
      'relation:src->dst',
      'relation:src->dst@2',
    ]);
  });

  it('should detect single class', () => {
    const db = builder();
    db.defineClass(['a'], ['stroke-width: 8px'], at('classDef:a'));
    expect(built(db).classes).toEqual([
      { name: 'a', styles: ['stroke-width: 8px'], textStyles: [] },
    ]);
  });

  it('should detect many classes', () => {
    const db = builder();
    db.defineClass(['a', 'b'], ['stroke-width: 8px'], at('classDef:a'));
    expect(built(db).classes).toEqual([
      { name: 'a', styles: ['stroke-width: 8px'], textStyles: [] },
      { name: 'b', styles: ['stroke-width: 8px'], textStyles: [] },
    ]);
  });

  it('should detect direction', () => {
    const db = builder();
    db.setDirection('TB');
    expect(built(db).direction).toBe('TB');
  });

  it('should add styles to a requirement and element', () => {
    const db = builder();
    db.addRequirement('requirement', 'Requirement', def('requirement:requirement'));
    db.setCssStyle(refs('requirement'), ['color:red'], at('style:1'));
    db.addElement('element', def('element:element'));
    db.setCssStyle(refs('element'), ['stroke-width:4px', 'stroke: yellow'], at('style:2'));
    const m = built(db);
    expect(m.requirements[0]?.styles).toEqual(['color:red']);
    expect(m.elements[0]?.styles).toEqual(['stroke-width:4px', 'stroke: yellow']);
  });

  it('should add classes to a requirement and element', () => {
    const db = builder();
    db.addRequirement('requirement', 'Requirement', def('requirement:requirement'));
    db.addElement('element', def('element:element'));
    db.setClass(refs('requirement', 'element'), ['myClass'], at('class:1'));
    const m = built(db);
    expect(m.requirements[0]?.classes).toEqual(['default', 'myClass']);
    expect(m.elements[0]?.classes).toEqual(['default', 'myClass']);
  });

  it('should add styles to a requirement and element inherited from a class', () => {
    const db = builder();
    db.addRequirement('requirement', 'Requirement', def('requirement:requirement'));
    db.addElement('element', def('element:element'));
    db.defineClass(['myClass'], ['color:red'], at('classDef:myClass'));
    db.defineClass(['myClass2'], ['stroke-width:4px', 'stroke: yellow'], at('classDef:myClass2'));
    db.setClass(refs('requirement'), ['myClass'], at('class:1'));
    db.setClass(refs('element'), ['myClass2'], at('class:2'));
    const m = built(db);
    expect(m.requirements[0]?.styles).toEqual(['color:red']);
    expect(m.elements[0]?.styles).toEqual(['stroke-width:4px', 'stroke: yellow']);
  });
});

describe('the builder beyond v12 (D433, D434)', () => {
  it('stops copying at the cap with one error, keeping what fit', () => {
    const errors: string[] = [];
    const db = new RequirementBuilder({ maxStyleCopies: 5, error: (code) => errors.push(code) });
    db.addRequirement('a', 'Requirement', def('requirement:a'));
    db.defineClass(['c'], ['fill:red'], at('classDef:c'));
    db.setClass(refs('a', 'a', 'a'), ['c', 'c'], at('class:1'));
    expect(errors).toEqual(['LAYOUT_LIMIT']);
    // The class's style (1), then `a` gets c + fill:red (2), c + fill:red (2): 5; no more.
    expect(built(db).requirements[0]?.classes).toEqual(['default', 'c', 'c']);
  });

  it('gives palette slots requirements first, then elements', () => {
    const db = builder();
    db.addElement('e', def('element:e'));
    db.addRequirement('r', 'Requirement', def('requirement:r'));
    db.addRequirement('s', 'Requirement', def('requirement:s'));
    const m = built(db);
    expect(m.requirements.map((r) => r.slot)).toEqual([0, 1]);
    expect(m.elements.map((e) => e.slot)).toEqual([2]);
  });

  it('resolves relation ends to the requirement of a shared name, and keeps unknown ends', () => {
    const db = builder();
    db.addElement('a', def('element:a'));
    db.addRequirement('a', 'Requirement', def('requirement:a'));
    db.addRelationship('traces', 'a', 'x', at('relation:a->x'));
    const { model, warnings } = db.model(undefined, () => 1);
    expect(model.relations[0]).toMatchObject({ from: 'requirement:a', to: undefined });
    expect(warnings.map((w) => w.code)).toEqual([
      'REQUIREMENT_SHARED_NAME',
      'REQUIREMENT_UNKNOWN_NODE',
    ]);
  });
});
