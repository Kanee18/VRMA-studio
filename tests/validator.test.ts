import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildGlb, parseGlb } from '../src/core/vrma/glb';
import { validateVrma } from '../src/core/vrma/validator';
import { parseVrma } from '../src/core/vrma/parser';
import { writeVrma } from '../src/core/vrma/writer';
import type { GltfJson } from '../src/core/vrma/gltf';

const FIXTURE_URL = new URL('./fixtures/minimal.vrma', import.meta.url);
const fixtureBytes = () => new Uint8Array(readFileSync(FIXTURE_URL));

/** Rebuild the fixture with its JSON and/or BIN mutated. */
const mutate = (
  editJson?: (json: GltfJson) => void,
  editBin?: (bin: Uint8Array) => void,
): Uint8Array => {
  const { json: jsonText, bin } = parseGlb(fixtureBytes());
  const json = JSON.parse(jsonText) as GltfJson;
  editJson?.(json);
  editBin?.(bin);
  return buildGlb(JSON.stringify(json), bin);
};

const codes = (bytes: Uint8Array, severity?: 'error' | 'warning') =>
  validateVrma(bytes)
    .issues.filter((issue) => !severity || issue.severity === severity)
    .map((issue) => issue.code);

describe('validateVrma', () => {
  it('passes the pristine fixture with no issues', () => {
    const report = validateVrma(fixtureBytes());
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('passes writer output with no issues', () => {
    const { document } = parseVrma(fixtureBytes());
    const report = validateVrma(writeVrma(document));
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('reports a broken container as an error', () => {
    const report = validateVrma(new Uint8Array([1, 2, 3]));
    expect(report.ok).toBe(false);
    expect(report.issues[0]?.code).toBe('glb-container');
  });

  it('reports a missing extension as an error', () => {
    const bytes = mutate((json) => {
      delete json.extensions;
    });
    expect(codes(bytes, 'error')).toContain('missing-extension');
  });

  it('reports missing hips as an error', () => {
    const bytes = mutate((json) => {
      delete json.extensions?.VRMC_vrm_animation?.humanoid.humanBones['hips'];
    });
    expect(codes(bytes, 'error')).toContain('missing-hips');
  });

  it('reports a bone pointing at a nonexistent node as an error (A.6 #3)', () => {
    const bytes = mutate((json) => {
      json.extensions!.VRMC_vrm_animation!.humanoid.humanBones['spine'] = { node: 99 };
    });
    expect(codes(bytes, 'error')).toContain('bad-node-ref');
  });

  it('reports non-ascending keyframe times as an error (A.6 #4)', () => {
    const bytes = mutate(undefined, (bin) => {
      // times live at BIN offset 0: [0, 1] → [0, 0]
      new DataView(bin.buffer, bin.byteOffset).setFloat32(4, 0, true);
    });
    expect(codes(bytes, 'error')).toContain('non-ascending-times');
  });

  it('reports min/max that disagree with the data as a warning (A.6 #4)', () => {
    const bytes = mutate((json) => {
      json.accessors![0]!.max = [5];
    });
    const report = validateVrma(bytes);
    expect(report.ok).toBe(true); // repairable → warning, not error
    expect(codes(bytes, 'warning')).toContain('minmax-mismatch');
  });

  it('reports channels on unmapped nodes as a warning, not an error (A.6 #5)', () => {
    const bytes = mutate((json) => {
      json.nodes!.push({ name: 'stray' });
      json.animations![0]!.channels.push({ sampler: 0, target: { node: 1, path: 'rotation' } });
    });
    const report = validateVrma(bytes);
    expect(report.ok).toBe(true);
    expect(codes(bytes, 'warning')).toContain('unmapped-channel');
  });

  it('reports non-unit quaternions as a repairable warning (A.6 #6)', () => {
    const bytes = mutate(undefined, (bin) => {
      // First quat starts at BIN offset 8; scale it to length 2.
      const view = new DataView(bin.buffer, bin.byteOffset);
      view.setFloat32(8 + 12, 2, true); // w: 1 → 2
    });
    const report = validateVrma(bytes);
    expect(report.ok).toBe(true);
    expect(codes(bytes, 'warning')).toContain('non-unit-quaternion');
  });

  it('collects multiple issues in one pass', () => {
    const bytes = mutate((json) => {
      const ext = json.extensions!.VRMC_vrm_animation!;
      delete ext.humanoid.humanBones['hips'];
      delete (ext as { specVersion?: string }).specVersion;
      json.accessors![0]!.max = [5];
    });
    const report = validateVrma(bytes);
    expect(report.ok).toBe(false);
    const all = report.issues.map((issue) => issue.code);
    expect(all).toContain('missing-hips');
    expect(all).toContain('spec-version');
    expect(all).toContain('minmax-mismatch');
  });
});
