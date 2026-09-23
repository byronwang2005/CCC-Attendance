import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App';
import { TEXT } from './config';

const html = readFileSync('index.html', 'utf8');
const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.classList.remove('boot-wait-4', 'boot-wait-15');
  if (originalFonts) {
    Object.defineProperty(document, 'fonts', originalFonts);
  } else {
    Reflect.deleteProperty(document, 'fonts');
  }
});

it('keeps both delayed hints visible across the static-to-React loader handoff', async () => {
  vi.useFakeTimers();
  let finishFonts = () => {};
  const fontReady = new Promise<void>((resolve) => { finishFonts = resolve; });
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: fontReady } });

  const entry = new DOMParser().parseFromString(html, 'text/html');
  const staticLoader = entry.querySelector('.boot-loader');
  expect(staticLoader?.querySelector('.boot-loader__hint--4')?.textContent).toBe(TEXT.placeholders.bootSlow);
  expect(staticLoader?.querySelector('.boot-loader__hint--15')?.textContent).toBe(TEXT.placeholders.bootStalled);

  const startupScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  expect(startupScript).toBeDefined();
  new Function(startupScript ?? '')();

  expect(document.documentElement).not.toHaveClass('boot-wait-4', 'boot-wait-15');
  await vi.advanceTimersByTimeAsync(3999);
  expect(document.documentElement).not.toHaveClass('boot-wait-4');
  await vi.advanceTimersByTimeAsync(1);
  expect(document.documentElement).toHaveClass('boot-wait-4');
  expect(document.documentElement).not.toHaveClass('boot-wait-15');

  render(<App />);
  const loader = screen.getByLabelText('正在加载');
  expect(loader.querySelector('.boot-loader__hint--4')).toHaveTextContent(TEXT.placeholders.bootSlow);
  expect(loader.querySelector('.boot-loader__hint--15')).toHaveTextContent(TEXT.placeholders.bootStalled);
  expect(document.documentElement).toHaveClass('boot-wait-4');

  await act(async () => { await vi.advanceTimersByTimeAsync(11000); });
  expect(document.documentElement).toHaveClass('boot-wait-4', 'boot-wait-15');
  expect(screen.getByLabelText('正在加载')).toBeInTheDocument();

  await act(async () => { finishFonts(); });
  expect(screen.queryByLabelText('正在加载')).not.toBeInTheDocument();
});
