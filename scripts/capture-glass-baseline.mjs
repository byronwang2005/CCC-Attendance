import { chromium, webkit } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { onRequestPost } from '../functions/api/generate.js';
const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/capture-glass-baseline.mjs <baseline-url>');
for (const [name, launcher, viewport] of [
  ['chromium-desktop', chromium, { width: 1280, height: 900 }],
  ['webkit-mobile', webkit, { width: 390, height: 844 }]
]) {
  const dir = `design-qa/before/${name}`;
  await mkdir(dir, { recursive: true });
  const browser = await launcher.launch(
    name.startsWith('chromium')
      ? { channel: 'chromium', args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] }
      : {}
  );
  const context = await browser.newContext({
    viewport,
    isMobile: name.endsWith('mobile'),
    hasTouch: name.endsWith('mobile'),
    recordVideo: { dir, size: viewport }
  });
  const page = await context.newPage();
  await page.route('**/api/generate', async (route) => {
    const response = await onRequestPost({
      request: new Request(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: route.request().postData()
      }),
      env: {},
      waitUntil: () => {}
    });
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer())
    });
  });
  const shot = async (name) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  };
  await page.goto(url);
  await page.getByRole('button', { name: '人类', exact: true }).waitFor();
  await shot('01-initial');
  await page.getByRole('button', { name: '跳转到第 2 步' }).click();
  await shot('02-dialog');
  await page.getByRole('button', { name: '关闭提示' }).click();
  await page.getByRole('button', { name: '智能体', exact: true }).click();
  await shot('03-agent');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} }
    })
  );
  await page.getByRole('button', { name: '复制', exact: true }).click();
  await shot('04-copy');
  await page.getByRole('button', { name: '人类', exact: true }).click();
  await page.getByRole('textbox').fill('https://ccc.nottingham.edu.cn/study/home/details?id=1234');
  await shot('05-human');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByText('手动', { exact: true }).waitFor();
  await shot('06-auto-time');
  await page.getByText('手动', { exact: true }).click();
  await shot('07-manual-time');
  await page.getByText('自动（推荐）', { exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.locator('.magic-tree-stage canvas').waitFor({ state: 'visible' });
  await shot('08-result');
  await page.goto(`${url}/404.html`);
  await shot('09-not-found');
  await context.close();
  await browser.close();
  console.log(`Captured ${name}`);
}
