# CLAUDE.md — VRMA Studio (Desktop VRMA Animation Editor)

## Project Overview

**VRMA Studio** is a desktop application for editing VRM Animation (`.vrma`) files with a video-editor-style workflow (think Adobe Premiere, but for humanoid 3D animations). It targets VTubers, indie game devs, and VRM hobbyists who currently must use Blender (steep learning curve, fragile VRMA add-on import/export) just to perform simple edits like cutting, trimming, or merging animations.

**Core value proposition:** Open a `.vrma` file, see it play on a VRM avatar instantly, cut/trim/merge on a timeline, and export a valid `.vrma` — no Blender, no Unity, no rigging knowledge required.

## Target Users

- VTubers and virtual assistant developers using VRM avatars
- Indie game developers using VRM/VRMA pipelines (Three.js, Godot, RPG Developer Bakin, etc.)
- Motion capture users (XR Animator, VRM Posing Desktop output) who need post-editing
- Beginners who have never used Blender

## Tech Stack

- **Shell:** Tauri v2 (Rust backend, small binary, native file dialogs)
  - Fallback option: Electron if Tauri causes friction — decide early, do not switch mid-project
- **Frontend:** React + TypeScript + Vite
- **3D Viewport:** Three.js + `@pixiv/three-vrm` (VRM 0.x & 1.0 support) + `@pixiv/three-vrm-animation` (VRMA loading)
- **glTF/VRMA read-write:** Custom module built on top of `@gltf-transform/core` for parsing and rewriting glb containers, animation samplers, and accessors. This is the heart of the project.
- **State management:** Zustand
- **Styling:** Tailwind CSS, dark theme by default (creative tool aesthetic)
- **Testing:** Vitest for the VRMA read/write module (round-trip tests are mandatory)

## Understanding the VRMA Format (critical context)

A `.vrma` file is a **glTF binary (`.glb`)** containing the `VRMC_vrm_animation` extension. Key facts:

- The extension maps glTF nodes → VRM humanoid bones (`humanoid.humanBones`), so animations retarget across any VRM model
- Animation data lives in standard glTF `animations` (channels → samplers → accessors holding keyframe times and values)
- Three animatable domains:
  1. **Humanoid bone rotations** (+ hips translation)
  2. **Expressions** (preset + custom, animated as node translation X coordinate)
  3. **Look-at** (gaze direction node)
- Editing = manipulating keyframe time/value arrays in accessors, then rewriting a valid glb with correct buffer offsets, byte lengths, and the extension intact

## Architecture

```
src/
├── core/                  # Pure TypeScript, no UI dependencies
│   ├── vrma/
│   │   ├── parser.ts      # .vrma → internal AnimationDocument model
│   │   ├── writer.ts      # AnimationDocument → valid .vrma (glb)
│   │   ├── validator.ts   # Spec-compliance checks + human-readable error report
│   │   ├── repair.ts      # Auto-fix common issues (missing ext fields, bad accessors)
│   │   └── types.ts       # AnimationDocument, Track, Keyframe, etc.
│   └── operations/
│       ├── trim.ts        # Cut range [tStart, tEnd], re-time keyframes
│       ├── split.ts       # Split one animation into two at time t
│       ├── merge.ts       # Concatenate animations, optional crossfade blending
│       ├── speed.ts       # Time-scale (slow-mo / speed-up), reverse
│       └── resample.ts    # Keyframe resampling utilities used by the above
├── viewport/
│   ├── Scene.tsx          # Three.js canvas, VRM model, grid, lighting
│   ├── useVrmPlayer.ts    # Binds AnimationDocument → three-vrm-animation playback
│   └── CameraControls.ts  # Orbit controls, focus-on-avatar
├── timeline/
│   ├── Timeline.tsx       # Ruler, playhead, zoom, snapping
│   ├── ClipTrack.tsx      # Draggable/trimmable clips (Premiere-style)
│   ├── TrackLanes.tsx     # Separate lanes: Body / Expressions / Look-At
│   └── useTimelineState.ts
├── panels/
│   ├── ProjectPanel.tsx   # Imported VRM model + VRMA clip library
│   ├── PropertiesPanel.tsx# Selected clip: duration, speed, blend settings
│   └── ExportDialog.tsx   # Export settings + validation results
└── app/
    ├── App.tsx
    ├── store.ts           # Zustand: project state, undo/redo history
    └── shortcuts.ts       # Keyboard shortcuts (space=play, S=split, etc.)

src-tauri/                 # Rust: file dialogs, fs read/write, recent files
```

**Design rule:** `core/` must be pure and framework-free so it can be unit-tested headlessly and reused (e.g., future CLI or web version).

## MVP Scope (Phase 1)

1. **Import & preview**
   - Open a `.vrm` model (default sample model bundled) and one or more `.vrma` files
   - Real-time playback in viewport with play/pause, scrubbing, loop toggle
2. **Timeline editing**
   - Single track, one clip per VRMA
   - Trim clip in/out points by dragging edges
   - Split clip at playhead (S key)
   - Delete clip segments
3. **Export**
   - Write edited result to a new `.vrma`
   - Round-trip guarantee: an unedited import→export must produce a functionally identical animation
4. **Validation on import**
   - If a file has issues, show a clear plain-language report instead of failing silently

## Phase 2 (post-MVP)

- Merge multiple clips into one exported VRMA, with optional crossfade blend between clips
- Speed adjustment and reverse per clip
- Separate lanes for Body / Expression / Look-At with independent editing
- Auto-repair mode for malformed VRMA files (the "it errors in Blender" fixer)
- Onion-skin / ghost preview at cut points
- Undo/redo (implement the command pattern from day one even if UI lands in Phase 2)

## Explicit Non-Goals

- No keyframe-level pose editing (this is not a posing tool — VRM Posing Desktop exists)
- No FBX/BVH import in MVP (VRMA in, VRMA out only)
- No VRM model editing
- No cloud features, accounts, or telemetry

## UI/UX Guidelines

- Layout mirrors familiar NLE conventions: viewport top-center, timeline bottom full-width, project panel left, properties right
- Everything critical reachable via keyboard: Space (play), I/O (set in/out), S (split), Del (delete), Ctrl+Z/Y (undo/redo), Ctrl+E (export)
- First-run experience: bundled sample VRM + sample VRMA so the app is instantly playable
- Errors must be human-readable: "This file is missing the humanoid bone map (VRMC_vrm_animation.humanoid). It may have been exported incorrectly. Try Auto-Repair?" — never raw stack traces

## Engineering Conventions

- TypeScript strict mode; no `any` in `core/`
- Every operation in `core/operations/` ships with Vitest round-trip tests using fixture `.vrma` files in `tests/fixtures/`
- Keep binary buffer math (offsets, alignment, padding to 4 bytes) centralized in one utility — glb corruption bugs are the biggest risk in this project
- Conventional Commits for all commit messages
- Document any deviation from the VRMC_vrm_animation spec in `docs/format-notes.md`

## Key References

- VRM Animation spec: https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm_animation-1.0
- three-vrm: https://github.com/pixiv/three-vrm
- glTF 2.0 spec (animations, accessors, buffers): https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- glTF-Transform: https://gltf-transform.dev/

## Development Order (suggested)

1. `core/vrma/parser.ts` + `writer.ts` with round-trip test on real VRMA fixtures — prove the hardest part first
2. Viewport playback of a loaded VRMA on a VRM model
3. Timeline UI with scrubbing synced to viewport
4. Trim/split operations wired to timeline
5. Export dialog + validation
6. Polish, shortcuts, sample assets, packaging (Tauri bundler for Windows first)

---

## Appendix A — VRMA Binary Format Details (parser/writer reference)

### A.1 GLB container layout

A `.vrma` file is a standard glTF Binary (glb v2). Byte layout:

```
Offset  Size  Field
0       4     magic       = 0x46546C67 ("glTF", little-endian)
4       4     version     = 2
8       4     total file length (bytes, uint32 LE)

12      4     chunk0 length (uint32 LE)
16      4     chunk0 type = 0x4E4F534A ("JSON")
20      n     chunk0 data = glTF JSON, padded with 0x20 (space) to 4-byte alignment

20+n    4     chunk1 length
...     4     chunk1 type = 0x004E4942 ("BIN\0")
...     m     chunk1 data = binary buffer, padded with 0x00 to 4-byte alignment
```

**Writer rules (corruption risk lives here):**
- All chunk lengths are the padded lengths
- JSON chunk padded with spaces (`0x20`), BIN chunk padded with zeros (`0x00`)
- `total file length` = 12 + (8 + paddedJsonLen) + (8 + paddedBinLen)
- Every `bufferView.byteOffset` must be 4-byte aligned for float/uint accessors
- After any keyframe edit, recompute in this order: accessor `count`/`min`/`max` → bufferView `byteOffset`/`byteLength` → buffer `byteLength` → chunk lengths → total length

### A.2 glTF animation structure (where keyframes live)

```
animations[0]
├── channels[]           # one channel per animated property
│   ├── sampler: index into samplers[]
│   └── target: { node: <index>, path: "rotation" | "translation" }
└── samplers[]
    ├── input:  accessor index → keyframe TIMES  (SCALAR, float32, seconds, ascending)
    ├── output: accessor index → keyframe VALUES
    │            rotation    → VEC4 float32 (quaternion x,y,z,w)
    │            translation → VEC3 float32
    └── interpolation: "LINEAR" | "STEP" | "CUBICSPLINE"
```

- `accessors[i]` → `{ bufferView, componentType: 5126 (float32), count, type, min, max }`
- `bufferViews[i]` → `{ buffer: 0, byteOffset, byteLength }` into the single BIN chunk
- For CUBICSPLINE, output holds 3 elements per keyframe (in-tangent, value, out-tangent) — the trim/split math must account for this; MVP may convert CUBICSPLINE → LINEAR on edit with a warning

### A.3 The VRMC_vrm_animation extension

Located at `json.extensions.VRMC_vrm_animation`:

```jsonc
{
  "specVersion": "1.0",
  "humanoid": {
    "humanBones": {
      "hips":     { "node": 2 },   // REQUIRED bone
      "spine":    { "node": 3 },
      "head":     { "node": 7 }
      // ... standard VRM humanoid bone names → glTF node index
    }
  },
  "expressions": {                 // OPTIONAL
    "preset": {
      "happy":  { "node": 40 },    // weight = that node's translation.x
      "aa":     { "node": 41 }
    },
    "custom": {
      "myExpr": { "node": 42 }
    }
  },
  "lookAt": { "node": 50 }         // OPTIONAL, gaze target node
}
```

Semantics the parser must implement:
- **Bones:** channels targeting a node listed in `humanBones` animate that humanoid bone's **rotation** (quaternion). Only `hips` also uses **translation** (root motion). Translation channels on other humanoid bones should be ignored or flagged by the validator.
- **Expressions:** the expression weight (0..1) is encoded as the **translation.x** of the mapped node. Y and Z are ignored.
- **Look-at:** gaze direction is derived from the look-at node's translation, interpreted from the head bone's local space.
- `"name"` fields on nodes are informative only — retargeting is done purely via the `humanBones` map, never by node name.

### A.4 Internal model mapping (AnimationDocument)

Parse into a domain model so operations never touch raw buffers:

```ts
interface AnimationDocument {
  duration: number;                      // max input time across all tracks
  boneTracks: Map<VrmBoneName, {
    rotation?: Keyframes<Quat>;          // times[] + values[]
    translation?: Keyframes<Vec3>;       // hips only
  }>;
  expressionTracks: Map<string, Keyframes<number>>;  // name → weight curve
  lookAtTrack?: Keyframes<Vec3>;
  metadata: { specVersion: string; sourceInterpolation: string };
}
```

The writer regenerates nodes, channels, samplers, accessors, and the BIN buffer **from scratch** from this model (don't patch original buffers in place — full regeneration is simpler and safer).

### A.5 Operation math notes

- **Trim [t0, t1]:** for each track, keep keyframes in range, then **insert interpolated boundary keyframes** at exactly t0 and t1 (slerp for quaternions, lerp for vec3/scalar), then shift all times by −t0
- **Split at t:** equivalent to two trims: [0, t] and [t, duration]
- **Merge A + B:** shift all of B's times by A.duration (+ optional gap); with crossfade of width w, overlap the last w seconds of A with the first w of B, blending rotations via slerp weighted by a smoothstep ramp
- **Speed ×k:** divide all times by k; **Reverse:** time' = duration − time, then re-sort ascending
- Quaternion hygiene: normalize after any interpolation; when slerping, ensure shortest path (negate one quat if dot < 0)

### A.6 Validator checklist (import + pre-export)

1. glb magic/version/length consistency; chunk alignment
2. `extensions.VRMC_vrm_animation` present with `specVersion` and `humanoid.humanBones.hips`
3. Every `humanBones` entry points to an existing node
4. Every sampler: input accessor is SCALAR float32 ascending; output count matches input count (×3 for CUBICSPLINE); accessor min/max match actual data
5. No channel targets a node outside the extension maps (warn, don't fail)
6. Rotation outputs are unit quaternions within tolerance (auto-repairable: normalize)

Repairable issues → offer Auto-Repair; structural issues (missing hips, broken buffer offsets) → clear error message naming the exact problem.

### A.7 Test fixtures to include

- `fixtures/minimal.vrma` — hips-only rotation, 2 keyframes (hand-crafted, byte-verified)
- `fixtures/full.vrma` — real export from VRoid/XR Animator with bones + expressions + look-at
- `fixtures/cubicspline.vrma` — CUBICSPLINE interpolation case
- `fixtures/broken-*.vrma` — deliberately corrupted files (bad alignment, missing hips, non-ascending times) for validator/repair tests
