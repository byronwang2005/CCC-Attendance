import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import SeasonTreePreview from './SeasonTreePreview';

vi.mock('./MagicTreeStage', () => ({
  MagicTreeStage: ({ imageUrl, season }: { imageUrl: string; season: string }) => <div data-testid="preview-stage" data-season={season} data-image={imageUrl} />
}));
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); });

describe('SeasonTreePreview', () => {
  it.each(['', 'monsoon'])('defaults to autumn for a missing or invalid season: %s', value => {
    window.history.replaceState({}, '', `/?preview=seasons&season=${value}`);
    render(<SeasonTreePreview />);
    expect(screen.getByRole('tab', { name: '秋季' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('preview-stage')).toHaveAttribute('data-season', 'autumn');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('秋季');
    expect(screen.getAllByTestId('preview-stage')).toHaveLength(1);
  });

  it('initializes from the query and switches the single stage and swatches without navigating', () => {
    window.history.replaceState({ retained: true }, '', '/?preview=seasons&season=spring&other=keep#tree');
    render(<SeasonTreePreview />);
    expect(screen.getByTestId('preview-stage')).toHaveAttribute('data-season', 'spring');
    expect(screen.getByText('#B57786')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: '冬季' }));
    expect(screen.getByRole('tab', { name: '冬季' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '春季' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('preview-stage')).toHaveAttribute('data-season', 'winter');
    expect(screen.getAllByTestId('preview-stage')).toHaveLength(1);
    expect(screen.getByText('#71869F')).toBeVisible();
    expect(screen.queryByText('#B57786')).not.toBeInTheDocument();
    expect(window.location.search).toBe('?preview=seasons&season=winter&other=keep');
    expect(window.location.hash).toBe('#tree');
    expect(window.history.state).toEqual({ retained: true });
  });

  it('offers keyboard tab navigation with arrow wrapping and Home / End', async () => {
    window.history.replaceState({}, '', '/?preview=seasons&season=winter');
    render(<SeasonTreePreview />);
    const user = userEvent.setup();
    screen.getByRole('tab', { name: '冬季' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '春季' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('春季');
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: '冬季' })).toHaveFocus();
    await user.keyboard('{Home}{ArrowLeft}');
    expect(screen.getByRole('tab', { name: '冬季' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: '冬季' })).toHaveAttribute('tabindex', '0');
  });

  it('pairs the winter scene with Bai Juyi’s winter invitation and its source', () => {
    window.history.replaceState({}, '', '/?preview=seasons&season=winter');
    render(<SeasonTreePreview />);
    expect(screen.getByRole('heading', { name: '冬·风雪' })).toBeVisible();
    expect(screen.getByRole('blockquote')).toHaveTextContent('晚来天欲雪，能饮一杯无？');
    expect(screen.getByRole('link', { name: '白居易《问刘十九》' })).toHaveAttribute('href', 'https://zh.wikisource.org/zh-hans/問劉十九');
    expect(screen.getByText(/急雪斜掠、翻卷/)).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: '秋季' }));
    expect(screen.getByRole('blockquote')).toHaveTextContent('云天收夏色，木叶动秋声。');
    expect(screen.queryByRole('link', { name: '白居易《问刘十九》' })).not.toBeInTheDocument();
  });

  it('ships an offline fixture encoding only the demonstration URL', () => {
    const png = PNG.sync.read(readFileSync('src/features/qrcode/fixtures/season-preview.png'));
    expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe('https://example.com/season-preview');
  });
});
