// v13 (#843): the passes that key points by their rounded coordinates ask for the keys of the
// same few points again and again; each key is made once.

/** `${x.toFixed(digits)},${y.toFixed(digits)}` for each point, made once per point. */
export class PointKeys {
  private readonly digits: number;
  private readonly keys = new Map<number, Map<number, string>>();

  constructor(digits: number) {
    this.digits = digits;
  }

  key(x: number, y: number): string {
    let byY = this.keys.get(x);
    if (!byY) {
      byY = new Map();
      this.keys.set(x, byY);
    }
    let key = byY.get(y);
    if (key === undefined) {
      key = `${x.toFixed(this.digits)},${y.toFixed(this.digits)}`;
      byY.set(y, key);
    }
    return key;
  }
}
