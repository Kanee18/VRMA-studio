import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStudioStore } from '../src/app/store';

const FIXTURE_URL = new URL('./fixtures/minimal.vrma', import.meta.url);

const fixtureArrayBuffer = (): ArrayBuffer => {
  const buffer = readFileSync(FIXTURE_URL);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
};

const state = () => useStudioStore.getState();
const ranges = () => state().clips.map((clip) => [clip.in, clip.out]);

const initialState = useStudioStore.getState();

describe('studio store editing (razor/split/trim/delete/undo)', () => {
  beforeEach(() => {
    useStudioStore.setState(initialState, true);
    state().openVrma(fixtureArrayBuffer(), 'minimal.vrma');
  });

  it('opens a .vrma as a single full-length clip', () => {
    expect(ranges()).toEqual([[0, 1]]);
    expect(state().document?.duration).toBe(1);
    expect(state().importError).toBeNull();
  });

  it('razor cut splits the clip covering the given timeline time', () => {
    state().splitClipAt(0.5);
    expect(ranges()).toEqual([
      [0, 0.5],
      [0.5, 1],
    ]);
    // Cutting does not change what plays.
    expect(state().document?.duration).toBeCloseTo(1, 6);
  });

  it('maps timeline time to source time across a jump cut', () => {
    // Build [0,0.3] + [0.7,1] (middle deleted): timeline length 0.6.
    state().splitClipAt(0.3);
    state().splitClipAt(0.7);
    const middle = state().clips[1];
    state().selectClip(middle.id);
    state().deleteSelectedClip();
    expect(ranges()).toEqual([
      [0, 0.3],
      [0.7, 1],
    ]);
    expect(state().document?.duration).toBeCloseTo(0.6, 6);

    // Timeline 0.45 falls 0.15 into the second clip → source time 0.85.
    state().splitClipAt(0.45);
    expect(ranges()).toEqual([
      [0, 0.3],
      [0.7, 0.85],
      [0.85, 1],
    ]);
  });

  it('ignores razor clicks on clip boundaries', () => {
    state().splitClipAt(0.5);
    state().splitClipAt(0.5); // exactly on the cut → no sliver clips
    expect(state().clips).toHaveLength(2);
  });

  it('trimClip shortens playback and clamps the playhead', () => {
    state().setPlayhead(0.9);
    const clip = state().clips[0];
    state().trimClip(clip.id, 0.25, 0.75);
    expect(ranges()).toEqual([[0.25, 0.75]]);
    expect(state().document?.duration).toBeCloseTo(0.5, 6);
    expect(state().playhead).toBeLessThanOrEqual(0.5);
  });

  it('undo/redo restore both the clip list and the derived document', () => {
    state().splitClipAt(0.5);
    const middle = state().clips[0];
    state().selectClip(middle.id);
    state().deleteSelectedClip();
    expect(state().document?.duration).toBeCloseTo(0.5, 6);

    state().undo();
    expect(ranges()).toEqual([
      [0, 0.5],
      [0.5, 1],
    ]);
    expect(state().document?.duration).toBeCloseTo(1, 6);

    state().undo();
    expect(ranges()).toEqual([[0, 1]]);

    state().redo();
    expect(ranges()).toEqual([
      [0, 0.5],
      [0.5, 1],
    ]);
  });

  it('refuses to delete the last remaining clip', () => {
    const only = state().clips[0];
    state().selectClip(only.id);
    state().deleteSelectedClip();
    expect(state().clips).toHaveLength(1);
  });

  it('switches timeline tools', () => {
    expect(state().tool).toBe('select');
    state().setTool('razor');
    expect(state().tool).toBe('razor');
  });
});
