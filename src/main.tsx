import '@fontsource/league-gothic/400.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
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
  void Promise.all([import('./media-engine'), import('./state/project-store'), import('./editor/editor-ui-store')]).then(([engine, project, ui]) => {
    (window as unknown as { __veyra: unknown }).__veyra = { ...engine, useProjectStore: project.useProjectStore, useEditorUi: ui.useEditorUi };
  });
}
