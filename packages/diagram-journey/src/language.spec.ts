import { describe, expect, it } from 'vitest';
import type { ProbeResult } from '@mermaid-js/core/parser-kit';
import { journeyLanguage as facet, JourneyTokenKind as T, parseJourney } from './language.ts';

const parse = (text: string, probe?: number) =>
  facet.parse(text, probe === undefined ? { keepTokens: true } : { keepTokens: true, probe });

/** Completion labels at the `|` of `marked`. */
function complete(marked: string): string[] {
  const at = marked.indexOf('|');
  const text = marked.slice(0, at) + marked.slice(at + 1);
  const result = parse(text, at);
  return facet.completions(result.probe as ProbeResult, { text, result }).map((i) => i.label);
}

const TEXT = `journey
  title A day
  Wake up: 3: Me
  section Go to work
    Make tea : 5: Me, Cat
    Do work: 1: Cat
  section Go to work
    Do work: 2: Me
`;

describe('journey facet parse', () => {
  it('adds section and task symbols beside the actors, blanks off, first one defining', () => {
    const { symbols } = parse(TEXT);
    const of = (kind: string) =>
      symbols
        .filter((s) => s.kind === kind)
        .map((s) => [s.name, s.role, TEXT.slice(s.range.start, s.range.end)]);
    expect(of('section')).toEqual([
      ['Go to work', 'def', 'Go to work'],
      ['Go to work', 'ref', 'Go to work'],
    ]);
    expect(of('task')).toEqual([
      ['Wake up', 'def', 'Wake up'],
      ['Make tea', 'def', 'Make tea'],
      ['Do work', 'def', 'Do work'],
      ['Do work', 'ref', 'Do work'],
    ]);
    expect(of('actor').map(([n]) => n)).toEqual(['Me', 'Me', 'Cat', 'Cat', 'Me']);
  });

  it('makes each section a block of the statements up to the next section line', () => {
    const { statements } = parse(TEXT);
    const show = (s: (typeof statements)[number]): unknown => [
      s.kind,
      TEXT.slice(s.range.start, s.range.end).split('\n').length,
      ...(s.children ?? []).map((c) => c.kind),
    ];
    expect(statements.map(show)).toEqual([
      ['header', 1],
      ['title', 1],
      ['task', 1],
      ['section', 3, 'task', 'task'],
      ['section', 2, 'task'],
    ]);
  });

  it('leaves the plain parse as it was (T2): actors only, flat statements', () => {
    const plain = parseJourney(TEXT);
    expect(new Set(plain.symbols.map((s) => s.kind))).toEqual(new Set(['actor']));
    expect(plain.statements.some((s) => s.children)).toBe(false);
  });

  it('gives a name written otherwise than read the statement range (the service drops it)', () => {
    const text = 'journey\nsection #quot;S#quot;\n';
    const [s] = parse(text).symbols;
    expect(s?.name).toBe('&quot;S&quot;');
    expect(text.slice(s!.range.start, s!.range.end)).toBe('section #quot;S#quot;');
  });
});

describe('journey probe', () => {
  it('records the statement kinds at a line start and the header at the start', () => {
    expect(parse('journey\n  \n', 10).probe?.expected).toEqual(
      expect.arrayContaining([T.Title, T.AccTitle, T.AccDescr, T.Section, T.TaskName])
    );
    expect(parse('jour', 4).probe?.expected).toEqual([T.Journey]);
  });

  it('names the lexer mode, and where the offset is outside code', () => {
    expect(parse('journey\naccTitle: xy\n', 19).probe?.mode).toBe('acc_title');
    expect(parse('journey\n%% c\nT: 1', 11).probe?.mode).toBe('comment');
    expect(parse('---\ntitle: x\n---\njourney\n', 6).probe?.mode).toBe('frontMatter');
  });
});

describe('journey completions', () => {
  it('offers keywords at a statement start, `journey` at the start', () => {
    expect(complete('journey\n  |')).toEqual(['section', 'title', 'accTitle', 'accDescr']);
    expect(complete('journey\n  s|')).toEqual(['section']);
    expect(complete('j|')).toEqual(['journey']);
  });

  it('offers the known actors after the second `:`, less those the task names', () => {
    const doc = 'journey\n  A: 5: Me, Cat\n  B: 3: Bob\n';
    expect(complete(`${doc}  C: 1: |`)).toEqual(['Bob', 'Cat', 'Me']);
    expect(complete(`${doc}  C: 1: Me, |`)).toEqual(['Bob', 'Cat']);
    expect(complete(`${doc}  C: 1: B|`)).toEqual(['Bob']);
    expect(complete(`${doc}  C: |1`)).toEqual([]);
    expect(complete(`${doc}  C: 1: Me: |`)).toEqual([]);
  });

  it('offers nothing in a name, title or accessibility value', () => {
    expect(complete('journey\n  title s|')).toEqual([]);
    expect(complete('journey\n  section s|')).toEqual([]);
    expect(complete('journey\n  Make s|: 5')).toEqual([]);
    expect(complete('journey\n  accTitle: s|')).toEqual([]);
  });
});

describe('journey isValidId', () => {
  it.each([
    ['actor', 'Me', undefined],
    ['actor', 'Mr Smith', undefined],
    ['actor', 'Me, Cat', "'Me, Cat' is not an actor name."],
    ['actor', 'a:b', "'a:b' is not an actor name."],
    ['actor', 'a#b', "'a#b' is not an actor name."],
    ['task', 'Make, tea', undefined],
    ['task', 'title x', "'title x' is not a task name."],
    ['task', 'accTitle', "'accTitle' is not a task name."],
    ['task', '%x', "'%x' is not a task name."],
    ['section', 'Go home', undefined],
    ['section', 'a:b', "'a:b' is not a section name."],
    ['section', ' x', 'A name cannot start or end with a space.'],
    ['section', '', 'A name cannot be empty.'],
    ['node', 'A', "'node' is not a user journey symbol kind."],
  ])('%s %j', (kind, name, reason) => {
    expect(facet.isValidId(name, kind)).toBe(reason);
  });

  it('reads an actor when no kind is given', () => {
    expect(facet.isValidId('a,b')).toBe("'a,b' is not an actor name.");
  });
});
