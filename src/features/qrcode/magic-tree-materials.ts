import { DoubleSide, MeshLambertMaterial, PlaneGeometry } from 'three';

export type FoliageKind = 'grass' | 'leaf' | 'petal' | 'broadleaf' | 'snow';

/** UV coordinates survive the organic shape so the same mesh can settle into a square. */
export function foliageGeometry(kind: FoliageKind) {
  const geometry = new PlaneGeometry(1, 1, kind === 'grass' ? 2 : 16, kind === 'leaf' ? 8 : 12);
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    if (kind === 'grass') {
      positions.setXYZ(i, (u - .5) * (1 - v * .985) + .27 * v * v,
        v, .12 * v * v + .025 * Math.sin(u * Math.PI));
    } else if (kind === 'leaf') {
      const angle = (u - .5) * 2.5;
      const edge = 1 - .13 * Math.exp(-angle * angle * 90) + .025 * Math.cos(u * Math.PI * 24);
      const radius = .025 + v * (.975 + (edge - 1) * Math.pow(v, 5));
      positions.setXYZ(i, Math.sin(angle) * radius * .68, Math.cos(angle) * radius - .48,
        .11 * Math.sin(angle * 2) * v * v + .065 * Math.cos(u * Math.PI * 8) * v + .08 * v * v);
    } else if (kind === 'petal') {
      // A rounded blossom petal cups upward, with its narrow tip attached to the flower.
      const round = Math.pow(Math.sin(v * Math.PI), .58);
      const width = round * (.58 + .3 * v);
      positions.setXYZ(i, (u - .5) * width, v - .5,
        .06 * round + .14 * (u - .5) ** 2 * 4 * round + .025 * Math.sin(v * Math.PI * 2));
    } else if (kind === 'broadleaf') {
      // A full elliptical leaf, unlike the fan-shaped autumn leaf, with a raised midrib.
      const width = Math.pow(Math.sin(v * Math.PI), .65) * (1.22 + .025 * Math.cos(v * Math.PI * 20));
      positions.setXYZ(i, (u - .5) * width, v - .5,
        .15 * (1 - (u - .5) ** 2 * 4) * Math.sin(v * Math.PI) + .04 * Math.sin(v * Math.PI * 2));
    } else {
      // A soft, low oval mound follows the upper side of a branch or the ground.
      const width = Math.sqrt(Math.max(0, 1 - (v * 2 - 1) ** 2));
      positions.setXYZ(i, (u - .5) * width * 1.5, (v - .5) * .65,
        .14 * width * (1 - (u - .5) ** 2 * 2.8) + .008 * Math.sin(u * 13 + v * 7) * width);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function foliageMaterial(kind: FoliageKind) {
  const material = new MeshLambertMaterial({ side: DoubleSide });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float reveal; varying float vReveal; varying vec2 vOrganicUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vOrganicUv = uv;
      vReveal = reveal;
      transformed = mix(transformed, vec3(uv - .5, 0.0), reveal);
    `);
    shader.fragmentShader = 'varying float vReveal; varying vec2 vOrganicUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec2 organic = vOrganicUv;
      ${kind === 'grass' ? `
        float fiber = .5 + .5 * sin(organic.x * 43.0 + sin(organic.y * 13.0));
        float ridge = exp(-pow((organic.x - .5) * 20.0, 2.0));
        float detail = .67 + .28 * organic.y + .08 * fiber + .09 * ridge;
      ` : kind === 'leaf' ? `
        float vein = pow(.5 + .5 * cos(organic.x * 125.6637), 18.0);
        float fineVein = pow(.5 + .5 * cos(organic.x * 251.3274 + organic.y * 2.0), 24.0);
        float mottling = sin(organic.x * 67.0 + sin(organic.y * 31.0)) * sin(organic.y * 83.0);
        float detail = .85 + .13 * organic.y - .10 * vein - .045 * fineVein + .04 * mottling;
      ` : kind === 'petal' ? `
        float fold = .5 + .5 * cos((organic.x - .5) * 20.0);
        float blush = sin(organic.y * 3.14159);
        float detail = .84 + .13 * organic.y + .055 * fold * blush;
      ` : kind === 'broadleaf' ? `
        float midrib = exp(-pow((organic.x - .5) * 32.0, 2.0));
        float branches = pow(.5 + .5 * cos((organic.y - abs(organic.x - .5) * .72) * 58.0), 18.0);
        float detail = .84 + .10 * organic.y + .07 * midrib - .055 * branches;
      ` : `
        float softMound = sin(organic.y * 3.14159) * sin(organic.x * 3.14159);
        float detail = .94 + .06 * softMound;
      `}
      outgoingLight = mix(outgoingLight * detail, diffuseColor.rgb, vReveal);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => kind === 'grass' || kind === 'leaf'
    ? `autumn-square-${kind}-v1` : `season-square-${kind}-v1`;
  return material;
}

export function barkMaterial(color: string) {
  const material = new MeshLambertMaterial({ color, transparent: true });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 vBarkUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBarkUv = uv;');
    shader.fragmentShader = 'varying vec2 vBarkUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float along = vBarkUv.x;
      float around = vBarkUv.y;
      float warp = .018 * sin(along * 45.0) + .009 * sin(along * 113.0);
      float furrow = pow(.5 + .5 * sin((around + warp) * 100.53), 14.0);
      float grain = .5 + .5 * sin(around * 320.0 + sin(along * 91.0) * 2.0);
      vec2 knot = vec2((along - .28) * 28.0, sin((around - .35) * 3.14159) * 8.0);
      float knotRing = exp(-dot(knot, knot) * .7) * (.5 + .5 * sin(length(knot) * 21.0));
      outgoingLight *= .88 + .17 * grain - .32 * furrow - .19 * knotRing;
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'autumn-bark-v1';
  return material;
}
