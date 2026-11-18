import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Dev-only test hook: lets the browser console and Playwright drive the media engine directly.
// Tree-shaken from production builds.
if (import.meta.env.DEV) {
  void import('./media-engine').then((engine) => {
    (window as unknown as { __veyra: unknown }).__veyra = engine;
  });
}
