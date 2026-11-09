/**
 * How the layout reads a size (D417: never NaN): a negative size, or one so large its square is
 * not a finite number (a 155-digit size), counts as 0. The parser warns about both with
 * `VENN_INVALID_SIZE`; a set laid out at 0 is not drawn.
 */

/** Whether `size` is laid out as 0 although it was not written as 0. */
export const invalidSize = (size: number): boolean => size < 0 || !Number.isFinite(size * size);

/** The size `size` is laid out at. */
export const laidOutSize = (size: number): number => (invalidSize(size) ? 0 : size);
