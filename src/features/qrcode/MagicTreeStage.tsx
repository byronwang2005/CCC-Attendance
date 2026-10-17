import { TEXT } from '../../config';
import { useEffect, useRef, useState } from 'react';
import { createMagicTreeStage, type MagicTreeScene } from './magic-tree-stage';
import { TREE_SEASONS, type TreeSeason } from './magic-tree-config';

export interface MagicTreeStageProps { imageUrl: string; season?: TreeSeason }

export function MagicTreeStage({ imageUrl, season }: MagicTreeStageProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MagicTreeScene | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [qr, setQr] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let instance: MagicTreeScene | null = null;
    let failed = false;
    setStatus('loading'); setQr(false);
    const fail = () => {
      if (controller.signal.aborted || failed) return;
      failed = true;
      instance?.destroy();
      instance = null;
      scene.current = null;
      setStatus('error');
    };
    void createMagicTreeStage(host.current!, imageUrl, controller.signal, fail, season).then(next => {
      if (controller.signal.aborted || failed) next.destroy();
      else { instance = next; scene.current = next; setStatus('ready'); }
    }).catch(fail);
    return () => { controller.abort(); instance?.destroy(); scene.current = null; };
  }, [imageUrl, attempt, season]);

  const toggle = () => {
    const next = !qr;
    setQr(next);
    scene.current?.setQr(next);
  };
  return (
    <div className="magic-tree-stage" data-season={season ?? 'autumn'} data-state={qr ? 'qr' : 'tree'}>
      <div className="magic-tree-stage__viewport">
        <div ref={host} className="magic-tree-stage__canvas" aria-hidden="true" />
        {status === 'ready' && <button type="button" className="magic-tree-stage__hit" onClick={toggle} aria-label={qr ? `返回${TREE_SEASONS[season ?? 'autumn'].name}树景` : '俯视查看二维码'} aria-pressed={qr} />}
        {status === 'loading' && <p className="magic-tree-stage__loading" role="status">{TEXT.placeholders.receiptLoading}</p>}
        {status === 'error' && <div className="magic-tree-stage__error"><p role="alert">树景加载失败，请重试或使用支持 WebGL 的浏览器。</p><button type="button" onClick={() => setAttempt(value => value + 1)}>重新加载树景</button></div>}
      </div>

    </div>
  );
}
