/** Which side of the spine a cause is on, and which way that is in y. */
import type { IshikawaSide } from './types.ts';

/** v12's alternation: causes at even indices above the spine, odd ones below. */
export const sideOf = (index: number): IshikawaSide => (index % 2 === 0 ? 'upper' : 'lower');

/** The direction of `side` in y: −1 above the spine (y grows down), 1 below. */
export const sign = (side: IshikawaSide): -1 | 1 => (side === 'upper' ? -1 : 1);

/** v12's sub-cause bones: even depths are horizontal, odd depths diagonal. */
export const horizontal = (depth: number): boolean => depth % 2 === 0;
