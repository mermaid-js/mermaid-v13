/**
 * The c4-beta facet's tables (spec #730 T6): what each element kind is, for completion and hover
 * (the generated keyword docs give every element kind the one doc of the `Element` rule), and
 * what a `style` key does. The keys and their fixed values are the builder's (`STYLE_KEYS`).
 */
import type { C4BetaElementKind } from '../beta/model.ts';
import { T } from '../beta/tokens.ts';

export { STYLE_KEYS } from '../beta/build.ts';

/** One element kind: its keyword's token kind, the line it starts, and what it is. */
export interface ElementKindInfo {
  readonly kind: C4BetaElementKind;
  readonly token: number;
  readonly line: string;
  readonly doc: string;
}

/** The element kinds, in the order completion offers them. */
export const ELEMENT_INFO: readonly ElementKindInfo[] = [
  {
    kind: 'person',
    token: T.Person,
    line: 'person id "Name" "Description"',
    doc: 'A person: a user of the system. It has no technology.',
  },
  {
    kind: 'softwareSystem',
    token: T.SoftwareSystem,
    line: 'softwareSystem id "Name" "Description"',
    doc: 'A software system: the highest level of the model. It has no technology.',
  },
  {
    kind: 'container',
    token: T.Container,
    line: 'container id "Name" "Description" "Technology"',
    doc: 'A container: an application or a data store that runs inside a software system.',
  },
  {
    kind: 'component',
    token: T.Component,
    line: 'component id "Name" "Description" "Technology"',
    doc: 'A component: a part of a container, a group of related code behind one interface.',
  },
  {
    kind: 'group',
    token: T.Group,
    line: 'group id "Name" {',
    doc: 'A group: a frame around elements, with no meaning of its own.',
  },
  {
    kind: 'deploymentNode',
    token: T.DeploymentNode,
    line: 'deploymentNode id "Name" "Description" "Technology" instances "n" {',
    doc: 'A deployment node: a place software runs, with a technology and a number of instances.',
  },
  {
    kind: 'infrastructureNode',
    token: T.InfrastructureNode,
    line: 'infrastructureNode id "Name" "Description" "Technology"',
    doc: 'An infrastructure node: infrastructure such as a load balancer, inside a deployment node.',
  },
];

/** What each diagram kind after `c4-beta` shows. */
export const DIAGRAM_KIND_DOCS: Readonly<Record<string, string>> = {
  context: 'The system context view, and the default.',
  container: 'The container view: what runs inside a software system.',
  component: 'The component view: what a container is made of.',
  dynamic: 'The dynamic view: relations numbered in steps, as in `2: a --> b`.',
  deployment: 'The deployment view: deployment nodes and infrastructure nodes.',
};

/** What each `style` key sets. */
export const STYLE_KEY_DOCS: Readonly<Record<string, string>> = {
  fill: 'The fill colour: `#` and three or six hex digits, or a colour name.',
  stroke: 'The outline colour: `#` and three or six hex digits, or a colour name.',
  color: 'The text colour: `#` and three or six hex digits, or a colour name.',
  shape: 'The shape: `cylinder` for a data store.',
  line: 'The line of an outline: `solid`, `dashed` or `dotted`.',
};
