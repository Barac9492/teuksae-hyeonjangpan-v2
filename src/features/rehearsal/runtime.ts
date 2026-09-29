import { createContext, useContext } from 'react';
export type Runtime = { rehearsal: boolean; eventDay: number; setEventDay: (day: number) => void; managed: boolean; status: { enabled: boolean; resources: unknown[] } | null; offline: boolean; lastSync: number | null };
export const RuntimeContext = createContext<Runtime>({ rehearsal: false, eventDay: 0, setEventDay: () => undefined, managed: false, status: null, offline: false, lastSync: null });
export const useRuntime = () => useContext(RuntimeContext);
let namespace = 'live';
export function setStorageNamespace(rehearsal: boolean) { namespace = rehearsal ? 'rehearsal' : 'live'; }
export function runtimeStorageKey(key: string) { return namespace === 'live' ? key : `${key}:rehearsal`; }

// Capture the namespace shown by the server-loaded UI, not the browser's clock.
export function runtimeModeHeader() { return namespace; }
