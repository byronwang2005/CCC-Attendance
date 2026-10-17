import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { MagicTreeStage } from './MagicTreeStage';
import { TREE_SEASONS, type TreeSeason } from './magic-tree-config';
import previewQrUrl from './fixtures/season-preview.png';
import './season-tree-preview.css';

const seasons: TreeSeason[] = ['spring', 'summer', 'autumn', 'winter'];
const edgeColors: Record<TreeSeason, string> = { spring: '#6D7F57', summer: '#647A52', autumn: '#847A59', winter: '#6E777D' };
const seasonNotes: Record<TreeSeason, string> = {
  spring: '枝梢先醒，花与嫩叶在晨风中舒展。几片花瓣落向根边，花隙藏着一点微光。',
  summer: '叶团铺成浓荫，一阵风从树冠一侧走向另一侧。青草与光尘在树下慢慢呼吸。',
  autumn: '秋风掠过树梢，叶片离枝、翻转，再轻轻落地。根边两三片落叶滚动，随后归于安静。',
  winter: '阵风穿过裸枝，急雪斜掠、翻卷，又随回风旋舞。枝面与分叉承住积雪，根边雪面起伏，留住风雪的痕迹。'
};

function initialSeason(): TreeSeason {
  const value = new URLSearchParams(window.location.search).get('season');
  return seasons.includes(value as TreeSeason) ? value as TreeSeason : 'autumn';
}

export default function SeasonTreePreview() {
  const [season, setSeason] = useState<TreeSeason>(initialSeason);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = TREE_SEASONS[season];
  const palette = current.palette;
  const swatches = [
    { name: '花叶', color: palette.leaf[0] },
    { name: '地表', color: palette.grass[0] },
    { name: '枝干', color: palette.bark },
    { name: '中心一', color: palette.scanLeaf[0] },
    { name: '中心二', color: palette.scanLeaf[1] },
    { name: '边缘', color: edgeColors[season] }
  ];
  const select = (next: TreeSeason) => {
    setSeason(next);
    const url = new URL(window.location.href);
    url.searchParams.set('season', next);
    window.history.replaceState(window.history.state, '', url);
  };
  const navigateTabs = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % seasons.length;
    else if (event.key === 'ArrowLeft') next = (index + seasons.length - 1) % seasons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = seasons.length - 1;
    else return;
    event.preventDefault();
    select(seasons[next]);
    tabs.current[next]?.focus();
  };

  return (
    <main className="season-preview" style={{ '--season-accent': palette.scanLeaf[0] } as CSSProperties}>
      <header className="season-preview__header">
        <div>
          <p className="season-preview__eyebrow">一棵树的四季</p>
          <h1>四季树景</h1>
          <p className="season-preview__intro">春生 · 夏盛 · 秋起 · 冬雪</p>
        </div>
        <div className="season-preview__tabs" role="tablist" aria-label="选择季节">
          {seasons.map((value, index) => (
            <button key={value} ref={element => { tabs.current[index] = element; }}
              type="button" role="tab" id={`season-tab-${value}`} aria-selected={season === value}
              aria-controls="season-scene" tabIndex={season === value ? 0 : -1}
              onClick={() => select(value)} onKeyDown={event => navigateTabs(event, index)}
              style={{ '--tab-color': TREE_SEASONS[value].palette.scanLeaf[0] } as CSSProperties}>
              <span className="season-preview__dot" aria-hidden="true" />{TREE_SEASONS[value].name}
            </button>
          ))}
        </div>
      </header>

      <section className="season-preview__scene" id="season-scene" role="tabpanel" aria-labelledby={`season-tab-${season}`}>
        <div className="season-preview__scene-caption" aria-hidden="true"><span>0{seasons.indexOf(season) + 1}</span><span>{current.title}</span></div>
        <MagicTreeStage imageUrl={previewQrUrl} season={season} />
        <p className="season-preview__hint">轻触树景，俯看成码 · 再次轻触，回到树下</p>
      </section>

      <section className="season-preview__details" aria-label={`${current.name}设计与配色`}>
        <div className="season-preview__story">
          <h2>{current.title}</h2>
          {current.poem && <figure className="season-preview__poem">
            <blockquote cite={current.poem.source}>{current.poem.text}</blockquote>
            <figcaption><a href={current.poem.source} target="_blank" rel="noopener noreferrer">{current.poem.author}《{current.poem.work}》</a></figcaption>
          </figure>}
          <p>{seasonNotes[season]}</p>
          <p className="season-preview__pantone">Pantone TCX 参考 · {current.pantone}</p>
        </div>
        <div className="season-preview__palette">
          <div className="season-preview__palette-heading"><span>自然色</span><span>二维码色</span></div>
          <ul aria-label={`${current.name}屏幕色卡`}>
            {swatches.map(swatch => <li key={swatch.name}>
              <span className="season-preview__swatch" style={{ backgroundColor: swatch.color }} aria-hidden="true" />
              <span>{swatch.name}</span><code>{swatch.color}</code>
            </li>)}
          </ul>
          <p>屏幕设计色 · 以 TCX 色彩气质为参考</p>
        </div>
      </section>
    </main>
  );
}
