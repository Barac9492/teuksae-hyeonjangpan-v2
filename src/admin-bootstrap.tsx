import { RehearsalBanner } from './features/rehearsal/RehearsalBanner';
import { RehearsalReset } from './features/rehearsal/RehearsalReset';
import { RuntimeProvider } from './features/rehearsal/RuntimeProvider';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './features/admin';
import './features/admin/admin.css';
import './styles/admin-base.css';

export function bootstrap(): void {
  const root = document.getElementById('root');
  if (!root) throw new Error('root element was not found');
  document.title = '관리자 · 우리 특새';
  createRoot(root).render(<StrictMode><RuntimeProvider><RehearsalBanner /><RehearsalReset /><AdminApp /></RuntimeProvider></StrictMode>);
}
