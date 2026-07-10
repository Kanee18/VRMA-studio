/**
 * Keyframe sampling/interpolation utilities shared by the editing operations.
 * Quaternion hygiene per CLAUDE.md A.5: shortest-path slerp, normalize after
 * any interpolation.
 */

import type { Keyframes, Quat, Vec3 } from '../vrma/types';

export type Lerp<T> = (a: T, b: T, t: number) => T;

export const lerpScalar: Lerp<number> = (a, b, t) => a + (b - a) * t;

export const lerpVec3: Lerp<Vec3> = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const slerpQuat: Lerp<Quat> = (a, b, t) => {
  // Shortest path: negate one endpoint if the arc is the long way around.
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    dot = -dot;
  }

  let scaleA: number;
  let scaleB: number;
  if (dot > 0.9995) {
    // Nearly parallel: fall back to lerp to avoid division by ~0.
    scaleA = 1 - t;
    scaleB = t;
  } else {
    const theta = Math.acos(Math.min(1, dot));
    const sinTheta = Math.sin(theta);
    scaleA = Math.sin((1 - t) * theta) / sinTheta;
    scaleB = Math.sin(t * theta) / sinTheta;
  }

  const out: Quat = [
    scaleA * a[0] + scaleB * bx,
    scaleA * a[1] + scaleB * by,
    scaleA * a[2] + scaleB * bz,
    scaleA * a[3] + scaleB * bw,
  ];
  return normalizeQuat(out);
};

export function normalizeQuat(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (length === 0) return [0, 0, 0, 1];
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

/**
 * Evaluate a curve at an arbitrary time: clamped at the ends, STEP holds the
 * previous key, LINEAR interpolates. Always returns a fresh value (never a
 * reference into `kf.values`).
 */
export function sampleKeyframes<T>(kf: Keyframes<T>, time: number, lerp: Lerp<T>): T {
  const { times, values, interpolation } = kf;
  if (times.length === 0) throw new Error('Cannot sample an empty keyframe track.');
  if (time <= times[0]) return lerp(values[0], values[0], 0);
  const last = times.length - 1;
  if (time >= times[last]) return lerp(values[last], values[last], 0);

  let i = 1;
  while (times[i] < time) i++;
  if (interpolation === 'STEP') return lerp(values[i - 1], values[i - 1], 0);
  const t = (time - times[i - 1]) / (times[i] - times[i - 1]);
  return lerp(values[i - 1], values[i], t);
}
