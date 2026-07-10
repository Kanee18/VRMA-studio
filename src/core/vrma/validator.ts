/**
 * Spec-compliance validation with a human-readable report (CLAUDE.md A.6).
 *
 * Unlike the parser — which throws on the first structural problem — the
 * validator collects every issue it can find and classifies each as:
 *   - error:   structural; the file cannot be safely used/exported
 *   - warning: tolerated on load, or auto-repairable (normalization etc.)
 *
 * Used before export (the report is shown in the export dialog) and reusable
 * for the import report / future auto-repair.
 */

import { parseGlb, readFloatAccessor } from './glb';
import type { GltfJson, VrmaHumanBoneRef } from './gltf';
import { VRMA_EXTENSION_NAME } from './gltf';
import { isVrmBoneName } from './types';

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
}

export interface ValidationReport {
  /** True when there are no errors (warnings allowed). */
  ok: boolean;
  issues: ValidationIssue[];
}

export function validateVrma(bytes: Uint8Array): ValidationReport {
  const issues: ValidationIssue[] = [];
  const error = (code: string, message: string) => issues.push({ severity: 'error', code, message });
  const warning = (code: string, message: string) => issues.push({ severity: 'warning', code, message });
  const report = (): ValidationReport => ({
    ok: !issues.some((issue) => issue.severity === 'error'),
    issues,
  });

  // 1. glb container: magic/version/length consistency, chunk alignment.
  let jsonText: string;
  let bin: Uint8Array;
  try {
    const chunks = parseGlb(bytes);
    jsonText = chunks.json;
    bin = chunks.bin;
  } catch (cause) {
    error('glb-container', cause instanceof Error ? cause.message : String(cause));
    return report();
  }

  let json: GltfJson;
  try {
    json = JSON.parse(jsonText) as GltfJson;
  } catch {
    error('json-chunk', 'The JSON chunk of this file is not valid JSON — the file is corrupted.');
    return report();
  }
  if (typeof json?.asset?.version !== 'string') {
    error('gltf-asset', 'This file is missing the glTF asset.version field — it is not a valid glTF file.');
  }

  // 2. Extension present with specVersion and humanoid.humanBones.hips.
  const ext = json.extensions?.VRMC_vrm_animation;
  if (!ext) {
    error(
      'missing-extension',
      `This file is missing the VRM animation extension (${VRMA_EXTENSION_NAME}). It may be a plain glTF/GLB model rather than a VRM animation.`,
    );
    return report();
  }
  if (typeof ext.specVersion !== 'string') {
    warning('spec-version', 'The extension does not declare a specVersion (expected "1.0").');
  } else if (ext.specVersion !== '1.0') {
    warning('spec-version', `The extension declares specVersion "${ext.specVersion}" (expected "1.0").`);
  }

  const nodeCount = json.nodes?.length ?? 0;
  const mappedNodes = new Set<number>();
  const nodeRef = (value: VrmaHumanBoneRef | undefined): number | undefined =>
    value && typeof value.node === 'number' ? value.node : undefined;
  const checkRef = (node: number | undefined, label: string): boolean => {
    if (node === undefined) {
      warning('missing-node-ref', `${label} has no node index.`);
      return false;
    }
    if (!Number.isInteger(node) || node < 0 || node >= nodeCount) {
      // A.6 #3: every extension entry must point to an existing node.
      error('bad-node-ref', `${label} points to node ${node}, which does not exist (the file has ${nodeCount} nodes).`);
      return false;
    }
    mappedNodes.add(node);
    return true;
  };

  const humanBones = ext.humanoid?.humanBones;
  if (!humanBones || typeof humanBones !== 'object') {
    error(
      'missing-humanoid',
      `This file is missing the humanoid bone map (${VRMA_EXTENSION_NAME}.humanoid). It may have been exported incorrectly.`,
    );
  } else {
    if (nodeRef(humanBones['hips']) === undefined) {
      error(
        'missing-hips',
        'The humanoid bone map is missing the required "hips" bone. It may have been exported incorrectly.',
      );
    }
    for (const [name, ref] of Object.entries(humanBones)) {
      if (checkRef(nodeRef(ref), `The humanoid bone "${name}"`) && !isVrmBoneName(name)) {
        warning('unknown-bone', `"${name}" is not a VRM humanoid bone name (VRM 0.x naming? auto-repair can remap it).`);
      }
    }
  }
  for (const [groupName, group] of [
    ['preset', ext.expressions?.preset],
    ['custom', ext.expressions?.custom],
  ] as const) {
    if (!group || typeof group !== 'object') continue;
    for (const [name, ref] of Object.entries(group)) {
      checkRef(nodeRef(ref), `The ${groupName} expression "${name}"`);
    }
  }
  if (ext.lookAt !== undefined) checkRef(nodeRef(ext.lookAt), 'The lookAt mapping');

  // 3. Animation channels and samplers (A.6 #4–#6).
  const animation = json.animations?.[0];
  if (!animation || !Array.isArray(animation.channels) || animation.channels.length === 0) {
    error('no-animation', 'This file contains no animation data.');
    return report();
  }
  if ((json.animations?.length ?? 0) > 1) {
    warning('multiple-animations', `This file contains ${json.animations?.length} animations; only the first is used.`);
  }

  animation.channels.forEach((channel, index) => {
    const label = `Channel ${index}`;
    const path = channel.target?.path;
    const targetNode = channel.target?.node;

    if (typeof targetNode !== 'number') {
      warning('channel-no-target', `${label} has no target node.`);
      return;
    }
    if (!mappedNodes.has(targetNode)) {
      // A.6 #5: warn, don't fail.
      warning('unmapped-channel', `${label} animates node ${targetNode}, which is not referenced by the VRM animation extension.`);
    }
    if (path !== 'rotation' && path !== 'translation') {
      warning('unsupported-path', `${label} animates "${String(path)}", which VRM animations do not use.`);
      return;
    }

    const sampler = animation.samplers?.[channel.sampler];
    if (!sampler) {
      error('bad-sampler', `${label} references sampler ${channel.sampler}, which does not exist.`);
      return;
    }
    const interpolation = sampler.interpolation ?? 'LINEAR';

    // Input accessor: SCALAR float32, strictly ascending, honest min/max.
    let times: Float32Array;
    try {
      times = readFloatAccessor(json, bin, sampler.input, 'SCALAR');
    } catch (cause) {
      error('bad-input-accessor', `${label}: ${cause instanceof Error ? cause.message : String(cause)}`);
      return;
    }
    for (let i = 1; i < times.length; i++) {
      if (times[i] <= times[i - 1]) {
        error(
          'non-ascending-times',
          `${label}: keyframe times must be strictly increasing, but keyframe ${i} (${times[i]}s) does not come after keyframe ${i - 1} (${times[i - 1]}s).`,
        );
        break;
      }
    }
    checkMinMax(json, sampler.input, times, 1, label, warning);

    // Output accessor: matching count (×3 for CUBICSPLINE), expected shape.
    const expectedType = path === 'rotation' ? 'VEC4' : 'VEC3';
    let values: Float32Array;
    try {
      values = readFloatAccessor(json, bin, sampler.output, expectedType);
    } catch (cause) {
      error('bad-output-accessor', `${label}: ${cause instanceof Error ? cause.message : String(cause)}`);
      return;
    }
    const components = expectedType === 'VEC4' ? 4 : 3;
    const expectedFrames = interpolation === 'CUBICSPLINE' ? times.length * 3 : times.length;
    if (values.length !== expectedFrames * components) {
      error(
        'count-mismatch',
        `${label} has ${times.length} keyframe times but ${values.length / components} values${
          interpolation === 'CUBICSPLINE' ? ' (CUBICSPLINE needs 3 per keyframe)' : ''
        }.`,
      );
      return;
    }
    checkMinMax(json, sampler.output, values, components, label, warning);

    // A.6 #6: rotation outputs should be unit quaternions (repairable).
    if (path === 'rotation' && interpolation !== 'CUBICSPLINE') {
      for (let i = 0; i < values.length; i += 4) {
        const length = Math.hypot(values[i], values[i + 1], values[i + 2], values[i + 3]);
        if (Math.abs(length - 1) > 1e-3) {
          warning(
            'non-unit-quaternion',
            `${label}: keyframe ${i / 4} holds a non-unit quaternion (length ${length.toFixed(4)}). Auto-repair can normalize it.`,
          );
          break;
        }
      }
    }
  });

  return report();
}

/** A.6 #4: declared accessor min/max should match the actual binary data. */
function checkMinMax(
  json: GltfJson,
  accessorIndex: number,
  data: Float32Array,
  components: number,
  label: string,
  warning: (code: string, message: string) => void,
): void {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || (!accessor.min && !accessor.max)) return;
  const TOLERANCE = 1e-5;
  for (let c = 0; c < components; c++) {
    let actualMin = Number.POSITIVE_INFINITY;
    let actualMax = Number.NEGATIVE_INFINITY;
    for (let i = c; i < data.length; i += components) {
      if (data[i] < actualMin) actualMin = data[i];
      if (data[i] > actualMax) actualMax = data[i];
    }
    const declaredMin = accessor.min?.[c];
    const declaredMax = accessor.max?.[c];
    if (
      (declaredMin !== undefined && Math.abs(declaredMin - actualMin) > TOLERANCE) ||
      (declaredMax !== undefined && Math.abs(declaredMax - actualMax) > TOLERANCE)
    ) {
      warning(
        'minmax-mismatch',
        `${label}: accessor ${accessorIndex} declares min/max that do not match its data. Auto-repair can recompute them.`,
      );
      return;
    }
  }
}
