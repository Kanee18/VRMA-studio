/**
 * Generates tests/fixtures/minimal.vrma — the hand-crafted, byte-verified
 * fixture from CLAUDE.md A.7: a single hips node with one rotation track of
 * two keyframes (identity → 90° around Y over 1 second).
 *
 * IMPORTANT: this script intentionally does NOT import src/core/vrma/writer.
 * It assembles the glb from raw bytes on its own, so the round-trip tests
 * have an independent oracle instead of testing the writer against itself.
 *
 * Deterministic: running it twice produces identical bytes.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/minimal.vrma');

// --- animation data (float32-exact values) -----------------------------------

// 90° rotation around Y: q = (0, sin(45°), 0, cos(45°)), quantized to float32
// so the JSON min/max match the binary data bit-for-bit.
const S = Math.fround(Math.SQRT1_2);

const times = [0, 1];
const quats = [
  [0, 0, 0, 1], // t=0: identity
  [0, S, 0, S], // t=1: 90° around +Y
];

const TIMES_BYTES = times.length * 4; // 8
const QUATS_BYTES = quats.length * 4 * 4; // 32
const BIN_LENGTH = TIMES_BYTES + QUATS_BYTES; // 40, already 4-byte aligned

const json = {
  asset: { version: '2.0', generator: 'VRMA Studio fixture generator' },
  extensionsUsed: ['VRMC_vrm_animation'],
  extensions: {
    VRMC_vrm_animation: {
      specVersion: '1.0',
      humanoid: { humanBones: { hips: { node: 0 } } },
    },
  },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'hips', translation: [0, 1, 0] }],
  animations: [
    {
      name: 'minimal',
      channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }],
      samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }],
    },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
    {
      bufferView: 1,
      componentType: 5126,
      count: 2,
      type: 'VEC4',
      min: [0, 0, 0, S],
      max: [0, S, 0, 1],
    },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: TIMES_BYTES },
    { buffer: 0, byteOffset: TIMES_BYTES, byteLength: QUATS_BYTES },
  ],
  buffers: [{ byteLength: BIN_LENGTH }],
};

// --- BIN chunk ----------------------------------------------------------------

const bin = new Uint8Array(BIN_LENGTH);
const binView = new DataView(bin.buffer);
times.forEach((t, i) => binView.setFloat32(i * 4, t, true));
quats.flat().forEach((v, i) => binView.setFloat32(TIMES_BYTES + i * 4, v, true));

// --- glb container (CLAUDE.md A.1 layout) --------------------------------------

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"
const align4 = (n) => (n + 3) & ~3;

const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
const jsonPadded = align4(jsonBytes.byteLength);
const binPadded = align4(bin.byteLength);
const totalLength = 12 + 8 + jsonPadded + 8 + binPadded;

const file = new Uint8Array(totalLength);
const view = new DataView(file.buffer);
view.setUint32(0, GLB_MAGIC, true);
view.setUint32(4, 2, true);
view.setUint32(8, totalLength, true);
view.setUint32(12, jsonPadded, true);
view.setUint32(16, CHUNK_JSON, true);
file.set(jsonBytes, 20);
file.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonPadded); // JSON padded with spaces
const binHeaderAt = 20 + jsonPadded;
view.setUint32(binHeaderAt, binPadded, true);
view.setUint32(binHeaderAt + 4, CHUNK_BIN, true);
file.set(bin, binHeaderAt + 8); // BIN padding stays 0x00

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, file);

// --- byte-level verification of what actually landed on disk -------------------

const onDisk = readFileSync(OUT_PATH);
const check = new DataView(onDisk.buffer, onDisk.byteOffset, onDisk.byteLength);
const assert = (cond, message) => {
  if (!cond) {
    console.error(`FIXTURE VERIFICATION FAILED: ${message}`);
    process.exit(1);
  }
};

assert(check.getUint32(0, true) === GLB_MAGIC, 'glTF magic');
assert(check.getUint32(4, true) === 2, 'glb version 2');
assert(check.getUint32(8, true) === onDisk.byteLength, 'declared length === file size');
assert(check.getUint32(12, true) % 4 === 0, 'JSON chunk length aligned');
assert(check.getUint32(16, true) === CHUNK_JSON, 'chunk 0 is JSON');
const jsonLen = check.getUint32(12, true);
const reparsed = JSON.parse(new TextDecoder().decode(onDisk.subarray(20, 20 + jsonLen)));
assert(reparsed.extensions.VRMC_vrm_animation.humanoid.humanBones.hips.node === 0, 'hips mapping');
const binAt = 20 + jsonLen;
assert(check.getUint32(binAt, true) % 4 === 0, 'BIN chunk length aligned');
assert(check.getUint32(binAt + 4, true) === CHUNK_BIN, 'chunk 1 is BIN');
assert(check.getFloat32(binAt + 8 + 4, true) === 1, 'time[1] === 1s');
assert(check.getFloat32(binAt + 8 + TIMES_BYTES + 12, true) === 1, 'quat[0].w === 1');
assert(check.getFloat32(binAt + 8 + TIMES_BYTES + 20, true) === S, 'quat[1].y === fround(1/sqrt(2))');

console.log(`wrote ${OUT_PATH} (${onDisk.byteLength} bytes) — byte verification passed`);
