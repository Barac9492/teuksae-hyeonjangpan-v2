import { canPublishPublicRequest } from '../companion/serviceSchedule';
import { useServiceClock } from '../companion/useServiceClock';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { RuntimeContext } from './runtime';
import type { Runtime } from './runtime';
import './rehearsal.css';
import { foregroundPolling } from '../companion/polling';

export function RuntimeProvider({ children, pauseDuringWorship = false }: { children: ReactNode; pauseDuringWorship?: boolean }) {
  const now = useServiceClock();
  const [runtime, setRuntime] = useState<Omit<Runtime, 'eventDay' | 'setEventDay'> | null>(null);
  const [eventDay, setEventDay] = useState(0);
  useEffect(() => {
    const markOffline = () => setRuntime(current => ({ rehearsal: false, managed: true, status: current?.status ?? null, offline: true, lastSync: current?.lastSync ?? null }));
    const polling = foregroundPolling(async signal => {
      const startedAt = Date.now();
      try {
        const response = await fetch('/api/status', { cache: 'no-store', credentials: 'same-origin', signal });
        const body: unknown = await response.json();
        if (signal.aborted || (pauseDuringWorship && !canPublishPublicRequest(startedAt))) return;
        if (!response.ok || !body || typeof body !== 'object' || !('enabled' in body) || typeof body.enabled !== 'boolean' || !('resources' in body) || !Array.isArray(body.resources)) throw new Error('Invalid runtime');
        setRuntime({ rehearsal: false, managed: true, status: { enabled: body.enabled, resources: body.resources }, offline: false, lastSync: Date.now() });
      } catch { if ((!pauseDuringWorship || canPublishPublicRequest(startedAt)) && (!signal.aborted || signal.reason?.message === 'timeout')) markOffline(); }
    }, 20000, markOffline, true, false, { publicSchedule: pauseDuringWorship, onPeriodChange: () => setRuntime(current => ({ rehearsal: false, managed: true, status: null, offline: !navigator.onLine || current?.offline === true, lastSync: null })) });
    return polling.stop;
  }, [pauseDuringWorship]);
  return <RuntimeContext.Provider value={{ rehearsal: false, managed: true, status: null, offline: !navigator.onLine, lastSync: null, ...runtime, ...(pauseDuringWorship && runtime?.lastSync != null && !canPublishPublicRequest(runtime.lastSync, now) ? { status: null, lastSync: null } : {}), eventDay, setEventDay }}>{children}</RuntimeContext.Provider>;
}
