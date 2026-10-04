import { RuntimeProvider } from './features/rehearsal/RuntimeProvider';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CompanionApp } from './features/companion';
import './features/companion/companion.css';

export function bootstrap(): void {
  const root = document.getElementById('root');
  if (!root) throw new Error('root element was not found');
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
  createRoot(root).render(<StrictMode><RuntimeProvider pauseDuringWorship><CompanionApp /></RuntimeProvider></StrictMode>);
}
