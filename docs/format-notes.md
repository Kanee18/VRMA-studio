# VRMA Format Notes — deviations & implementation decisions

Status: Phase 1, step 1 (parser/writer + round-trip test). Updated 2026-07-11.

## Implementation decisions

### 1. Hand-rolled glb I/O instead of `@gltf-transform/core`

CLAUDE.md's tech-stack section mentions building on `@gltf-transform/core`, but the
rest of the document points the other way: Appendix A specifies the byte layout we
must own, the engineering conventions require binary buffer math centralized in one
utility, and A.4 requires the writer to regenerate the BIN buffer from scratch.
A `.vrma` uses a tiny slice of glTF (nodes + animations + float32 accessors in one
embedded buffer — no meshes, materials, or textures), and glTF-Transform has no
built-in `VRMC_vrm_animation` extension, so using it would still mean writing a
custom extension class plus glb re-packing around it.

So `src/core/vrma/glb.ts` implements the container and accessor math directly
(~250 lines, zero dependencies, byte-level tests). **Revisit if** real-world files
show up with accessor layouts we rejected (see §3) — glTF-Transform would then be
the escape hatch, hidden behind the same `parseVrma`/`writeVrma` API.

### 2. `AnimationDocument` carries `skeleton` and `nodeMaps` (extension of A.4)

The A.4 sketch only holds tracks. That is not enough for a *functionally* identical
round-trip:

- Consumers (e.g. `three-vrm-animation`) read the **rest pose** of the VRMA's own
  node hierarchy — the hips rest height scales root motion onto the target avatar.
- The extension's `humanBones` map usually lists **every** bone of the source
  skeleton even when only a few are animated, and must survive re-export.

So the parser preserves all glTF nodes as `skeleton` (parent + rest TRS) plus
`nodeMaps` (bone/expression/lookAt name → node index), and the writer regenerates
the glTF *from* that model. Operations still never touch either.

### 3. Accessor support envelope

The parser accepts only what real VRMA exporters emit and errors clearly otherwise:

- `componentType` 5126 (float32) only — normalized int rotation outputs
  (`byte`/`short`, allowed by glTF) are rejected for now.
- No sparse accessors, no external `buffer.uri`, no `byteStride` (animation data
  must be tightly packed per glTF anyway).
- Strictly increasing keyframe times are enforced at parse time (a repairable-file
  path can relax this when `repair.ts` lands).

### 4. CUBICSPLINE is converted to LINEAR on import

Per the MVP allowance in A.2: tangents are discarded (the value element of each
`(a, v, b)` triple is kept) and a `cubicspline-converted` warning is emitted.
Consequence: a CUBICSPLINE file does **not** round-trip losslessly — by design,
until proper cubic editing lands. `metadata.sourceInterpolation` records what the
source used.

### 5. Other read-side notes

- Only `animations[0]` is loaded; extra animations produce a warning.
- Channels on nodes the extension doesn't map: **warning, not error** (A.6 §5).
- Translation channels on non-hips humanoid bones: warning, ignored (A.3).
- Expression weight is read from `translation.x` of the mapped node; y/z ignored.
- Node `matrix` transforms: warning, rest pose treated as identity (animated glTF
  nodes may not use `matrix`, so this only affects malformed files).
- Non-VRM bone names in `humanBones` (e.g. VRM 0.x's `leftThumbIntermediate`):
  warning, entry dropped. Auto-repair (Phase 2) should remap instead.

## Writer guarantees

- Full regeneration: nodes, channels, samplers, accessors, buffer views, and the
  BIN buffer are rebuilt from the document on every export; original file bytes
  are never patched.
- glb layout per A.1: JSON chunk space-padded, BIN chunk zero-padded, chunk
  lengths are padded lengths, every bufferView 4-byte aligned.
- `min`/`max` are written on **all** accessors (glTF only requires them on sampler
  inputs) and are computed from the float32-quantized data, so they match the
  binary bit-for-bit.
- One bufferView per accessor (simple, slightly redundant, valid).
- Expression tracks are written as `translation` = `[weight, 0, 0]`.
- Determinism: `write(parse(write(doc)))` is byte-identical to `write(doc)`
  (covered by a test). Note new keyframe times created by future operations are
  quantized to float32 on write.
- Tracks for bones/expressions with no node mapping (possible after future merge
  operations) get a synthesized root-level node with identity rest pose.

## Round-trip definition

"Round-trip guarantee" (MVP scope §3) means **functional identity** — an identical
`AnimationDocument` after `parse(write(parse(file)))` — not byte-identity with the
input file (key order, accessor packing, and dropped `extras` may differ).
