// Brands are minted by core's checks only; each cast below skips one (#1023).
import type * as svg from '@mermaid-js/core/svg';
import type {
  Paint,
  SafeColor,
  SafeValue,
  ThemeRef,
  Transform as SvgTransform,
} from '@mermaid-js/core/svg';

type Ink = SafeColor | ThemeRef;

export const dash = '3,3' as SafeValue;
export const ink = (text: string) => text as unknown as SafeColor;
export const paint = (text: string) => text as Paint;
export const moved = (text: string) => text as SvgTransform;
export const local = (text: string) => text as Ink;
export const named = (text: string) => text as svg.SafeUrl;
export const list = (texts: string[]) => texts as readonly SafeValue[];
