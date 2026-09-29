import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { RuntimeContext, setStorageNamespace } from './runtime';
import type { Runtime } from './runtime';
import './rehearsal.css';

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<Omit<Runtime, 'eventDay' | 'setEventDay'> | null>(null);
  const [error, setError] = useState(false);
  const [transition, setTransition] = useState(false);
  const [eventDay, setEventDay] = useState(0);
  const previous = useRef<boolean | null>(null);
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
        const rehearsal = body.enabled === true && 'rehearsal' in body && body.rehearsal === true;
        if (previous.current !== null && previous.current !== rehearsal) {
          setTransition(true); window.location.reload(); return;
        }
        previous.current = rehearsal;
        setStorageNamespace(rehearsal);
        setRuntime({ rehearsal, managed: true, status: { enabled: body.enabled, resources: body.resources }, offline: false, lastSync: Date.now() });
        setError(false);
      } catch { if (alive) { setError(true); setRuntime(null); } }
      finally { window.clearTimeout(timeout); controller.signal.removeEventListener('abort', abort); pending = false; }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 20000);
    const refresh = () => { void load(); };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; controller.abort(); window.clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  if (transition) return <p role="status">운영 모드가 바뀌어 새로 불러옵니다.</p>;
  if (!runtime) return <p role={error ? 'alert' : 'status'} className="rehearsal-banner">{error ? '운영 모드를 확인하지 못했습니다. 안전을 위해 안내와 접수를 잠시 중지합니다. 자동으로 다시 확인합니다.' : '운영 모드를 확인하고 있습니다.'}</p>;
  return <RuntimeContext.Provider value={{ ...runtime, eventDay, setEventDay }}>{children}</RuntimeContext.Provider>;
}
