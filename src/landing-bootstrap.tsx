import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CompanionApp } from './features/companion';
import './features/companion/companion.css';

export function bootstrap(): void {
  const root = document.getElementById('root');
  if (!root) throw new Error('root element was not found');
  createRoot(root).render(<StrictMode><CompanionApp /></StrictMode>);
}
