import { describe, expect, it } from 'vitest';
import { ShaderLib, type WebGLRenderer } from 'three';
import { foliageGeometry, foliageMaterial, type FoliageKind } from './magic-tree-materials';

const kinds: FoliageKind[] = ['grass', 'leaf', 'petal', 'broadleaf', 'snow'];

function compiledShader(kind: FoliageKind) {
  const material = foliageMaterial(kind);
  const shader = { vertexShader: ShaderLib.lambert.vertexShader, fragmentShader: ShaderLib.lambert.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as WebGLRenderer);
  material.dispose();
  return shader;
}

describe('season foliage geometry and square reveal', () => {
  it.each(kinds)('retains a full UV square, finite curved vertices and normals for %s', kind => {
    const geometry = foliageGeometry(kind);
    const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), normal = geometry.getAttribute('normal');
    const corners = new Set<string>();
    let curved = false;
    for (let i = 0; i < positions.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
      if ((u === 0 || u === 1) && (v === 0 || v === 1)) corners.add(`${u},${v}`);
      for (const value of [positions.getX(i), positions.getY(i), positions.getZ(i), normal.getX(i), normal.getY(i), normal.getZ(i)]) expect(Number.isFinite(value)).toBe(true);
      curved ||= Math.abs(positions.getZ(i)) > .02;
    }
    expect(corners.size).toBe(4);
    expect(curved).toBe(true);
    const shader = compiledShader(kind);
    expect(shader.vertexShader).toContain('transformed = mix(transformed, vec3(uv - .5, 0.0), reveal)');
    expect(shader.fragmentShader).toContain('mix(outgoingLight * detail, diffuseColor.rgb, vReveal)');
    geometry.dispose();
  });

  it('distinguishes blossom petals, summer leaves and low winter snow in silhouette', () => {
    const shape = (kind: FoliageKind) => {
      const geometry = foliageGeometry(kind); geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      const result = { width: bounds.max.x - bounds.min.x, height: bounds.max.y - bounds.min.y };
      geometry.dispose(); return result;
    };
    const petal = shape('petal'), broadleaf = shape('broadleaf'), snow = shape('snow');
    expect(petal.width).toBeLessThan(.85);
    expect(petal.height).toBeCloseTo(1);
    expect(broadleaf.width).toBeGreaterThan(1.2);
    expect(broadleaf.height).toBeCloseTo(1);
    expect(snow.width).toBeGreaterThan(broadleaf.width);
    expect(snow.height).toBeCloseTo(.65);
  });

  it('gives each material its own shader cache key and keeps winter shading free of leaf veins', () => {
    const materials = kinds.map(foliageMaterial);
    const keys = materials.map(material => material.customProgramCacheKey());
    expect(new Set(keys).size).toBe(kinds.length);
    expect(keys.slice(0, 2)).toEqual(['autumn-square-grass-v1', 'autumn-square-leaf-v1']);
    expect(compiledShader('snow').fragmentShader).toContain('softMound');
    expect(compiledShader('snow').fragmentShader).not.toMatch(/vein|midrib|branches|fiber/);
    expect(compiledShader('petal').fragmentShader).toContain('blush');
    expect(compiledShader('broadleaf').fragmentShader).toContain('midrib');
    materials.forEach(material => material.dispose());
  });
});
