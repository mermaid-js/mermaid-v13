import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EVENTMODELING_DUPLICATE_FRAME,
  EVENTMODELING_INVALID_SOURCE,
  EVENTMODELING_UNKNOWN_DATA,
  EVENTMODELING_UNKNOWN_FRAME,
  EVENTMODELING_UNKNOWN_SOURCE,
  eventModelStructure,
  parseEventModel,
} from '@mermaid-js/diagram-eventmodeling';
import type { EventModelFrameNode } from '@mermaid-js/diagram-eventmodeling';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { REPO_ROOT } from '../corpus.ts';

/**
 * The event modeling parser and model (#602) on the e2e fixtures (`pr-check/`, and the parser's
 * own in `nightly-check/parser-*.mmd`, all accepted by v12) and the `parser-*` cases of
 * `corpus/eventmodeling-cases.json` v12 rejects: the model in source order, D523 data text,
 * D524 values, the D218 title, AST ids (D528), D525's warnings, symbols, statement spans,
 * v12's duplicate-id error, and `eventModelStructure`'s lanes, boxes and relations (D522).
 * Accept/reject and model parity with v12 are `parity.spec.ts`'s.
 */
const parse = (src: string) => parseEventModel(src);
const fixture = (name: string) =>
  readFileSync(join(REPO_ROOT, `e2e/diagrams/eventmodeling/pr-check/${name}.mmd`), 'utf8');
const nightly = (name: string) =>
  readFileSync(join(REPO_ROOT, `e2e/diagrams/eventmodeling/nightly-check/${name}.mmd`), 'utf8');
const CASES = new Map(
  (
    JSON.parse(
      readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/eventmodeling-cases.json'), 'utf8')
    ) as { id: string; source: string }[]
  ).map((c) => [c.id, c.source])
);
const emCase = (id: string): string => {
  const found = CASES.get(`eventmodeling-cases/${id}`);
  if (found === undefined) throw new Error(`no event modeling case ${id}`);
  return found;
};
const codes = (src: string) => parse(src).diagnostics.map((d) => [d.severity, d.code]);
/** The source text of `range` in `src`. */
const at = (src: string, range: { start: number; end: number }) =>
  src.slice(range.start, range.end);

describe('event modeling parser on the fixtures', () => {
  it('reads the e2e fixtures with no diagnostics', () => {
    for (const name of [
      'state-change-pattern',
      'state-view-pattern',
      'translation-pattern',
      'with-data-block-reference',
      'with-multiple-source-relations',
      'with-qualified-names',
    ]) {
      expect(parse(fixture(name)).diagnostics, name).toEqual([]);
    }
  });

  it('keeps frames in source order with their parts', () => {
    const { model } = parse(fixture('with-data-block-reference'));
    expect(model.frames).toEqual([
      {
        id: '01',
        reset: false,
        kind: 'ui',
        keyword: 'ui',
        name: 'CartScreen',
        sources: [],
        astId: 'frame:01',
      },
      {
        id: '02',
        reset: false,
        kind: 'cmd',
        keyword: 'cmd',
        name: 'AddItem',
        sources: [],
        data: { text: 'productId: 7' },
        astId: 'frame:02',
      },
      {
        id: '03',
        reset: false,
        kind: 'evt',
        keyword: 'evt',
        name: 'ItemAdded',
        sources: [],
        dataRef: 'ItemAddedData',
        astId: 'frame:03',
      },
    ]);
    expect(model.dataBlocks).toEqual([
      {
        name: 'ItemAddedData',
        data: { text: 'productId: 7,\nquantity: 1' },
        astId: 'data:ItemAddedData',
      },
    ]);
  });

  it('maps the long keywords to the short kinds and reads reset frames', () => {
    const { model, diagnostics } = parse(nightly('parser-kinds-long'));
    // `pcr ->> processor`: v12's validator wanted a read model.
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        EVENTMODELING_INVALID_SOURCE,
        "A processor can only receive input from a read model, not from 'processor'.",
      ],
    ]);
    expect(model.frames.map((f) => [f.id, f.reset, f.kind, f.keyword])).toEqual([
      ['01', false, 'ui', 'ui'],
      ['02', false, 'cmd', 'command'],
      ['03', false, 'evt', 'event'],
      ['04', true, 'rmo', 'readmodel'],
      ['05', false, 'pcr', 'processor'],
      ['06', true, 'pcr', 'pcr'],
    ]);
  });

  it('shows data between its braces or quotes, dedented and trimmed (D523)', () => {
    const inline = parse(nightly('parser-inline-data')).model.frames.map((f) => f.data);
    expect(inline).toEqual([
      { text: 'a:1' },
      { text: 'a: 1, b: 2' },
      { text: 'some text' },
      { text: 'more text' },
      { text: '"k": true', type: 'json' },
      { text: 'a: { b: c }' },
    ]);
    const blocks = parse(nightly('parser-data-ref')).model.dataBlocks;
    expect(blocks.map((b) => [b.name, b.data, b.astId])).toEqual([
      ['Payload', { text: 'id: 7\n  nested: true' }, 'data:Payload'],
      ['Payload', { text: 'second: "ignored"', type: 'json' }, 'data:Payload@2'],
    ]);
  });

  it('reads notes, gwt specifications and entities, and draws them nowhere (D526)', () => {
    const { model } = parse(nightly('parser-notes-gwt-entity'));
    expect(model.entities.map((e) => [e.name, e.astId])).toEqual([
      ['CartUpdated', 'entity:CartUpdated'],
      ['Cart.Line', 'entity:Cart.Line'],
      ['CartUpdated', 'entity:CartUpdated@2'],
    ]);
    expect(model.notes).toEqual([
      { frame: '02', data: { text: '# head\na markdown note', type: 'md' }, astId: 'note:02' },
      { frame: '02', data: { text: 'second note' }, astId: 'note:02@2' },
      { frame: '09', data: { text: 'on no frame' }, astId: 'note:09' },
    ]);
    expect(model.gwts[0]).toEqual({
      frame: '01',
      given: [
        { kind: 'evt', keyword: 'evt', name: 'CartUpdated' },
        { kind: 'cmd', keyword: 'cmd', name: 'UpdateCart' },
      ],
      when: [{ kind: 'cmd', keyword: 'cmd', name: 'UpdateCart' }],
      then: [{ kind: 'evt', keyword: 'evt', name: 'CartUpdated' }],
      astId: 'gwt:01',
    });
    expect(model.gwts.map((g) => [g.frame, g.when.length, g.astId])).toEqual([
      ['01', 1, 'gwt:01'],
      ['02', 0, 'gwt:02'],
      ['07', 0, 'gwt:07'],
    ]);
  });

  it('strips the keywords from title and accessibility values, the last one winning (D524)', () => {
    const src = nightly('parser-title-acc');
    const { model, ast } = parse(src);
    expect(model.title).toBe('Last wins accDescr: ignored');
    expect(model.titleAstId).toBe('title@2');
    expect(model.accTitle).toBe('An accessible title');
    expect(model.accDescr).toBe('Last description');
    const texts = ast.children.filter((n) => n.type !== 'Frame' && n.type !== 'Header');
    expect(texts.map((n) => [n.id, at(src, n.range).split('\n', 1)[0]])).toEqual([
      ['title', 'title  First   title'],
      ['accTitle', 'accTitle:   An   accessible title'],
      ['accDescr', 'accDescr {'],
      ['title@2', 'title Last wins accDescr: ignored'],
      ['accDescr@2', 'accDescr: Last   description'],
    ]);
  });

  it('falls back to the front-matter title, and prefers the in-text one (D218)', () => {
    const fm = parse(nightly('parser-front-matter-title')).model;
    expect([fm.title, fm.titleAstId]).toEqual(['From front matter', undefined]);
    expect(parse(nightly('parser-kinds-long')).model.title).toBeUndefined();
  });

  it('reads a model on one line, and through every kind of comment', () => {
    const one = parse(nightly('parser-one-line'));
    expect(one.diagnostics).toEqual([]);
    expect(one.ast.children.map((n) => n.id)).toEqual([
      'eventmodeling',
      'frame:01',
      'frame:02',
      'frame:03',
      'data:D',
      'note:03',
      'gwt:03',
      'entity:C',
    ]);
    const commented = parse(nightly('parser-comments'));
    expect(commented.diagnostics).toEqual([]);
    expect(commented.model.frames.map((f) => [f.id, f.sources])).toEqual([
      ['01', []],
      ['02', ['01']],
      ['03', []],
    ]);
  });
});

describe('event modeling AST, symbols and spans (D528)', () => {
  it('gives frames and their sources ids, with ranges over their text', () => {
    const src = nightly('parser-sources');
    const { ast } = parse(src);
    const frames = ast.children.filter((n): n is EventModelFrameNode => n.type === 'Frame');
    expect(frames.map((f) => [f.id, f.children.map((s) => s.id)])).toEqual([
      ['frame:01', ['relation:01->01']],
      ['frame:02', ['relation:05->02', 'relation:01->02']],
      ['frame:03', ['relation:02->03', 'relation:02->03@2']],
      ['frame:04', ['relation:03->04', 'relation:01->04', 'relation:09->04']],
      ['frame:05', ['relation:04->05']],
    ]);
    expect(at(src, frames[1]?.range ?? { start: 0, end: 0 })).toBe(
      'tf 02 cmd Submit ->> 05 ->> 01'
    );
    expect(at(src, frames[1]?.children[0]?.range ?? { start: 0, end: 0 })).toBe('->> 05');
  });

  it('defines frame ids, data and entity names at their first declaration', () => {
    const src = nightly('parser-notes-gwt-entity');
    const { symbols } = parse(src);
    const rows = symbols.map((s) => [s.kind, s.name, s.role, at(src, s.range)]);
    expect(rows.filter(([, , role]) => role === 'def')).toEqual([
      ['frame', '01', 'def', '01'],
      ['frame', '02', 'def', '02'],
      ['entity', 'CartUpdated', 'def', 'CartUpdated'],
      ['entity', 'Cart.Line', 'def', 'Cart.Line'],
    ]);
    // A repeated entity is a reference; a note or gwt on frame 09 or 07 and the step `Missing`
    // name nothing declared, so they are no symbol.
    expect(rows.filter(([kind, name]) => kind === 'entity' && name === 'CartUpdated')).toHaveLength(
      7
    );
    expect(rows.some(([, name]) => name === '09' || name === '07' || name === 'Missing')).toBe(
      false
    );
    const data = parse(nightly('parser-data-ref')).symbols.filter((s) => s.kind === 'data');
    expect(data.map((s) => [s.name, s.role])).toEqual([
      ['Payload', 'ref'],
      ['Payload', 'ref'],
      ['Payload', 'def'],
      ['Payload', 'ref'],
    ]);
  });

  it('records one span per statement', () => {
    const { statements } = parse(nightly('parser-one-line'));
    expect(statements.map((s) => s.kind)).toEqual([
      'header',
      'frame',
      'frame',
      'frame',
      'data',
      'note',
      'gwt',
      'entity',
    ]);
  });
});

describe('event modeling diagnostics', () => {
  it("rejects a repeated frame id with v12's message, lines counted from the source's start", () => {
    for (const id of [
      'parser-duplicate-id',
      'parser-duplicate-reset',
      'parser-duplicate-after-comment',
    ]) {
      const errors = parse(emCase(id)).diagnostics.filter((d) => d.severity === 'error');
      expect(
        errors.map((d) => [d.code, d.message]),
        id
      ).toEqual([
        [EVENTMODELING_DUPLICATE_FRAME, 'Duplicate event modeling frame ID "01" on line 4'],
      ]);
    }
    const src = emCase('parser-duplicate-after-front-matter');
    const [error] = parse(src).diagnostics;
    expect(error?.message).toBe('Duplicate event modeling frame ID "01" on line 6');
    expect(new LineIndex(src).position(error?.range.start ?? 0).line + 1).toBe(6);
    expect(at(src, error?.range ?? { start: 0, end: 0 })).toBe('01');
    // Each repeat is its own error.
    expect(codes(emCase('parser-duplicate-three'))).toEqual([
      ['error', EVENTMODELING_DUPLICATE_FRAME],
      ['error', EVENTMODELING_DUPLICATE_FRAME],
    ]);
  });

  it('warns once per kind about what v12 dropped silently, every case related (D525)', () => {
    const src = nightly('parser-sources');
    const warnings = parse(src).diagnostics;
    expect(warnings.every((d) => d.severity === 'warning')).toBe(true);
    const unknown = warnings.find((d) => d.code === EVENTMODELING_UNKNOWN_SOURCE);
    expect(
      [unknown?.range, ...(unknown?.related ?? []).map((r) => r.range)].map((r) =>
        at(src, r ?? { start: 0, end: 0 })
      )
    ).toEqual(['05', '09']);
    expect(unknown?.message).toMatch(/comes after it/);
    expect(unknown?.related?.[0]?.message).toMatch(/which no frame has/);

    const invalid = parse(nightly('parser-invalid-sources')).diagnostics;
    expect(invalid.map((d) => d.code)).toEqual([EVENTMODELING_INVALID_SOURCE]);
    expect([invalid[0]?.message, ...(invalid[0]?.related ?? []).map((r) => r.message)]).toEqual([
      "A event can only receive input from a command, not from 'evt'.",
      "A command can only receive input from a ui or processor, not from 'rmo'.",
      "A processor can only receive input from a read model, not from 'evt'.",
      "A processor can only receive input from a read model, not from 'cmd'.",
      "A ui can only receive input from a read model, not from 'cmd'.",
      "A read model can only receive input from a event, not from 'pcr'.",
    ]);

    expect(codes(nightly('parser-data-ref'))).toEqual([['warning', EVENTMODELING_UNKNOWN_DATA]]);
    const frames = parse(nightly('parser-notes-gwt-entity')).diagnostics;
    expect(frames.map((d) => [d.code, d.related?.length])).toEqual([
      [EVENTMODELING_UNKNOWN_FRAME, 1],
    ]);
    expect(parse(nightly('parser-notes-gwt-entity')).model.warnings).toEqual(frames);
  });

  it('explains keyword names, title placement and part order without naming tokens', () => {
    const message = (id: string) => parse(emCase(id)).diagnostics[0]?.message ?? '';
    expect(message('keyword-name-text')).toMatch(/`text` is a keyword and cannot be a name/);
    expect(message('title-own-line')).toMatch(/`title` is read only after another statement/);
    expect(message('parser-ref-before-arrow')).toMatch(/`->>` sources, then `\[\[data\]\]`/);
    expect(message('parser-second-header')).toMatch(/one `eventmodeling`, at its start/);
    expect(message('frame-id-four-digits')).toMatch(/one to three digits/);
    expect(message('parser-typed-block-on-frame')).toMatch(/inline data stays on one line/);
  });

  it('takes the preprocess result from the caller', () => {
    const src = nightly('parser-front-matter-title');
    const pre = preprocess(src);
    expect(parseEventModel(src, { preprocessed: pre }).model.title).toBe('From front matter');
  });
});

describe('event modeling lanes, boxes and relations (eventModelStructure)', () => {
  it("keeps v12's bands and namespace lanes, one per namespace (D522)", () => {
    const { lanes, boxes } = eventModelStructure(parse(nightly('parser-namespace-repeated')).model);
    expect(lanes.map((l) => [l.index, l.label])).toEqual([
      [1, 'UI/A: Shop'],
      [101, 'C/RM: Inv'],
      [102, 'C/RM: Pricing'],
      [201, 'Stream: Inv'],
    ]);
    expect(boxes.map((b) => [b.name, lanes[b.lane]?.index])).toEqual([
      ['AddItem', 101],
      ['ItemAdded', 201],
      ['RemoveItem', 101],
      ['ItemRemoved', 201],
      ['Cart', 1],
      ['Robot', 1],
      ['Prices', 102],
    ]);
    // A name of three parts or more keeps the default lane and its whole name.
    const deep = eventModelStructure(parse(nightly('parser-qualified-deep')).model);
    expect(deep.boxes.map((b) => [b.name, deep.lanes[b.lane]?.label])).toEqual([
      ['a.b.c', 'UI/Automation'],
      ['Do', 'C/RM: Ns'],
      ['x.y.z.w', 'Events'],
    ]);
  });

  it("draws v12's relations: sources once each in frame order, else inferred", () => {
    const model = parse(nightly('parser-sources')).model;
    const { relations } = eventModelStructure(model);
    const id = (k: number) => model.frames[k]?.id;
    expect(relations.map((r) => [id(r.source), id(r.target), r.inferred])).toEqual([
      ['01', '01', false],
      ['01', '02', false],
      ['02', '03', false],
      ['01', '04', false],
      ['03', '04', false],
      ['04', '05', false],
    ]);
    const reset = parse(nightly('parser-reset-inferred')).model;
    const r = eventModelStructure(reset).relations;
    expect(
      r.map((x) => [reset.frames[x.source]?.id, reset.frames[x.target]?.id, x.inferred, x.astId])
    ).toEqual([
      ['01', '02', true, undefined],
      ['02', '03', true, undefined],
      ['03', '04', false, 'relation:03->04'],
      ['05', '06', true, undefined],
    ]);
  });

  it('shows a defined reference before the inline data', () => {
    const { boxes } = eventModelStructure(parse(nightly('parser-data-ref')).model);
    expect(boxes.map((b) => b.data)).toEqual([
      'id: 7\n  nested: true',
      'kept: 2',
      'id: 7\n  nested: true',
    ]);
  });
});
