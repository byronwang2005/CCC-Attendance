import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  GlassEnvironment,
  publishGlassBackground,
  releaseGlassBackground
} from '../../src/features/glass/glass-environment';
import { GlassGroup, REGULAR_OPTICS } from '../../src/features/glass/GlassGroup';
import { GlassIsland } from '../../src/features/glass/GlassIsland';
import { SegmentedGlassControl } from '../../src/features/glass/SegmentedGlassControl';
import '../../src/features/glass/glass.css';

// A deterministic optical probe, served only by Vite in the browser tests.
// Compare the real adapter with refraction on/off; all other optics stay equal.
document.documentElement.style.setProperty('--brand', '#1b365d');
const dark = new URLSearchParams(location.search).has('dark');
if (new URLSearchParams(location.search).has('flat')) REGULAR_OPTICS.strength = 0;
function Fixture() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState('a');
  const [commits, setCommits] = useState(0);
  useEffect(() => {
    const node = canvas.current!,
      ctx = node.getContext('2d')!;
    node.width = innerWidth;
    node.height = innerHeight;
    ctx.fillStyle = dark ? '#171d25' : '#e5e3db';
    ctx.fillRect(0, 0, node.width, node.height);
    for (let x = 0; x < node.width; x += 12) {
      ctx.fillStyle = dark ? (x % 24 ? '#111820' : '#223241') : x % 24 ? '#344455' : '#ddd4b9';
      ctx.fillRect(x, 0, 6, node.height);
    }
    publishGlassBackground(node, '#fff', 200);
    return releaseGlassBackground;
  }, []);
  return (
    <>
      <canvas
        ref={canvas}
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: -1 }}
      />
      <div style={{ margin: '60px 16px', width: 320 }}>
        <GlassGroup className="actions">
          <GlassIsland className="action-island" shape="capsule">
            <button className="button-primary" onClick={() => setCommits((n) => n + 1)}>
              Continue
            </button>
          </GlassIsland>
        </GlassGroup>
        <div style={{ height: 40 }} />
        <div className={dark ? 'standard-surface' : undefined} style={{ borderRadius: 28, padding: dark ? 8 : 0 }}>
        <SegmentedGlassControl
          value={value}
          onValueChange={(next) => {
            setValue(next);
            setCommits((n) => n + 1);
          }}
          options={[
            { value: 'a', label: 'First' },
            { value: 'b', label: 'Second' }
          ]}
          ariaLabel="Options"
        />
        </div>
        <output data-testid="commits" style={{ color: dark ? '#fff' : '#000' }}>{commits}</output>
      </div>
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <GlassEnvironment>
    <Fixture />
  </GlassEnvironment>
);
