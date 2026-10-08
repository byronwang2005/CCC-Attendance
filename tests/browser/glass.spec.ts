import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';

async function aligned(page: Page) {
  await expect
    .poll(() =>
      page.locator('.segmented-glass__layout:visible').evaluate((el) => {
        const option = el.querySelector('[aria-checked="true"]')!.getBoundingClientRect();
        const lens = el.querySelector('.segmented-glass__lens-track')!.getBoundingClientRect();
        return Math.max(
          Math.abs(option.x - lens.x),
          Math.abs(option.y - lens.y),
          Math.abs(option.width - lens.width),
          Math.abs(option.height - lens.height)
        );
      })
    )
    .toBeLessThanOrEqual(1);
}
async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('radio', { name: '人类', exact: true })).toBeVisible();
}

test('button and selection produce refracted pixels in the real adapter', async ({ page }) => {
  const captures: Buffer[][] = [];
  for (const suffix of ['', '?flat']) {
    await page.goto(`/tests/browser/glass-fixture.html${suffix}`);
    await expect(page.locator('.glass-optical-output canvas')).toHaveCount(2);
    await expect(page.locator('.glass-group[data-glass-renderer="canvas"]')).toHaveCount(2);
    await aligned(page);
    // Allow the async displacement map image to be uploaded before pixel capture.
    await page.waitForTimeout(500);
    captures.push(
      await Promise.all([
        page.locator('.actions .glass-optical-output').screenshot(),
        page.locator('.segmented-glass .glass-optical-output').screenshot()
      ])
    );
    await screenshot(page, suffix ? 'optical-flat' : 'optical-refracted');
  }
  for (let i = 0; i < 2; i++) {
    const a = PNG.sync.read(captures[0][i]),
      b = PNG.sync.read(captures[1][i]);
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    let changed = 0;
    for (let p = 0; p < a.data.length; p += 4)
      if (
        Math.abs(a.data[p] - b.data[p]) +
          Math.abs(a.data[p + 1] - b.data[p + 1]) +
          Math.abs(a.data[p + 2] - b.data[p + 2]) >
        15
      )
        changed++;
    expect(changed, `refraction must change real ${i === 0 ? 'button' : 'selection'} pixels`).toBeGreaterThan(
      100
    );
  }
  await page.goto('/tests/browser/glass-fixture.html?dark');
  await expect(page.locator('.glass-optical-output canvas')).toHaveCount(2);
  await page.waitForTimeout(500);
  await screenshot(page, 'optical-dark');
  const dark = PNG.sync.read(await page.locator('.actions .glass-optical-output').screenshot());
  const point = (8 * dark.width + 65) * 4;
  const luminance = (rgb: number[]) =>
    rgb
      .map((n) => n / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
  const light = luminance([...dark.data.subarray(point, point + 3)]);
  expect(
    (light + 0.05) / (luminance([27, 54, 93]) + 0.05),
    'dark backdrop must retain legible brand text'
  ).toBeGreaterThanOrEqual(4.5);
});

test('segments support interruption, keyboard, resize, drag commit and cancellation', async ({ page }) => {
  await page.goto('/tests/browser/glass-fixture.html');
  const first = page.getByRole('radio', { name: 'First' }),
    second = page.getByRole('radio', { name: 'Second' });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(second).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await aligned(page);
  await page.setViewportSize({ width: 420, height: 844 });
  await aligned(page);
  await page.locator('.segmented-glass').evaluate((el) => ((el as HTMLElement).style.zoom = '1.25'));
  await aligned(page);
  await page.locator('.segmented-glass').evaluate((el) => ((el as HTMLElement).style.zoom = '1'));
  const a = (await first.boundingBox())!,
    b = (await second.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page
    .locator('[role="radiogroup"]')
    .dispatchEvent('pointercancel', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: b.x + b.width / 2,
      clientY: b.y + b.height / 2
    });
  await page.mouse.up();
  await expect(first).toBeChecked();
  await aligned(page);
  const before = Number(await page.getByTestId('commits').textContent());
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(second).toBeChecked();
  await aligned(page);
  await expect(page.getByTestId('commits')).toHaveText(String(before + 1));
  expect(await page.locator('[role="radiogroup"]').evaluate((el) => getComputedStyle(el).touchAction)).toBe(
    'pan-y'
  );
});

test('all three steps, copy feedback, manual time, dialog and 404', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  await screenshot(page, '01-initial');
  const locked = page.getByRole('button', { name: '跳转到第 2 步' });
  await locked.focus();
  await locked.click();
  const dialog = page.getByRole('alertdialog', { name: '提示' });
  await expect(dialog).toBeVisible();
  await screenshot(page, '02-error-dialog');
  const close = page.getByRole('button', { name: '关闭提示' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(locked).toBeFocused();
  await page.getByRole('radio', { name: '智能体', exact: true }).click();
  await aligned(page);
  // Browser clipboard permission differs; emulate only the clipboard API.
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => new Promise((resolve) => setTimeout(resolve, 200)) }
    })
  );
  await screenshot(page, '03-agent');
  await page.getByRole('button', { name: '复制', exact: true }).click();
  await expect(page.getByRole('button', { name: '复制中…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '已复制!' })).toBeDisabled();
  await screenshot(page, '04-copy');
  await page.getByRole('radio', { name: '人类', exact: true }).click();
  await aligned(page);
  const input = page.getByRole('textbox', { name: '课程详情链接输入框' });
  await input.scrollIntoViewIfNeeded();
  await page.locator('.course-link-input-island').click({ position: { x: 0.5, y: 26 } });
  await expect(input).toBeFocused();
  await input.fill('https://ccc.nottingham.edu.cn/study/home/details?id=1234');
  await screenshot(page, '05-human');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('heading', { name: '再选择时间模式' })).toBeVisible();
  await aligned(page);
  await screenshot(page, '06-auto-time');
  await page.getByRole('radio', { name: '手动', exact: true }).click();
  await aligned(page);
  await expect(page.getByLabel('日期', { exact: true })).toBeVisible();
  await screenshot(page, '07-manual-time');
  for (const select of await page.locator('select:visible').all())
    expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await page.getByRole('radio', { name: '自动（推荐）', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('button', { name: '生成更多' })).toBeVisible();
  await expect(page.locator('.magic-tree-stage canvas')).toBeVisible();
  await screenshot(page, '08-result');
  expect(await page.locator('.glass-optical-output canvas').count()).toBeLessThanOrEqual(4);
  for (const group of await page.locator('.glass-group:visible').all()) {
    if ((await group.getAttribute('data-glass-quality')) !== 'fallback')
      await expect(group).toHaveAttribute('data-glass-renderer', 'canvas');
  }
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { name: '这个页面没有找到' })).toBeVisible();
  await expect(page.locator('.not-found-action-island')).toHaveAttribute('data-glass-renderer', 'canvas');
  await screenshot(page, '09-not-found');
  expect(errors).toEqual([]);
});

test('reduced motion and failed WebGL keep the controls usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.getByRole('radio', { name: '人类', exact: true }).click();
  await aligned(page);
  const hash = (data: string) => createHash('sha256').update(data).digest('hex');
  // Sample an unobscured strip of the actual water background, after entry settles.
  const inkFrame = () => page.screenshot({ clip: { x: 0, y: 0, width: 8, height: 200 } });
  await page.waitForTimeout(550);
  const before = hash((await inkFrame()).toString('base64'));
  await page.waitForTimeout(250);
  expect(hash((await inkFrame()).toString('base64'))).toBe(before);
  await page.getByRole('radio', { name: '智能体', exact: true }).click();
  await aligned(page);
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.includes('webgl')) return null;
      return get.apply(this, [type, ...args] as Parameters<typeof get>);
    } as typeof get;
  });
  await ready(page);
  await page.getByRole('radio', { name: '人类', exact: true }).click();
  await expect(page.locator('.stepper-island')).toHaveAttribute('data-glass-renderer', 'backdrop');
  await page.getByRole('textbox').fill('https://ccc.nottingham.edu.cn/study/home/details?id=1234');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('heading', { name: '再选择时间模式' })).toBeVisible();
});

test('reduced transparency uses solid surfaces and optical context loss recovers', async ({ page }) => {
  await page.goto('/tests/browser/glass-fixture.html');
  await expect(page.locator('.actions')).toHaveAttribute('data-glass-renderer', 'canvas');
  // The engine keeps this canvas alive until context restoration; then adapter remounts it.
  const supported = await page.locator('.actions canvas').evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 500);
    return true;
  });
  expect(supported).toBe(true);
  await expect(page.locator('.actions')).toHaveAttribute('data-glass-renderer', 'backdrop');
  await expect(page.locator('.actions')).toHaveAttribute('data-glass-renderer', 'canvas');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('commits')).toHaveText('1');
  // Playwright does not expose reduced-transparency emulation. Override just
  // that media query; computed surfaces are still checked in the real browser.
  await page.addInitScript(() => {
    const original = matchMedia.bind(window);
    window.matchMedia = (query) =>
      query.includes('prefers-reduced-transparency')
        ? Object.defineProperty(original(query), 'matches', { value: true })
        : original(query);
  });
  await page.goto('/tests/browser/glass-fixture.html');
  await expect(page.locator('.actions')).toHaveAttribute('data-glass-renderer', 'solid');
  await expect(page.locator('.glass-optical-output')).toHaveCount(0);
  expect(
    await page
      .locator('.actions .regular-glass-surface')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
  ).toBe('rgb(250, 249, 245)');
});

test('large text and short landscape keep controls reachable without horizontal overflow', async ({
  page
}) => {
  await ready(page);
  await page.getByRole('radio', { name: '人类', exact: true }).click();
  await page.getByRole('textbox').fill('https://ccc.nottingham.edu.cn/study/home/details?id=1234');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('radio', { name: '手动', exact: true }).click();
  await page
    .locator('.segment-option, .time-mode-description, .time-grid label, .panel-header h3')
    .evaluateAll((nodes) =>
      nodes.forEach((el) => {
        (el as HTMLElement).style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * 1.5}px`;
      })
    );
  await aligned(page);
  await expect(page.getByRole('radio', { name: '自动（推荐）' })).toBeVisible();
  await expect.poll(() => page.locator('#manualTime').evaluate((el) => el.getAnimations().length)).toBe(0);
  await screenshot(page, '10-large-text');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  const next = page.getByRole('button', { name: '下一步', exact: true });
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('11-landscape.png') });
});

test('sustained slow frames lower resolution before switching to blur', async ({ page }) => {
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => raf((time) => callback(time * 2));
  });
  await page.goto('/tests/browser/glass-fixture.html');
  const group = page.locator('.actions');
  await expect(group).toHaveAttribute('data-glass-quality', 'high');
  await expect(group.locator('canvas')).toBeVisible();
  const initialWidth = await group.locator('canvas').evaluate((el) => (el as HTMLCanvasElement).width);
  await expect(group).toHaveAttribute('data-glass-quality', 'low');
  await expect
    .poll(() => group.locator('canvas').evaluate((el) => (el as HTMLCanvasElement).width))
    .toBeLessThan(initialWidth);
  await expect(group).toHaveAttribute('data-glass-renderer', 'canvas');
  await expect(group.locator('canvas')).toBeVisible();
  await expect(group).toHaveAttribute('data-glass-quality', 'fallback');
  await expect(group).toHaveAttribute('data-glass-renderer', 'backdrop');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('commits')).toHaveText('1');
});
