// cspell:words Darkoob darkoob userf usemaxwidth Shahir Exjjjnjjjj Giancarlo Supercalifragilisticexpialidocious
/**
 * `JourneyModel` fixtures for the layout and render specs: every journey corpus file
 * (`e2e/diagrams/journey/**`) parsed by the v13 parser (T2 #302), with its front-matter
 * `journey` config, plus hand-built edge cases the corpus lacks. The corpus texts are copies of
 * the files (a diagram package reads no files); conformance's
 * `src/journey/layout-corpus.spec.ts` runs the same invariants on the files themselves.
 */
import type { JourneyDiagramConfig } from '@mermaid-js/core/config';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { JourneyModel, JourneySection, JourneyTask } from '../model.ts';
import { parseJourney } from '../parser/index.ts';

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

/**
 * Every journey corpus file: name → [path under `e2e/diagrams/journey/`, text]. Names are the
 * file names, but for the three the layout and render specs name by their model.
 */
const CORPUS: Readonly<Record<string, readonly [path: string, text: string]>> = {
  'dark-theme': [
    'pr-check/dark-theme.mmd',
    `---
description: >-
  Two-section user-journey chart ("Go to work" / "Go home") with a title and an
  accTitle/accDescr pair, rendered under the "dark" theme via an in-body
  %%{init}%% directive.
---
%%{init: { 'logLevel': 0, 'theme': 'dark'} }%%
journey
  accTitle: This is a title
  accDescr: This is a description

  title My working day
  section Go to work
    Make tea: 5: Me
    Go upstairs: 3: Me
    Do work: 1: Me, Cat
  section Go home
    Go downstairs: 5: Me
    Sit down: 5: Me
`,
  ],
  'default-theme': [
    'pr-check/default-theme.mmd',
    `---
description: >-
  Two-section user-journey chart ("Go to work" / "Go home") with a title and an
  accTitle/accDescr pair, rendered under the "default" theme via an in-body
  %%{init}%% directive.
---
%%{init: { 'logLevel': 0, 'theme': 'default'} }%%
journey
  accTitle: This is a title
  accDescr: This is a description

  title My working day
  section Go to work
    Make tea: 5: Me
    Go upstairs: 3: Me
    Do work: 1: Me, Cat
  section Go home
    Go downstairs: 5: Me
    Sit down: 5: Me
`,
  ],
  'forest-theme': [
    'pr-check/forest-theme.mmd',
    `---
description: >-
  Two-section user-journey chart ("Go to work" / "Go home") with a title and an
  accTitle/accDescr pair, rendered under the "forest" theme via an in-body
  %%{init}%% directive.
---
%%{init: { 'logLevel': 0, 'theme': 'forest'} }%%
journey
  accTitle: This is a title
  accDescr: This is a description

  title My working day
  section Go to work
    Make tea: 5: Me
    Go upstairs: 3: Me
    Do work: 1: Me, Cat
  section Go home
    Go downstairs: 5: Me
    Sit down: 5: Me
`,
  ],
  'left-margin-150px': [
    'nightly-check/left-margin-150px.mmd',
    `---
description: >-
  A two-section user journey (Onboarding, Engagement) with short task
  labels, rendered with journey.maxLabelWidth set to 320 — checks that the
  diagram content starts with a 150px left margin to make room for the
  legend.
config:
  journey:
    maxLabelWidth: 320
    useMaxWidth: true
---
journey
  title User Journey Example
  section Onboarding
      Sign Up: 5:
      Browse Features: 3:
      Use Core Functionality: 4:
  section Engagement
      Browse Features: 3
      Use Core Functionality: 4
`,
  ],
  'legend-long-labels': [
    'nightly-check/legend-diagram-spacing-long-labels.mmd',
    `---
description: >-
  A "Web hook life cycle" journey with three sections and a deliberately
  long legend label ("Darkoob userf deliberately increasing the size of
  this label...") — checks that the diagram content is pushed right far
  enough to maintain spacing from a wide legend.
config:
  journey:
    useMaxWidth: true
---
journey
title  Web hook life cycle
section Darkoob
  Make preBuilt:5: Darkoob user
  register slug : 5: Darkoob userf deliberately increasing the size of this label to check if distance between legend and diagram is  maintained
  Map slug to a Prebuilt Job:5: Darkoob user
section External Service
  set Darkoob slug as hook for an Event : 5 : admin Exjjjnjjjj qwerty
  listen to the events : 5 :  External Service
  call darkoob endpoint : 5 : External Service
section Darkoob
  check for inputs : 5 : DarkoobAPI
  run the prebuilt job : 5 : DarkoobAPI
`,
  ],
  'neutral-theme': [
    'pr-check/neutral-theme.mmd',
    `---
description: >-
  Two-section user-journey chart ("Go to work" / "Go home") with a title and an
  accTitle/accDescr pair, rendered under the "neutral" theme via an in-body
  %%{init}%% directive.
---
%%{init: { 'logLevel': 0, 'theme': 'neutral'} }%%
journey
  accTitle: This is a title
  accDescr: This is a description

  title My working day
  section Go to work
    Make tea: 5: Me
    Go upstairs: 3: Me
    Do work: 1: Me, Cat
  section Go home
    Go downstairs: 5: Me
    Sit down: 5: Me
`,
  ],
  'redux-color-theme': [
    'pr-check/redux-color-theme.mmd',
    `---
description: >-
  Eight-section user-journey chart under the "redux-color" redux colour theme,
  so all eight of the journey's fillType0..7 task-fill colours are exercised
  rather than just the first few.
config:
  theme: redux-color
---
journey
  title Task and section fills
  section Browse
    Land on site: 5: Visitor
    Search: 3: Visitor
  section Cart
    Add item: 4: Visitor
    View cart: 3: Visitor
  section Pay
    Enter card: 2: Visitor
    Confirm: 5: Visitor
  section Fulfil
    Pack: 4: Warehouse
    Ship: 3: Warehouse
  section Deliver
    Handover: 5: Courier
  section Support
    Contact: 2: Visitor
  section Return
    Request: 1: Visitor
  section Close
    Archive: 4: Visitor
`,
  ],
  'redux-dark-color-theme': [
    'pr-check/redux-dark-color-theme.mmd',
    `---
description: >-
  Eight-section user-journey chart under the "redux-dark-color" redux colour
  theme, so all eight of the journey's fillType0..7 task-fill colours are
  exercised rather than just the first few.
config:
  theme: redux-dark-color
---
journey
  title Task and section fills
  section Browse
    Land on site: 5: Visitor
    Search: 3: Visitor
  section Cart
    Add item: 4: Visitor
    View cart: 3: Visitor
  section Pay
    Enter card: 2: Visitor
    Confirm: 5: Visitor
  section Fulfil
    Pack: 4: Warehouse
    Ship: 3: Warehouse
  section Deliver
    Handover: 5: Courier
  section Support
    Contact: 2: Visitor
  section Return
    Request: 1: Visitor
  section Close
    Archive: 4: Visitor
`,
  ],
  'redux-dark-theme': [
    'pr-check/redux-dark-theme.mmd',
    `---
description: >-
  Eight-section user-journey chart under the "redux-dark" redux colour theme, so
  all eight of the journey's fillType0..7 task-fill colours are exercised rather
  than just the first few.
config:
  theme: redux-dark
---
journey
  title Task and section fills
  section Browse
    Land on site: 5: Visitor
    Search: 3: Visitor
  section Cart
    Add item: 4: Visitor
    View cart: 3: Visitor
  section Pay
    Enter card: 2: Visitor
    Confirm: 5: Visitor
  section Fulfil
    Pack: 4: Warehouse
    Ship: 3: Warehouse
  section Deliver
    Handover: 5: Courier
  section Support
    Contact: 2: Visitor
  section Return
    Request: 1: Visitor
  section Close
    Archive: 4: Visitor
`,
  ],
  'eight-sections': [
    'pr-check/redux-theme.mmd',
    `---
description: >-
  Eight-section user-journey chart under the "redux" redux colour theme, so all
  eight of the journey's fillType0..7 task-fill colours are exercised rather
  than just the first few.
config:
  theme: redux
---
journey
  title Task and section fills
  section Browse
    Land on site: 5: Visitor
    Search: 3: Visitor
  section Cart
    Add item: 4: Visitor
    View cart: 3: Visitor
  section Pay
    Enter card: 2: Visitor
    Confirm: 5: Visitor
  section Fulfil
    Pack: 4: Warehouse
    Ship: 3: Warehouse
  section Deliver
    Handover: 5: Courier
  section Support
    Contact: 2: Visitor
  section Return
    Request: 1: Visitor
  section Close
    Archive: 4: Visitor
`,
  ],
  'should-render-a-user-journey-chart': [
    'pr-check/should-render-a-user-journey-chart.mmd',
    `---
description: >-
  Standard user-journey diagram with two sections ("Go to work", "Go home"),
  each containing multiple scored tasks, including one task shared by two
  actors ("Me, Cat").
---
journey
  title My working day
  section Go to work
  Make tea: 5: Me
  Go upstairs: 3: Me
  Do work: 1: Me, Cat
  section Go home
  Go downstairs: 5: Me
  Sit down: 3: Me
`,
  ],
  'should-render-a-user-journey-diagram-when-usemaxwidth-is-false': [
    'pr-check/should-render-a-user-journey-diagram-when-usemaxwidth-is-false.mmd',
    `---
description: >-
  User-journey diagram with journey.useMaxWidth set to false via frontmatter
  config, so the SVG should not stretch to full container width. Two
  sections ("Order from website", "Checkout from website"), each with a
  single task.
config:
  journey:
    useMaxWidth: false
---
journey
  title E-Commerce
  section Order from website
  Add to cart: 5: Me
  section Checkout from website
  Add payment details: 5: Me
`,
  ],
  'simple-test': [
    'pr-check/simple-test.mmd',
    `---
description: >-
  Minimal-edge-case journey diagram: a title and a single section header with
  no tasks underneath it at all.
---
journey
  title Adding journey diagram functionality to mermaid
  section Order from website
`,
  ],
  'single-word-hyphenation': [
    'nightly-check/single-word-hyphenation.mmd',
    `---
description: >-
  A single task with one very long unbroken word
  ("Supercalifragilisticexpialidocious") as its actor label, rendered with
  journey.maxLabelWidth set to 100 — checks that a word with no whitespace
  to wrap on gets hyphenated instead.
config:
  journey:
    maxLabelWidth: 100
    useMaxWidth: true
---
journey
  title Long Word Test
  section Test
    VeryLongWord: 5: Supercalifragilisticexpialidocious
`,
  ],
  'title-styling': [
    'nightly-check/title-styling.mmd',
    `---
description: >-
  A three-section user journey rendered with journey.titleColor,
  titleFontFamily, and titleFontSize all overridden via frontmatter config
  — checks that the title text picks up the configured color, font, and
  size.
config:
  journey:
    titleColor: '#2900A5'
    titleFontFamily: 'Times New Roman'
    titleFontSize: '5rem'
---
journey
    title User Journey Example
    section Onboarding
        Sign Up: 5: John, Shahir
        Complete Profile: 4: John
    section Engagement
        Browse Features: 3: John
        Use Core Functionality: 4: John
    section Retention
        Revisit Application: 5: John
        Invite Friends: 3: John

        size: 2rem
`,
  ],
  'e-commerce': [
    'nightly-check/usemaxwidth-true.mmd',
    `---
description: >-
  The same E-Commerce user-journey diagram (two sections, "Order from
  website" and "Checkout from website", one task each) as
  should-render-a-user-journey-diagram-when-usemaxwidth-is-false.mmd, but
  with journey.useMaxWidth explicitly set to true (the default) — scales
  responsively to 100% width.
config:
  journey:
    useMaxWidth: true
---
journey
title E-Commerce
section Order from website
  Add to cart: 5: Me
section Checkout from website
  Add payment details: 5: Me
`,
  ],
  'whitespace-wrapping-no-hyphens': [
    'nightly-check/whitespace-wrapping-no-hyphens.mmd',
    `---
description: >-
  A single task with a long, multi-word actor label ("Gustavo Fring is
  played by Giancarlo Esposito and is a character in Breaking Bad."),
  rendered with journey.maxLabelWidth set to 200 — checks that text with
  whitespace to wrap on never gets hyphenated.
config:
  journey:
    maxLabelWidth: 200
    useMaxWidth: true
---
journey
  title Whitespace Test
  section Test
    TextWithSpaces: 5: Gustavo Fring is played by Giancarlo Esposito and is a character in Breaking Bad.
`,
  ],
  'wrap-long-labels-multiline-margins': [
    'nightly-check/wrap-long-labels-multiline-margins.mmd',
    `---
description: >-
  A two-section user journey (Onboarding, Engagement) where every
  Onboarding task carries a long descriptive label, rendered with
  journey.maxLabelWidth set to 320 — checks that long labels wrap into
  multiple legend lines while staying under the max width and preserving
  the diagram's left margin.
config:
  journey:
    maxLabelWidth: 320
    useMaxWidth: true
---
journey
  title User Journey Example
  section Onboarding
      Sign Up: 5: This is a long label that will be split into multiple lines to test the wrapping functionality
      Browse Features: 3: This is another long label that will be split into multiple lines to test the wrapping functionality
      Use Core Functionality: 4: This is yet another long label that will be split into multiple lines to test the wrapping functionality
  section Engagement
      Browse Features: 3
      Use Core Functionality: 4
`,
  ],
};

/** A corpus text parsed by the v13 parser, with its front-matter `journey` config. */
function parsed(text: string): Fixture {
  const pre = preprocess(text);
  const result = parseJourney(text, { preprocessed: pre });
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(`corpus fixture rejected: ${errors[0]?.message}`);
  const config = pre.frontMatter?.config?.journey as JourneyDiagramConfig | undefined;
  return config ? { model: result.model, config } : { model: result.model };
}

export const FIXTURES: Readonly<Record<string, Fixture>> = {
  ...Object.fromEntries(Object.entries(CORPUS).map(([name, [, text]]) => [name, parsed(text)])),
  // Edge cases no corpus file has.
  // default-theme.mmd without its accessibility lines and directive.
  'working-day': parsed(
    [
      'journey',
      '  title My working day',
      '  section Go to work',
      '    Make tea: 5: Me',
      '    Go upstairs: 3: Me',
      '    Do work: 1: Me, Cat',
      '  section Go home',
      '    Go downstairs: 5: Me',
      '    Sit down: 5: Me',
    ].join('\n')
  ),
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
  'three-line-labels': {
    model: journey(
      undefined,
      section('A section name long enough to wrap onto three lines'),
      task('A task name long enough to wrap onto three lines', 4, 'A'),
      section('B'),
      task('Short', 2, 'A')
    ),
  },
  'missing-section-index': {
    model: {
      ...journey(undefined, section('A'), section('B'), section('A')),
      tasks: [
        { ast: 't:1', name: 'One', score: 3, people: [], section: 'A' },
        { ast: 't:2', name: 'Two', score: 3, people: [], section: 'Gone' },
      ],
    },
  },
  empty: { model: journey(undefined) },
  'blank-names': {
    model: journey('   ', section('   '), task('  ', 3, ''), task('Named', 3, ' x '.trim())),
  },
};
