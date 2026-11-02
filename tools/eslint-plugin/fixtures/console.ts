// Warnings belong in RenderResult.warnings, never on the console (R-ERR-4).
export function warn(message: string): void {
  console.warn(message);
}
