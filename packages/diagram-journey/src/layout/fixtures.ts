// cspell:words Darkoob darkoob userf usemaxwidth Shahir Exjjjnjjjj Giancarlo
/**
 * Hand-built `JourneyModel` fixtures for the layout specs, written as v12 parses the corpus
 * source named on each (`e2e/diagrams/journey/**`), plus edge cases. They stand in for
 * parser-produced fixtures until T2 #302 lands: `FIXTURES` is the one place that builds them,
 * so T2 swaps its entries for `parseJourney` output on the `.mmd` files.
 */
import type { JourneyDiagramConfig } from '@mermaid-js/core/config';
import type { JourneyModel, JourneySection, JourneyTask } from '../model.ts';

interface SectionLine {
  readonly kind: 'section';
  readonly name: string;
}
interface TaskLine {
  readonly kind: 'task';
  readonly name: string;
  readonly score: number;
  readonly people: readonly string[];
}
type Line = SectionLine | TaskLine;

/** `section <name>`: the name as v12's `substr(8)` keeps it. */
export const section = (name: string): Line => ({ kind: 'section', name });

/** `<name>: <score>: <people>`: the score as `Number()` gives it, people trimmed. */
export const task = (name: string, score: number, ...people: string[]): Line => ({
  kind: 'task',
  name,
  score,
  people,
});

/** The model v12's DB holds after these lines: AST ids, sections, actors sorted by code unit. */
export function journey(title: string | undefined, ...lines: Line[]): JourneyModel {
  const sections: JourneySection[] = [];
  const tasks: JourneyTask[] = [];
  const seen = new Map<string, number>();
  for (const line of lines) {
    if (line.kind === 'section') {
      const n = (seen.get(line.name) ?? 0) + 1;
      seen.set(line.name, n);
      sections.push({ ast: n === 1 ? `s:${line.name}` : `s:${line.name}@${n}`, name: line.name });
    } else {
      const at = sections.length - 1;
      tasks.push({
        ast: `t:${tasks.length + 1}`,
        name: line.name,
        score: line.score,
        people: line.people,
        section: at < 0 ? '' : (sections[at] as JourneySection).name,
        ...(at < 0 ? {} : { sectionIndex: at }),
      });
    }
  }
  const actors = [...new Set(tasks.flatMap((t) => t.people))].sort();
  return {
    sections,
    tasks,
    actors,
    ...(title === undefined ? {} : { title }),
    accTitle: '',
    accDescr: '',
    warnings: [],
  };
}

export interface Fixture {
  readonly model: JourneyModel;
  /** The fixture's `journey` front-matter config. */
  readonly config?: Readonly<JourneyDiagramConfig>;
}

// default-theme.mmd, dark-theme.mmd, forest-theme.mmd, neutral-theme.mmd (the four are one
// model); should-render-a-user-journey-chart.mmd ends with `Sit down: 3`.
const workingDay = (sitDown: number): JourneyModel =>
  journey(
    'My working day',
    section('Go to work'),
    task('Make tea', 5, 'Me'),
    task('Go upstairs', 3, 'Me'),
    task('Do work', 1, 'Me', 'Cat'),
    section('Go home'),
    task('Go downstairs', 5, 'Me'),
    task('Sit down', sitDown, 'Me')
  );

// redux-theme.mmd and the other three redux themes.
const eightSections = journey(
  'Task and section fills',
  section('Browse'),
  task('Land on site', 5, 'Visitor'),
  task('Search', 3, 'Visitor'),
  section('Cart'),
  task('Add item', 4, 'Visitor'),
  task('View cart', 3, 'Visitor'),
  section('Pay'),
  task('Enter card', 2, 'Visitor'),
  task('Confirm', 5, 'Visitor'),
  section('Fulfil'),
  task('Pack', 4, 'Warehouse'),
  task('Ship', 3, 'Warehouse'),
  section('Deliver'),
  task('Handover', 5, 'Courier'),
  section('Support'),
  task('Contact', 2, 'Visitor'),
  section('Return'),
  task('Request', 1, 'Visitor'),
  section('Close'),
  task('Archive', 4, 'Visitor')
);

const LONG_LABEL =
  'Darkoob userf deliberately increasing the size of this label to check if distance between legend and diagram is  maintained';

export const FIXTURES: Readonly<Record<string, Fixture>> = {
  'working-day': { model: workingDay(5) },
  'should-render-a-user-journey-chart': { model: workingDay(3) },
  // usemaxwidth-true.mmd and should-render-…-when-usemaxwidth-is-false.mmd.
  'e-commerce': {
    model: journey(
      'E-Commerce',
      section('Order from website'),
      task('Add to cart', 5, 'Me'),
      section('Checkout from website'),
      task('Add payment details', 5, 'Me')
    ),
  },
  // simple-test.mmd: a title and one empty section.
  'simple-test': {
    model: journey(
      'Adding journey diagram functionality to mermaid',
      section('Order from website')
    ),
  },
  'eight-sections': { model: eightSections },
  // title-styling.mmd: `size: 2rem` is a task with score NaN.
  'title-styling': {
    model: journey(
      'User Journey Example',
      section('Onboarding'),
      task('Sign Up', 5, 'John', 'Shahir'),
      task('Complete Profile', 4, 'John'),
      section('Engagement'),
      task('Browse Features', 3, 'John'),
      task('Use Core Functionality', 4, 'John'),
      section('Retention'),
      task('Revisit Application', 5, 'John'),
      task('Invite Friends', 3, 'John'),
      task('size', NaN)
    ),
    config: { titleColor: '#2900A5', titleFontFamily: 'Times New Roman', titleFontSize: '5rem' },
  },
  // left-margin-150px.mmd: `Sign Up: 5:` names the actor ''.
  'left-margin-150px': {
    model: journey(
      'User Journey Example',
      section('Onboarding'),
      task('Sign Up', 5, ''),
      task('Browse Features', 3, ''),
      task('Use Core Functionality', 4, ''),
      section('Engagement'),
      task('Browse Features', 3),
      task('Use Core Functionality', 4)
    ),
    config: { maxLabelWidth: 320 },
  },
  // legend-diagram-spacing-long-labels.mmd: `Darkoob` comes back after another section.
  'legend-long-labels': {
    model: journey(
      ' Web hook life cycle',
      section('Darkoob'),
      task('Make preBuilt', 5, 'Darkoob user'),
      task('register slug ', 5, LONG_LABEL),
      task('Map slug to a Prebuilt Job', 5, 'Darkoob user'),
      section('External Service'),
      task('set Darkoob slug as hook for an Event ', 5, 'admin Exjjjnjjjj qwerty'),
      task('listen to the events ', 5, 'External Service'),
      task('call darkoob endpoint ', 5, 'External Service'),
      section('Darkoob'),
      task('check for inputs ', 5, 'DarkoobAPI'),
      task('run the prebuilt job ', 5, 'DarkoobAPI')
    ),
  },
  'single-word-hyphenation': {
    model: journey(
      'Long Word Test',
      section('Test'),
      task('VeryLongWord', 5, 'Supercalifragilisticexpialidocious')
    ),
    config: { maxLabelWidth: 100 },
  },
  'whitespace-wrapping-no-hyphens': {
    model: journey(
      'Whitespace Test',
      section('Test'),
      task(
        'TextWithSpaces',
        5,
        'Gustavo Fring is played by Giancarlo Esposito and is a character in Breaking Bad.'
      )
    ),
    config: { maxLabelWidth: 200 },
  },
  'wrap-long-labels-multiline-margins': {
    model: journey(
      'User Journey Example',
      section('Onboarding'),
      task(
        'Sign Up',
        5,
        'This is a long label that will be split into multiple lines to test the wrapping functionality'
      ),
      task(
        'Browse Features',
        3,
        'This is another long label that will be split into multiple lines to test the wrapping functionality'
      ),
      task(
        'Use Core Functionality',
        4,
        'This is yet another long label that will be split into multiple lines to test the wrapping functionality'
      ),
      section('Engagement'),
      task('Browse Features', 3),
      task('Use Core Functionality', 4)
    ),
    config: { maxLabelWidth: 320 },
  },
  // Edge cases no corpus file has.
  'odd-scores': {
    model: journey(
      undefined,
      section('Scores'),
      task('Not a number', NaN, 'A'),
      task('Zero', 0, 'A'),
      task('Seven', 7, 'A'),
      task('Negative', -2, 'B'),
      task('Half', 2.5, 'B')
    ),
  },
  'before-first-section': {
    model: journey(
      undefined,
      task('Early', 4, 'A', '', 'B'),
      section('Later'),
      section('Later'),
      task('In a repeated section', 2, 'A', 'A')
    ),
  },
  'nine-sections': {
    model: journey(
      'Nine',
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].flatMap((s) => [
        section(s),
        task(`task ${s}`, 3, 'X'),
      ])
    ),
  },
  'line-breaks': {
    model: journey(
      'One<br>two',
      section('First<br/>line'),
      task('A task name long enough to wrap inside its box twice', 4, 'Actor<br>name')
    ),
  },
  empty: { model: journey(undefined) },
  'blank-names': {
    model: journey('   ', section('   '), task('  ', 3, ''), task('Named', 3, ' x '.trim())),
  },
};
