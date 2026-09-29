import { createContext, useContext } from 'react';
export type Runtime = { rehearsal: boolean; eventDay: number; setEventDay: (day: number) => void; managed: boolean; status: { enabled: boolean; resources: unknown[] } | null; offline: boolean; lastSync: number | null };
export const RuntimeContext = createContext<Runtime>({ rehearsal: false, eventDay: 0, setEventDay: () => undefined, managed: false, status: null, offline: false, lastSync: null });
export const useRuntime = () => useContext(RuntimeContext);
// Browser drafts and receipts use the same keys throughout the event.
export function setStorageNamespace(_rehearsal: boolean) { void _rehearsal; }
export function runtimeStorageKey(key: string) { return key; }
