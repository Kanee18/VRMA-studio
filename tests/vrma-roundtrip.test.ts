import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { VrmaFileError } from '../src/core/vrma/errors';
import { buildGlb, parseGlb } from '../src/core/vrma/glb';
import { parseVrma } from '../src/core/vrma/parser';
import { writeVrma } from '../src/core/vrma/writer';
import type { GltfJson } from '../src/core/vrma/gltf';

const FIXTURE_URL = new URL('./fixtures/minimal.vrma', import.meta.url);
const fixtureBytes = () => new Uint8Array(readFileSync(FIXTURE_URL));

// 1/sqrt(2) as float32, exactly as stored in the fixture's BIN chunk.
const S = Math.fround(Math.SQRT1_2);

describe('parseVrma on minimal.vrma', () => {
  it('parses the fixture without warnings', () => {
    const { document, warnings } = parseVrma(fixtureBytes());

    expect(warnings).toEqual([]);
    expect(document.duration).toBe(1);
    expect(document.metadata.specVersion).toBe('1.0');
    expect(document.metadata.sourceInterpolation).toBe('LINEAR');
    expect(document.metadata.animationName).toBe('minimal');

    expect([...document.boneTracks.keys()]).toEqual(['hips']);
    const hips = document.boneTracks.get('hips');
    expect(hips).toBeDefined();
    expect(hips?.translation).toBeUndefined();
    expect(hips?.rotation?.interpolation).toBe('LINEAR');
    expect(hips?.rotation?.times).toEqual([0, 1]);
    expect(hips?.rotation?.values).toEqual([
      [0, 0, 0, 1],
      [0, S, 0, S],
    ]);

    expect(document.expressionTracks.size).toBe(0);
    expect(document.lookAtTrack).toBeUndefined();

    // Rest pose survives: hips node sits 1m up, at the scene root.
    expect(document.skeleton).toEqual([
      { name: 'hips', parent: -1, translation: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    ]);
    expect(document.nodeMaps.bones.get('hips')).toBe(0);
    expect(document.nodeMaps.presetExpressions.size).toBe(0);
    expect(document.nodeMaps.customExpressions.size).toBe(0);
    expect(document.nodeMaps.lookAt).toBeUndefined();
  });
});

describe('round-trip (parse → write → parse)', () => {
  it('produces a functionally identical AnimationDocument', () => {
    const first = parseVrma(fixtureBytes());
    const rewritten = writeVrma(first.document);
    const second = parseVrma(rewritten);

    expect(second.warnings).toEqual([]);
    expect(second.document).toEqual(first.document);
  });

  it('is write-stable: write(parse(write(doc))) is byte-identical to write(doc)', () => {
    const first = parseVrma(fixtureBytes());
    const out1 = writeVrma(first.document);
    const out2 = writeVrma(parseVrma(out1).document);
    expect(out2).toEqual(out1);
  });

  it('writes a structurally valid glb (A.1 checklist)', () => {
    const { document } = parseVrma(fixtureBytes());
    const glb = writeVrma(document);
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);

    // Header
    expect(view.getUint32(0, true)).toBe(0x46546c67); // "glTF"
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(glb.byteLength);

    // JSON chunk: aligned, space-padded, parseable
    const jsonLength = view.getUint32(12, true);
    expect(jsonLength % 4).toBe(0);
    expect(view.getUint32(16, true)).toBe(0x4e4f534a); // "JSON"
    const jsonText = new TextDecoder().decode(glb.subarray(20, 20 + jsonLength));
    const json = JSON.parse(jsonText) as GltfJson;

    // BIN chunk: aligned, zero-padded, matches the declared buffer length
    const binHeaderAt = 20 + jsonLength;
    const binLength = view.getUint32(binHeaderAt, true);
    expect(binLength % 4).toBe(0);
    expect(view.getUint32(binHeaderAt + 4, true)).toBe(0x004e4942); // "BIN\0"
    expect(12 + 8 + jsonLength + 8 + binLength).toBe(glb.byteLength);
    const declaredBuffer = json.buffers?.[0]?.byteLength ?? 0;
    expect(declaredBuffer).toBeGreaterThan(0);
    expect(binLength - declaredBuffer).toBeGreaterThanOrEqual(0);
    expect(binLength - declaredBuffer).toBeLessThan(4);

    // Extension and buffer-math invariants
    expect(json.extensionsUsed).toContain('VRMC_vrm_animation');
    expect(json.extensions?.VRMC_vrm_animation?.humanoid.humanBones.hips?.node).toBe(0);
    for (const bufferView of json.bufferViews ?? []) {
      expect((bufferView.byteOffset ?? 0) % 4).toBe(0);
      expect((bufferView.byteOffset ?? 0) + bufferView.byteLength).toBeLessThanOrEqual(declaredBuffer);
    }
    // Animation input accessors must carry min/max (glTF requirement)
    for (const sampler of json.animations?.[0]?.samplers ?? []) {
      const input = json.accessors?.[sampler.input];
      expect(input?.min).toBeDefined();
      expect(input?.max).toBeDefined();
    }
  });
});

describe('parser error reporting', () => {
  it('rejects garbage bytes with a readable message', () => {
    expect(() => parseVrma(new Uint8Array([1, 2, 3]))).toThrow(VrmaFileError);
    expect(() => parseVrma(new Uint8Array([1, 2, 3]))).toThrow(/too small/i);
  });

  it('rejects a glb without the VRMC_vrm_animation extension', () => {
    const plainGlb = buildGlb(JSON.stringify({ asset: { version: '2.0' } }), new Uint8Array(0));
    expect(() => parseVrma(plainGlb)).toThrow(/VRMC_vrm_animation/);
  });

  it('rejects a file whose humanoid map is missing hips', () => {
    const { json: jsonText, bin } = parseGlb(fixtureBytes());
    const json = JSON.parse(jsonText) as GltfJson;
    delete json.extensions?.VRMC_vrm_animation?.humanoid.humanBones.hips;
    expect(() => parseVrma(buildGlb(JSON.stringify(json), bin))).toThrow(/hips/);
  });

  it('warns about (but keeps parsing past) channels on unmapped nodes', () => {
    const { json: jsonText, bin } = parseGlb(fixtureBytes());
    const json = JSON.parse(jsonText) as GltfJson;
    json.nodes?.push({ name: 'stray' });
    json.animations?.[0]?.channels.push({
      sampler: 0,
      target: { node: 1, path: 'rotation' },
    });

    const { document, warnings } = parseVrma(buildGlb(JSON.stringify(json), bin));
    expect(warnings.map((w) => w.code)).toContain('unmapped-channel');
    expect([...document.boneTracks.keys()]).toEqual(['hips']); // stray channel ignored
    expect(document.duration).toBe(1);
  });
});
