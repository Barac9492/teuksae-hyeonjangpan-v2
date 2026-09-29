// One operational dataset and account set, before, during and after the event.
// Kept as compatibility helpers for callers and previously deployed configuration.
export const REHEARSAL_UNTIL = '2026-10-05T00:00:00+09:00';
export const REHEARSAL_END = Date.parse(REHEARSAL_UNTIL);
export function isRehearsal() { return false; }
export function runtimeInfo() { return { rehearsal: false }; }
export function rpcName(name) { return name; }
