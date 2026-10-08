import { GlassEnvironment } from './features/glass/glass-environment';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './features/glass/glass.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing app root.');

createRoot(root).render(
  <GlassEnvironment><App /></GlassEnvironment>
);
