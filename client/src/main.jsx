import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/layout.css';
import './ui/styles/detail.css';
import './ui/styles/overlays.css';
import './ui/styles/screens.css';
import { applyTheme, getStoredTheme } from './ui/lib/theme.js';
import App from './App.jsx';

applyTheme(getStoredTheme());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
