/**
 * Hand-built `TimelineModel` fixtures for the layout specs, written as v12's DB holds the
 * timeline source above each one (raw text: a period keeps the space before its `:`, an event
 * the space before the next `:`). They stand in for parser-produced fixtures until #336 lands;
 * T2 runs `timelineLayoutViolations` on its own models.
 *
 * Corpus files are `e2e/diagrams/timeline/<dir>/<n>-….mmd`.
 */
// cspell:words Resposibility
import type { TimelineDirection, TimelineModel, TimelinePeriod } from '../model.ts';

/** A `section` statement (its name as written), or a period and its events (as written). */
export type Item = string | readonly [period: string, ...events: string[]];

export interface FixtureOptions {
  readonly direction?: TimelineDirection;
  readonly title?: string;
}

/** The model v12's grammar builds from `items` in order, with spec #291's AST ids. */
export function timeline(items: readonly Item[], options: FixtureOptions = {}): TimelineModel {
  const sections: { ast: string; text: string }[] = [];
  const periods: TimelinePeriod[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      sections.push({ ast: `sec:${sections.length + 1}`, text: item });
      continue;
    }
    const [text, ...events] = item;
    const n = periods.length + 1;
    periods.push({
      ast: `per:${n}`,
      text,
      ...(sections.length > 0 ? { section: sections.length - 1 } : {}),
      events: events.map((e, k) => ({ ast: `ev:${n}.${k + 1}`, text: e })),
    });
  }
  return {
    direction: options.direction ?? 'LR',
    ...(options.title !== undefined ? { title: options.title } : {}),
    accTitle: '',
    accDescr: '',
    sections,
    periods,
    warnings: [],
  };
}

/** The same model drawn the other way. */
export const turned = (m: TimelineModel): TimelineModel => ({
  ...m,
  direction: m.direction === 'LR' ? 'TD' : 'LR',
});

/** pr-check/1: no sections; one period with two events. */
export const simple = timeline(
  [
    ['2002 ', 'LinkedIn'],
    ['2004 ', 'Facebook ', 'Google'],
    ['2005 ', 'YouTube'],
    ['2006 ', 'Twitter'],
  ],
  { title: 'History of Social Media Platform' }
);

/** pr-check/2: two sections, `<br>` in an event. */
export const sections = timeline(
  [
    '17th-20th century',
    ['Industry 1.0 ', 'Machinery, Water power, Steam <br>power'],
    ['Industry 2.0 ', 'Electricity, Internal combustion engine, Mass production'],
    ['Industry 3.0 ', 'Electronics, Computers, Automation'],
    '21st century',
    ['Industry 4.0 ', 'Internet, Robotics, Internet of Things'],
    ['Industry 5.0 ', 'Artificial intelligence, Big data,3D printing'],
  ],
  { title: 'Timeline of Industrial Revolution' }
);

/** pr-check/3: long events with `<br>`, stacked continuation lines. */
export const longEvents = timeline(
  [
    'Stone Age',
    ['7600 BC ', "Britain's oldest known house was built in Orkney, Scotland"],
    [
      '6000 BC ',
      'Sea levels rise and Britain becomes an island.<br> The people who live here are hunter-gatherers.',
    ],
    'Bronze Age',
    [
      '2300 BC ',
      'People arrive from Europe and settle in Britain. <br>They bring farming and metalworking.',
      'New styles of pottery and ways of burying the dead appear.',
    ],
    [
      '2200 BC ',
      'The last major building works are completed at Stonehenge.<br> People now bury their dead in stone circles.',
      'The first metal objects are made in Britain.Some other nice things happen. it is a good time to be alive.',
    ],
  ],
  { title: "England's History Timeline" }
);

/** pr-check/5–8: seven periods, no sections. */
export const seven = timeline(
  [
    ['2002 ', 'LinkedIn'],
    ['2004 ', 'Facebook ', 'Google'],
    ['2005 ', 'YouTube'],
    ['2006 ', 'Twitter'],
    ['2007 ', 'Tumblr'],
    ['2008 ', 'Instagram'],
    ['2010 ', 'Pinterest'],
  ],
  { title: 'History of Social Media Platform' }
);

/** nightly-check/11: one period with eleven stacked events. */
export const stacked = timeline(
  [
    'Pre-Development',
    ['Quality Management System ', 'Regulatory Compliance ', 'Risk Management'],
    'Development',
    ['Management Responsibility ', 'Planning Activities ', 'Human Resources'],
    ['Resource Management ', 'Management Reviews ', 'Infrastructure'],
    'Post-Development',
    ['Product Realization Activities ', 'Planning Activities ', 'Customer-related Processes'],
    [
      'Post-Production Activities ',
      'Feedback ',
      'Complaints ',
      'Adverse Events',
      'Research and Development ',
      'Purchasing Activities',
      'Production Activities ',
      'Installation Activities',
      'Servicing Activities ',
      'Post-Market Surveillance',
    ],
  ],
  { title: 'Medical Device Lifecycle' }
);

/** pr-check/12: event stacks of every height across three sections. */
export const columns = timeline(
  [
    'Planning',
    ['Quality Management System (4)', 'Regulatory Compliance (4.1.1)', 'Risk Management (4.1.2)'],
    ['Management Resposibility (5)', 'Planning Activities (5.4)', 'Management Reviews (5.6)'],
    ['Resource Management (6)', 'Human Resources (6.2)', 'Infrastructure (6.3)'],
    'Realization',
    [
      'Research and Development (7.3)',
      'RnD Planning (7.3.2)',
      'Inputs (7.3.3)',
      'Outputs (7.3.4)',
      'Review (7.3.5)',
      'Verification (7.3.6)',
      'Validation (7.3.7)',
    ],
    ['Purchasing (7.4)', 'Purchasing Process (7.4.1)', 'Purchasing Information (7.4.2)'],
    ['Production (7.5)', 'Production Activities (7.5.1)', 'Production Feedback (8.2.1)'],
    ['Installation (7.5.3)', 'Installation Activities (7.5.3)'],
    ['Servicing (7.5.4)', 'Servicing Activities (7.5.4)'],
    'Post-Production',
    [
      'Post-Market Activities (8)',
      'Feedback (8.2.1)',
      'Complaints (8.2.2)',
      'Adverse Events (8.2.3)',
    ],
  ],
  { title: 'Medical Device Lifecycle' }
);

/** nightly-check/13: TD, no sections. */
export const verticalSimple = { ...simple, direction: 'TD' as const };

/** pr-check/14: TD, two sections. */
export const verticalSections = { ...sections, direction: 'TD' as const };

/** nightly-check/space-exploration-*: three sections, two-event stacks. */
export const space = timeline(
  [
    'Early Era',
    ['1957 ', 'Sputnik 1 launched', 'First artificial satellite'],
    ['1961 ', 'Yuri Gagarin in space', 'First human in orbit'],
    'Moon Era',
    ['1969 ', 'Apollo 11 moon landing', "Neil Armstrong's first steps"],
    ['1972 ', 'Last Apollo mission'],
    'Modern Era',
    ['2012 ', 'Curiosity rover on Mars'],
    ['2020 ', 'SpaceX Crew Dragon', 'Commercial spaceflight'],
    ['2021 ', 'James Webb Space Telescope', 'Perseverance rover on Mars'],
  ],
  { title: 'Space Exploration Milestones' }
);

const LONG = Array.from({ length: 12 }, (_, i) => `word${i}`).join(' ');

/**
 * Not in the corpus (D252): a period over 150 px tall in LR, so v12 put its events on the
 * axis. Twelve words wrap to a line or two each at 150 px.
 */
export const tallPeriod = timeline(
  [
    [`A period with a very long name: ${LONG} ${LONG} `, 'its first event', 'its second event'],
    ['2002 ', 'LinkedIn'],
  ],
  { title: 'Tall period' }
);

/** Not in the corpus (D251): periods before the first section, a repeated name, an empty one. */
export const leading = timeline([
  ['1990 ', 'before any section'],
  ['1995 '],
  'Repeated',
  ['2000 ', 'one'],
  'Empty',
  'Repeated',
  ['2010 ', 'two', 'three'],
]);

/**
 * Not in the corpus: TD sections whose last row holds the tallest event stack, where v12's
 * section advance (`− 2 × TASK_VERTICAL_GAP`) put the next section 30 px over that row.
 */
export const verticalFullRows = timeline(
  [
    'First',
    ['2000 ', 'a', 'b', 'c', 'd'],
    'Second',
    ['2001 ', 'e'],
    ['2002 ', 'f', 'g', 'h', 'i'],
    'Third',
    ['2003 ', 'j'],
  ],
  { direction: 'TD' }
);

/** `timeline` and nothing else. */
export const empty = timeline([]);

/** Every fixture by name. */
export const FIXTURES: Readonly<Record<string, TimelineModel>> = {
  simple,
  sections,
  longEvents,
  seven,
  stacked,
  columns,
  verticalSimple,
  verticalSections,
  space,
  tallPeriod,
  leading,
  verticalFullRows,
  empty,
};
