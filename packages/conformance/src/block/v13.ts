/**
 * The v13 side of block parity: the block parser and the normaliser from its `BlockModel` to
 * the {@link BlockSnapshot} that `v12.ts` takes from mermaid\@12's DB. A space's `cells` are
 * expanded into v12's one block per cell (`<id>-<j>`, labelled with the space's id).
 */
import { detectBlock, parseBlock } from '@mermaid-js/diagram-block';
import type { Block, BlockModel } from '@mermaid-js/diagram-block';
import { parseForParity } from '../parity-parse.ts';
import type { DiagramAdapter } from '../types.ts';
import { BLOCK_V12_TYPES, blockV12Snapshot, IdNumbering, renumber } from './v12.ts';
import type { BlockSnapshot, BlockSnapshotNode } from './v12.ts';

function nodes(blocks: readonly Block[]): BlockSnapshotNode[] {
  const out: BlockSnapshotNode[] = [];
  for (const b of blocks) {
    const node: BlockSnapshotNode = {
      id: b.id,
      type: b.type,
      label: b.label,
      span: b.span,
      columns: b.columns ?? null,
      classes: [...b.classes],
      styles: [...b.styles],
      directions: b.directions ? [...b.directions] : null,
      colorIndex: b.colorIndex ?? null,
      children: nodes(b.children),
    };
    if (b.type !== 'space') {
      out.push(node);
      continue;
    }
    for (let j = 0; j < (b.cells ?? 1); j++) out.push({ ...node, id: `${b.id}-${j}`, label: b.id });
  }
  return out;
}

export function blockV13Snapshot(model: BlockModel): BlockSnapshot {
  return {
    columns: model.columns,
    blocks: renumber(nodes(model.blocks), new IdNumbering(/^id-\d+/)),
    edges: model.edges.map((e) => ({
      id: e.id,
      start: e.start,
      end: e.end,
      label: e.label,
      arrowTypeStart: e.arrowTypeStart,
      arrowTypeEnd: e.arrowTypeEnd,
      thickness: e.thickness,
      pattern: e.pattern,
    })),
    classes: model.classDefs.map((c) => ({
      id: c.id,
      styles: [...c.styles],
      textStyles: [...c.textStyles],
    })),
  };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export const parseBlockForParity = (text: string): BlockModel => parseForParity(text, parseBlock);

export const blockAdapter: DiagramAdapter<BlockModel> = {
  id: 'block',
  v12Types: BLOCK_V12_TYPES,
  detect: (text) => detectBlock(text),
  parse: parseBlockForParity,
  normaliseV13: blockV13Snapshot,
  normaliseV12: blockV12Snapshot,
};
