/**
 * v12's `getData` (`usecaseDb.ts`) for the ported specs: the projection of the DB onto v12's
 * renderer contract, here over the v13 model (test only; v13's layout is T3's). Labels are not
 * sanitised (the oracle's identity DOMPurify): sanitising is the security suites' concern.
 */
import type { UsecaseArrowType, UsecaseModel, UsecaseRelationship } from '../model.ts';

/** v12's `defaultConfig.usecase` keys `getData` reads, with v12's defaults. */
export const DEFAULT_USECASE = {
  useMaxWidth: true,
  wrappingWidth: 120,
  minNodeWidth: 120,
  actorFontSize: 14,
  actorFontFamily: '"Open Sans", sans-serif',
  actorFontWeight: 'normal',
  usecaseFontSize: 12,
  usecaseFontFamily: '"Open Sans", sans-serif',
  usecaseFontWeight: 'normal',
  nodeSpacing: 50,
  rankSpacing: 50,
  diagramPadding: 20,
};

export type V12Node = Record<string, unknown>;

const classNames = (...names: (string | false | undefined)[]): string =>
  names.filter((n): n is string => Boolean(n)).join(' ');

const ACTOR_SHAPE: Readonly<Record<string, string>> = {
  normal: 'usecaseActor',
  hollow: 'usecaseActorHollow',
  awesome: 'usecaseActorAwesome',
  icon: 'usecaseActorIcon',
};

const MARKERS: Readonly<Record<UsecaseArrowType, [start: string, end: string]>> = {
  point: ['none', 'arrow_point'],
  reversedPoint: ['arrow_point', 'none'],
  line: ['none', 'none'],
  circle: ['none', 'arrow_circle'],
  cross: ['none', 'arrow_cross'],
  reversedCircle: ['arrow_circle', 'none'],
  reversedCross: ['arrow_cross', 'none'],
};

/** The class definitions' styles for `classes` (`default` first), the last of each property. */
function compiledStyles(model: UsecaseModel, classes: readonly string[]): string[] {
  const compiled = new Map<string, string>();
  for (const name of ['default', ...classes]) {
    for (const raw of model.classDefs.find((c) => c.id === name)?.styles ?? []) {
      const style = raw.trim();
      const colon = style.indexOf(':');
      const property = (colon === -1 ? style : style.slice(0, colon)).trim();
      if (property) compiled.set(property, style);
    }
  }
  return [...compiled.values()];
}

/** v12's `endpointLabel`: an element's label, a JSON table's id, else the id. */
function endLabel(model: UsecaseModel, id: string): string {
  return (
    model.actors.find((a) => a.id === id)?.label ??
    model.useCases.find((u) => u.id === id)?.label ??
    model.jsonTables.find((j) => j.id === id)?.id ??
    model.notes.find((n) => n.id === id)?.label ??
    id
  );
}

const optional = (key: string, value: unknown): V12Node =>
  value === undefined || value === false || value === '' ? {} : { [key]: value };

function elementNodes(model: UsecaseModel, look: unknown): V12Node[] {
  let colorIndex = 0;
  const out: V12Node[] = [];
  for (const a of model.actors) {
    out.push({
      id: a.id,
      label: a.label,
      labelType: a.labelType,
      shape: ACTOR_SHAPE[a.type],
      isGroup: false,
      padding: 10,
      look,
      colorIndex: colorIndex++,
      cssClasses: classNames(
        'default',
        'usecase-actor',
        `usecase-actor-${a.type}`,
        a.business && 'usecase-business',
        ...a.classes
      ),
      cssStyles: [...a.styles],
      cssCompiledStyles: compiledStyles(model, a.classes),
      actorType: a.type,
      business: a.business,
      ...optional('icon', a.icon),
      ...optional('stereotype', a.stereotype),
      ...optional('parentId', a.parentId),
    });
  }
  for (const u of model.useCases) {
    const ellipse = u.shape === 'ellipse';
    const businessShape = u.business ? 'usecaseBusiness' : 'usecaseEllipse';
    out.push({
      id: u.id,
      label: u.label,
      labelType: u.labelType,
      shape: ellipse ? businessShape : u.shape,
      isGroup: false,
      padding: ellipse ? 20 : 10,
      look,
      colorIndex: colorIndex++,
      cssClasses: classNames(
        'default',
        'usecase-element',
        `usecase-${u.shape}`,
        u.business && 'usecase-business',
        ...u.classes
      ),
      cssStyles: [...u.styles],
      cssCompiledStyles: compiledStyles(model, u.classes),
      business: u.business,
      ...optional('stereotype', u.stereotype),
      ...optional('parentId', u.parentId),
    });
  }
  return out;
}

function otherNodes(model: UsecaseModel, look: unknown): V12Node[] {
  const out: V12Node[] = [];
  for (const n of model.notes) {
    out.push({
      id: n.id,
      label: n.label,
      labelType: n.labelType,
      shape: 'note',
      isGroup: false,
      padding: 10,
      look,
      cssClasses: 'default usecase-note',
      cssStyles: [],
      cssCompiledStyles: compiledStyles(model, []),
      noteTarget: n.target,
      noteTargetLabel: endLabel(model, n.target),
    });
  }
  for (const j of model.jsonTables) {
    out.push({
      id: j.id,
      label: j.id,
      labelType: 'text',
      shape: 'usecaseJsonTable',
      isGroup: false,
      padding: 10,
      look,
      cssClasses: classNames('default', 'usecase-json-table', ...j.classes),
      cssStyles: [...j.styles],
      cssCompiledStyles: compiledStyles(model, j.classes),
      jsonRows: j.rows.map((r) => ({ ...r })),
    });
  }
  model.boundaries.forEach((b, boundaryColorIndex) => {
    out.push({
      id: b.id,
      label: b.label,
      labelType: b.labelType,
      shape: 'usecaseSystemBoundary',
      isGroup: true,
      padding: 20,
      look,
      colorIndex: boundaryColorIndex,
      cssClasses: classNames(
        'default',
        'system-boundary',
        `system-boundary-${b.type}`,
        ...b.classes
      ),
      cssStyles: [...b.styles],
      cssCompiledStyles: compiledStyles(model, b.classes),
      boundaryType: b.type,
    });
  });
  return out;
}

/** v12's `relationshipVisuals`. */
function visuals(r: UsecaseRelationship): V12Node {
  if (r.type === 'include' || r.type === 'extend') {
    return {
      arrowTypeStart: 'none',
      arrowTypeEnd: 'arrow_point',
      pattern: 'dotted',
      label: `«${r.type}»`,
      labelType: 'text',
    };
  }
  if (r.type === 'generalization') {
    return { arrowTypeStart: 'none', arrowTypeEnd: 'extension', pattern: 'solid' };
  }
  const [start, end] = MARKERS[r.arrowType];
  return {
    arrowTypeStart: start,
    arrowTypeEnd: end,
    pattern: 'solid',
    ...optional('label', r.label),
    ...optional('labelType', r.labelType),
  };
}

function edges(model: UsecaseModel, look: unknown): V12Node[] {
  const out: V12Node[] = model.relationships.map((r) => {
    const animated = r.animate || r.animation !== undefined;
    return {
      id: r.id,
      start: r.source,
      end: r.target,
      source: r.source,
      target: r.target,
      sourceLabel: endLabel(model, r.source),
      targetLabel: endLabel(model, r.target),
      type: 'edge',
      relationshipType: r.type,
      internal: false,
      ...visuals(r),
      labelpos: 'c',
      classes: classNames(
        'default',
        'relationship',
        `relationship-${r.type}`,
        ...r.classes,
        animated && `edge-animation-${r.animation ?? 'fast'}`
      ),
      style: [...r.styles],
      cssCompiledStyles: compiledStyles(model, r.classes),
      animate: r.animate,
      ...optional('animation', r.animation),
      look,
      thickness: 'normal',
      minlen: r.minlen,
      isUserDefinedId: r.explicitId,
    };
  });
  for (const n of model.notes) {
    out.push({
      id: `${n.id}-edge`,
      start: n.id,
      end: n.target,
      source: n.id,
      target: n.target,
      type: 'edge',
      relationshipType: 'note',
      sourceLabel: endLabel(model, n.id),
      targetLabel: endLabel(model, n.target),
      internal: true,
      pattern: 'dotted',
      arrowTypeStart: 'none',
      arrowTypeEnd: 'none',
      labelpos: 'c',
      classes: 'default relationship relationship-note',
      style: [],
      cssCompiledStyles: compiledStyles(model, []),
      animate: false,
      look,
      thickness: 'normal',
      minlen: 1,
      isUserDefinedId: false,
    });
  }
  return out;
}

/** v12's `getData()` for `model` under the site `config`. */
export function layoutData(
  model: UsecaseModel,
  config: Record<string, unknown> & { usecase?: Record<string, unknown> }
): Record<string, unknown> {
  const look = config.look;
  const cfg = { ...DEFAULT_USECASE, ...config.usecase };
  const nodes = [...elementNodes(model, look), ...otherNodes(model, look)];
  for (const node of nodes) {
    node.wrappingWidth ??= cfg.wrappingWidth;
    const shape = node.shape as string;
    if (!node.isGroup && !shape.startsWith('usecaseActor')) node.minWidth ??= cfg.minNodeWidth;
    if (shape === 'usecaseEllipse' || shape === 'usecaseBusiness') node.spreadPorts = true;
  }
  return {
    nodes,
    edges: edges(model, look),
    config,
    type: 'usecase',
    layoutAlgorithm: 'dagre',
    direction: model.direction,
    nodeSpacing: cfg.nodeSpacing,
    rankSpacing: cfg.rankSpacing,
    actorFontSize: cfg.actorFontSize,
    actorFontFamily: cfg.actorFontFamily,
    actorFontWeight: cfg.actorFontWeight,
    usecaseFontSize: cfg.usecaseFontSize,
    usecaseFontFamily: cfg.usecaseFontFamily,
    usecaseFontWeight: cfg.usecaseFontWeight,
    diagramPadding: cfg.diagramPadding,
    useMaxWidth: cfg.useMaxWidth,
    markers: ['point', 'circle', 'cross', 'extension'],
  };
}
