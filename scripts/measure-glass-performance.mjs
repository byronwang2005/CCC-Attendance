import { chromium, webkit } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const [before, after = 'http://127.0.0.1:5173'] = process.argv.slice(2);
if (!before)
  throw new Error('Usage: node scripts/measure-glass-performance.mjs <baseline-url> [current-url]');
const results = [];
for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
  const browser = await launcher.launch(
    engine === 'chromium'
      ? { channel: 'chromium', args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] }
      : {}
  );
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 }
  ]) {
    for (const [version, url] of Object.entries({ before, after })) {
      const page = await browser.newPage({
        viewport,
        isMobile: viewport.width < 500,
        hasTouch: viewport.width < 500
      });
      await page.goto(url);
      await page.getByText('人类', { exact: true }).click();
      await page.waitForTimeout(1800);
      const frames = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const samples = [];
            let start = 0,
              previous = 0;
            const frame = (now) => {
              if (!start) start = now;
              if (previous) samples.push(now - previous);
              previous = now;
              if (now - start < 4000) requestAnimationFrame(frame);
              else resolve(samples);
            };
            requestAnimationFrame(frame);
          })
      );
      const sorted = [...frames].sort((a, b) => a - b);
      const result = {
        engine,
        viewport,
        version,
        meanFps: +(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)).toFixed(1),
        medianMs: +sorted[Math.floor(sorted.length * 0.5)].toFixed(2),
        p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
        framesOver25ms: frames.filter((n) => n > 25).length,
        glass: await page
          .locator('.glass-group:visible')
          .evaluateAll((nodes) =>
            nodes.map((n) => ({ renderer: n.dataset.glassRenderer, quality: n.dataset.glassQuality }))
          )
      };
      results.push(result);
      console.log(JSON.stringify(result));
      await page.close();
    }
  }
  await browser.close();
}
await mkdir('design-qa', { recursive: true });
await writeFile(
  'design-qa/performance.json',
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      note: '4s rAF sampling on one Mac; not physical iPhone, not GPU frame timing or a guarantee of 60fps.',
      results
    },
    null,
    2
  )
);
