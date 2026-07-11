/**
 * Editing-timebase helpers. VRMA stores keyframe times in seconds with no
 * intrinsic frame rate, so the UI adopts a 30 fps editing timebase — the
 * playhead steps, snaps, and reads out in frames like a conventional NLE,
 * while the underlying document keeps full float precision.
 */
export const FPS = 30;

/** Round a time in seconds to the nearest frame boundary of the editing timebase. */
export function quantizeToFrame(seconds: number): number {
  return Math.round(seconds * FPS) / FPS;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** Format seconds as NLE timecode `MM:SS:FF` (with hours only when non-zero). */
export function formatTimecode(seconds: number): string {
  const totalFrames = Math.max(0, Math.round(seconds * FPS));
  const frames = totalFrames % FPS;
  const totalSeconds = Math.floor(totalFrames / FPS);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const core = `${pad(m)}:${pad(s)}:${pad(frames)}`;
  return h > 0 ? `${pad(h)}:${core}` : core;
}
