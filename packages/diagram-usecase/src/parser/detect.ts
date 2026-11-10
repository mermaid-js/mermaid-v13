/** v12's usecase detector (`usecaseDetector.ts`): `usecase-beta` first, in lower case. */
const DETECT = /^\s*usecase-beta(?:\s|$)/;

/** Whether `text` (the preprocessed body) is a usecase diagram. */
export function detectUsecase(text: string): boolean {
  return DETECT.test(text);
}
