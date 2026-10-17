import { seasonWind } from './magic-tree-config';

/** A finite leaf cycle: leave a real branch, settle, fade, then reuse the same slot. */
export function fallingLeafPose(time: number, index: number, source: { x: number; y: number; z: number }) {
  const cycle = 10.4;
  const delay = index * .13 + source.x * .11 + source.z * .07;
  const age = ((time - delay) % cycle + cycle) % cycle;
  const active = age - .8;
  const flight = Math.max(0, Math.min(1, active / 5.2));
  const flutter = Math.sin(Math.PI * flight);
  const appearance = Math.max(0, Math.min(1, active / .22));
  const disappearance = Math.max(0, Math.min(1, (8.1 - age) / .9));
  return {
    x: source.x + flight * .72 + Math.sin(flight * Math.PI * 3 + index) * .15 * flutter,
    y: source.y * (1 - flight) + .035 * flight + .14 * flutter * Math.max(0, Math.sin(flight * Math.PI * 3)),
    z: source.z + flight * .28 + Math.sin(flight * Math.PI * 2 + index) * .10 * flutter,
    rotationX: -1.25 + Math.sin(flight * Math.PI * 5 + index) * .6 * flutter,
    rotationY: index + flight * Math.PI * 2,
    rotationZ: Math.sin(flight * Math.PI * 4 + index) * .65,
    presence: appearance * disappearance
  };
}

/** Windblown snow reuses fixed slots, disappearing before each fall wraps overhead. */
export function winterSnowPose(time: number, index: number, seed: { x: number; y: number; z: number }) {
  const layer = index % 3;
  const cycle = 8 - layer * .9;
  const phase = time / cycle + seed.y * .23 + index * .61803398875;
  const fall = ((phase % 1) + 1) % 1;
  const smooth = (value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    return clamped * clamped * (3 - 2 * clamped);
  };
  const presence = smooth(fall / .08) * smooth((1 - fall) / .09);
  const wind = seasonWind(time, seed.x, seed.z, 'winter');
  const curl = Math.max(0, Math.sin(time * .67 - index * .31)) ** 4;
  const flutter = Math.sin(Math.PI * fall);
  const swirl = curl * flutter * (.35 + .65 * Math.min(1, Math.max(0, wind)));
  const drift = 1.45 + layer * .2;
  const variation = .5 + .5 * Math.sin(index * 1.73 + seed.y);
  return {
    x: seed.x - drift * .5 + drift * fall + wind * .24 + Math.sin(time * 2.1 + index) * .14 * swirl,
    y: 4.5 * (1 - fall),
    z: seed.z * .8 + (layer - 1) * .24 + (.32 + layer * .08) * (fall - .5) + wind * .07 + Math.cos(time * 1.8 + index) * .1 * swirl,
    rotationX: -.52 + Math.sin(time * 1.1 + index) * .3 + curl * .2,
    rotationY: index + time * (.6 + layer * .1),
    rotationZ: -.62 - wind * .35 + Math.sin(time * .8 + index) * .22,
    presence,
    size: [.025, .038, .052][layer] + variation * (layer === 2 ? .008 : .006)
  };
}
