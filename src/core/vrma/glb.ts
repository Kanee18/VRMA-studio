/**
 * GLB container I/O and binary buffer math.
 *
 * ALL byte-offset, alignment, and padding logic for .vrma files lives in this
 * module (CLAUDE.md engineering convention — glb corruption bugs are the
 * project's biggest risk, so the risky math is centralized and tested here).
 *
 * Layout reference: CLAUDE.md Appendix A.1 / glTF 2.0 spec §GLB File Format.
 * All multi-byte values are little-endian. Floats are written explicitly via
 * DataView so platform endianness can never leak into a file.
 */

import { VrmaFileError } from './errors';
import type { GltfJson } from './gltf';
import { COMPONENT_COUNT, GLTF_FLOAT } from './gltf';

export const GLB_MAGIC = 0x46546c67; // "glTF"
export const GLB_VERSION = 2;
export const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
export const CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"

const GLB_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

/** Round up to the next multiple of 4. */
export function align4(byteLength: number): number {
  return (byteLength + 3) & ~3;
}

export interface GlbChunks {
  /** Decoded JSON chunk text (may include the trailing 0x20 padding). */
  json: string;
  /**
   * BIN chunk contents including its zero padding, so byteLength is always a
   * multiple of 4 and may exceed buffers[0].byteLength by up to 3 bytes.
   * Empty if the file has no BIN chunk.
   */
  bin: Uint8Array;
}

/** Split a .glb/.vrma byte stream into its JSON text and BIN chunk. */
export function parseGlb(bytes: Uint8Array): GlbChunks {
  if (bytes.byteLength < GLB_HEADER_BYTES + CHUNK_HEADER_BYTES) {
    throw new VrmaFileError(
      `This file is too small to be a .vrma file (${bytes.byteLength} bytes).`,
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    throw new VrmaFileError(
      'This is not a .vrma/.glb file — the glTF magic bytes are missing from the file header.',
    );
  }
  const version = view.getUint32(4, true);
  if (version !== GLB_VERSION) {
    throw new VrmaFileError(
      `Unsupported glb container version ${version} (expected version 2).`,
    );
  }
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== bytes.byteLength) {
    throw new VrmaFileError(
      `The file header declares ${declaredLength} bytes but the file is ${bytes.byteLength} bytes — the file is truncated or corrupted.`,
    );
  }

  let offset = GLB_HEADER_BYTES;
  let jsonText: string | undefined;
  let bin = new Uint8Array(0);
  let binSeen = false;

  while (offset < declaredLength) {
    if (offset + CHUNK_HEADER_BYTES > declaredLength) {
      throw new VrmaFileError(
        `Corrupted chunk header at byte ${offset} — not enough bytes left in the file.`,
      );
    }
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + CHUNK_HEADER_BYTES;
    if (chunkLength % 4 !== 0) {
      throw new VrmaFileError(
        `The chunk at byte ${offset} has length ${chunkLength}, which is not 4-byte aligned.`,
      );
    }
    if (dataStart + chunkLength > declaredLength) {
      throw new VrmaFileError(
        `The chunk at byte ${offset} declares ${chunkLength} bytes but only ${declaredLength - dataStart} remain — the file is truncated.`,
      );
    }
    const data = bytes.slice(dataStart, dataStart + chunkLength);

    if (jsonText === undefined) {
      if (chunkType !== CHUNK_TYPE_JSON) {
        throw new VrmaFileError(
          'The first glb chunk is not the JSON chunk. The file does not follow the glTF binary layout.',
        );
      }
      jsonText = new TextDecoder().decode(data);
    } else if (chunkType === CHUNK_TYPE_BIN && !binSeen) {
      binSeen = true;
      bin = data;
    }
    // Unknown chunk types are skipped, as the glTF spec requires.
    offset = dataStart + chunkLength;
  }

  if (jsonText === undefined) {
    throw new VrmaFileError('This file contains no JSON chunk — it is not a valid .vrma file.');
  }
  return { json: jsonText, bin };
}

/**
 * Assemble a glb file from JSON text and a BIN payload.
 * JSON is padded with spaces (0x20), BIN with zeros (0x00); chunk lengths are
 * the padded lengths. A BIN chunk is only emitted when `bin` is non-empty.
 */
export function buildGlb(jsonText: string, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(jsonText);
  const jsonPadded = align4(jsonBytes.byteLength);
  const binPadded = align4(bin.byteLength);
  const hasBin = bin.byteLength > 0;

  const totalLength =
    GLB_HEADER_BYTES +
    CHUNK_HEADER_BYTES +
    jsonPadded +
    (hasBin ? CHUNK_HEADER_BYTES + binPadded : 0);

  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer);

  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalLength, true);

  view.setUint32(12, jsonPadded, true);
  view.setUint32(16, CHUNK_TYPE_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonPadded);

  if (hasBin) {
    const binHeader = 20 + jsonPadded;
    view.setUint32(binHeader, binPadded, true);
    view.setUint32(binHeader + 4, CHUNK_TYPE_BIN, true);
    out.set(bin, binHeader + CHUNK_HEADER_BYTES);
    // BIN padding bytes are already 0x00 (fresh Uint8Array).
  }
  return out;
}

/**
 * Read a float32 accessor out of the BIN chunk, with full bounds and
 * alignment checking. Only the accessor shapes a .vrma actually uses are
 * supported: non-sparse, non-normalized float32, tightly packed.
 */
export function readFloatAccessor(
  json: GltfJson,
  bin: Uint8Array,
  accessorIndex: number,
  expectedType: 'SCALAR' | 'VEC3' | 'VEC4',
): Float32Array {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) {
    throw new VrmaFileError(`The animation references accessor ${accessorIndex}, which does not exist.`);
  }
  const where = `Accessor ${accessorIndex}`;
  if (accessor.sparse !== undefined) {
    throw new VrmaFileError(`${where} uses sparse storage, which VRMA Studio does not support.`);
  }
  if (accessor.componentType !== GLTF_FLOAT) {
    throw new VrmaFileError(
      `${where} stores component type ${accessor.componentType}; only float32 (5126) animation data is supported.`,
    );
  }
  if (accessor.normalized === true) {
    throw new VrmaFileError(`${where} is marked "normalized", which is not supported for float data.`);
  }
  if (accessor.type !== expectedType) {
    throw new VrmaFileError(`${where} has type ${accessor.type}, but ${expectedType} was expected here.`);
  }
  if (!Number.isInteger(accessor.count) || accessor.count < 1) {
    throw new VrmaFileError(`${where} has an invalid element count (${accessor.count}).`);
  }
  if (accessor.bufferView === undefined) {
    throw new VrmaFileError(`${where} has no bufferView (implicit zero-filled accessors are not supported).`);
  }

  const bufferView = json.bufferViews?.[accessor.bufferView];
  if (!bufferView) {
    throw new VrmaFileError(`${where} references bufferView ${accessor.bufferView}, which does not exist.`);
  }
  const buffer = json.buffers?.[bufferView.buffer];
  if (!buffer) {
    throw new VrmaFileError(
      `BufferView ${accessor.bufferView} references buffer ${bufferView.buffer}, which does not exist.`,
    );
  }
  if (buffer.uri !== undefined) {
    throw new VrmaFileError(
      'This file stores its binary data in an external file (buffer.uri), which is not supported — .vrma files embed their data in the glb.',
    );
  }
  if (buffer.byteLength > bin.byteLength) {
    throw new VrmaFileError(
      `The file declares a ${buffer.byteLength}-byte binary buffer but the BIN chunk only holds ${bin.byteLength} bytes — the file is truncated.`,
    );
  }

  const components = COMPONENT_COUNT[expectedType];
  if (bufferView.byteStride !== undefined && bufferView.byteStride !== components * 4) {
    throw new VrmaFileError(
      `BufferView ${accessor.bufferView} uses byte stride ${bufferView.byteStride}; animation data must be tightly packed.`,
    );
  }

  const viewOffset = bufferView.byteOffset ?? 0;
  const accessorOffset = accessor.byteOffset ?? 0;
  const start = viewOffset + accessorOffset;
  const byteLength = accessor.count * components * 4;

  if (start % 4 !== 0) {
    throw new VrmaFileError(
      `${where} starts at byte ${start}, which is not 4-byte aligned as float data requires.`,
    );
  }
  if (accessorOffset + byteLength > bufferView.byteLength) {
    throw new VrmaFileError(
      `${where} needs ${byteLength} bytes but its bufferView only holds ${bufferView.byteLength - accessorOffset}.`,
    );
  }
  if (viewOffset + bufferView.byteLength > buffer.byteLength) {
    throw new VrmaFileError(
      `BufferView ${accessor.bufferView} extends past the end of the binary buffer (byte ${viewOffset + bufferView.byteLength} of ${buffer.byteLength}).`,
    );
  }

  const view = new DataView(bin.buffer, bin.byteOffset + start, byteLength);
  const out = new Float32Array(accessor.count * components);
  for (let i = 0; i < out.length; i++) {
    out[i] = view.getFloat32(i * 4, true);
  }
  return out;
}

/**
 * Accumulates float32 arrays into a single BIN payload, returning the
 * 4-byte-aligned byteOffset/byteLength each block lands at. Data is written
 * explicitly little-endian.
 */
export class BufferBuilder {
  private parts: Uint8Array[] = [];
  private length = 0;

  pushFloat32(values: Float32Array): { byteOffset: number; byteLength: number } {
    const aligned = align4(this.length);
    if (aligned > this.length) {
      this.parts.push(new Uint8Array(aligned - this.length));
      this.length = aligned;
    }
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < values.length; i++) {
      view.setFloat32(i * 4, values[i], true);
    }
    this.parts.push(bytes);
    const byteOffset = this.length;
    this.length += bytes.byteLength;
    return { byteOffset, byteLength: bytes.byteLength };
  }

  build(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.byteLength;
    }
    return out;
  }
}
