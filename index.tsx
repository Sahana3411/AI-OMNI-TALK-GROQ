import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const mount = () => {
  const rootElement = document.getElementById('root');
  
  // Retry if root not found (race condition with async script injection)
  if (!rootElement) {
    console.warn("Root element not found, retrying mounting...");
    setTimeout(mount, 50);
    return;
  }

  // Prevent double mounting
  if (rootElement.hasAttribute('data-mounted')) return;
  rootElement.setAttribute('data-mounted', 'true');

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <App />
  );
};

// Robust entry logic handling various ready states
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  // If already loaded or interactive, try mounting immediately
  mount();
}