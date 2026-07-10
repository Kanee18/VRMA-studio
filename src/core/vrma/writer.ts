/**
 * AnimationDocument → .vrma (glb).
 *
 * The writer regenerates everything — nodes, channels, samplers, accessors,
 * and the BIN buffer — from the domain model. It never patches original file
 * bytes (CLAUDE.md A.4: full regeneration is simpler and safer).
 *
 * Guarantees:
 *  - output is a spec-valid glb (alignment/padding handled by glb.ts),
 *  - parse(write(doc)) is deep-equal to doc for parser-produced documents,
 *  - write(parse(write(doc))) is byte-identical to write(doc).
 */

import { BufferBuilder, buildGlb } from './glb';
import type {
  GltfAccessor,
  GltfAnimationChannel,
  GltfAnimationSampler,
  GltfBufferView,
  GltfJson,
  GltfNode,
  VrmaExtension,
  VrmaHumanBoneRef,
} from './gltf';
import { COMPONENT_COUNT, GLTF_FLOAT, VRMA_EXTENSION_NAME } from './gltf';
import type { AnimationDocument, Interpolation, Quat, Vec3, VrmBoneName } from './types';
import { VRM_PRESET_EXPRESSIONS } from './types';

export function writeVrma(doc: AnimationDocument): Uint8Array {
  // --- nodes (rest pose from the skeleton, plus any nodes we must invent) ---
  const skeleton = doc.skeleton;
  const childrenOf: number[][] = skeleton.map(() => []);
  skeleton.forEach((entry, index) => {
    const parent = entry.parent;
    if (parent >= 0 && parent < skeleton.length && parent !== index) {
      childrenOf[parent].push(index);
    }
  });

  const nodes: GltfNode[] = [];
  const roots: number[] = [];
  skeleton.forEach((entry, index) => {
    const node: GltfNode = {};
    if (entry.name !== undefined) node.name = entry.name;
    if (childrenOf[index].length > 0) node.children = [...childrenOf[index]];
    if (!vecEquals(entry.translation, [0, 0, 0])) node.translation = [...entry.translation];
    if (!vecEquals(entry.rotation, [0, 0, 0, 1])) node.rotation = [...entry.rotation];
    if (!vecEquals(entry.scale, [1, 1, 1])) node.scale = [...entry.scale];
    nodes.push(node);
    if (entry.parent < 0 || entry.parent >= skeleton.length) roots.push(index);
  });

  const addSyntheticNode = (name: string): number => {
    nodes.push({ name });
    const index = nodes.length - 1;
    roots.push(index);
    return index;
  };
  const checkMappedNode = (node: number, label: string): number => {
    if (!Number.isInteger(node) || node < 0 || node >= nodes.length) {
      throw new Error(`writeVrma: ${label} maps to node ${node}, which is outside the skeleton (${nodes.length} nodes).`);
    }
    return node;
  };

  // Copy the node maps so tracks that have no mapping yet (e.g. added by a
  // future merge operation) get a synthesized node without mutating the input.
  const boneNodes = new Map<VrmBoneName, number>();
  for (const [bone, node] of doc.nodeMaps.bones) {
    boneNodes.set(bone, checkMappedNode(node, `bone "${bone}"`));
  }
  for (const bone of doc.boneTracks.keys()) {
    if (!boneNodes.has(bone)) boneNodes.set(bone, addSyntheticNode(bone));
  }

  const presetNodes = new Map<string, number>();
  for (const [name, node] of doc.nodeMaps.presetExpressions) {
    presetNodes.set(name, checkMappedNode(node, `preset expression "${name}"`));
  }
  const customNodes = new Map<string, number>();
  for (const [name, node] of doc.nodeMaps.customExpressions) {
    customNodes.set(name, checkMappedNode(node, `custom expression "${name}"`));
  }
  for (const name of doc.expressionTracks.keys()) {
    if (presetNodes.has(name) || customNodes.has(name)) continue;
    const isPreset = (VRM_PRESET_EXPRESSIONS as readonly string[]).includes(name);
    (isPreset ? presetNodes : customNodes).set(name, addSyntheticNode(name));
  }

  let lookAtNode = doc.nodeMaps.lookAt;
  if (lookAtNode !== undefined) {
    lookAtNode = checkMappedNode(lookAtNode, 'lookAt');
  } else if (doc.lookAtTrack) {
    lookAtNode = addSyntheticNode('lookAt');
  }

  // --- animation data (accessors, buffer views, BIN buffer) -----------------
  const builder = new BufferBuilder();
  const accessors: GltfAccessor[] = [];
  const bufferViews: GltfBufferView[] = [];
  const samplers: GltfAnimationSampler[] = [];
  const channels: GltfAnimationChannel[] = [];

  const addAccessor = (data: Float32Array, type: 'SCALAR' | 'VEC3' | 'VEC4'): number => {
    const components = COMPONENT_COUNT[type];
    const { byteOffset, byteLength } = builder.pushFloat32(data);
    bufferViews.push({ buffer: 0, byteOffset, byteLength });
    const min = new Array<number>(components).fill(Number.POSITIVE_INFINITY);
    const max = new Array<number>(components).fill(Number.NEGATIVE_INFINITY);
    for (let i = 0; i < data.length; i++) {
      const c = i % components;
      if (data[i] < min[c]) min[c] = data[i];
      if (data[i] > max[c]) max[c] = data[i];
    }
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: GLTF_FLOAT,
      count: data.length / components,
      type,
      min,
      max,
    });
    return accessors.length - 1;
  };

  const addTrack = (
    node: number,
    path: 'rotation' | 'translation',
    times: number[],
    flatValues: Float32Array,
    type: 'VEC3' | 'VEC4',
    interpolation: Interpolation,
  ): void => {
    if (times.length === 0) return;
    if (flatValues.length !== times.length * COMPONENT_COUNT[type]) {
      throw new Error(
        `writeVrma: track for node ${node}/${path} has ${times.length} times but ${flatValues.length / COMPONENT_COUNT[type]} values.`,
      );
    }
    const input = addAccessor(new Float32Array(times), 'SCALAR');
    const output = addAccessor(flatValues, type);
    samplers.push({ input, output, interpolation });
    channels.push({ sampler: samplers.length - 1, target: { node, path } });
  };

  for (const [bone, track] of doc.boneTracks) {
    const node = boneNodes.get(bone);
    if (node === undefined) continue; // unreachable — map was just filled
    if (track.rotation) {
      addTrack(node, 'rotation', track.rotation.times, flattenQuats(track.rotation.values), 'VEC4', track.rotation.interpolation);
    }
    // Translation is only meaningful on hips; anything else is dropped to keep
    // the output spec-clean (the parser never produces such tracks anyway).
    if (track.translation && bone === 'hips') {
      addTrack(node, 'translation', track.translation.times, flattenVec3s(track.translation.values), 'VEC3', track.translation.interpolation);
    }
  }
  for (const [name, track] of doc.expressionTracks) {
    const node = presetNodes.get(name) ?? customNodes.get(name);
    if (node === undefined) continue; // unreachable — map was just filled
    addTrack(node, 'translation', track.times, weightsToTranslationX(track.values), 'VEC3', track.interpolation);
  }
  if (doc.lookAtTrack && lookAtNode !== undefined) {
    addTrack(lookAtNode, 'translation', doc.lookAtTrack.times, flattenVec3s(doc.lookAtTrack.values), 'VEC3', doc.lookAtTrack.interpolation);
  }

  // --- VRMC_vrm_animation extension -----------------------------------------
  const humanBones: Partial<Record<string, VrmaHumanBoneRef>> = {};
  for (const [bone, node] of boneNodes) humanBones[bone] = { node };

  const extension: VrmaExtension = {
    specVersion: doc.metadata.specVersion || '1.0',
    humanoid: { humanBones },
  };
  if (presetNodes.size > 0 || customNodes.size > 0) {
    extension.expressions = {
      ...(presetNodes.size > 0 ? { preset: mapToRecord(presetNodes) } : {}),
      ...(customNodes.size > 0 ? { custom: mapToRecord(customNodes) } : {}),
    };
  }
  if (lookAtNode !== undefined) extension.lookAt = { node: lookAtNode };

  // --- glTF JSON + glb container --------------------------------------------
  const bin = builder.build();
  const animationName = doc.metadata.animationName;
  const json: GltfJson = {
    asset: { version: '2.0', generator: 'VRMA Studio' },
    extensionsUsed: [VRMA_EXTENSION_NAME],
    extensions: { [VRMA_EXTENSION_NAME]: extension },
    ...(nodes.length > 0
      ? { scene: 0, scenes: [roots.length > 0 ? { nodes: roots } : {}], nodes }
      : {}),
    ...(channels.length > 0
      ? {
          animations: [
            {
              ...(animationName !== undefined ? { name: animationName } : {}),
              channels,
              samplers,
            },
          ],
        }
      : {}),
    ...(accessors.length > 0 ? { accessors, bufferViews } : {}),
    ...(bin.byteLength > 0 ? { buffers: [{ byteLength: bin.byteLength }] } : {}),
  };

  return buildGlb(JSON.stringify(json), bin);
}

// --- helpers ------------------------------------------------------------------

function flattenQuats(values: Quat[]): Float32Array {
  const out = new Float32Array(values.length * 4);
  values.forEach((q, i) => out.set(q, i * 4));
  return out;
}

function flattenVec3s(values: Vec3[]): Float32Array {
  const out = new Float32Array(values.length * 3);
  values.forEach((v, i) => out.set(v, i * 3));
  return out;
}

/** Expression weights are stored as the X coordinate of a translation. */
function weightsToTranslationX(weights: number[]): Float32Array {
  const out = new Float32Array(weights.length * 3);
  weights.forEach((w, i) => {
    out[i * 3] = w;
  });
  return out;
}

function vecEquals(value: readonly number[], expected: readonly number[]): boolean {
  return value.length === expected.length && value.every((v, i) => v === expected[i]);
}

function mapToRecord(map: Map<string, number>): Partial<Record<string, VrmaHumanBoneRef>> {
  const out: Partial<Record<string, VrmaHumanBoneRef>> = {};
  for (const [name, node] of map) out[name] = { node };
  return out;
}
