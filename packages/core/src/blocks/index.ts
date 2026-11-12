/**
 * What `mermaid`'s block pass takes from core (ADR-15, D554): the block shapes it hands every
 * host as `RenderContext.blockShapes`, the check on an inner diagram's root, and the nesting
 * limit (which the language service reports too). No diagram imports this subpath, and the pass
 * loads only for a text with a block, so neither core's bundle nor a host's chunk carries it.
 */
import type { BlockShapes } from '../pipeline/types.ts';
import {
  drawFolded,
  FOLDED_TYPE_SIZE,
  foldedCells,
  foldedSize,
  foldedTypeText,
} from '../svg/folded.ts';
import { drawFramed, framedSize, titleStrip } from '../svg/framed.ts';

export { MAX_BLOCK_DEPTH, openerRange, tooDeep } from '../parser-kit/embed-depth.ts';
export { embeddedSvg } from '../svg/framed.ts';

/** The open frame (`svg/framed.ts`) and the folded box (`svg/folded.ts`), for every host. */
export const blockShapes: BlockShapes = {
  framedSize,
  titleStrip,
  drawFramed,
  foldedSize,
  foldedCells,
  foldedTypeText,
  foldedTypeSize: FOLDED_TYPE_SIZE,
  drawFolded,
};
