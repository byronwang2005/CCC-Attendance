import {
  AmbientLight, BufferGeometry, CircleGeometry, Color, CatmullRomCurve3, TubeGeometry, DirectionalLight,
  DoubleSide, Float32BufferAttribute, Group, InstancedMesh, LineBasicMaterial,
  InstancedBufferAttribute,
  LineSegments, Material, Mesh, MeshBasicMaterial, Object3D,
  OrthographicCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer
} from 'three';
import { loadQrModules } from './qr-modules';
import { advanceTreeTransition, naturalQrTargets, TREE_PALETTE, TREE_SEASONS, autumnGust, seasonWind, canopyCoverage, meadowDensity, qrModuleColors, treeRandom, treeTransition, treeWind, type TreeSeason } from './magic-tree-config';

import { barkMaterial, foliageGeometry, foliageMaterial } from './magic-tree-materials';
import { fallingLeafPose, winterSnowPose } from './magic-tree-ecology';

export interface MagicTreeScene {
  setQr(value: boolean): void;
  destroy(): void;
}

export async function createMagicTreeStage(
  host: HTMLElement, imageUrl: string, signal: AbortSignal, onFailure: () => void, season?: TreeSeason
): Promise<MagicTreeScene> {
  // Explicit seasons enable the seasonal ecology; omitted values preserve the legacy autumn API.
  const enhanced = season !== undefined;
  const activeSeason = season ?? 'autumn';
  const palette = enhanced ? TREE_SEASONS[activeSeason].palette : TREE_PALETTE;
  const modules = await loadQrModules(imageUrl, signal);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  const scene = new Scene();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const geometry = <T extends BufferGeometry>(value: T) => { geometries.add(value); return value; };
  const material = <T extends Material>(value: T) => { materials.add(value); return value; };
  let frame = 0;
  let destroyed = false;
  let observer: ResizeObserver | undefined;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motion.matches;
  let progress = 0;
  let target = 0;
  let last = 0;
  let time = 0;
  let lastScanFrame = 0;
  let wake: () => void = () => {};
  const visibility = () => { cancelAnimationFrame(frame); frame = 0; last = 0; wake(); };
  const preference = () => { reduced = motion.matches; if (reduced) progress = target; visibility(); };
  const lost = (event: Event) => { event.preventDefault(); destroy(); onFailure(); };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    motion.removeEventListener('change', preference);
    renderer.domElement.removeEventListener('webglcontextlost', lost);
    scene.traverse(object => { if (object instanceof InstancedMesh) object.dispose(); });
    geometries.forEach(value => value.dispose());
    materials.forEach(value => value.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  };
  try {
    let random = treeRandom();
    const mobile = host.clientWidth < 600;
    const pixelRatio = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(palette.background, 0);
    host.appendChild(renderer.domElement);
    const camera = new OrthographicCamera(-3, 3, 3, -3, .1, 60);
    const focus = new Vector3();
    const scanFocus = new Vector3();
    let scanZoom = 1.25;
    const size = modules.length;
    const side = 3.65;
    const cell = side / size;
    const quietEdge = side / 2 + cell * 4;
    const groundSize = (quietEdge + .035) * 2;
    scene.add(new AmbientLight(enhanced && activeSeason === 'winter' ? '#edf3ff' : '#fff9ef', 1.5));
    const sun = new DirectionalLight(enhanced && activeSeason === 'winter' ? '#e5edff' : '#fff6e4', 1.6);
    sun.position.set(-3, 8, 5); scene.add(sun);
    const environment = new Group(); scene.add(environment);
    const darkCells: Array<{ x: number; z: number }> = [];
    modules.forEach((row, z) => row.forEach((dark, x) => { if (dark) darkCells.push({ x, z }); }));
    const grassColors = palette.grass.map(value => new Color(value));
    const leafColors = palette.leaf.map(value => new Color(value));
    const pickColor = () => { const r = random(); return r < .5 ? 0 : r < .8 ? 1 : 2; };
    const moduleColors = qrModuleColors(size, activeSeason).map(row => row.map(value => new Color(value)));
    const tempColor = new Color();
    const dummy = new Object3D();
    const bark = material(barkMaterial(palette.bark));
    const branchPaths: CatmullRomCurve3[] = [];

    const branch = (a: Vector3, b: Vector3, radius: number, trunkPoints?: Vector3[]) => {
      const mid = a.clone().lerp(b, .5);
      mid.x -= .035; mid.y -= a.distanceTo(b) * .08;
      const curve = new CatmullRomCurve3(trunkPoints ?? [a, mid, b]);
      if (Math.hypot(b.x - a.x, b.z - a.z) > .15) branchPaths.push(curve);
      const tube = geometry(new TubeGeometry(curve, trunkPoints ? 40 : 8, radius, trunkPoints ? 12 : 8, false));
      const vertices = tube.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const t = tube.attributes.uv.getX(i);
        const center = curve.getPointAt(t);
        const around = tube.attributes.uv.getY(i) * Math.PI * 2;
        const taper = (1 - t * (trunkPoints ? .9 : .58)) * (1 + .065 * Math.sin(around * 5 + t * 17) + (trunkPoints ? .24 * Math.exp(-t * 28) : 0));
        vertices.setXYZ(i, center.x + (vertices.getX(i) - center.x) * taper, center.y + (vertices.getY(i) - center.y) * taper, center.z + (vertices.getZ(i) - center.z) * taper);
      }
      tube.computeVertexNormals(); environment.add(new Mesh(tube, bark));
    };
    const canopyCenters: Vector3[] = [];
    const trunkPoints = [new Vector3(0, 0, 0)];
    for (let level = 0; level < 8; level++) {
      const y = .65 + level * .43 + random() * .06;
      const trunk = new Vector3(Math.sin(level * .7) * .1, y, Math.cos(level) * .07);
      trunkPoints.push(trunk);
      if (level < 2) continue;
      const radius = (1.05 + random() * .28) * (1 - Math.max(0, level - 5) * .20);
      for (let j = 0; j < 3; j++) {
        const angle = level * 2.4 + j * Math.PI * .67 + (random() - .5) * .6;
        const end = new Vector3(Math.cos(angle) * radius, y + .1 + random() * .4, Math.sin(angle) * radius);
        const middle = trunk.clone().lerp(end, .6); middle.y -= .15;
        branch(trunk, end, .05 * (1 - level / 12), [trunk, middle, end]);
        canopyCenters.push(middle.clone().lerp(end, .75));
      }
    }
    branch(trunkPoints[0], trunkPoints[trunkPoints.length - 1], .13, trunkPoints);
    if (enhanced) {
      // Extra fine twigs share a fixed stream across every season, including winter.
      random = treeRandom(17921);
      canopyCenters.forEach((center, index) => {
        for (let twig = 0; twig < 3; twig++) {
          const angle = index * 2.4 + twig * 2.1;
          const end = center.clone().add(new Vector3(Math.cos(angle) * (.2 + random() * .15), .15 + random() * .14, Math.sin(angle) * .28));
          branch(center, end, .009 + random() * .004);
        }
      });
      random = treeRandom({ spring: 82171, summer: 47219, autumn: 74819, winter: 94321 }[activeSeason]);
    }
    const windAt = (x: number, z: number) => enhanced ? seasonWind(time, x, z, activeSeason) : treeWind(time, x, z);
    // Sample the meadow independently of the QR bitmap. Canopy coverage controls acceptance.
    const grassGeometry = geometry(foliageGeometry('grass'));
    const grassMat = material(foliageMaterial('grass'));
    const grassPoses: Array<{ origin: Vector3; scan: Vector3; angle: number; height: number; width: number; color: number; ink: Color }> = [];
    for (let patchIndex = 0; patchIndex < (mobile ? 500 : 700); patchIndex++) {
      const patch = new Vector3((random() - .5) * side, .005, (random() - .5) * side);
      // Reject whole tufts instead of shortening blades or replacing rejected tufts elsewhere.
      if (random() >= meadowDensity(patch.x, patch.z, canopyCenters) * (enhanced && activeSeason === 'winter' ? .22 : 1)) continue;
      const patchColor = Math.floor(random() * grassColors.length);
      const cover = canopyCoverage(patch.x, patch.z, canopyCenters);
      const density = cover > .75 ? 2 : mobile ? 4 : 6;
      for (let i = 0; i < density; i++) {
        const origin = patch.clone();
        origin.x = Math.max(-side / 2, Math.min(side / 2, origin.x + (random() - .5) * .08));
        origin.z = Math.max(-side / 2, Math.min(side / 2, origin.z + (random() - .5) * .08));
        grassPoses.push({ origin, scan: origin.clone(), ink: new Color(),
          angle: (random() - .5) * Math.PI * 2, height: .09 + random() * .19 + (random() < .08 ? .12 : 0),
          width: .014 + random() * .024, color: random() < .8 ? patchColor : Math.floor(random() * grassColors.length) });
      }
    }
    const grassReveal = new InstancedBufferAttribute(new Float32Array(grassPoses.length), 1);
    grassGeometry.setAttribute('reveal', grassReveal);
    const grass = new InstancedMesh(grassGeometry, grassMat, grassPoses.length);
    grass.name = 'meadow'; grass.frustumCulled = false; environment.add(grass);

    if (enhanced && (activeSeason === 'spring' || activeSeason === 'winter')) {
      grassPoses.forEach(pose => { pose.height *= activeSeason === 'winter' ? .35 : .65; });
    }
    const canopyKind = enhanced ? ({ spring: 'petal', summer: 'broadleaf', autumn: 'leaf', winter: 'snow' } as const)[activeSeason] : 'leaf';
    const leafMat = material(foliageMaterial(canopyKind));
    const leafGeometry = geometry(foliageGeometry(canopyKind));
    type LeafPose = { origin: Vector3; scan: Vector3; rotation: Vector3; size: number; width?: number; color: number; ink: Color };
    const leafPoses: LeafPose[] = [];
    const makeLeaf = (origin: Vector3, ground: boolean, color: number): LeafPose => {
      return { origin, scan: origin.clone(), ink: new Color(),
        rotation: ground ? new Vector3(-Math.PI / 2 + random() * .16, random() * .15, random() * Math.PI * 2)
          : new Vector3(-.35 - random() * 1.4, random() * 1.1 - .55, random() * Math.PI * 2),
        size: ground ? .14 + random() * .075 : .10 + random() * .075, color };
    };
    canopyCenters.forEach((center, cluster) => {
      const baseCount = enhanced && activeSeason === 'winter' ? (mobile ? 14 : 20) : enhanced && activeSeason === 'spring' ? (mobile ? 55 : 75) : mobile ? 100 : 130;
      const count = Math.max(baseCount, Math.ceil(darkCells.length / canopyCenters.length * (enhanced && activeSeason === 'winter' ? .45 : 1)));
      const spread = .46 + random() * .14;
      const clusterColor = cluster % leafColors.length;
      const blooms = enhanced && activeSeason === 'spring' ? Array.from({ length: Math.ceil(count / 5) }, () => center.clone().add(new Vector3((random() - .5) * spread * 1.5, (random() - .5) * spread, (random() - .5) * spread * 1.5))) : [];
      for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * spread;
        const origin = new Vector3(center.x + Math.cos(angle) * radius, center.y + (random() - .5) * spread * 1.3, center.z + Math.sin(angle) * radius);
        const pose = makeLeaf(origin, false, random() < .82 ? clusterColor : pickColor());
        if (enhanced && activeSeason === 'spring') {
          const petalAngle = (i % 5) * Math.PI * 2 / 5;
          pose.origin.copy(blooms[Math.floor(i / 5)]).add(new Vector3(Math.cos(petalAngle) * .035, Math.sin(petalAngle) * .035, 0));
          pose.rotation.set(-.25, .2, petalAngle - Math.PI / 2);
          pose.size = i % 23 < 5 ? .045 : .09;
          pose.color = Math.floor(cluster / 2) % Math.min(3, leafColors.length);
        } else if (enhanced && activeSeason === 'summer') {
          pose.origin.x = center.x + Math.cos(angle) * radius * 1.13;
          pose.origin.z = center.z + Math.sin(angle) * radius * 1.13;
          pose.size *= 1.4;
        } else if (enhanced && activeSeason === 'winter') {
          const path = branchPaths[(cluster * 4 + i % 4) % branchPaths.length];
          pose.origin.copy(path.getPoint(.12 + random() * .86));
          pose.origin.y += .025 + random() * .018;
          pose.rotation.set(-Math.PI / 2 + random() * .14, 0, random() * Math.PI);
          pose.size = .065 + random() * .07;
          pose.width = pose.size * (.35 + random() * .45);
          pose.color = i % 5 === 0 ? 2 : i % 2;
        }
        leafPoses.push(pose);
      }
    });
    const leafReveal = new InstancedBufferAttribute(new Float32Array(leafPoses.length), 1);
    leafGeometry.setAttribute('reveal', leafReveal);
    const leaves = new InstancedMesh(leafGeometry, leafMat, leafPoses.length);
    leaves.name = 'canopy'; leaves.frustumCulled = false; environment.add(leaves);

    const youngPoses: LeafPose[] = [];
    if (enhanced && activeSeason === 'spring') canopyCenters.forEach(center => {
      for (let i = 0; i < (mobile ? 18 : 26); i++) {
        const origin = center.clone().add(new Vector3((random() - .5) * .6, (random() - .5) * .4, (random() - .5) * .6));
        const pose = makeLeaf(origin, false, 3 + i % 2); pose.size = .06 + random() * .035; youngPoses.push(pose);
      }
    });
    const youngGeometry = geometry(foliageGeometry('broadleaf'));
    const youngReveal = new InstancedBufferAttribute(new Float32Array(youngPoses.length), 1);
    youngGeometry.setAttribute('reveal', youngReveal);
    const youngLeaves = new InstancedMesh(youngGeometry, material(foliageMaterial('broadleaf')), youngPoses.length);
    youngLeaves.name = 'young-leaves'; youngLeaves.frustumCulled = false; environment.add(youngLeaves);

    const litterPoses: LeafPose[] = [];
    const litterCount = enhanced && activeSeason === 'winter' ? Math.max(mobile ? 480 : 700, Math.ceil(darkCells.length * .8)) : enhanced && activeSeason === 'summer' ? 0 : mobile ? 24 : 40;
    for (let i = 0; i < litterCount; i++) {
      let x = 0, z = 0;
      for (let attempt = 0; attempt < 100; attempt++) {
        x = (random() - .5) * side * .85; z = (random() - .5) * side * .85;
        if (random() < canopyCoverage(x, z, canopyCenters)) break;
      }
      if (enhanced && activeSeason === 'autumn') {
        x = x * .7 + .32; z = z * .7 + .12;
      }
      if (enhanced && activeSeason === 'winter') {
        x = (random() - .5) * side * .94; z = (random() - .5) * side * .94;
        // Leave irregular seams around the root instead of painting a solid flat disc.
        if (i % 3 === 0) { x *= .38; z *= .38; }
      }
      const pose = makeLeaf(new Vector3(x, .025 + random() * .012, z), true, Math.floor(random() * leafColors.length));
      if (enhanced && activeSeason === 'spring') { pose.size *= .55; pose.color %= 3; }
      if (enhanced && activeSeason === 'winter') { pose.size = .12 + random() * .16; pose.width = pose.size * (.7 + random() * .3); pose.color = i % 5 === 0 ? 2 : i % 2; }
      litterPoses.push(pose);
    }
    const litterGeometry = geometry(leafGeometry.clone());
    const litterReveal = new InstancedBufferAttribute(new Float32Array(litterPoses.length), 1);
    litterGeometry.setAttribute('reveal', litterReveal);
    const litter = new InstancedMesh(litterGeometry, leafMat, litterPoses.length);
    litter.name = 'fallen-leaves'; litter.frustumCulled = false; environment.add(litter);

    const allPoses = [...grassPoses, ...leafPoses, ...litterPoses, ...youngPoses];
    const destinations = naturalQrTargets(allPoses.map(pose => pose.origin), modules, side);
    allPoses.forEach((pose, i) => {
      const destination = destinations[i];
      const x = Math.round(destination.x / cell + (size - 1) / 2), z = Math.round(destination.z / cell + (size - 1) / 2);
      // Keep canopy height: the camera reveals the grid without dropping the whole crown onto the ground.
      pose.scan.set(destination.x, pose.origin.y + .003 + i * .000001, destination.z);
      pose.ink = moduleColors[z][x];
    });

    const seedMat = material(new MeshBasicMaterial({ color: palette.grass[1], transparent: true, side: DoubleSide }));
    const seedHeads = new InstancedMesh(geometry(new PlaneGeometry(.018, .06)), seedMat, Math.floor(grassPoses.length / 36));
    seedHeads.frustumCulled = false; environment.add(seedHeads);

    const rainCount = mobile ? 24 : 45;
    const rainPositions = new Float32Array(rainCount * 6);
    const rainSeeds = Array.from({ length: rainCount }, () => [random() * 5 - 2.5, random() * 5, random() * 5 - 2.5]);
    const rainGeometry = geometry(new BufferGeometry());
    rainGeometry.setAttribute('position', new Float32BufferAttribute(rainPositions, 3));
    const rainMat = material(new LineBasicMaterial({ color: '#aaa393', transparent: true, opacity: .16, depthWrite: false }));
    const rain = new LineSegments(rainGeometry, rainMat); rain.frustumCulled = false; scene.add(rain);
    const fallenMat = material(new MeshBasicMaterial({ color: enhanced && activeSeason === 'winter' ? '#FFFFFF' : enhanced && activeSeason === 'summer' ? '#FFF6D9' : palette.leaf[1], transparent: true, side: DoubleSide, depthWrite: false }));
    const atmosphereCount = enhanced && activeSeason === 'winter' ? mobile ? 96 : 160 : enhanced && activeSeason === 'summer' ? mobile ? 10 : 18 : mobile ? 6 : 10;
    const atmosphereGeometry = enhanced && (activeSeason === 'summer' || activeSeason === 'winter') ? geometry(new CircleGeometry(1, 6)) : leafGeometry;
    const fallen = new InstancedMesh(atmosphereGeometry, fallenMat, atmosphereCount);
    fallen.name = 'season-atmosphere'; fallen.frustumCulled = false;
    const fallingSeeds = Array.from({ length: fallen.count }, () => [enhanced && activeSeason === 'winter' ? random() * 5 - 2.5 : random() * 3.8 - 1.9, random() * 4, random() * 3.8 - 1.9]);
    if (enhanced && activeSeason === 'winter') {
      const snowColors = [palette.leaf[2], palette.leaf[3], palette.leaf[0]];
      for (let i = 0; i < fallen.count; i++) fallen.setColorAt(i, new Color(snowColors[i % snowColors.length]));
    }
    const fallSources = Array.from({ length: fallen.count }, (_, i) => leafPoses[Math.floor(i * leafPoses.length / fallen.count)].origin.clone());
    environment.add(fallen);

    const glintCount = enhanced && (activeSeason === 'spring' || activeSeason === 'winter') ? mobile ? 7 : 12 : 0;
    const glintMat = material(new MeshBasicMaterial({ color: '#FFFDF0', transparent: true, opacity: .5, depthWrite: false, side: DoubleSide }));
    const glints = new InstancedMesh(geometry(new CircleGeometry(1, 4)), glintMat, glintCount);
    glints.name = 'season-glints'; glints.frustumCulled = false; environment.add(glints);
    const glintOrigins = Array.from({ length: glintCount }, (_, i) => leafPoses[Math.floor(i * leafPoses.length / Math.max(1, glintCount))].origin.clone());

    const shadowMat = material(new MeshBasicMaterial({ color: '#405240', transparent: true, opacity: .055, depthWrite: false, side: DoubleSide }));
    const shadows = new InstancedMesh(geometry(new CircleGeometry(1, 16)), shadowMat, enhanced && activeSeason === 'summer' ? canopyCenters.length : 0);
    shadows.name = 'canopy-shadow'; shadows.frustumCulled = false; environment.add(shadows);

    const render = (now: number) => {
      frame = 0;
      if (destroyed || document.hidden) return;
      try {
        if (!reduced && progress === 1 && target === 1 && lastScanFrame && now - lastScanFrame < 49) {
          frame = requestAnimationFrame(render); return;
        }
        lastScanFrame = now;
        const delta = last ? Math.min((now - last) / 1000, .1) : 0;
        last = now; time += reduced ? 0 : delta;
        progress = advanceTreeTransition(progress, target, delta, reduced);
        const view = progress === 1 ? 'qr' : progress === 0 ? 'tree' : 'transition';
        if (renderer.domElement.dataset.view !== view) renderer.domElement.dataset.view = view;
        const { camera: p, settle } = treeTransition(progress);
        const polar = (1 - p) * 1.07;
        const azimuth = (1 - p) * Math.atan2(7, 8);
        focus.set(scanFocus.x * p, 1.78 * (1 - p), scanFocus.z * p);
        camera.position.set(focus.x + 12 * Math.sin(polar) * Math.sin(azimuth), focus.y + 12 * Math.cos(polar), focus.z + 12 * Math.sin(polar) * Math.cos(azimuth));
        camera.up.set(0, Math.cos(p * Math.PI / 2), -Math.sin(p * Math.PI / 2));
        camera.lookAt(focus);
        camera.zoom = 1 + p * (scanZoom - 1); camera.updateProjectionMatrix();
        rain.visible = !enhanced && settle < 1 && !reduced;
        rainMat.opacity = .12 * (1 - settle);
        fallen.visible = settle < 1 && !reduced;
        fallenMat.opacity = 1 - settle;
        glints.visible = settle < 1 && !reduced && glintCount > 0;
        glintMat.opacity = .5 * (1 - settle);
        shadows.visible = settle < 1 && shadows.count > 0;
        shadowMat.opacity = .055 * (1 - settle);
        bark.opacity = 1 - settle;
        bark.depthWrite = settle < .5;
        // The same visible particles settle locally and stay present through the final frame.
        const animateLeaves = (mesh: InstancedMesh, poses: LeafPose[], reveal: InstancedBufferAttribute, ground: boolean) => {
          mesh.visible = true;
          poses.forEach((pose, i) => {
            const local = treeTransition(progress, (i % 17) / 16).settle;
            const anchored = ground || (enhanced && activeSeason === 'winter');
            const wind = reduced || anchored ? 0 : windAt(pose.origin.x, pose.origin.z);
            dummy.position.copy(pose.origin).lerp(pose.scan, local);
            dummy.position.x += wind * .045 * (1 - local);
            if (enhanced) dummy.position.z += wind * .018 * (1 - local);
            dummy.position.y += anchored || reduced ? 0 : Math.sin(time * 2.1 + i * .9) * .018 * (1 - local);
            const roll = enhanced && activeSeason === 'autumn' && ground && i < 3 && !reduced ? autumnGust(time - 2.2, pose.origin.x, pose.origin.z) * (1 - local) : 0;
            dummy.position.x += roll * .08; dummy.position.z += roll * .032; dummy.position.y += Math.sin(roll * Math.PI) * .024;
            const squareAngle = Math.round(pose.rotation.z / (Math.PI / 2)) * Math.PI / 2;
            dummy.rotation.set((pose.rotation.x + wind * .16) * (1 - local) - Math.PI / 2 * local,
              pose.rotation.y * (1 - local), (pose.rotation.z + wind * .23) * (1 - local) + squareAngle * local + roll * .45);
            if (local === 1) dummy.rotation.set(-Math.PI / 2, 0, squareAngle);
            dummy.scale.set((pose.width ?? pose.size) * (1 - local) + cell * local, pose.size * (1 - local) + cell * local, pose.size * (1 - local) + cell * local);
            dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, tempColor.copy(leafColors[pose.color]).lerp(pose.ink, local));
            reveal.setX(i, local);
          });
          mesh.instanceMatrix.needsUpdate = true; reveal.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        };
        animateLeaves(leaves, leafPoses, leafReveal, false);
        animateLeaves(litter, litterPoses, litterReveal, true);
        if (youngPoses.length) animateLeaves(youngLeaves, youngPoses, youngReveal, false);
        grassPoses.forEach((pose, i) => {
          const local = treeTransition(progress, (i % 13) / 12).settle;
          const wind = reduced ? 0 : windAt(pose.origin.x, pose.origin.z);
          dummy.position.copy(pose.origin).lerp(pose.scan, local);
          dummy.rotation.set(-Math.PI / 2 * local + wind * .18 * (1 - local), pose.angle * (1 - local), wind * .23 * (1 - local));
          if (local === 1) dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.scale.set(pose.width * (1 - local) + cell * local,
            pose.height * (1 - local) + cell * local, 1);
          dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
          grass.setColorAt(i, tempColor.copy(grassColors[pose.color]).lerp(pose.ink, local));
          grassReveal.setX(i, local);
          if (i % 36 === 0 && i / 36 < seedHeads.count) {
            dummy.position.copy(pose.origin);
            dummy.position.y += pose.height;
            dummy.position.x += wind * pose.height * .2;
            dummy.rotation.set(0, pose.angle, wind * .15);
            dummy.scale.setScalar(1); dummy.updateMatrix(); seedHeads.setMatrixAt(i / 36, dummy.matrix);
          }
        });
        grass.instanceMatrix.needsUpdate = true; grassReveal.needsUpdate = true;
        if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
        seedHeads.instanceMatrix.needsUpdate = true; seedHeads.visible = settle < 1 && (!enhanced || activeSeason === 'autumn'); seedMat.opacity = 1 - settle;
        const positions = rainGeometry.attributes.position.array;
        rainSeeds.forEach(([x, y, z], i) => {
          const height = ((y - time * 2.2) % 5 + 5) % 5;
          positions[i * 6] = x; positions[i * 6 + 1] = height; positions[i * 6 + 2] = z;
          positions[i * 6 + 3] = x; positions[i * 6 + 4] = height - .14; positions[i * 6 + 5] = z;
        });
        rainGeometry.attributes.position.needsUpdate = true;
        fallingSeeds.forEach(([x, y, z], i) => {
          if (enhanced && (activeSeason === 'autumn' || activeSeason === 'spring')) {
            const pose = fallingLeafPose(time, i, fallSources[i]);
            dummy.position.set(pose.x, pose.y, pose.z);
            dummy.rotation.set(pose.rotationX, pose.rotationY, pose.rotationZ);
            dummy.scale.setScalar((activeSeason === 'spring' ? .075 : .12) * pose.presence);
          } else if (enhanced && activeSeason === 'winter') {
            const snow = winterSnowPose(time, i, { x, y, z });
            dummy.position.set(snow.x, snow.y, snow.z);
            dummy.rotation.copy(camera.rotation);
            dummy.rotateZ(snow.rotationZ);
            dummy.rotateX(Math.sin(snow.rotationX) * .22);
            dummy.rotateY(Math.sin(snow.rotationY) * .25);
            dummy.scale.setScalar(snow.size * snow.presence);
          } else if (enhanced && activeSeason === 'summer') {
            const phase = ((y + time * .045) % 2.7) / 2.7;
            dummy.position.set(x * .65 + Math.sin(time * .17 + i) * .15, .6 + phase * 2.7, z * .6);
            dummy.rotation.set(0, .6, time * .2 + i);
            dummy.scale.setScalar((.006 + .004 * (.5 + .5 * Math.sin(time * .6 + i))) * Math.sin(phase * Math.PI) ** 2);
          } else {
            dummy.position.set(x + Math.sin(time + i) * .12, reduced ? .04 : ((y - time * .24) % 4 + 4) % 4, z);
            dummy.rotation.set(-1.3, time * .2 + i, Math.sin(time + i) * .3);
            dummy.scale.setScalar(.12);
          }
          dummy.updateMatrix(); fallen.setMatrixAt(i, dummy.matrix);
        });
        fallen.instanceMatrix.needsUpdate = true;
        glintOrigins.forEach((origin, i) => {
          const pulse = Math.pow(Math.max(0, Math.sin(time * .7 + i * 2.3)), 16);
          dummy.position.copy(origin); dummy.position.y += .02;
          dummy.rotation.copy(camera.rotation); dummy.scale.setScalar(.018 * pulse);
          dummy.updateMatrix(); glints.setMatrixAt(i, dummy.matrix);
        });
        if (glintCount) glints.instanceMatrix.needsUpdate = true;
        for (let i = 0; i < shadows.count; i++) {
          const center = canopyCenters[i], wind = reduced ? 0 : windAt(center.x, center.z);
          dummy.position.set(center.x - center.y * .16 + wind * .04, .004 + i * .00001, center.z - center.y * .12 + wind * .018);
          dummy.rotation.set(-Math.PI / 2, 0, i * 1.7);
          dummy.scale.set(.20 + i % 3 * .035, .15 + i % 4 * .028, 1);
          dummy.updateMatrix(); shadows.setMatrixAt(i, dummy.matrix);
        }
        if (shadows.count) shadows.instanceMatrix.needsUpdate = true;
        renderer.render(scene, camera);
        if (!reduced) frame = requestAnimationFrame(render);
      } catch { destroy(); onFailure(); }
    };
    wake = () => { if (!destroyed && !document.hidden && !frame) frame = requestAnimationFrame(render); };
    const resize = () => {
      if (destroyed) return;
      const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const halfHeight = Math.max(3.15, (groundSize * .70) / aspect);
      // Snap the settled grid to physical pixels, including its origin, to avoid soft finder edges.
      const physicalWidth = Math.floor(width * pixelRatio), physicalHeight = Math.floor(height * pixelRatio);
      // Large uniform pastel blocks confuse local-threshold scanners; retain a bounded scan scale.
      const scanPixelBudget = enhanced ? Math.max(1, Math.floor(7 * pixelRatio)) : Infinity;
      const modulePixels = Math.max(1, Math.min(scanPixelBudget, Math.floor(cell * physicalHeight / (2 * halfHeight) * 1.25), Math.floor((Math.min(physicalWidth, physicalHeight) - 1) / (size + 8))));
      scanZoom = modulePixels * 2 * halfHeight / (cell * physicalHeight);
      scanFocus.set(((physicalWidth - size * modulePixels) % 2) * .5 * cell / modulePixels, 0,
        ((physicalHeight - size * modulePixels) % 2) * .5 * cell / modulePixels);
      camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
      camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix(); wake();
    };
    observer = new ResizeObserver(resize); observer.observe(host);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', preference);
    resize();
    return {
      setQr(value) { target = value ? 1 : 0; last = 0; wake(); },
      destroy
    };
  } catch (error) { destroy(); throw error; }
}
