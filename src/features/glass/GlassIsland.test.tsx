import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlassIsland, StaticGlassIsland } from './GlassIsland';
import { detectGlassCapabilities, nextGlassQuality } from './glass-environment';

const environment = (preference = '') => {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: query.includes(preference || 'no-preference-test'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  vi.stubGlobal('CSS', { supports: () => true });
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('material fallback and quality policy', () => {
  it.each(['Safari/605.1.15', 'Chrome/140.0.0.0', 'Mobile Safari/604.1'])('does not gate rendering on %s', userAgent => {
    environment();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    expect(detectGlassCapabilities()).toEqual({ material: 'backdrop', motion: true });
  });
  it.each(['prefers-reduced-transparency', 'forced-colors'])('uses an opaque surface for %s', preference => {
    environment(preference);
    expect(detectGlassCapabilities().material).toBe('solid');
  });
  it('keeps transparency but removes movement for reduced motion', () => {
    environment('prefers-reduced-motion');
    expect(detectGlassCapabilities()).toEqual({ material: 'backdrop', motion: false });
  });
  it('waits for sustained evidence and lowers resolution before removing optics', () => {
    expect(nextGlassQuality('high', [60])).toBe('high');
    expect(nextGlassQuality('high', Array(120).fill(16.7))).toBe('high');
    expect(nextGlassQuality('high', Array(120).fill(24))).toBe('low');
    expect(nextGlassQuality('low', Array(120).fill(24))).toBe('low');
    expect(nextGlassQuality('low', Array(120).fill(33))).toBe('fallback');
    expect(nextGlassQuality('fallback', Array(120).fill(16))).toBe('fallback');
  });
  it('keeps controls usable when no background producer exists', () => {
    environment();
    render(<GlassIsland shape="capsule"><button>继续</button></GlassIsland>);
    expect(screen.getByRole('button', { name: '继续' })).toBeEnabled();
    expect(screen.getByText('继续').closest('[data-glass-renderer]')).toHaveAttribute('data-glass-renderer', 'backdrop');
  });
  it('does not create optical surfaces for content', () => {
    const { container } = render(<StaticGlassIsland shape="panel">正文</StaticGlassIsland>);
    expect(screen.getByText('正文').closest('[data-glass-material]')).toHaveAttribute('data-glass-material', 'standard');
    expect(container.querySelector('canvas, .regular-glass-surface')).toBeNull();
  });
});
