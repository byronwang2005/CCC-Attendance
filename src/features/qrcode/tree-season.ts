import type { TreeSeason } from './magic-tree-config';

/** Fixed annual scene dates, at midnight in China (UTC+8), independent of device timezone. */
export const TREE_SEASON_DATES: ReadonlyArray<{ season: TreeSeason; month: number; day: number }> = [
  { season: 'spring', month: 3, day: 5 },
  { season: 'summer', month: 5, day: 5 },
  { season: 'autumn', month: 10, day: 8 },
  { season: 'winter', month: 12, day: 7 }
];
const CHINA_OFFSET = 8 * 60 * 60 * 1000;

export function treeSeasonAt(now = Date.now()): TreeSeason {
  const china = new Date(now + CHINA_OFFSET);
  const day = (china.getUTCMonth() + 1) * 100 + china.getUTCDate();
  let season: TreeSeason = 'winter';
  for (const entry of TREE_SEASON_DATES) {
    if (day >= entry.month * 100 + entry.day) season = entry.season;
  }
  return season;
}

export function nextTreeSeasonAt(now = Date.now()): number {
  const year = new Date(now + CHINA_OFFSET).getUTCFullYear();
  for (const entry of TREE_SEASON_DATES) {
    const boundary = Date.UTC(year, entry.month - 1, entry.day) - CHINA_OFFSET;
    if (boundary > now) return boundary;
  }
  return Date.UTC(year + 1, 2, 5) - CHINA_OFFSET;
}
