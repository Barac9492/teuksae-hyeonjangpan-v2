// Server-owned mode boundary. URL parameters and the device clock cannot enable rehearsal.
export const REHEARSAL_UNTIL = '2026-10-05T00:00:00+09:00';
export const REHEARSAL_END = Date.parse(REHEARSAL_UNTIL);
export function isRehearsal(env = process.env, now = Date.now()) {
  return env.REHEARSAL_ENABLED === 'true' && Number.isFinite(now) && now < REHEARSAL_END;
}
export function runtimeInfo(env = process.env, now = Date.now()) {
  return { rehearsal: isRehearsal(env, now), rehearsalUntil: REHEARSAL_UNTIL };
}
export function rpcName(name, rehearsal) {
  return rehearsal ? `rehearsal_${name}` : name;
}
