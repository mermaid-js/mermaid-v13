/* eslint-disable complexity, max-depth, no-param-reassign, eqeqeq, @typescript-eslint/no-unnecessary-condition -- v12's code, kept verbatim */
/**
 * v12's block grid (spec #521 T3), test-only: v12's `diagrams/block/layout.ts` (fa796a943)
 * verbatim but for the logging, the `db` argument (unused but by `layout`, which takes the root
 * here) and the config read (`padding` is an argument). It sizes with `setBlockSizes`,
 * which recurses into each child twice (O(2^depth)), so it only runs on small trees. Parity
 * (`layout-parity.spec.ts`) hands it the leaf sizes `layoutBlock` measured and compares every
 * block's box with the linear port's.
 */

/** v12 `Block`, as far as the layout reads it. */
export interface V12Block {
  id: string;
  type: string;
  columns?: number;
  widthInColumns?: number;
  children: V12Block[];
  size?: { width: number; height: number; x: number; y: number };
}

interface BlockPosition {
  px: number;
  py: number;
}

export function calculateBlockPosition(columns: number, position: number): BlockPosition {
  // Ensure that columns is a positive integer
  if (columns === 0 || !Number.isInteger(columns)) {
    throw new Error('Columns must be an integer !== 0.');
  }

  // Ensure that position is a non-negative integer
  if (position < 0 || !Number.isInteger(position)) {
    throw new Error('Position must be a non-negative integer.' + position);
  }

  if (columns < 0) {
    // Auto columns is set
    return { px: position, py: 0 };
  }
  if (columns === 1) {
    // Auto columns is set
    return { px: 0, py: position };
  }
  // Calculate posX and posY
  const px = position % columns;
  const py = Math.floor(position / columns);
  return { px, py };
}

const getMaxChildSize = (block: V12Block) => {
  let maxWidth = 0;
  let maxHeight = 0;
  // find max width of children
  for (const child of block.children) {
    const { width, height } = child.size ?? { width: 0, height: 0, x: 0, y: 0 };
    if (child.type === 'space') {
      continue;
    }
    const normalizedWidth = width / (child.widthInColumns ?? 1);
    if (normalizedWidth > maxWidth) {
      maxWidth = normalizedWidth;
    }
    if (height > maxHeight) {
      maxHeight = height;
    }
  }
  return { width: maxWidth, height: maxHeight };
};

function setBlockSizes(block: V12Block, siblingWidth = 0, siblingHeight = 0, padding = 8) {
  if (!block?.size?.width) {
    block.size = {
      width: siblingWidth,
      height: siblingHeight,
      x: 0,
      y: 0,
    };
  }
  let maxWidth = 0;
  let maxHeight = 0;

  if (block.children?.length > 0) {
    for (const child of block.children) {
      setBlockSizes(child, 0, 0, padding);
    }
    // find max width of children
    const childSize = getMaxChildSize(block);
    maxWidth = childSize.width;
    maxHeight = childSize.height;

    // set width of block to max width of children
    for (const child of block.children) {
      if (child.size) {
        child.size.width =
          maxWidth * (child.widthInColumns ?? 1) + padding * ((child.widthInColumns ?? 1) - 1);
        child.size.height = maxHeight;
        child.size.x = 0;
        child.size.y = 0;
      }
    }
    for (const child of block.children) {
      setBlockSizes(child, maxWidth, maxHeight, padding);
    }

    const columns = block.columns ?? -1;
    let numItems = 0;
    for (const child of block.children) {
      numItems += child.widthInColumns ?? 1;
    }

    // The width and height in number blocks
    let xSize = block.children.length;
    if (columns > 0 && columns < numItems) {
      xSize = columns;
    }

    const ySize = Math.ceil(numItems / xSize);

    let width = xSize * (maxWidth + padding) + padding;
    let height = ySize * (maxHeight + padding) + padding;
    // If maxWidth
    if (width < siblingWidth) {
      width = siblingWidth;
      height = siblingHeight;
      const childWidth = (siblingWidth - xSize * padding - padding) / xSize;
      const childHeight = (siblingHeight - ySize * padding - padding) / ySize;

      // set width of block to max width of children
      for (const child of block.children) {
        if (child.size) {
          child.size.width = childWidth;
          child.size.height = childHeight;
          child.size.x = 0;
          child.size.y = 0;
        }
      }
    }

    if (width < (block?.size?.width || 0)) {
      width = block?.size?.width || 0;

      // Grow children to fit
      const num = columns > 0 ? Math.min(block.children.length, columns) : block.children.length;
      if (num > 0) {
        const childWidth = (width - num * padding - padding) / num;
        for (const child of block.children) {
          if (child.size) {
            child.size.width = childWidth;
          }
        }
      }
    }
    block.size = {
      width,
      height,
      x: 0,
      y: 0,
    };
  }
}

function layoutBlocks(block: V12Block, padding = 8) {
  const columns = block.columns ?? -1;
  if (
    block.children && // find max width of children
    block.children.length > 0
  ) {
    // Pre-compute per-row max heights so y-positioning accounts for rows of different heights
    const rowHeights = new Map<number, number>();
    {
      let colPos = 0;
      for (const child of block.children) {
        if (!child.size) {
          continue;
        }
        const { py } = calculateBlockPosition(columns, colPos);
        const currentMax = rowHeights.get(py) ?? 0;
        if (child.size.height > currentMax) {
          rowHeights.set(py, child.size.height);
        }
        let filled = child?.widthInColumns ?? 1;
        if (columns > 0) {
          filled = Math.min(filled, columns - (colPos % columns));
        }
        colPos += filled;
      }
    }
    const rowYOffsets = new Map<number, number>();
    {
      let offset = 0;
      const rows = [...rowHeights.keys()].sort((a, b) => a - b);
      for (const row of rows) {
        rowYOffsets.set(row, offset);
        offset += (rowHeights.get(row) ?? 0) + padding;
      }
    }

    let columnPos = 0;
    let startingPosX = block?.size?.x ? block?.size?.x + (-block?.size?.width / 2 || 0) : -padding;
    let rowPos = 0;
    for (const child of block.children) {
      const parent = block;

      if (!child.size) {
        continue;
      }
      const { width, height } = child.size;
      const { py } = calculateBlockPosition(columns, columnPos);
      if (py != rowPos) {
        rowPos = py;
        startingPosX = block?.size?.x ? block?.size?.x + (-block?.size?.width / 2 || 0) : -padding;
      }
      if (parent.size) {
        const halfWidth = width / 2;
        child.size.x = startingPosX + padding + halfWidth;

        startingPosX = child.size.x + halfWidth;

        const rowYOffset = rowYOffsets.get(py) ?? 0;
        const rowHeight = rowHeights.get(py) ?? height;
        child.size.y =
          parent.size.y - parent.size.height / 2 + rowYOffset + rowHeight / 2 + padding;
      }
      if (child.children) {
        layoutBlocks(child, padding);
      }
      let columnsFilled = child?.widthInColumns ?? 1;
      if (columns > 0) {
        // Make sure overflowing lines do not affect later lines
        columnsFilled = Math.min(columnsFilled, columns - (columnPos % columns));
      }
      columnPos += columnsFilled;
    }
  }
}

function findBounds(
  block: V12Block,
  { minX, minY, maxX, maxY } = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
) {
  if (block.size && block.id !== 'root') {
    const { x, y, width, height } = block.size;
    if (x - width / 2 < minX) {
      minX = x - width / 2;
    }
    if (y - height / 2 < minY) {
      minY = y - height / 2;
    }
    if (x + width / 2 > maxX) {
      maxX = x + width / 2;
    }
    if (y + height / 2 > maxY) {
      maxY = y + height / 2;
    }
  }
  if (block.children) {
    for (const child of block.children) {
      ({ minX, minY, maxX, maxY } = findBounds(child, { minX, minY, maxX, maxY }));
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * v12 `layout(db)`: `root` is v12's root block (`{ id: 'root', type: 'composite', columns }`
 * with the top-level blocks), every other block carrying its measured `size`; the sizes and
 * centres are written into the tree.
 */
export function layout(
  root: V12Block,
  padding = 8
): { x: number; y: number; width: number; height: number } {
  setBlockSizes(root, 0, 0, padding);
  layoutBlocks(root, padding);
  const { minX, minY, maxX, maxY } = findBounds(root);

  const height = maxY - minY;
  const width = maxX - minX;
  return { x: minX, y: minY, width, height };
}
