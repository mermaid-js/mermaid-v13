/**
 * The v13 side of class-diagram parity: the class parser and the normaliser from its
 * `ClassModel` to the {@link ClassSnapshot} that `v12.ts` takes from mermaid 12's ClassDB.
 *
 * The oracle runs class sources at `securityLevel: 'loose'` ({@link classAdapter}'s
 * `v12Config`): v12 then keeps link URLs as written, as v13 does (v13 checks them when SVG is
 * written), and queues its click bindings, which the snapshots compare with `callbacks`.
 *
 * Bridged here instead of listed as a divergence: v12 wrote `'none'` for a missing multiplicity; v13 leaves it out. Both read as undefined
 * (a written `"none"` too, which v12's renderer also drew as nothing).
 */
import { detectClass, memberText, parseClass } from '@mermaid-js/diagram-class';
import type { ClassMember, ClassModel } from '@mermaid-js/diagram-class';
import { modelOrThrow } from '../parity-parse.ts';
import type { DiagramAdapter } from '../types.ts';
import { CLASS_V12_TYPES, classV12Snapshot } from './v12.ts';
import type { ClassMemberSnapshot, ClassSnapshot } from './v12.ts';

const member = (m: ClassMember): ClassMemberSnapshot => ({
  memberType: m.kind,
  visibility: m.visibility,
  id: m.name,
  parameters: m.parameters,
  returnType: m.returnType,
  classifier: m.classifier,
  text: memberText(m),
});

const none = (s: string | undefined): string | undefined => (s === 'none' ? undefined : s);

export function classV13Snapshot(model: ClassModel): ClassSnapshot {
  return {
    direction: model.direction,
    callbacks: model.callbacks.map((c) => ({ id: c.id, name: c.name, args: [...c.args] })),
    accTitle: model.accTitle,
    accDescr: model.accDescr,
    classes: model.classes.map((c) => ({
      id: c.id,
      type: c.type,
      label: c.label,
      cssClasses: c.classes.join(' '),
      styles: [...c.styles],
      annotations: [...c.annotations],
      members: c.attributes.map(member),
      methods: c.methods.map(member),
      parent: c.parent,
      link: c.link,
      linkTarget: c.linkTarget,
      tooltip: c.tooltip,
      haveCallback: c.haveCallback === true,
    })),
    relations: model.relations.map((r) => ({
      id1: r.start.id,
      id2: r.end.id,
      type1: r.start.type,
      type2: r.end.type,
      lineType: r.line,
      relationTitle1: none(r.start.multiplicity),
      relationTitle2: none(r.end.multiplicity),
      title: r.label,
    })),
    notes: model.notes.map((n) => ({ id: n.id, class: n.class, text: n.text, parent: n.parent })),
    namespaces: model.namespaces.map((ns) => ({
      id: ns.id,
      label: ns.label,
      parent: ns.parent,
      explicit: ns.explicit,
      classes: [...ns.classes],
      notes: [...ns.notes],
      children: [...ns.children],
    })),
    interfaces: model.interfaces.map((f) => ({ id: f.id, label: f.label, classId: f.classId })),
    styleClasses: model.styleClasses.map((s) => ({
      id: s.id,
      styles: [...s.styles],
      textStyles: [...s.textStyles],
    })),
  };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export const parseClassForParity = (text: string): ClassModel => modelOrThrow(parseClass(text));

export const classAdapter: DiagramAdapter<ClassModel> = {
  id: 'class',
  v12Types: CLASS_V12_TYPES,
  detect: (text) => detectClass(text) !== undefined,
  parse: parseClassForParity,
  normaliseV13: classV13Snapshot,
  normaliseV12: classV12Snapshot,
  v12Config: { securityLevel: 'loose' },
};
