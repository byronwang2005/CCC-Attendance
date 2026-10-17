import { describe, expect, it } from 'vitest';
import { fallingLeafPose, winterSnowPose } from './magic-tree-ecology';

describe('finite falling leaf ecology', () => {
  const source = { x: .7, y: 3.1, z: -.4 };
  it('starts at the branch and settles near the ground before fading', () => {
    const snapshots = Array.from({ length: 1040 }, (_, i) => fallingLeafPose(i / 100, 0, source));
    const visible = snapshots.filter(pose => pose.presence > .01);
    expect(visible[0].y).toBeGreaterThan(3);
    expect(visible.some(pose => pose.y < .04 && pose.presence === 1)).toBe(true);
    expect(visible.at(-1)!.presence).toBeLessThan(.03);
    expect(visible.at(-1)!.x).toBeGreaterThan(source.x);
    for (const pose of snapshots) {
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      expect(pose.y).toBeGreaterThanOrEqual(.035 - 1e-8);
    }
  });
  it('recycles only after the slot becomes invisible and staggers leaves', () => {
    expect(fallingLeafPose(10.399, 0, { x: 0, y: 3, z: 0 }).presence).toBe(0);
    expect(fallingLeafPose(10.401, 0, { x: 0, y: 3, z: 0 }).presence).toBe(0);
    expect(fallingLeafPose(1, 0, source).presence).not.toBe(fallingLeafPose(1, 5, source).presence);
    expect(fallingLeafPose(5.3, 2, source)).toEqual(fallingLeafPose(5.3, 2, source));
  });
});

describe('finite windblown winter snow', () => {
  const seed = { x: .7, y: 2.3, z: -.4 };

  it('carries each flake downwind across a fall, with three distinct depth sizes', () => {
    for (let index = 0; index < 3; index++) {
      const cycle = 8 - index * .9;
      const phase = index * .61803398875;
      const startTime = (Math.ceil(phase) + .12 - phase) * cycle;
      const start = winterSnowPose(startTime, index, { x: 0, y: 0, z: 0 });
      const end = winterSnowPose(startTime + cycle * .76, index, { x: 0, y: 0, z: 0 });
      expect(start.presence).toBe(1);
      expect(end.presence).toBe(1);
      expect(end.x - start.x).toBeGreaterThan(.7);
      expect(end.z - start.z).toBeGreaterThan(.15);
      expect(start.y - end.y).toBeCloseTo(3.42);
    }
    const sizes = [0, 1, 2].map(index => winterSnowPose(2, index, seed).size);
    expect(sizes[0]).toBeLessThan(sizes[1]);
    expect(sizes[1]).toBeLessThan(sizes[2]);
  });

  it('moves continuously while visible and hides every recycled slot', () => {
    for (let index = 0; index < 12; index++) {
      const cycle = 8 - index % 3 * .9;
      const initialPhase = seed.y * .23 + index * .61803398875;
      const wrapTime = (Math.ceil(initialPhase) - initialPhase) * cycle;
      const beforeWrap = winterSnowPose(wrapTime - .001, index, seed);
      const afterWrap = winterSnowPose(wrapTime + .001, index, seed);
      expect(beforeWrap.presence).toBeLessThan(.0001);
      expect(afterWrap.presence).toBeLessThan(.0001);
      const midFall = wrapTime + cycle * .5;
      const before = winterSnowPose(midFall, index, seed);
      const after = winterSnowPose(midFall + .0001, index, seed);
      for (const key of ['x', 'y', 'z', 'rotationX', 'rotationY', 'rotationZ'] as const) {
        expect(Math.abs(after[key] - before[key])).toBeLessThan(.001);
      }
    }
  });

  it('stays deterministic, finite and bounded through repeated fixed-pool cycles', () => {
    for (let index = 0; index < 160; index++) {
      for (const time of [-20, 0, 2.7, 42.1, 800]) {
        const pose = winterSnowPose(time, index, seed);
        expect(pose).toEqual(winterSnowPose(time, index, seed));
        expect(Object.values(pose).every(Number.isFinite)).toBe(true);
        expect(pose.presence).toBeGreaterThanOrEqual(0);
        expect(pose.presence).toBeLessThanOrEqual(1);
        expect(pose.y).toBeGreaterThanOrEqual(0);
        expect(pose.y).toBeLessThanOrEqual(4.5);
        expect(Math.abs(pose.x - seed.x)).toBeLessThan(1.7);
        expect(Math.abs(pose.z - seed.z * .8)).toBeLessThan(.8);
        expect(pose.size).toBeGreaterThanOrEqual(.025);
        expect(pose.size).toBeLessThanOrEqual(.06);
      }
    }
  });
});
