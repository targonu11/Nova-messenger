import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './motion.css';
import './motion-extra.css';
import './motion-batch-3.css';
import './motion-batch-4.css';
import './motion-call-voice.css';
import './motion-imba.css';
import './motion-imba-2.css';
import './motion-imba-3.css';
import './motion-imba-4.css';
import './motion-imba-5.css';
import { applyTheme, getStoredTheme } from './themeStorage';
import { applyUiCustomization } from './uiCustomize';
import { applyMotionPreferences } from './motion';

applyTheme(getStoredTheme());
applyUiCustomization();
applyMotionPreferences();

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.innerHTML = '<div style="padding:20;font-family:sans-serif">No #root element</div>';
} else {
  try {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (err) {
    rootEl.innerHTML = '<div style="padding:24;background:#0c0c0e;color:#e4e4e7;min-height:100vh;font-family:sans-serif">' +
      '<h2 style="color:#e53935">Ошибка запуска</h2><pre>' + (err && err.message) + '</pre></div>';
    console.error(err);
  }
}
