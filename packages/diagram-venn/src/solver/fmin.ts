// cspell:ignore Gratzl Nocedal Polak Ribiere Ribière fmin fxprime
/**
 * The optimisers of the venn solver (spec #429 T3, D411): bisection, Nelder–Mead (downhill
 * simplex) and the conjugate gradient method with a Wolfe line search, with the vector helpers
 * they use.
 *
 * Ported from fmin 0.0.4 (https://github.com/benfred/fmin), BSD 3-Clause License, Copyright
 * 2016, Ben Frederickson, as venn.js 2.0.0 bundles it (https://github.com/upsetjs/venn.js,
 * `build/venn.esm.js`), MIT License, Copyright (c) 2013 Ben Frederickson, Copyright (c) 2021
 * Samuel Gratzl. The arithmetic and its order are theirs; the options venn.js never passes
 * (`history`, the simplex coefficients) are left out.
 */

/** A point of the search, with its loss once evaluated. */
export type Vector = number[] & { fx?: number };

/** The zero of `f` between `a` and `b`, where `f` has opposite signs. */
export function bisect(f: (x: number) => number, from: number, b: number): number {
  const maxIterations = 100;
  const tolerance = 1e-10;
  let a = from;
  const fA = f(a);
  const fB = f(b);
  let delta = b - a;

  if (fA * fB > 0) {
    // venn.js throws a string here; its callers never pass such points.
    throw new Error('Initial bisect points must have opposite signs');
  }

  if (fA === 0) return a;
  if (fB === 0) return b;

  for (let i = 0; i < maxIterations; ++i) {
    delta /= 2;
    const mid = a + delta;
    const fMid = f(mid);

    if (fMid * fA >= 0) a = mid;

    if (Math.abs(delta) < tolerance || fMid === 0) return mid;
  }
  return a + delta;
}

/** `n` zeros. */
export function zeros(n: number): number[] {
  const r = new Array<number>(n);
  for (let i = 0; i < n; ++i) r[i] = 0;
  return r;
}

/** An `n × m` matrix of zeros. */
export function zerosM(n: number, m: number): number[][] {
  return zeros(n).map(() => zeros(m));
}

function dot(a: readonly number[], b: readonly number[]): number {
  let ret = 0;
  for (let i = 0; i < a.length; ++i) ret += a[i]! * b[i]!;
  return ret;
}

/** The Euclidean norm. */
export function norm2(a: readonly number[]): number {
  return Math.sqrt(dot(a, a));
}

/** `ret = value · c`. */
export function scale(ret: number[], value: readonly number[], c: number): void {
  for (let i = 0; i < value.length; ++i) ret[i] = value[i]! * c;
}

function weightedSum(
  ret: number[],
  w1: number,
  v1: readonly number[],
  w2: number,
  v2: readonly number[]
): void {
  for (let j = 0; j < ret.length; ++j) ret[j] = w1 * v1[j]! + w2 * v2[j]!;
}

/** The options of {@link nelderMead} that venn.js passes. */
export interface NelderMeadOptions {
  readonly maxIterations?: number;
  readonly minErrorDelta?: number;
}

/** Minimises `f` from `x0` by the downhill simplex method. */
export function nelderMead(
  f: (x: readonly number[]) => number,
  x0: Vector,
  parameters: NelderMeadOptions = {}
): { fx: number; x: Vector } {
  // fmin reads these with `||`; venn.js never passes 0.
  const maxIterations = parameters.maxIterations ?? x0.length * 200;
  const nonZeroDelta = 1.05;
  const zeroDelta = 0.001;
  const minErrorDelta = parameters.minErrorDelta ?? 1e-6;
  // fmin reads `minErrorDelta` here too, so the tolerance follows it.
  const minTolerance = parameters.minErrorDelta ?? 1e-5;
  const rho = 1;
  const chi = 2;
  const psi = -0.5;
  const sigma = 0.5;
  let maxDiff;

  // initialize simplex.
  const N = x0.length;
  const simplex = new Array<Vector>(N + 1);
  simplex[0] = x0;
  x0.fx = f(x0);
  for (let i = 0; i < N; ++i) {
    const point: Vector = [...x0];
    point[i] = point[i] ? point[i]! * nonZeroDelta : zeroDelta;
    simplex[i + 1] = point;
    point.fx = f(point);
  }

  function updateSimplex(value: Vector): void {
    const worst = simplex[N]!;
    for (let i = 0; i < value.length; i++) worst[i] = value[i]!;
    worst.fx = value.fx;
  }

  const sortOrder = (a: Vector, b: Vector): number => a.fx! - b.fx!;

  const centroid: Vector = [...x0];
  const reflected: Vector = [...x0];
  const contracted: Vector = [...x0];
  const expanded: Vector = [...x0];

  for (let iteration = 0; iteration < maxIterations; ++iteration) {
    simplex.sort(sortOrder);

    maxDiff = 0;
    for (let i = 0; i < N; ++i) {
      maxDiff = Math.max(maxDiff, Math.abs(simplex[0][i]! - simplex[1]![i]!));
    }

    if (Math.abs(simplex[0].fx! - simplex[N]!.fx!) < minErrorDelta && maxDiff < minTolerance) {
      break;
    }

    // compute the centroid of all but the worst point in the simplex
    for (let i = 0; i < N; ++i) {
      centroid[i] = 0;
      for (let j = 0; j < N; ++j) centroid[i]! += simplex[j]![i]!;
      centroid[i]! /= N;
    }

    // reflect the worst point past the centroid  and compute loss at reflected
    // point
    const worst = simplex[N]!;
    weightedSum(reflected, 1 + rho, centroid, -rho, worst);
    reflected.fx = f(reflected);

    // if the reflected point is the best seen, then possibly expand
    if (reflected.fx < simplex[0].fx!) {
      weightedSum(expanded, 1 + chi, centroid, -chi, worst);
      expanded.fx = f(expanded);
      if (expanded.fx < reflected.fx) updateSimplex(expanded);
      else updateSimplex(reflected);
    }

    // if the reflected point is worse than the second worst, we need to
    // contract
    else if (reflected.fx >= simplex[N - 1]!.fx!) {
      let shouldReduce = false;

      if (reflected.fx > worst.fx!) {
        // do an inside contraction
        weightedSum(contracted, 1 + psi, centroid, -psi, worst);
        contracted.fx = f(contracted);
        if (contracted.fx < worst.fx!) updateSimplex(contracted);
        else shouldReduce = true;
      } else {
        // do an outside contraction
        weightedSum(contracted, 1 - psi * rho, centroid, psi * rho, worst);
        contracted.fx = f(contracted);
        if (contracted.fx < reflected.fx) updateSimplex(contracted);
        else shouldReduce = true;
      }

      if (shouldReduce) {
        // do a reduction
        for (let i = 1; i < simplex.length; ++i) {
          const point = simplex[i]!;
          weightedSum(point, 1 - sigma, simplex[0], sigma, point);
          point.fx = f(point);
        }
      }
    } else {
      updateSimplex(reflected);
    }
  }

  simplex.sort(sortOrder);
  return { fx: simplex[0].fx!, x: simplex[0] };
}

/** A point of the gradient search: its position, loss and gradient. */
interface GradientPoint {
  x: number[];
  fx: number;
  fxprime: number[];
}

/** A loss that also writes its gradient into `fxprime`. */
export type GradientLoss = (x: readonly number[], fxprime: number[]) => number;

/**
 * Searches along `pk` for a step that satisfies the Wolfe conditions (Nocedal and Wright,
 * "Numerical Optimization", p. 59–60), writing the point into `next`; the step, or 0 when none
 * was found.
 */
function wolfeLineSearch(
  f: GradientLoss,
  pk: readonly number[],
  current: GradientPoint,
  next: GradientPoint,
  a0: number
): number {
  const phi0 = current.fx;
  const phiPrime0 = dot(current.fxprime, pk);
  let phi = phi0;
  let phiOld = phi0;
  let phiPrime = phiPrime0;
  let aPrev = 0;
  let a = a0 || 1;
  const c1 = 1e-6;
  const c2 = 0.1;

  function zoom(lo: number, high: number, phiAtLo: number): number {
    let aLo = lo;
    let aHigh = high;
    let phiLo = phiAtLo;
    for (let iteration = 0; iteration < 16; ++iteration) {
      a = (aLo + aHigh) / 2;
      weightedSum(next.x, 1.0, current.x, a, pk);
      phi = next.fx = f(next.x, next.fxprime);
      phiPrime = dot(next.fxprime, pk);

      if (phi > phi0 + c1 * a * phiPrime0 || phi >= phiLo) {
        aHigh = a;
      } else {
        if (Math.abs(phiPrime) <= -c2 * phiPrime0) return a;

        if (phiPrime * (aHigh - aLo) >= 0) aHigh = aLo;

        aLo = a;
        phiLo = phi;
      }
    }

    return 0;
  }

  for (let iteration = 0; iteration < 10; ++iteration) {
    weightedSum(next.x, 1.0, current.x, a, pk);
    phi = next.fx = f(next.x, next.fxprime);
    phiPrime = dot(next.fxprime, pk);
    if (phi > phi0 + c1 * a * phiPrime0 || (iteration && phi >= phiOld)) {
      return zoom(aPrev, a, phiOld);
    }

    if (Math.abs(phiPrime) <= -c2 * phiPrime0) return a;

    if (phiPrime >= 0) return zoom(a, aPrev, phi);

    phiOld = phi;
    aPrev = a;
    a *= 2;
  }

  return a;
}

/** Minimises `f` from `initial` by the Polak–Ribière conjugate gradient method. */
export function conjugateGradient(
  f: GradientLoss,
  initial: readonly number[],
  params: { readonly maxIterations?: number } = {}
): GradientPoint {
  // allocate all memory up front here, keep out of the loop for performance
  // reasons
  let current: GradientPoint = { x: [...initial], fx: 0, fxprime: [...initial] };
  let next: GradientPoint = { x: [...initial], fx: 0, fxprime: [...initial] };
  const yk = [...initial];
  let temp;
  let a = 1;
  const maxIterations = params.maxIterations ?? initial.length * 20;

  current.fx = f(current.x, current.fxprime);
  const pk = [...current.fxprime];
  scale(pk, current.fxprime, -1);

  for (let i = 0; i < maxIterations; ++i) {
    a = wolfeLineSearch(f, pk, current, next, a);

    if (!a) {
      // failed to find point that satisfies wolfe conditions.
      // reset direction for next iteration
      scale(pk, current.fxprime, -1);
    } else {
      // update direction using Polak–Ribiere CG method
      weightedSum(yk, 1, next.fxprime, -1, current.fxprime);

      const deltaK = dot(current.fxprime, current.fxprime);
      const betaK = Math.max(0, dot(yk, next.fxprime) / deltaK);

      weightedSum(pk, betaK, pk, -1, next.fxprime);

      temp = current;
      current = next;
      next = temp;
    }

    if (norm2(current.fxprime) <= 1e-5) break;
  }

  return current;
}
