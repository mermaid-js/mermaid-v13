import type { PacketModel } from './model.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178): the title and each
 * field's label, as written. Bit numbers are digits only.
 */
export function packetLabels(model: PacketModel): readonly string[] {
  return [...(model.title === undefined ? [] : [model.title]), ...model.fields.map((f) => f.label)];
}
