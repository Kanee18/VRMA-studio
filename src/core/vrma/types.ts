/**
 * Pure domain types for VRM animations (the AnimationDocument model).
 *
 * This module must stay framework-free: no imports from React, Three.js,
 * Tauri, or the glTF layer. Operations in core/operations/ work exclusively
 * on these types and never touch raw buffers.
 */

export type Vec3 = [number, number, number];

/** Quaternion in glTF component order: x, y, z, w. */
export type Quat = [number, number, number, number];

/**
 * VRM 1.0 humanoid bone names (the keys allowed in
 * VRMC_vrm_animation.humanoid.humanBones).
 */
export const VRM_BONE_NAMES = [
  // torso & head
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftEye',
  'rightEye',
  'jaw',
  // legs
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
  // arms
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  // fingers
  'leftThumbMetacarpal',
  'leftThumbProximal',
  'leftThumbDistal',
  'leftIndexProximal',
  'leftIndexIntermediate',
  'leftIndexDistal',
  'leftMiddleProximal',
  'leftMiddleIntermediate',
  'leftMiddleDistal',
  'leftRingProximal',
  'leftRingIntermediate',
  'leftRingDistal',
  'leftLittleProximal',
  'leftLittleIntermediate',
  'leftLittleDistal',
  'rightThumbMetacarpal',
  'rightThumbProximal',
  'rightThumbDistal',
  'rightIndexProximal',
  'rightIndexIntermediate',
  'rightIndexDistal',
  'rightMiddleProximal',
  'rightMiddleIntermediate',
  'rightMiddleDistal',
  'rightRingProximal',
  'rightRingIntermediate',
  'rightRingDistal',
  'rightLittleProximal',
  'rightLittleIntermediate',
  'rightLittleDistal',
] as const;

export type VrmBoneName = (typeof VRM_BONE_NAMES)[number];

export function isVrmBoneName(name: string): name is VrmBoneName {
  return (VRM_BONE_NAMES as readonly string[]).includes(name);
}

/** VRM 1.0 preset expression names (everything else is a custom expression). */
export const VRM_PRESET_EXPRESSIONS = [
  'happy',
  'angry',
  'sad',
  'relaxed',
  'surprised',
  'aa',
  'ih',
  'ou',
  'ee',
  'oh',
  'blink',
  'blinkLeft',
  'blinkRight',
  'lookUp',
  'lookDown',
  'lookLeft',
  'lookRight',
  'neutral',
] as const;

export type Interpolation = 'LINEAR' | 'STEP';

/**
 * A keyframe curve. Invariants: times.length === values.length, times are
 * strictly ascending, and times are in seconds.
 */
export interface Keyframes<T> {
  times: number[];
  values: T[];
  interpolation: Interpolation;
}

export interface BoneTrack {
  rotation?: Keyframes<Quat>;
  /** Root motion. Per spec only meaningful on `hips`. */
  translation?: Keyframes<Vec3>;
}

/**
 * One node of the source file's rest pose, preserved through edits.
 *
 * Consumers (e.g. three-vrm-animation) use the hips node's rest-pose world
 * position to scale root motion onto the target avatar, so a functionally
 * identical round-trip must keep the node hierarchy and rest TRS intact.
 */
export interface SkeletonNode {
  name?: string;
  /** Index into AnimationDocument.skeleton, or -1 for scene roots. */
  parent: number;
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
}

/**
 * Which skeleton nodes the VRMC_vrm_animation extension maps. Kept separately
 * from the tracks because the extension typically maps every bone of the
 * source skeleton even when only a few are animated, and that mapping must
 * survive a round-trip.
 */
export interface VrmaNodeMaps {
  bones: Map<VrmBoneName, number>;
  presetExpressions: Map<string, number>;
  customExpressions: Map<string, number>;
  lookAt?: number;
}

export interface AnimationDocument {
  /** Max keyframe time across all tracks, in seconds. */
  duration: number;
  boneTracks: Map<VrmBoneName, BoneTrack>;
  /** Expression name → weight curve (weights 0..1). */
  expressionTracks: Map<string, Keyframes<number>>;
  lookAtTrack?: Keyframes<Vec3>;
  skeleton: SkeletonNode[];
  nodeMaps: VrmaNodeMaps;
  metadata: {
    specVersion: string;
    /**
     * Interpolation modes seen in the source file, comma-joined.
     * CUBICSPLINE is converted to LINEAR on import (see docs/format-notes.md).
     */
    sourceInterpolation: string;
    animationName?: string;
  };
}
