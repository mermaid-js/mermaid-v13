/**
 * The oracle for XY chart data labels: v12 computes them in its renderer, not in the chart
 * builder (`getDrawableElem()`), and the renderer needs a DOM. This is that block,
 * `fa796a943:packages/mermaid/src/diagrams/xychart/xychartRenderer.ts:102-226` (byte-identical
 * in mermaid 12.2.0, `01-v12-xychart.md` §0), ported verbatim with the d3 selection calls
 * turned into the values they set: per `rect` shape, `labelData[i].toString()` for each bar
 * with an area, the 0.7 character-width font search, the smallest size for all, and each
 * label's `x`, `y`, `text-anchor`, `dominant-baseline` and `font-size`. The only other edits are
 * for the repo's lint (`else` after `return` dropped, `fitsInBar`'s shadowing `yOffset` parameter
 * named `offset`). Conformance only; the caller passes the label values (v12 passed plot 0's,
 * D382 passes the shape's own).
 */

export interface V12Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface V12DataLabel {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end' | 'middle';
  baseline: 'middle' | 'auto' | 'hanging';
  /** v12's `uniformFontSize`: `Math.floor(Math.min(...))`, `Infinity` with no bar. */
  fontSize: number;
}

interface BarItem {
  data: V12Rect;
  label: string;
}

/** v12's labels for one `rect` shape. */
export function v12DataLabels(
  shapeData: readonly V12Rect[],
  labelData: readonly (number | undefined)[],
  chartConfig: { chartOrientation: string; showDataLabelOutsideBar: boolean }
): V12DataLabel[] {
  const showDataLabelOutsideBar = chartConfig.showDataLabelOutsideBar;

  if (chartConfig.chartOrientation === 'horizontal') {
    // Factor to approximate each character's width.
    const charWidthFactor = 0.7;

    const rightMargin = 10;

    // Filter out bars that have zero width or height.
    const validItems = shapeData
      .map((d, i) => ({ data: d, label: labelData[i]!.toString() }))
      .filter((item) => item.data.width > 0 && item.data.height > 0);

    // Helper function to check if the text fits horizontally with a 10px right margin.
    function fitsHorizontally(item: BarItem, fontSize: number): boolean {
      const { data, label } = item;
      // Approximate the text width.
      const textWidth: number = fontSize * label.length * charWidthFactor;
      // The available width is the bar's width minus a 10px right margin.
      return textWidth <= data.width - rightMargin;
    }

    // For each valid bar, start with an initial candidate font size (70% of the bar's height),
    // then reduce it until the text fits horizontally.
    const candidateFontSizes = validItems.map((item) => {
      const { data } = item;
      let fontSize = data.height * 0.7;
      // Decrease fontSize until the text fits horizontally.
      while (!fitsHorizontally(item, fontSize) && fontSize > 0) {
        fontSize -= 1;
      }
      return fontSize;
    });

    // Choose the smallest candidate font size across all valid bars for uniformity.
    const uniformFontSize = Math.floor(Math.min(...candidateFontSizes));

    const determineLabelXPosition = (item: BarItem) => {
      if (showDataLabelOutsideBar) {
        return item.data.x + item.data.width + rightMargin;
      }
      return item.data.x + item.data.width - rightMargin;
    };

    return validItems.map((item) => ({
      text: item.label,
      x: determineLabelXPosition(item),
      y: item.data.y + item.data.height / 2,
      anchor: showDataLabelOutsideBar ? 'start' : 'end',
      baseline: 'middle',
      fontSize: uniformFontSize,
    }));
  }
  {
    const yOffset = 10;

    // filter out bars that have zero width or height.
    const validItems = shapeData
      .map((d, i) => ({ data: d, label: labelData[i]!.toString() }))
      .filter((item) => item.data.width > 0 && item.data.height > 0);

    // Helper function that checks if the text with a given fontSize fits within the bar boundaries.
    function fitsInBar(item: BarItem, fontSize: number, offset: number): boolean {
      const { data, label } = item;
      const charWidthFactor = 0.7;
      const textWidth = fontSize * label.length * charWidthFactor;

      // Compute horizontal boundaries using the center.
      const centerX = data.x + data.width / 2;
      const leftEdge = centerX - textWidth / 2;
      const rightEdge = centerX + textWidth / 2;

      // Check that text doesn't overflow horizontally.
      const horizontalFits = leftEdge >= data.x && rightEdge <= data.x + data.width;

      // For vertical placement, we use 'dominant-baseline: hanging' so that y marks the top of the text.
      // Thus, the bottom edge is y + yOffset + fontSize.
      const verticalFits = data.y + offset + fontSize <= data.y + data.height;

      return horizontalFits && verticalFits;
    }

    // For each valid item, start with a candidate font size based on the width,
    // then reduce it until the text fits within both the horizontal and vertical boundaries.
    const candidateFontSizes = validItems.map((item) => {
      const { data, label } = item;
      let fontSize = data.width / (label.length * 0.7);

      // Decrease the font size until the text fits or fontSize reaches 0.
      while (!fitsInBar(item, fontSize, yOffset) && fontSize > 0) {
        fontSize -= 1;
      }
      return fontSize;
    });

    // Choose the smallest candidate across all valid items for uniformity.
    const uniformFontSize = Math.floor(Math.min(...candidateFontSizes));

    const determineLabelYPosition = (item: BarItem) => {
      if (showDataLabelOutsideBar) {
        return item.data.y - yOffset;
      }
      return item.data.y + yOffset;
    };

    // Render text only for valid items.
    return validItems.map((item) => ({
      text: item.label,
      x: item.data.x + item.data.width / 2,
      y: determineLabelYPosition(item),
      anchor: 'middle',
      baseline: showDataLabelOutsideBar ? 'auto' : 'hanging',
      fontSize: uniformFontSize,
    }));
  }
}
