import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { RuntimeContext } from './runtime';
import type { Runtime } from './runtime';
import './rehearsal.css';

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<Omit<Runtime, 'eventDay' | 'setEventDay'> | null>(null);
  const [eventDay, setEventDay] = useState(0);
  useEffect(() => {
    let alive = true; let pending = false;
    const controller = new AbortController();
    const load = async () => {
      if (pending) return;
      pending = true;
      const request = new AbortController();
      const abort = () => request.abort(); controller.signal.addEventListener('abort', abort);
      const timeout = window.setTimeout(abort, 8000);
      try {
        const response = await fetch('/api/status', { cache: 'no-store', credentials: 'same-origin', signal: request.signal });
        const body: unknown = await response.json();
        if (!response.ok || !body || typeof body !== 'object' || !('enabled' in body) || typeof body.enabled !== 'boolean' || !('resources' in body) || !Array.isArray(body.resources)) throw new Error('Invalid runtime');
        if (!alive) return;
        setRuntime({ rehearsal: false, managed: true, status: { enabled: body.enabled, resources: body.resources }, offline: false, lastSync: Date.now() });
      } catch { if (alive) setRuntime(current => ({ rehearsal: false, managed: true, status: current?.status ?? null, offline: true, lastSync: current?.lastSync ?? null })); }
      finally { window.clearTimeout(timeout); controller.signal.removeEventListener('abort', abort); pending = false; }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 20000);
    const refresh = () => { void load(); };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; controller.abort(); window.clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return <RuntimeContext.Provider value={{ rehearsal: false, managed: true, status: null, offline: false, lastSync: null, ...runtime, eventDay, setEventDay }}>{children}</RuntimeContext.Provider>;
}
