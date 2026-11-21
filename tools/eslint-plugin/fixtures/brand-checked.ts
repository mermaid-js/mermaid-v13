// Values that keep the type a check gave them, and casts to types that are not brands.
import { checkColor, type Paint, type SafeColor } from '@mermaid-js/core/svg';

interface Transform {
  readonly x: number;
}

export const CURRENT: Paint = 'currentColor';
export const WHITE: SafeColor = checkColor('#fff')!;
export const moved = (value: unknown) => value as Transform;
export const text = (value: unknown) => value as string;
export const fill = { fill: CURRENT } satisfies { fill: Paint };
