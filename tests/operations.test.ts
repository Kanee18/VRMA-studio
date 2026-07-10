import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { concatDocuments } from '../src/core/operations/merge';
import { sampleKeyframes, slerpQuat } from '../src/core/operations/resample';
import { splitDocument } from '../src/core/operations/split';
import { trimDocument } from '../src/core/operations/trim';
import { parseVrma } from '../src/core/vrma/parser';
import { writeVrma } from '../src/core/vrma/writer';
import type { Quat } from '../src/core/vrma/types';

const FIXTURE_URL = new URL('./fixtures/minimal.vrma', import.meta.url);
const loadDoc = () => parseVrma(new Uint8Array(readFileSync(FIXTURE_URL))).document;

/** Fixture rotates 0° → 90° around Y over 1s, so rotation(t) = 90t degrees. */
const quatAroundY = (degrees: number): Quat => {
  const half = (degrees * Math.PI) / 360;
  return [0, Math.sin(half), 0, Math.cos(half)];
};

const expectQuatClose = (actual: Quat, expected: Quat) => {
  expected.forEach((component, i) => expect(actual[i]).toBeCloseTo(component, 5));
};

describe('slerpQuat', () => {
  it('interpolates along the shortest path and normalizes', () => {
    const q = slerpQuat([0, 0, 0, 1], quatAroundY(90), 0.5);
    expectQuatClose(q, quatAroundY(45));
    // long-way-around input: negated endpoint must give the same rotation
    const neg = quatAroundY(90).map((v) => -v) as Quat;
    const q2 = slerpQuat([0, 0, 0, 1], neg, 0.5);
    expect(Math.abs(q2[1])).toBeCloseTo(Math.abs(quatAroundY(45)[1]), 5);
  });
});

describe('trimDocument', () => {
  it('keeps [t0, t1], inserts interpolated boundary keys, and re-times to 0', () => {
    const trimmed = trimDocument(loadDoc(), 0.25, 0.75);

    expect(trimmed.duration).toBeCloseTo(0.5, 6);
    const rotation = trimmed.boneTracks.get('hips')?.rotation;
    expect(rotation).toBeDefined();
    expect(rotation?.times).toEqual([0, 0.5]);
    // Slerp along a 90° arc is angle-linear: t=0.25 → 22.5°, t=0.75 → 67.5°.
    expectQuatClose(rotation!.values[0], quatAroundY(22.5));
    expectQuatClose(rotation!.values[1], quatAroundY(67.5));

    // Rest pose and node maps survive the operation.
    expect(trimmed.skeleton).toEqual(loadDoc().skeleton);
    expect(trimmed.nodeMaps.bones.get('hips')).toBe(0);
  });

  it('keeps interior keyframes and does not duplicate exact-boundary keys', () => {
    const trimmed = trimDocument(loadDoc(), 0, 0.5);
    const rotation = trimmed.boneTracks.get('hips')?.rotation;
    // Original key at t=0 must not be duplicated by the boundary sample.
    expect(rotation?.times).toEqual([0, 0.5]);
    expectQuatClose(rotation!.values[0], [0, 0, 0, 1]);
  });

  it('rejects an empty range', () => {
    expect(() => trimDocument(loadDoc(), 0.5, 0.5)).toThrow(/empty/i);
  });

  it('produces a document that survives write → parse', () => {
    const trimmed = trimDocument(loadDoc(), 0.25, 0.75);
    const reparsed = parseVrma(writeVrma(trimmed));
    expect(reparsed.warnings).toEqual([]);
    expect(reparsed.document.duration).toBeCloseTo(0.5, 5);
    const rotation = reparsed.document.boneTracks.get('hips')?.rotation;
    expectQuatClose(rotation!.values[0], quatAroundY(22.5));
  });
});

describe('splitDocument', () => {
  it('is equivalent to the two trims [0,t] and [t,duration]', () => {
    const [head, tail] = splitDocument(loadDoc(), 0.5);
    expect(head.duration).toBeCloseTo(0.5, 6);
    expect(tail.duration).toBeCloseTo(0.5, 6);
    const headEnd = head.boneTracks.get('hips')!.rotation!.values.at(-1)!;
    const tailStart = tail.boneTracks.get('hips')!.rotation!.values[0];
    expectQuatClose(headEnd, quatAroundY(45));
    expectQuatClose(tailStart, quatAroundY(45)); // continuous at the cut
  });
});

describe('concatDocuments', () => {
  it('rejoining a split reproduces the original curve', () => {
    const original = loadDoc();
    const [head, tail] = splitDocument(original, 0.4);
    const rejoined = concatDocuments(head, tail);

    expect(rejoined.duration).toBeCloseTo(1, 6);
    const rotation = rejoined.boneTracks.get('hips')!.rotation!;
    // Sample the rejoined curve against the original at several times.
    const originalRotation = original.boneTracks.get('hips')!.rotation!;
    for (const t of [0, 0.2, 0.4, 0.7, 1]) {
      expectQuatClose(
        sampleKeyframes(rotation, t, slerpQuat),
        sampleKeyframes(originalRotation, t, slerpQuat),
      );
    }
    // Times stay strictly ascending across the join.
    for (let i = 1; i < rotation.times.length; i++) {
      expect(rotation.times[i]).toBeGreaterThan(rotation.times[i - 1]);
    }
  });

  it('a jump cut (deleted middle segment) keeps times strictly ascending and writes cleanly', () => {
    const original = loadDoc();
    const head = trimDocument(original, 0, 0.3);
    const tail = trimDocument(original, 0.7, 1);
    const joined = concatDocuments(head, tail);

    expect(joined.duration).toBeCloseTo(0.6, 6);
    const reparsed = parseVrma(writeVrma(joined));
    expect(reparsed.warnings).toEqual([]);
    expect(reparsed.document.duration).toBeCloseTo(0.6, 4);
  });
});
