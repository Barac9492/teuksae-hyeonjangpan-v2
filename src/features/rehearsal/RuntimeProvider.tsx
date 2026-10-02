import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { RuntimeContext } from './runtime';
import type { Runtime } from './runtime';
import { requestWithDeadline } from '../../lib/requestDeadline';
import './rehearsal.css';

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<Omit<Runtime, 'eventDay' | 'setEventDay'> | null>(null);
  const [eventDay, setEventDay] = useState(0);
  useEffect(() => {
    let alive = true;
    let activeRequest: AbortController | null = null;
    const markOffline = () => {
      if (alive) setRuntime(current => ({ rehearsal: false, managed: true, status: current?.status ?? null, offline: true, lastSync: current?.lastSync ?? null }));
    };
    const cancelRequest = () => {
      const request = activeRequest;
      // Invalidate synchronously so a quick reconnect can start a fresh read,
      // even if the old transport or body ignores abort and settles later.
      activeRequest = null;
      request?.abort();
    };
    const goOffline = () => { cancelRequest(); markOffline(); };
    const load = async () => {
      if (!alive) return;
      if (!navigator.onLine) { goOffline(); return; }
      if (activeRequest) return;
      const request = new AbortController();
      activeRequest = request;
      try {
        const status = await requestWithDeadline(async signal => {
          const response = await fetch('/api/status', { cache: 'no-store', credentials: 'same-origin', signal });
          const body: unknown = await response.json();
          if (!response.ok || !body || typeof body !== 'object' || !('enabled' in body) || typeof body.enabled !== 'boolean' || !('resources' in body) || !Array.isArray(body.resources)) throw new Error('Invalid runtime');
          return { enabled: body.enabled, resources: body.resources };
        }, { signal: request.signal, timeoutMs: 8000 });
        if (!alive || activeRequest !== request) return;
        if (!navigator.onLine) { goOffline(); return; }
        setRuntime({ rehearsal: false, managed: true, status, offline: false, lastSync: Date.now() });
      } catch { if (alive && activeRequest === request) markOffline(); }
      finally { if (activeRequest === request) activeRequest = null; }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 20000);
    const refresh = () => { void load(); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; cancelRequest(); window.clearInterval(timer); window.removeEventListener('offline', goOffline); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return <RuntimeContext.Provider value={{ rehearsal: false, managed: true, status: null, offline: false, lastSync: null, ...runtime, eventDay, setEventDay }}>{children}</RuntimeContext.Provider>;
}
