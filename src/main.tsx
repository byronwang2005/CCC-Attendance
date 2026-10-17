import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import App from './App';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing app root.');

if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'seasons') {
  const SeasonTreePreview = lazy(() => import('./features/qrcode/SeasonTreePreview'));
  createRoot(root).render(
    <Suspense fallback={<p role="status">四季树景加载中…</p>}><SeasonTreePreview /></Suspense>
  );
} else {
  createRoot(root).render(<App />);
}
