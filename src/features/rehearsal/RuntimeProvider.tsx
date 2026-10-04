import { canPublishPublicRequest } from '../companion/serviceSchedule';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { RuntimeContext } from './runtime';
import type { Runtime } from './runtime';
import './rehearsal.css';
import { foregroundPolling } from '../companion/polling';

export function RuntimeProvider({ children, publicDayBoundaries = false }: { children: ReactNode; publicDayBoundaries?: boolean }) {
  const [runtime, setRuntime] = useState<Omit<Runtime, 'eventDay' | 'setEventDay'> | null>(null);
  const [eventDay, setEventDay] = useState(0);
  useEffect(() => {
    const markOffline = () => setRuntime(current => ({ rehearsal: false, managed: true, status: current?.status ?? null, offline: true, lastSync: current?.lastSync ?? null }));
    const polling = foregroundPolling(async signal => {
      const startedAt = Date.now();
      try {
        const response = await fetch('/api/status', { cache: 'no-store', credentials: 'same-origin', signal });
        const body: unknown = await response.json();
        if (signal.aborted || (publicDayBoundaries && !canPublishPublicRequest(startedAt))) return;
        if (!response.ok || !body || typeof body !== 'object' || !('enabled' in body) || typeof body.enabled !== 'boolean' || !('resources' in body) || !Array.isArray(body.resources)) throw new Error('Invalid runtime');
        const { enabled, resources } = body;
        setRuntime(current => ({ rehearsal: false, managed: true, status: { enabled, resources: enabled ? resources : current?.status?.resources ?? [] }, offline: false, lastSync: Date.now() }));
      } catch { if ((!publicDayBoundaries || canPublishPublicRequest(startedAt)) && (!signal.aborted || signal.reason?.message === 'timeout')) markOffline(); }
    }, 20000, markOffline, true, false, { publicSchedule: publicDayBoundaries });
    return polling.stop;
  }, [publicDayBoundaries]);
  return <RuntimeContext.Provider value={{ rehearsal: false, managed: true, status: null, offline: !navigator.onLine, lastSync: null, ...runtime, eventDay, setEventDay }}>{children}</RuntimeContext.Provider>;
}
