import { describe, expect, it } from 'vitest';

import {
  BufferBuilder,
  CHUNK_TYPE_BIN,
  CHUNK_TYPE_JSON,
  GLB_MAGIC,
  align4,
  buildGlb,
  parseGlb,
} from '../src/core/vrma/glb';
import { VrmaFileError } from '../src/core/vrma/errors';

describe('align4', () => {
  it('rounds up to the next multiple of 4', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(align4)).toEqual([0, 4, 4, 4, 4, 8, 8, 8, 8]);
  });
});

describe('buildGlb / parseGlb', () => {
  it('round-trips JSON of every padding remainder', () => {
    // JSON text lengths chosen to hit paddings of 0..3 bytes.
    const payloads = ['{"a":1}', '{"a":12}', '{"a":123}', '{"a":1234}'];
    for (const jsonText of payloads) {
      const glb = buildGlb(jsonText, new Uint8Array(0));
      expect(glb.byteLength % 4).toBe(0);
      const parsed = parseGlb(glb);
      expect(JSON.parse(parsed.json)).toEqual(JSON.parse(jsonText));
      expect(parsed.bin.byteLength).toBe(0);
    }
  });

  it('round-trips BIN payloads of every padding remainder', () => {
    for (const binLength of [1, 2, 3, 4, 5, 40]) {
      const bin = new Uint8Array(binLength).map((_, i) => (i * 7 + 1) % 256);
      const glb = buildGlb('{"asset":{"version":"2.0"}}', bin);
      const parsed = parseGlb(glb);
      // Parsed BIN is the padded chunk: original bytes then 0x00 up to align4.
      expect(parsed.bin.byteLength).toBe(align4(binLength));
      expect([...parsed.bin.subarray(0, binLength)]).toEqual([...bin]);
      expect([...parsed.bin.subarray(binLength)].every((b) => b === 0)).toBe(true);
    }
  });

  it('writes the exact byte layout from CLAUDE.md A.1', () => {
    const jsonText = '{"a":1}'; // 7 bytes → padded to 8 with one 0x20
    const bin = new Uint8Array([1, 2, 3, 4, 5]); // → padded to 8 with 0x00
    const glb = buildGlb(jsonText, bin);
    const view = new DataView(glb.buffer);

    expect(view.getUint32(0, true)).toBe(GLB_MAGIC);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(glb.byteLength);
    expect(glb.byteLength).toBe(12 + 8 + 8 + 8 + 8);

    expect(view.getUint32(12, true)).toBe(8); // padded JSON length
    expect(view.getUint32(16, true)).toBe(CHUNK_TYPE_JSON);
    expect(glb[20 + 7]).toBe(0x20); // JSON padded with spaces

    expect(view.getUint32(28, true)).toBe(8); // padded BIN length
    expect(view.getUint32(32, true)).toBe(CHUNK_TYPE_BIN);
    expect([...glb.subarray(36, 44)]).toEqual([1, 2, 3, 4, 5, 0, 0, 0]); // zero padding
  });

  it('rejects files that are not glb at all', () => {
    expect(() => parseGlb(new Uint8Array([1, 2, 3]))).toThrow(VrmaFileError);
    expect(() => parseGlb(new Uint8Array(64))).toThrow(/magic/i);
  });

  it('rejects a header length that disagrees with the file size', () => {
    const glb = buildGlb('{"a":1}', new Uint8Array(0));
    const view = new DataView(glb.buffer);
    view.setUint32(8, glb.byteLength + 4, true);
    expect(() => parseGlb(glb)).toThrow(/truncated|corrupted/i);
  });

  it('rejects unsupported container versions', () => {
    const glb = buildGlb('{"a":1}', new Uint8Array(0));
    new DataView(glb.buffer).setUint32(4, 1, true);
    expect(() => parseGlb(glb)).toThrow(/version/i);
  });
});

describe('BufferBuilder', () => {
  it('writes float32 little-endian at 4-byte-aligned offsets', () => {
    const builder = new BufferBuilder();
    const a = builder.pushFloat32(new Float32Array([1]));
    const b = builder.pushFloat32(new Float32Array([0, 2.5, -1]));
    expect(a).toEqual({ byteOffset: 0, byteLength: 4 });
    expect(b).toEqual({ byteOffset: 4, byteLength: 12 });

    const bin = builder.build();
    expect(bin.byteLength).toBe(16);
    expect([...bin.subarray(0, 4)]).toEqual([0x00, 0x00, 0x80, 0x3f]); // 1.0f LE
    const view = new DataView(bin.buffer);
    expect(view.getFloat32(8, true)).toBe(2.5);
    expect(view.getFloat32(12, true)).toBe(-1);
  });
});
