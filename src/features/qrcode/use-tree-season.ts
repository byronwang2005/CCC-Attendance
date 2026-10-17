import { useEffect, useState } from 'react';
import { nextTreeSeasonAt, treeSeasonAt } from './tree-season';

export function useTreeSeason() {
  const [season, setSeason] = useState(() => treeSeasonAt());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = Date.now();
      setSeason(treeSeasonAt(now));
      // Long waits must stay within the browser's signed 32-bit timer limit.
      timer = setTimeout(refresh, Math.min(nextTreeSeasonAt(now) - now, 2_147_483_647));
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return season;
}
