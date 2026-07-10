/**
 * Concatenate two animations: B's keyframes are shifted by A's duration.
 *
 * MVP scope: plain concatenation only — this is what joins the surviving
 * segments after split/delete edits. Crossfade blending is Phase 2.
 * Both documents are assumed to share a skeleton (true for segments cut from
 * one source file); the skeleton and node maps are taken from A.
 */

import type {
  AnimationDocument,
  BoneTrack,
  Keyframes,
  VrmBoneName,
} from '../vrma/types';

/** Jump cuts can put two keys at the same instant; nudge the later one. */
const JOIN_EPS = 1e-5;

function concatKeyframes<T>(
  a: Keyframes<T> | undefined,
  b: Keyframes<T> | undefined,
  offset: number,
): Keyframes<T> | undefined {
  if (!a && !b) return undefined;
  const times: number[] = [];
  const values: T[] = [];
  if (a) {
    times.push(...a.times);
    values.push(...a.values);
  }
  if (b) {
    for (let i = 0; i < b.times.length; i++) {
      let time = b.times[i] + offset;
      const previous = times[times.length - 1];
      if (previous !== undefined && time <= previous) time = previous + JOIN_EPS;
      times.push(time);
      values.push(b.values[i]);
    }
  }
  const interpolation = a?.interpolation ?? b?.interpolation ?? 'LINEAR';
  return { times, values, interpolation };
}

export function concatDocuments(a: AnimationDocument, b: AnimationDocument): AnimationDocument {
  const offset = a.duration;

  const boneTracks = new Map<VrmBoneName, BoneTrack>();
  const boneNames = new Set<VrmBoneName>([...a.boneTracks.keys(), ...b.boneTracks.keys()]);
  for (const bone of boneNames) {
    const trackA = a.boneTracks.get(bone);
    const trackB = b.boneTracks.get(bone);
    const joined: BoneTrack = {};
    const rotation = concatKeyframes(trackA?.rotation, trackB?.rotation, offset);
    const translation = concatKeyframes(trackA?.translation, trackB?.translation, offset);
    if (rotation) joined.rotation = rotation;
    if (translation) joined.translation = translation;
    boneTracks.set(bone, joined);
  }

  const expressionTracks = new Map<string, Keyframes<number>>();
  const expressionNames = new Set<string>([...a.expressionTracks.keys(), ...b.expressionTracks.keys()]);
  for (const name of expressionNames) {
    const joined = concatKeyframes(a.expressionTracks.get(name), b.expressionTracks.get(name), offset);
    if (joined) expressionTracks.set(name, joined);
  }

  const result: AnimationDocument = {
    duration: a.duration + b.duration,
    boneTracks,
    expressionTracks,
    skeleton: a.skeleton,
    nodeMaps: a.nodeMaps,
    metadata: { ...a.metadata },
  };
  const lookAt = concatKeyframes(a.lookAtTrack, b.lookAtTrack, offset);
  if (lookAt) result.lookAtTrack = lookAt;
  return result;
}
