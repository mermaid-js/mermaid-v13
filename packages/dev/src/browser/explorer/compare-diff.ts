/**
 * The Compare tab's pixel diff (#61; v12 `compare-diff.ts`): both panes' SVGs are rasterised
 * top-left aligned on one canvas size (the larger of each dimension) over the canvas
 * background and compared with pixelmatch. The result is a magenta-on-transparent mask that
 * the right pane draws over its SVG.
 */
import pixelmatch from 'pixelmatch';

/** A pane's render at the SVG's natural size. */
export interface RenderedSvg {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

export interface DiffResult {
  readonly changedPixels: number;
  readonly width: number;
  readonly height: number;
  /** The mask as a PNG data URL. */
  readonly dataUrl: string;
  /** Set when the two SVGs differ in size. */
  readonly sizeNote: string;
}

// Within what browsers reliably allocate.
const MAX_CANVAS_PIXELS = 40_000_000;

function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The browser could not rasterise this SVG.'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function canvas2d(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available.');
  return ctx;
}

function rasterise(
  img: HTMLImageElement,
  r: RenderedSvg,
  width: number,
  height: number,
  background: string
): Uint8ClampedArray {
  const ctx = canvas2d(width, height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, r.width, r.height);
  // A SecurityError if the image tainted the canvas (<foreignObject> in some browsers).
  return ctx.getImageData(0, 0, width, height).data;
}

export async function diffRenders(
  left: RenderedSvg,
  right: RenderedSvg,
  background: string
): Promise<DiffResult> {
  const width = Math.max(left.width, right.width);
  const height = Math.max(left.height, right.height);
  if (width * height > MAX_CANVAS_PIXELS) {
    throw new Error(`Diagram too large to diff (${width}×${height}).`);
  }
  const [a, b] = await Promise.all([loadImage(left.svg), loadImage(right.svg)]);
  let pa: Uint8ClampedArray;
  let pb: Uint8ClampedArray;
  try {
    pa = rasterise(a, left, width, height, background);
    pb = rasterise(b, right, width, height, background);
  } catch (e) {
    throw new Error(
      e instanceof Error && e.name === 'SecurityError'
        ? 'The canvas was tainted while rasterising (HTML labels in <foreignObject>), so its pixels cannot be read.'
        : `Rasterising failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  const out = canvas2d(width, height);
  const image = out.createImageData(width, height);
  const changedPixels = pixelmatch(pa, pb, image.data, width, height, {
    threshold: 0.1,
    diffColor: [255, 0, 255],
    diffMask: true,
  });
  out.putImageData(image, 0, 0);
  const sizeNote =
    left.width !== right.width || left.height !== right.height
      ? `Sizes differ: left ${left.width}×${left.height}, right ${right.width}×${right.height}.`
      : '';
  return { changedPixels, width, height, dataUrl: out.canvas.toDataURL('image/png'), sizeNote };
}
