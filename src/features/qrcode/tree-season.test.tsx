import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTreeSeasonAt, treeSeasonAt } from './tree-season';
import { useTreeSeason } from './use-tree-season';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('fixed annual seasons in China time', () => {
  it.each([
    ['2026-03-04T16:00:00Z', 'winter', 'spring'],
    ['2026-05-04T16:00:00Z', 'spring', 'summer'],
    ['2026-10-07T16:00:00Z', 'summer', 'autumn'],
    ['2026-12-06T16:00:00Z', 'autumn', 'winter']
  ] as const)('switches exactly at %s, regardless of the browser timezone', (date, before, after) => {
    const boundary = Date.parse(date);
    expect(treeSeasonAt(boundary - 1)).toBe(before);
    expect(treeSeasonAt(boundary)).toBe(after);
    expect(nextTreeSeasonAt(boundary - 1)).toBe(boundary);
    expect(nextTreeSeasonAt(boundary)).toBeGreaterThan(boundary);
  });

  it('carries winter over New Year and leap day, repeating the same dates each year', () => {
    for (const year of [2026, 2027, 2028, 2030]) {
      expect(treeSeasonAt(Date.UTC(year, 0, 1))).toBe('winter');
      expect(nextTreeSeasonAt(Date.UTC(year, 0, 1))).toBe(Date.UTC(year, 2, 4, 16));
      expect(nextTreeSeasonAt(Date.UTC(year, 11, 31))).toBe(Date.UTC(year + 1, 2, 4, 16));
    }
    expect(treeSeasonAt(Date.parse('2028-02-29T12:00:00Z'))).toBe('winter');
  });

  it('updates an open page at midnight and clears its timer on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-04T15:59:59Z'));
    const { result, unmount } = renderHook(useTreeSeason);
    expect(result.current).toBe('spring');
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe('summer');
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rearms long waits without timer overflow and catches up after sleep or clock changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { result } = renderHook(useTreeSeason);
    act(() => vi.advanceTimersByTime(2_147_483_647));
    expect(result.current).toBe('winter');
    expect(vi.getTimerCount()).toBe(1);
    vi.setSystemTime(new Date('2026-10-08T00:00:00Z'));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current).toBe('autumn');
    vi.setSystemTime(new Date('2026-05-05T00:00:00Z'));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current).toBe('summer');
    expect(vi.getTimerCount()).toBe(1);
  });
});
