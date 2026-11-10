/** Which way a side of the spine is in y, and which bones are horizontal. */
import type { IshikawaSide } from '../model.ts';

/** The direction of `side` in y: −1 above the spine (y grows down), 1 below. */
export const sign = (side: IshikawaSide): -1 | 1 => (side === 'upper' ? -1 : 1);

/** v12's sub-cause bones: even depths are horizontal, odd depths diagonal. */
export const horizontal = (depth: number): boolean => depth % 2 === 0;
