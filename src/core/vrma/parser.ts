/**
 * .vrma → AnimationDocument.
 *
 * Structural problems (bad glb container, missing extension, missing hips,
 * broken accessors, non-ascending keyframe times) throw VrmaFileError with a
 * user-facing message. Recoverable oddities (channels on unmapped nodes,
 * CUBICSPLINE conversion, unknown bone names) are reported as warnings and
 * the parse continues — per the validator checklist in CLAUDE.md A.6.
 */

import { VrmaFileError } from './errors';
import { parseGlb, readFloatAccessor } from './glb';
import type { GltfAnimationSampler, GltfJson, VrmaHumanBoneRef } from './gltf';
import { VRMA_EXTENSION_NAME } from './gltf';
import type {
  AnimationDocument,
  BoneTrack,
  Interpolation,
  Keyframes,
  Quat,
  SkeletonNode,
  Vec3,
  VrmBoneName,
} from './types';
import { isVrmBoneName } from './types';

export interface ParseWarning {
  code: string;
  message: string;
}

export interface ParseResult {
  document: AnimationDocument;
  warnings: ParseWarning[];
}

type NodeBinding =
  | { kind: 'bone'; bone: VrmBoneName }
  | { kind: 'expression'; name: string }
  | { kind: 'lookAt' };

export function parseVrma(bytes: Uint8Array): ParseResult {
  const warnings: ParseWarning[] = [];
  const warn = (code: string, message: string): void => {
    warnings.push({ code, message });
  };

  const { json: jsonText, bin } = parseGlb(bytes);
  const json = decodeGltfJson(jsonText);

  const ext = json.extensions?.VRMC_vrm_animation;
  if (!ext) {
    throw new VrmaFileError(
      `This file is missing the VRM animation extension (${VRMA_EXTENSION_NAME}). It may be a plain glTF/GLB model rather than a VRM animation.`,
    );
  }
  const humanBonesJson = ext.humanoid?.humanBones;
  if (!humanBonesJson || typeof humanBonesJson !== 'object') {
    throw new VrmaFileError(
      `This file is missing the humanoid bone map (${VRMA_EXTENSION_NAME}.humanoid). It may have been exported incorrectly.`,
    );
  }

  let specVersion = '1.0';
  if (typeof ext.specVersion === 'string') {
    specVersion = ext.specVersion;
    if (specVersion !== '1.0') {
      warn(
        'spec-version',
        `This file declares VRM animation spec version "${specVersion}" (expected "1.0"). Reading it anyway.`,
      );
    }
  } else {
    warn('missing-spec-version', 'This file does not declare a specVersion; assuming "1.0".');
  }

  // --- skeleton (rest pose + hierarchy) -----------------------------------
  const gltfNodes = json.nodes ?? [];
  const skeleton: SkeletonNode[] = gltfNodes.map((node) => {
    const entry: SkeletonNode = {
      parent: -1,
      translation: toVec3(node.translation, [0, 0, 0]),
      rotation: toQuat(node.rotation, [0, 0, 0, 1]),
      scale: toVec3(node.scale, [1, 1, 1]),
    };
    if (typeof node.name === 'string') entry.name = node.name;
    return entry;
  });
  gltfNodes.forEach((node, index) => {
    if (node.matrix !== undefined) {
      warn(
        'node-matrix',
        `Node ${index} uses a "matrix" transform, which animated glTF nodes must not — its rest pose is treated as identity.`,
      );
    }
    for (const child of node.children ?? []) {
      const target = skeleton[child];
      if (target) target.parent = index;
    }
  });

  // --- extension node maps -------------------------------------------------
  const binding = new Map<number, NodeBinding>();
  const bindNode = (node: number, entry: NodeBinding, label: string): boolean => {
    const existing = binding.get(node);
    if (existing) {
      warn(
        'duplicate-node-binding',
        `${label} points at node ${node}, which is already mapped as ${describeBinding(existing)} — the ${label} entry is ignored.`,
      );
      return false;
    }
    binding.set(node, entry);
    return true;
  };
  const nodeRef = (value: VrmaHumanBoneRef | undefined): number | undefined =>
    value && typeof value.node === 'number' ? value.node : undefined;
  const checkNodeExists = (node: number, label: string): void => {
    if (!Number.isInteger(node) || node < 0 || node >= skeleton.length) {
      throw new VrmaFileError(
        `${label} points to node ${node}, which does not exist (the file has ${skeleton.length} nodes).`,
      );
    }
  };

  const bones = new Map<VrmBoneName, number>();
  for (const [name, ref] of Object.entries(humanBonesJson)) {
    const node = nodeRef(ref);
    if (node === undefined) {
      warn('bad-bone-entry', `The humanoid bone "${name}" has no node index and was ignored.`);
      continue;
    }
    checkNodeExists(node, `The humanoid bone "${name}"`);
    if (!isVrmBoneName(name)) {
      warn(
        'unknown-bone',
        `"${name}" is not a VRM humanoid bone name — the entry was ignored. (VRM 0.x exports use slightly different names; auto-repair will handle this later.)`,
      );
      continue;
    }
    if (bindNode(node, { kind: 'bone', bone: name }, `The humanoid bone "${name}"`)) {
      bones.set(name, node);
    }
  }
  if (!bones.has('hips')) {
    throw new VrmaFileError(
      `This file is missing the required "hips" bone mapping (${VRMA_EXTENSION_NAME}.humanoid.humanBones.hips). It may have been exported incorrectly.`,
    );
  }

  const presetExpressions = new Map<string, number>();
  const customExpressions = new Map<string, number>();
  const readExpressionGroup = (
    group: Partial<Record<string, VrmaHumanBoneRef>> | undefined,
    into: Map<string, number>,
    label: string,
  ): void => {
    if (!group || typeof group !== 'object') return;
    for (const [name, ref] of Object.entries(group)) {
      const node = nodeRef(ref);
      if (node === undefined) {
        warn('bad-expression-entry', `The ${label} expression "${name}" has no node index and was ignored.`);
        continue;
      }
      checkNodeExists(node, `The ${label} expression "${name}"`);
      if (bindNode(node, { kind: 'expression', name }, `The ${label} expression "${name}"`)) {
        into.set(name, node);
      }
    }
  };
  readExpressionGroup(ext.expressions?.preset, presetExpressions, 'preset');
  readExpressionGroup(ext.expressions?.custom, customExpressions, 'custom');

  let lookAtNode: number | undefined;
  {
    const node = nodeRef(ext.lookAt);
    if (node !== undefined) {
      checkNodeExists(node, 'The lookAt mapping');
      if (bindNode(node, { kind: 'lookAt' }, 'The lookAt mapping')) {
        lookAtNode = node;
      }
    }
  }

  // --- animation channels ---------------------------------------------------
  const animations = json.animations ?? [];
  const animation = animations[0];
  if (!animation || !Array.isArray(animation.channels) || animation.channels.length === 0) {
    throw new VrmaFileError('This file contains no animation data.');
  }
  if (animations.length > 1) {
    warn(
      'multiple-animations',
      `This file contains ${animations.length} animations; only the first one is loaded.`,
    );
  }

  const boneTracks = new Map<VrmBoneName, BoneTrack>();
  const expressionTracks = new Map<string, Keyframes<number>>();
  let lookAtTrack: Keyframes<Vec3> | undefined;
  const seenInterpolations = new Set<string>();

  animation.channels.forEach((channel, channelIndex) => {
    const label = `Channel ${channelIndex}`;
    const targetNode = channel.target?.node;
    const path = channel.target?.path;
    if (typeof targetNode !== 'number') {
      warn('channel-no-target', `${label} has no target node and was ignored.`);
      return;
    }
    if (path !== 'rotation' && path !== 'translation') {
      warn(
        'unsupported-path',
        `${label} animates "${String(path)}", which VRM animations do not use — it was ignored.`,
      );
      return;
    }
    const bound = binding.get(targetNode);
    if (!bound) {
      warn(
        'unmapped-channel',
        `${label} animates node ${targetNode}${nodeName(skeleton, targetNode)}, which is not referenced by the VRM animation extension — it was ignored.`,
      );
      return;
    }

    // Decide the expected value shape before touching the buffer.
    let components: 3 | 4;
    if (bound.kind === 'bone' && path === 'rotation') {
      components = 4;
    } else if (bound.kind === 'bone') {
      if (bound.bone !== 'hips') {
        warn(
          'non-hips-translation',
          `${label} animates the translation of "${bound.bone}". Only hips translation is meaningful in VRM animations — it was ignored.`,
        );
        return;
      }
      components = 3;
    } else if (path === 'translation') {
      components = 3;
    } else {
      warn(
        'unsupported-path',
        `${label} animates the rotation of ${describeBinding(bound)}, which VRM animations do not use — it was ignored.`,
      );
      return;
    }

    const sampler = animation.samplers?.[channel.sampler];
    if (!sampler) {
      warn('bad-sampler', `${label} references sampler ${channel.sampler}, which does not exist — it was ignored.`);
      return;
    }

    const curve = readCurve(json, bin, sampler, components, label, warn, seenInterpolations);

    if (bound.kind === 'bone' && path === 'rotation') {
      const track = getOrCreateBoneTrack(boneTracks, bound.bone);
      if (track.rotation) {
        warn('duplicate-channel', `${label} re-animates the rotation of "${bound.bone}" — the earlier channel is replaced.`);
      }
      track.rotation = { times: curve.times, values: groupQuats(curve.flat), interpolation: curve.interpolation };
    } else if (bound.kind === 'bone') {
      const track = getOrCreateBoneTrack(boneTracks, bound.bone);
      if (track.translation) {
        warn('duplicate-channel', `${label} re-animates the translation of "${bound.bone}" — the earlier channel is replaced.`);
      }
      track.translation = { times: curve.times, values: groupVec3s(curve.flat), interpolation: curve.interpolation };
    } else if (bound.kind === 'expression') {
      if (expressionTracks.has(bound.name)) {
        warn('duplicate-channel', `${label} re-animates the expression "${bound.name}" — the earlier channel is replaced.`);
      }
      // Expression weight is the X coordinate of the node's translation.
      expressionTracks.set(bound.name, {
        times: curve.times,
        values: groupWeights(curve.flat),
        interpolation: curve.interpolation,
      });
    } else {
      if (lookAtTrack) {
        warn('duplicate-channel', `${label} re-animates the look-at target — the earlier channel is replaced.`);
      }
      lookAtTrack = { times: curve.times, values: groupVec3s(curve.flat), interpolation: curve.interpolation };
    }
  });

  // --- assemble -------------------------------------------------------------
  let duration = 0;
  const bumpDuration = (kf: Keyframes<unknown> | undefined): void => {
    if (kf && kf.times.length > 0) {
      duration = Math.max(duration, kf.times[kf.times.length - 1]);
    }
  };
  for (const track of boneTracks.values()) {
    bumpDuration(track.rotation);
    bumpDuration(track.translation);
  }
  for (const track of expressionTracks.values()) bumpDuration(track);
  bumpDuration(lookAtTrack);

  const document: AnimationDocument = {
    duration,
    boneTracks,
    expressionTracks,
    skeleton,
    nodeMaps: {
      bones,
      presetExpressions,
      customExpressions,
    },
    metadata: {
      specVersion,
      sourceInterpolation: [...seenInterpolations].join(',') || 'LINEAR',
    },
  };
  if (lookAtTrack) document.lookAtTrack = lookAtTrack;
  if (lookAtNode !== undefined) document.nodeMaps.lookAt = lookAtNode;
  if (typeof animation.name === 'string') document.metadata.animationName = animation.name;

  return { document, warnings };
}

// --- helpers ----------------------------------------------------------------

function decodeGltfJson(jsonText: string): GltfJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new VrmaFileError('The JSON chunk of this file is not valid JSON — the file is corrupted.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new VrmaFileError('The JSON chunk of this file is not a glTF object — the file is corrupted.');
  }
  const json = parsed as GltfJson;
  if (typeof json.asset?.version !== 'string') {
    throw new VrmaFileError('This file is missing the glTF asset.version field — it is not a valid glTF file.');
  }
  return json;
}

interface Curve {
  times: number[];
  flat: Float32Array;
  interpolation: Interpolation;
}

function readCurve(
  json: GltfJson,
  bin: Uint8Array,
  sampler: GltfAnimationSampler,
  components: 3 | 4,
  label: string,
  warn: (code: string, message: string) => void,
  seenInterpolations: Set<string>,
): Curve {
  const timesF32 = readFloatAccessor(json, bin, sampler.input, 'SCALAR');
  const times = Array.from(timesF32);
  for (let i = 1; i < times.length; i++) {
    if (times[i] <= times[i - 1]) {
      throw new VrmaFileError(
        `${label}: keyframe times must be strictly increasing, but keyframe ${i} (${times[i]}s) does not come after keyframe ${i - 1} (${times[i - 1]}s).`,
      );
    }
  }

  const sourceInterpolation = sampler.interpolation ?? 'LINEAR';
  seenInterpolations.add(sourceInterpolation);

  const type = components === 4 ? 'VEC4' : 'VEC3';
  let flat = readFloatAccessor(json, bin, sampler.output, type);
  let interpolation: Interpolation;

  if (sourceInterpolation === 'CUBICSPLINE') {
    if (flat.length !== times.length * components * 3) {
      throw new VrmaFileError(
        `${label}: CUBICSPLINE data should hold ${times.length * 3} elements (3 per keyframe) but holds ${flat.length / components}.`,
      );
    }
    flat = extractCubicSplineValues(flat, components);
    interpolation = 'LINEAR';
    warn(
      'cubicspline-converted',
      `${label} uses CUBICSPLINE interpolation. Its tangents were discarded and the curve now plays back linearly.`,
    );
  } else {
    if (sourceInterpolation === 'STEP') {
      interpolation = 'STEP';
    } else {
      if (sourceInterpolation !== 'LINEAR') {
        warn(
          'unknown-interpolation',
          `${label} uses unknown interpolation "${sourceInterpolation}" — treated as LINEAR.`,
        );
      }
      interpolation = 'LINEAR';
    }
    if (flat.length !== times.length * components) {
      throw new VrmaFileError(
        `${label} has ${times.length} keyframe times but ${flat.length / components} values.`,
      );
    }
  }
  return { times, flat, interpolation };
}

/** For CUBICSPLINE output data, keep only the value element of each (in-tangent, value, out-tangent) triple. */
function extractCubicSplineValues(flat: Float32Array, components: number): Float32Array {
  const frames = flat.length / (components * 3);
  const out = new Float32Array(frames * components);
  for (let frame = 0; frame < frames; frame++) {
    for (let c = 0; c < components; c++) {
      out[frame * components + c] = flat[(frame * 3 + 1) * components + c];
    }
  }
  return out;
}

function getOrCreateBoneTrack(tracks: Map<VrmBoneName, BoneTrack>, bone: VrmBoneName): BoneTrack {
  let track = tracks.get(bone);
  if (!track) {
    track = {};
    tracks.set(bone, track);
  }
  return track;
}

function groupQuats(flat: Float32Array): Quat[] {
  const out: Quat[] = [];
  for (let i = 0; i + 3 < flat.length; i += 4) {
    out.push([flat[i], flat[i + 1], flat[i + 2], flat[i + 3]]);
  }
  return out;
}

function groupVec3s(flat: Float32Array): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) {
    out.push([flat[i], flat[i + 1], flat[i + 2]]);
  }
  return out;
}

/** Expression weight = translation.x; y and z are ignored per spec. */
function groupWeights(flat: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < flat.length; i += 3) {
    out.push(flat[i]);
  }
  return out;
}

function toVec3(value: readonly number[] | undefined, fallback: Vec3): Vec3 {
  if (value && value.length === 3 && value.every((v) => typeof v === 'number')) {
    return [value[0], value[1], value[2]];
  }
  return [...fallback];
}

function toQuat(value: readonly number[] | undefined, fallback: Quat): Quat {
  if (value && value.length === 4 && value.every((v) => typeof v === 'number')) {
    return [value[0], value[1], value[2], value[3]];
  }
  return [...fallback];
}

function describeBinding(entry: NodeBinding): string {
  switch (entry.kind) {
    case 'bone':
      return `the humanoid bone "${entry.bone}"`;
    case 'expression':
      return `the expression "${entry.name}"`;
    case 'lookAt':
      return 'the look-at target';
  }
}

function nodeName(skeleton: SkeletonNode[], index: number): string {
  const name = skeleton[index]?.name;
  return name ? ` ("${name}")` : '';
}
