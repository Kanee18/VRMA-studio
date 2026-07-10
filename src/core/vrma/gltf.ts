/**
 * Minimal glTF 2.0 JSON typings — only the subset a .vrma file uses
 * (nodes, animations, accessors, buffer views, one binary buffer, and the
 * VRMC_vrm_animation extension).
 */

export const VRMA_EXTENSION_NAME = 'VRMC_vrm_animation';

/** glTF componentType for 32-bit float. */
export const GLTF_FLOAT = 5126;

export type GltfAccessorType = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT2' | 'MAT3' | 'MAT4';

export const COMPONENT_COUNT: Record<'SCALAR' | 'VEC3' | 'VEC4', number> = {
  SCALAR: 1,
  VEC3: 3,
  VEC4: 4,
};

export interface GltfNode {
  name?: string;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  matrix?: number[];
}

export interface GltfAnimationChannel {
  sampler: number;
  target: {
    node?: number;
    path: string;
  };
}

export interface GltfAnimationSampler {
  input: number;
  output: number;
  interpolation?: string;
}

export interface GltfAnimation {
  name?: string;
  channels: GltfAnimationChannel[];
  samplers: GltfAnimationSampler[];
}

export interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  normalized?: boolean;
  count: number;
  type: GltfAccessorType;
  min?: number[];
  max?: number[];
  sparse?: unknown;
}

export interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
}

export interface GltfBuffer {
  byteLength: number;
  uri?: string;
}

export interface VrmaHumanBoneRef {
  node: number;
}

export interface VrmaExtension {
  specVersion: string;
  humanoid: {
    humanBones: Partial<Record<string, VrmaHumanBoneRef>>;
  };
  expressions?: {
    preset?: Partial<Record<string, VrmaHumanBoneRef>>;
    custom?: Partial<Record<string, VrmaHumanBoneRef>>;
  };
  lookAt?: VrmaHumanBoneRef;
}

export interface GltfJson {
  asset: {
    version: string;
    generator?: string;
  };
  scene?: number;
  scenes?: { nodes?: number[]; name?: string }[];
  nodes?: GltfNode[];
  animations?: GltfAnimation[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  buffers?: GltfBuffer[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  extensions?: {
    VRMC_vrm_animation?: VrmaExtension;
    [name: string]: unknown;
  };
}
