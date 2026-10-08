import type { CSSProperties } from 'react';
import { InkFlowBackground } from '../background/InkFlowBackground';
import {
  GlassIsland,
  StaticGlassIsland,
} from '../glass/GlassIsland';
import { NOT_FOUND_INK_PALETTE } from './not-found-config';

function MessageContent() {
  return (
    <div className="message-island__content">
      <h1 id="notFoundTitle">这个页面没有找到</h1>
      <p className="message-island__copy">
        地址可能已经失效，或者从未存在。返回首页，继续生成您的签到二维码。
      </p>
      <GlassIsland
        variant="interactive"
        shape="capsule"
        className="action-island not-found-action-island"
      >
        <a href="/" className="home-action">
          <svg className="home-action__icon" aria-hidden="true" focusable="false">
            <use href="/assets/icons/actions.svg#arrow-left" />
          </svg>
          <span>返回首页</span>
        </a>
      </GlassIsland>
    </div>
  );
}

function MessageIsland() {
  return (
    <StaticGlassIsland
      shape="panel"
      className="message-island"
    >
      <MessageContent />
    </StaticGlassIsland>
  );
}

export function NotFoundPage() {
  const stageStyle = {
    '--ink-stage-background': NOT_FOUND_INK_PALETTE.backgroundHex
  } as CSSProperties;

  return (
    <div className="not-found-stage" style={stageStyle}>
      <InkFlowBackground step={1} palette={NOT_FOUND_INK_PALETTE} />

      <main id="main-content" className="not-found-layout" aria-labelledby="notFoundTitle">
        <section className="error-mark" aria-label="错误代码 404">
          <p className="error-mark__label" lang="en">PATH NOT FOUND</p>
          <p className="error-mark__code" aria-hidden="true">404</p>
          <div className="error-mark__rule" aria-hidden="true" />
        </section>

        <MessageIsland />
      </main>
    </div>
  );
}
