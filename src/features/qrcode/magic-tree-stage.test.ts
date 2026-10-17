import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstancedMesh, OrthographicCamera, Scene, Matrix4, Vector3 } from 'three';
import { createMagicTreeStage } from './magic-tree-stage';
import type { TreeSeason } from './magic-tree-config';

const rendererState = vi.hoisted(() => ({ render: vi.fn(), clear: vi.fn(), dispose: vi.fn() }));
vi.mock('./qr-modules', () => ({ loadQrModules: vi.fn(async () => Array.from({ length: 21 }, (_, y) => Array.from({ length: 21 }, (_, x) => (x + y) % 3 !== 0))) }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    domElement = document.createElement('canvas');
    setPixelRatio() {} setClearColor = rendererState.clear; setSize() {}
    render = rendererState.render;
    dispose = rendererState.dispose;
  } };
});
let callbacks: Map<number, FrameRequestCallback>;
let nextId: number;
let now: number;
let clean: (() => void) | undefined;
let reduced = false;
const tick = (count = 1) => {
  for (let i = 0; i < count; i++) {
    now += 50;
    const pending = [...callbacks.values()]; callbacks.clear();
    pending.forEach(callback => callback(now));
  }
};
const objects = () => {
  const [scene, camera] = rendererState.render.mock.calls.at(-1) as [Scene, OrthographicCamera];
  return { camera, canopy: scene.getObjectByName('canopy') as InstancedMesh, meadow: scene.getObjectByName('meadow') as InstancedMesh };
};
beforeEach(() => {
  callbacks = new Map(); nextId = 0; now = 100; reduced = false;
  rendererState.clear.mockClear(); rendererState.render.mockClear(); rendererState.dispose.mockClear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++nextId, callback); return nextId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
});
afterEach(() => { clean?.(); clean = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function mount(width = 550, season?: TreeSeason) {
  const host = document.createElement('div');
  Object.defineProperties(host, { clientWidth: { value: width }, clientHeight: { value: 480 } });
  const fail = vi.fn();
  const stage = await createMagicTreeStage(host, 'blob:qr', new AbortController().signal, fail, season);
  clean = stage.destroy;
  tick(); return { host, stage, fail };
}

describe('tree rendering lifecycle', () => {
  it('animates natural poses, supports reversal and keeps scan movement inside fixed module centers', async () => {
    const { stage } = await mount();
    const before = objects().canopy.instanceMatrix.array.slice();
    tick(4);
    expect(objects().canopy.instanceMatrix.array).not.toEqual(before);
    stage.setQr(true); tick(15);
    const midCamera = objects().camera.position.clone();
    stage.setQr(false); tick(5);
    expect(objects().camera.position.distanceTo(midCamera)).toBeGreaterThan(.01);
    stage.setQr(true); tick(55);
    expect(objects().camera.position.x).toBeCloseTo(0);
    expect(objects().camera.position.z).toBeCloseTo(0);
    expect(objects().camera.up.z).toBeCloseTo(-1);
    expect(callbacks.size).toBe(1);
    const scanBefore = objects().canopy.instanceMatrix.array.slice();
    const cameraBefore = objects().camera.matrixWorld.elements.slice();
    tick(10);
    const scanAfter = objects().canopy.instanceMatrix.array;
    expect(objects().canopy.visible).toBe(true);
    expect(scanAfter).toEqual(scanBefore);
    for (let i = 0; i < scanAfter.length; i += 16) {
      expect(Math.abs(scanAfter[i + 12] - scanBefore[i + 12])).toBeLessThan(3.65 / 21 * .121);
      expect(Math.abs(scanAfter[i + 14] - scanBefore[i + 14])).toBeLessThan(3.65 / 21 * .121);
    }
    expect(objects().camera.matrixWorld.elements).toEqual(cameraBefore);
    stage.setQr(false); tick(55); expect(callbacks.size).toBe(1);
  });
  it('keeps all foliage present in aligned squares covering every dark module, without intruding into light cells', async () => {
    const { stage } = await mount();
    expect(rendererState.clear).toHaveBeenLastCalledWith(expect.any(String), 0);
    const grass = objects().meadow;
    stage.setQr(true); tick(55);
    const occupied = new Set<string>();
    const cell = 3.65 / 21;
    const matrix = new Matrix4();
    const [scene] = rendererState.render.mock.calls.at(-1) as [Scene];
    const meshes = [grass, objects().canopy, scene.getObjectByName('fallen-leaves') as InstancedMesh];
    for (const mesh of meshes) for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      const scale = new Vector3().setFromMatrixScale(matrix);
      expect(scale.x).toBeGreaterThan(0);
      const center = new Vector3().setFromMatrixPosition(matrix);
      const x = Math.round(center.x / cell + 10), y = Math.round(center.z / cell + 10);
      expect((x + y) % 3).not.toBe(0);
      occupied.add(`${x},${y}`);
      expect(scale.x).toBeCloseTo(cell, 6); expect(scale.y).toBeCloseTo(cell, 6);
      expect(mesh.geometry.getAttribute('reveal').getX(i)).toBe(1);
      // Shader's final local geometry is exactly uv - .5, irrespective of the organic mesh.
      for (const dx of [-.5, .5]) for (const dy of [-.5, .5]) {
        const corner = new Vector3(dx, dy, 0).applyMatrix4(matrix);
        expect(Math.abs(corner.x - center.x)).toBeCloseTo(cell / 2, 6);
        expect(Math.abs(corner.z - center.z)).toBeCloseTo(cell / 2, 6);
        expect(corner.y).toBeCloseTo(center.y, 6);
        expect(Math.abs(corner.x)).toBeLessThanOrEqual(3.65 / 2 + 1e-6);
        expect(Math.abs(corner.z)).toBeLessThanOrEqual(3.65 / 2 + 1e-6);
      }
    }
    expect(occupied.size).toBe(294);
    const before = grass.instanceMatrix.array.slice();
    tick(100);
    expect(grass.instanceMatrix.array).toEqual(before);
  });
  it.each([[550, 24], [900, 40]])('keeps %i px ground leaves stationary and restores them on reversal', async (width, count) => {
    reduced = true;
    const { stage } = await mount(width);
    const [scene] = rendererState.render.mock.calls.at(-1) as [Scene];
    const litter = scene.getObjectByName('fallen-leaves') as InstancedMesh;
    expect(litter.count).toBe(count);
    expect(litter.visible).toBe(true);
    const before = litter.instanceMatrix.array.slice();
    for (let i = 0; i < litter.count; i++) {
      const y = before[i * 16 + 13];
      expect(y).toBeGreaterThan(.02); expect(y).toBeLessThan(.04);
      expect(Math.abs(before[i * 16 + 12])).toBeLessThan(1.56);
      expect(Math.abs(before[i * 16 + 14])).toBeLessThan(1.56);
    }
    tick(10); expect(litter.instanceMatrix.array).toEqual(before);
    stage.setQr(true); tick(); expect(litter.visible).toBe(true);
    stage.setQr(false); tick(); expect(litter.visible).toBe(true);
    expect(litter.instanceMatrix.array).toEqual(before);
  });
  it('uses nearby, fixed destinations and keeps canopy height instead of rebuilding the code at the end', async () => {
    const { stage } = await mount();
    const canopy = objects().canopy;
    const before = canopy.instanceMatrix.array.slice();
    stage.setQr(true); tick(55);
    let travel = 0;
    for (let i = 0; i < canopy.count; i++) {
      const offset = i * 16;
      const after = canopy.instanceMatrix.array;
      travel += Math.hypot(after[offset + 12] - before[offset + 12], after[offset + 14] - before[offset + 14]);
      expect(Math.abs(after[offset + 13] - before[offset + 13])).toBeLessThan(.06);
    }
    expect(travel / canopy.count).toBeLessThan(.25);
    expect(canopy.visible).toBe(true);
  });
  it('renders once per state when reduced motion is enabled', async () => {
    reduced = true;
    const { stage } = await mount();
    expect(callbacks.size).toBe(0);
    stage.setQr(true); tick();
    expect(objects().camera.position.z).toBeCloseTo(0);
    expect(callbacks.size).toBe(0);
    stage.setQr(false); tick();
    expect(objects().camera.position.z).toBeGreaterThan(0);
  });
  it('limits scan rendering to 20 FPS and pauses while the document is hidden', async () => {
    const { stage } = await mount();
    stage.setQr(true); tick(55);
    const count = rendererState.render.mock.calls.length;
    for (let i = 0; i < 30; i++) {
      now += 10;
      const pending = [...callbacks.values()]; callbacks.clear();
      pending.forEach(callback => callback(now));
    }
    expect(rendererState.render.mock.calls.length - count).toBeLessThanOrEqual(6);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    const paused = rendererState.render.mock.calls.length;
    tick(5); expect(rendererState.render).toHaveBeenCalledTimes(paused);
    expect(callbacks.size).toBe(0);
    hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'));
    tick(); expect(rendererState.render.mock.calls.length).toBeGreaterThan(paused);
  });
  it('releases the renderer and stops scheduling on context loss', async () => {
    const { host, stage, fail } = await mount();
    const canvas = host.querySelector('canvas')!;
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(fail).toHaveBeenCalledOnce();
    expect(host.querySelector('canvas')).toBeNull();
    expect(callbacks.size).toBe(0);
    stage.destroy(); expect(rendererState.dispose).toHaveBeenCalledOnce();
  });
});

describe('seasonal scene acceptance', () => {
  it.each<TreeSeason>(['spring', 'summer', 'autumn', 'winter'])('%s settles every visible material into dark cells and removes atmosphere', async season => {
    const { stage, fail } = await mount(390, season);
    stage.setQr(true); tick(55);
    const [scene, camera] = rendererState.render.mock.calls.at(-1) as [Scene, OrthographicCamera];
    const occupied = new Set<string>(), matrix = new Matrix4();
    for (const name of ['meadow', 'canopy', 'fallen-leaves', 'young-leaves']) {
      const mesh = scene.getObjectByName(name) as InstancedMesh;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        const center = new Vector3().setFromMatrixPosition(matrix);
        const x = Math.round(center.x / (3.65 / 21) + 10), z = Math.round(center.z / (3.65 / 21) + 10);
        expect((x + z) % 3).not.toBe(0); occupied.add(`${x},${z}`);
        const scale = new Vector3().setFromMatrixScale(matrix);
        expect(scale.x).toBeCloseTo(3.65 / 21, 6); expect(scale.y).toBeCloseTo(scale.x, 6);
        expect(mesh.geometry.getAttribute('reveal').getX(i)).toBe(1);
      }
    }
    expect(occupied.size).toBe(294);
    for (const name of ['season-atmosphere', 'season-glints', 'canopy-shadow']) expect(scene.getObjectByName(name)?.visible).toBe(false);
    expect((camera.right - camera.left) / camera.zoom).toBeGreaterThanOrEqual(3.65 / 21 * 29);
    const still = objects().canopy.instanceMatrix.array.slice(); tick(15);
    expect(objects().canopy.instanceMatrix.array).toEqual(still);
    expect(fail).not.toHaveBeenCalled();
  });

  it('keeps winter branch snow anchored while its atmospheric flakes continue moving', async () => {
    await mount(550, 'winter');
    const before = objects().canopy.instanceMatrix.array.slice();
    const [scene] = rendererState.render.mock.calls.at(-1) as [Scene];
    const flakes = scene.getObjectByName('season-atmosphere') as InstancedMesh;
    expect(flakes.count).toBe(96);
    const snowBefore = flakes.instanceMatrix.array.slice(); tick(35);
    expect(objects().canopy.instanceMatrix.array).toEqual(before);
    expect(flakes.instanceMatrix.array).not.toEqual(snowBefore);
    tick(172);
    const edge = flakes.instanceMatrix.array.slice(); tick(2);
    for (let i = 0; i < flakes.count; i++) {
      const beforeScale = Math.hypot(edge[i * 16], edge[i * 16 + 1], edge[i * 16 + 2]);
      const afterScale = Math.hypot(flakes.instanceMatrix.array[i * 16], flakes.instanceMatrix.array[i * 16 + 1], flakes.instanceMatrix.array[i * 16 + 2]);
      if (beforeScale > .005 && afterScale > .005) expect(Math.abs(flakes.instanceMatrix.array[i * 16 + 12] - edge[i * 16 + 12])).toBeLessThan(.15);
    }
  });

  it('uses the same intermediate camera path and tree skeleton in every season', async () => {
    let referenceCamera: number[] | undefined;
    let referenceBranches: number[][] | undefined;
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      const { stage } = await mount(550, season);
      stage.setQr(true); tick(16);
      const [scene, camera] = rendererState.render.mock.calls.at(-1) as [Scene, OrthographicCamera];
      const branches: number[][] = [];
      scene.traverse(object => {
        if ('geometry' in object && (object.geometry as { type?: string }).type === 'TubeGeometry') branches.push(Array.from((object as InstancedMesh).geometry.getAttribute('position').array));
      });
      const path = [...camera.position.toArray(), ...camera.up.toArray(), camera.zoom];
      if (referenceCamera) { expect(path).toEqual(referenceCamera); expect(branches).toEqual(referenceBranches); }
      referenceCamera = path; referenceBranches = branches; stage.destroy();
    }
  });

  it.each<TreeSeason>(['spring', 'summer', 'autumn', 'winter'])('%s respects reduced motion and restores its natural materials', async season => {
    reduced = true;
    const { stage } = await mount(550, season);
    const before = objects().canopy.instanceMatrix.array.slice();
    expect(callbacks.size).toBe(0);
    stage.setQr(true); tick(); stage.setQr(false); tick();
    expect(objects().canopy.instanceMatrix.array).toEqual(before);
    expect(callbacks.size).toBe(0);
  });
});
