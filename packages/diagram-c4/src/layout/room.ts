/**
 * The room a relation label's box adds to its text (D629): the unit profile's `labelPatch`, in
 * px. Both C4 layouts reserve it and the renderer draws it, so the placed box is the drawn box.
 */
import type { RenderContext } from '@mermaid-js/core';
import { pxProfile } from '@mermaid-js/core/layout';
import { C4_METRICS as M } from './metrics.ts';

/** The room across (`x`) and down (`y`), in px. */
export interface LabelRoom {
  readonly x: number;
  readonly y: number;
}

/** `units`' `labelPatch` (the px profile's without one) in px. */
export function labelRoomOf(units: RenderContext['units'] | undefined): LabelRoom {
  const { builder, pxPerUnit } = units ?? pxProfile;
  return { x: builder.labelPatch.x * pxPerUnit.x, y: builder.labelPatch.y * pxPerUnit.y };
}

/**
 * Classic C4's room: the `labelPatch` where the label is drawn as an edge-label tag; on the cell
 * profile (text output, which frames its labels itself) the one-cell `textLabelPad` across.
 */
export function classicLabelRoom(units: RenderContext['units'] | undefined): LabelRoom {
  return units?.id === 'cell' ? { x: M.textLabelPad, y: 0 } : labelRoomOf(units);
}
