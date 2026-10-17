import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import qr from 'qr-image';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { cameraEase, TREE_TRANSITION_SECONDS, advanceTreeTransition, nearestDarkCell, treeRandom, treeTransition, treeWind, qrProtectedCells, qrModuleColors, canopyCoverage, meadowDensity, TREE_PALETTE, TREE_SEASONS, autumnGust, seasonWind, type TreeSeason } from './magic-tree-config';
import { extractQrModules } from './qr-modules';

describe('autumn reveal choreography', () => {
  it('uses a two-second Core Animation ease-in-out camera path', () => {
    expect(TREE_TRANSITION_SECONDS).toBe(2);
    expect(cameraEase(0)).toBe(0);
    expect(cameraEase(.25)).toBeCloseTo(.1291619, 6);
    expect(cameraEase(.5)).toBeCloseTo(.5);
    expect(cameraEase(.75)).toBeCloseTo(.8708381, 6);
    expect(cameraEase(1)).toBe(1);
    expect(advanceTreeTransition(0, 1, 1, false)).toBe(.5);
    expect(advanceTreeTransition(.5, 1, 1, false)).toBe(1);
  });
  it('overlaps gathering with the camera, completes before the last frames and stays continuous during reversal', () => {
    expect(treeTransition(.25).settle).toBe(0);
    expect(treeTransition(.8).settle).toBeGreaterThan(0);
    expect(treeTransition(1)).toEqual({ camera: 1, settle: 1 });
    const forward = advanceTreeTransition(.8, 1, .016, false);
    const reverse = advanceTreeTransition(forward, 0, .016, false);
    expect(reverse).toBeCloseTo(.8);
    expect(advanceTreeTransition(.99, 1, 1, false)).toBe(1);
    expect(advanceTreeTransition(.01, 0, 1, false)).toBe(0);
  });
  it('staggered cohorts finish smoothly before the endpoint', () => {
    expect(treeTransition(.4, 0).settle).toBeGreaterThan(treeTransition(.4, 1).settle);
    expect(treeTransition(.95, 1).settle).toBe(1);
    expect(treeTransition(.94, 1).settle).toBeGreaterThan(.998);
  });
  it('protects finder, timing, format, version and alignment cells', () => {
    const v1 = qrProtectedCells(21);
    expect(v1[3][3]).toBe(true); expect(v1[6][12]).toBe(true); expect(v1[12][12]).toBe(false);
    const v2 = qrProtectedCells(25);
    expect(v2[18][18]).toBe(true); expect(v2[20][20]).toBe(true);
    const v7 = qrProtectedCells(45);
    expect(v7[22][22]).toBe(true); expect(v7[0][35]).toBe(true);
    const v32 = qrProtectedCells(145);
    expect(v32[86][86]).toBe(true);
    expect(qrProtectedCells(177)[170][170]).toBe(true);
  });
  it('jumps directly to either endpoint for reduced motion', () => {
    expect(advanceTreeTransition(.3, 1, 0, true)).toBe(1);
    expect(advanceTreeTransition(.8, 0, 0, true)).toBe(0);
  });
  it('assigns local dark destinations and produces deterministic but varying wind', () => {
    const destination = nearestDarkCell([[false, true], [true, false]], .4, -.4, 2);
    expect(destination).toMatchObject({ x: .5, z: -.5 });
    expect(destination.distance).toBeLessThan(.15);
    const a = treeRandom(), b = treeRandom();
    expect(Array.from({ length: 10 }, a)).toEqual(Array.from({ length: 10 }, b));
    expect(treeWind(0, 1, 2)).not.toBe(treeWind(1, 1, 2));
    expect(treeWind(1, 1, 2)).not.toBe(treeWind(1, 3, 2));
  });
});


describe('autumn distribution and scan colors', () => {
  it('reduces grass to 6% under the canopy and blends into the open meadow', () => {
    const centers = [{ x: 0, z: 0 }];
    expect(canopyCoverage(0, 0, centers)).toBe(1);
    expect(meadowDensity(0, 0, centers)).toBeCloseTo(.06);
    expect(meadowDensity(1.2, 0, centers)).toBe(1);
    expect(meadowDensity(.7, 0, centers)).toBeGreaterThan(.06);
    expect(meadowDensity(.7, 0, centers)).toBeLessThan(1);
    expect(meadowDensity(.701, 0, centers) - meadowDensity(.7, 0, centers)).toBeLessThan(.005);
    expect(meadowDensity(0, 0, [...centers, ...centers])).toBeCloseTo(.06);
  });
  it('places soft gold on the top-left/bottom-right and warm leaves on the opposite diagonal', () => {
    const colors = qrModuleColors(177);
    const brightness = (x: number, y: number) => {
      const channels = [1, 3, 5].map(offset => parseInt(colors[y][x].slice(offset, offset + 2), 16));
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const redness = (x: number, y: number) => parseInt(colors[y][x].slice(1, 3), 16) - parseInt(colors[y][x].slice(3, 5), 16);
    // Honey gold stays darker than the rejected pale yellow, lighter than the meadow.
    // Reuse the softer canopy brown instead of the more saturated Pantone maple.
    expect(TREE_PALETTE.scanLeaf[1]).toBe(TREE_PALETTE.leaf[2]);
    expect(redness(65, 65)).toBeLessThan(65);
    expect(redness(65, 111)).toBeGreaterThan(45);
    expect(redness(0, 0)).toBeLessThan(38);
    for (const [x, y] of [[65, 65], [111, 111]]) expect(brightness(x, y)).toBeGreaterThan(145);
    for (const [x, y] of [[65, 111], [111, 65]]) expect(brightness(x, y)).toBeLessThan(130);
    // Band midpoint mixes the families; no abrupt brightness jump across the center line.
    expect(brightness(88, 65)).toBeGreaterThan(125);
    expect(brightness(88, 65)).toBeLessThan(145);
    expect(Math.abs(brightness(87, 65) - brightness(89, 65))).toBeLessThan(20);
    expect(Math.abs(brightness(65, 87) - brightness(65, 89))).toBeLessThan(20);
  });
  it.each([21, 37, 41, 45, 177])('uses deterministic, contrasting neighbors with leaf centers and grass edges at size %i', size => {
    const colors = qrModuleColors(size);
    expect(colors).toEqual(qrModuleColors(size));
    colors.forEach((row, y) => row.forEach((color, x) => {
      const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
      const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      expect(luminance).toBeGreaterThan(108); expect(luminance).toBeLessThan(156);
      for (const neighbor of [row[x - 1], colors[y - 1]?.[x]].filter(Boolean)) {
        const other = [1, 3, 5].map(offset => parseInt(neighbor.slice(offset, offset + 2), 16));
        // A one-channel rounding difference is not enough: the jump must remain visible.
        expect(Math.hypot(...rgb.map((value, i) => value - other[i]))).toBeGreaterThanOrEqual(14);
      }
      if (y && x) expect(color).not.toBe(colors[y - 1][x - 1]);
      if (y && x < size - 1) expect(color).not.toBe(colors[y - 1][x + 1]);
      if (!x || !y || x === size - 1 || y === size - 1) expect(TREE_PALETTE.scanGrass).toContain(color);
    }));
  });
});

describe('season palettes and coherent wind', () => {
  const seasons = Object.keys(TREE_SEASONS) as TreeSeason[];

  it('preserves the original default autumn color map and palette', () => {
    expect(TREE_SEASONS.autumn.palette).toBe(TREE_PALETTE);
    expect(qrModuleColors(41)).toEqual(qrModuleColors(41, 'autumn'));
    expect(createHash('sha256').update(JSON.stringify(qrModuleColors(41))).digest('hex'))
      .toBe('1bca7f0e7b7e1ed296194232c50cc21ffdb958f097c00ee64639f112a83063eb');
  });

  it('keeps the approved diagonal families and derives edge variants around the approved base', () => {
    const seeds = { spring: ['#B57786', '#8A805A', '#6D7F57'], summer: ['#4C8D72', '#7B8B4B', '#647A52'], winter: ['#71869F', '#818B96', '#6E777D'] };
    for (const season of ['spring', 'summer', 'winter'] as const) {
      const palette = TREE_SEASONS[season].palette;
      expect(palette.scanLeaf.slice(0, 2)).toEqual(seeds[season].slice(0, 2));
      for (const offset of [1, 3, 5]) {
        const average = palette.scanGrass.reduce((sum, color) => sum + parseInt(color.slice(offset, offset + 2), 16), 0) / 9;
        expect(Math.abs(average - parseInt(seeds[season][2].slice(offset, offset + 2), 16))).toBeLessThan(.5);
      }
    }
  });

  it.each(seasons)('uses stable separated module colors and its own edge family for %s', season => {
    const colors = qrModuleColors(45, season);
    expect(colors).toEqual(qrModuleColors(45, season));
    colors.forEach((row, y) => row.forEach((color, x) => {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
      for (const neighbor of [row[x - 1], colors[y - 1]?.[x]].filter(Boolean)) {
        const distance = Math.hypot(...[1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) - parseInt(neighbor.slice(offset, offset + 2), 16)));
        expect(distance).toBeGreaterThanOrEqual(14);
      }
      if (!x || !y || x === 44 || y === 44) expect(TREE_SEASONS[season].palette.scanGrass).toContain(color);
    }));
  });

  it.each(seasons)('decodes the %s QR palette at small and large display scales', season => {
    for (const value of ['https://example.com/season-preview', `https://ccc.nottingham.edu.cn/study/attendance?scheduleId=${'abc123'.repeat(8)}&time=1777777777777`]) {
      const buffer = qr.imageSync(value, { type: 'png', margin: 2, size: 10 });
      if (typeof buffer === 'string') throw new Error('Expected PNG');
      const png = PNG.sync.read(buffer);
      const modules = extractQrModules({ ...png, data: new Uint8ClampedArray(png.data) });
      const colors = qrModuleColors(modules.length, season);
      for (const scale of [4, 7]) {
        const width = (modules.length + 8) * scale;
        const data = new Uint8ClampedArray(width * width * 4);
        for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
          const mx = Math.floor(x / scale) - 4, my = Math.floor(y / scale) - 4;
          const color = modules[my]?.[mx] ? colors[my][mx] : TREE_SEASONS[season].palette.background;
          data.set([1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)).concat(255), (y * width + x) * 4);
        }
        expect(jsQR(data, width, width)?.data).toBe(value);
      }
    }
  });

  it('shares a bounded autumn gust front with calm gaps and smooth spatial propagation', () => {
    const samples = Array.from({ length: 208 }, (_, i) => autumnGust(i * .05, 0, 0));
    expect(Math.min(...samples)).toBe(0);
    expect(Math.max(...samples)).toBe(1);
    expect(samples.filter(value => value === 0).length).toBeGreaterThan(120);
    expect(autumnGust(1.2, 0, 0)).toBeCloseTo(autumnGust(11.6, 0, 0));
    expect(autumnGust(.5, 0, 0)).toBeGreaterThan(autumnGust(.5, 2, 0));
    expect(Math.abs(autumnGust(.5, 1, 1) - autumnGust(.5, 1.001, 1))).toBeLessThan(.001);
    expect(seasonWind(7, 1, 1, 'autumn')).toBe(0);
  });

  it('varies season wind strengths while keeping nearby plants coherent and seeds independent', () => {
    const amplitude = (season: TreeSeason) => Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(seasonWind(i * .1, 0, 0, season))));
    expect(amplitude('summer')).toBeGreaterThan(amplitude('spring'));
    expect(amplitude('winter')).toBeGreaterThan(amplitude('summer'));
    for (const season of seasons) expect(Math.abs(seasonWind(2, 1, 1, season) - seasonWind(2, 1.001, 1, season))).toBeLessThan(.001);
    const a = treeRandom(17), b = treeRandom(17), c = treeRandom(18);
    expect(Array.from({ length: 8 }, a)).toEqual(Array.from({ length: 8 }, b));
    expect(treeRandom()()).toBe(treeRandom(74819)());
    expect(c()).not.toBe(treeRandom(17)());
  });
});
