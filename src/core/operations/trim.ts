/**
 * Trim: keep the range [t0, t1] of an animation, inserting interpolated
 * boundary keyframes at exactly t0 and t1, then re-time so the result starts
 * at 0 (CLAUDE.md A.5).
 */

import type {
  AnimationDocument,
  BoneTrack,
  Keyframes,
  Quat,
  Vec3,
  VrmBoneName,
} from '../vrma/types';
import { lerpScalar, lerpVec3, sampleKeyframes, slerpQuat, type Lerp } from './resample';

const BOUNDARY_EPS = 1e-6;
/** Anything shorter than this is considered an empty trim. */
export const MIN_TRIM_LENGTH = 1e-4;

export function trimKeyframes<T>(kf: Keyframes<T>, t0: number, t1: number, lerp: Lerp<T>): Keyframes<T> {
  const times: number[] = [0];
  const values: T[] = [sampleKeyframes(kf, t0, lerp)];
  for (let i = 0; i < kf.times.length; i++) {
    const time = kf.times[i];
    if (time > t0 + BOUNDARY_EPS && time < t1 - BOUNDARY_EPS) {
      times.push(time - t0);
      values.push(lerp(kf.values[i], kf.values[i], 0)); // fresh copy
    }
  }
  times.push(t1 - t0);
  values.push(sampleKeyframes(kf, t1, lerp));
  return { times, values, interpolation: kf.interpolation };
}

export function trimDocument(doc: AnimationDocument, t0raw: number, t1raw: number): AnimationDocument {
  const t0 = Math.max(0, Math.min(t0raw, doc.duration));
  const t1 = Math.max(0, Math.min(t1raw, doc.duration));
  if (t1 - t0 < MIN_TRIM_LENGTH) {
    throw new Error(`Trim range [${t0raw}, ${t1raw}] is empty.`);
  }

  const boneTracks = new Map<VrmBoneName, BoneTrack>();
  for (const [bone, track] of doc.boneTracks) {
    const trimmed: BoneTrack = {};
    if (track.rotation) trimmed.rotation = trimKeyframes<Quat>(track.rotation, t0, t1, slerpQuat);
    if (track.translation) trimmed.translation = trimKeyframes<Vec3>(track.translation, t0, t1, lerpVec3);
    boneTracks.set(bone, trimmed);
  }

  const expressionTracks = new Map<string, Keyframes<number>>();
  for (const [name, track] of doc.expressionTracks) {
    expressionTracks.set(name, trimKeyframes(track, t0, t1, lerpScalar));
  }

  const result: AnimationDocument = {
    duration: t1 - t0,
    boneTracks,
    expressionTracks,
    skeleton: doc.skeleton.map((node) => ({
      ...node,
      translation: [...node.translation],
      rotation: [...node.rotation],
      scale: [...node.scale],
    })),
    nodeMaps: {
      bones: new Map(doc.nodeMaps.bones),
      presetExpressions: new Map(doc.nodeMaps.presetExpressions),
      customExpressions: new Map(doc.nodeMaps.customExpressions),
      ...(doc.nodeMaps.lookAt !== undefined ? { lookAt: doc.nodeMaps.lookAt } : {}),
    },
    metadata: { ...doc.metadata },
  };
  if (doc.lookAtTrack) result.lookAtTrack = trimKeyframes(doc.lookAtTrack, t0, t1, lerpVec3);
  return result;
}
