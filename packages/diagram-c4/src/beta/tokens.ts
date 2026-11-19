/**
 * c4-beta token kinds. They are the terminals of `grammar/c4beta.ebnf`, in its order, so the
 * hand-written lexer can be checked against the grammar's own (spec #730). Kinds are plain
 * numbers (TS enums are banned); the line break, comment and end are the shared `Kind`s.
 *
 * They start above legacy C4's kinds (`parser/tokens.ts` has 72, from `FIRST_DIAGRAM_KIND`): the
 * `c4` language facet serves both header types with one kind to category table, as the service
 * reads it by kind number alone (railroad's four notations share one set of kinds likewise).
 * `language.spec.ts` holds the two sets apart.
 */
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

/** The first c4-beta kind: past the last legacy C4 kind, with room to add to it. */
export const FIRST_BETA_KIND = FIRST_DIAGRAM_KIND + 80;

const F = FIRST_BETA_KIND;

export const T = {
  /** `c4-beta`. */
  Header: F,
  Context: F + 1,
  Container: F + 2,
  Component: F + 3,
  Dynamic: F + 4,
  Deployment: F + 5,
  Person: F + 6,
  SoftwareSystem: F + 7,
  Group: F + 8,
  DeploymentNode: F + 9,
  InfrastructureNode: F + 10,
  Instances: F + 11,
  On: F + 12,
  Off: F + 13,
  Tb: F + 14,
  Bt: F + 15,
  Lr: F + 16,
  Rl: F + 17,
  Direction: F + 18,
  Legend: F + 19,
  Style: F + 20,
  /** `title` and the rest of the line, up to a `%%`. */
  Title: F + 21,
  /** `accTitle:` and the rest of the line, up to a `%%`. */
  AccTitle: F + 22,
  /** `accDescr:` and the rest of the line, or `accDescr { … }`. */
  AccDescr: F + 23,
  ArrowRight: F + 24,
  ArrowLeft: F + 25,
  ArrowBoth: F + 26,
  ArrowUndirected: F + 27,
  /** `:::name`, the colons included. */
  Tag: F + 28,
  Colon: F + 29,
  Comma: F + 30,
  Lbrace: F + 31,
  Rbrace: F + 32,
  /** The digits of `2:` at the start of a line. */
  Step: F + 33,
  /** `#` and 3, 4, 6 or 8 hex digits. */
  Hex: F + 34,
  /** `"…"` or `'…'`, the quotes included. */
  String: F + 35,
  Id: F + 36,
  /** `rgb(…)`, `rgba(…)`, `hsl(…)` or `hsla(…)`, on one line, with no `(` inside. */
  ColorFunction: F + 37,
} as const;

/** Trivia: comments and the directives core found. Blanks are never tokens. */
export const C4BETA_TRIVIA = /* @__PURE__ */ kindSet(Kind.Comment, Kind.Directive, Kind.Space);

/** The words the lexer reads as keyword tokens; every other word is an {@link T.Id}. */
export const KEYWORDS: ReadonlyMap<string, number> = new Map([
  ['c4-beta', T.Header],
  ['context', T.Context],
  ['container', T.Container],
  ['component', T.Component],
  ['dynamic', T.Dynamic],
  ['deployment', T.Deployment],
  ['person', T.Person],
  ['softwareSystem', T.SoftwareSystem],
  ['group', T.Group],
  ['deploymentNode', T.DeploymentNode],
  ['infrastructureNode', T.InfrastructureNode],
  ['instances', T.Instances],
  ['on', T.On],
  ['off', T.Off],
  ['TB', T.Tb],
  ['BT', T.Bt],
  ['LR', T.Lr],
  ['RL', T.Rl],
  ['direction', T.Direction],
  ['legend', T.Legend],
  ['style', T.Style],
]);

/** Kinds that read as an id wherever an id goes: the words that open no statement. */
export const ID_KINDS = /* @__PURE__ */ kindSet(
  T.Id,
  T.Header,
  T.Context,
  T.Container,
  T.Component,
  T.Dynamic,
  T.Deployment,
  T.Person,
  T.SoftwareSystem,
  T.Group,
  T.DeploymentNode,
  T.InfrastructureNode,
  T.Instances,
  T.On,
  T.Off,
  T.Tb,
  T.Bt,
  T.Lr,
  T.Rl
);

/** The kinds that open an element. */
export const ELEMENT_KINDS = /* @__PURE__ */ kindSet(
  T.Person,
  T.SoftwareSystem,
  T.Container,
  T.Component,
  T.Group,
  T.DeploymentNode,
  T.InfrastructureNode
);

/** The kinds a diagram may name after `c4-beta`. */
export const DIAGRAM_KINDS = /* @__PURE__ */ kindSet(
  T.Context,
  T.Container,
  T.Component,
  T.Dynamic,
  T.Deployment
);
