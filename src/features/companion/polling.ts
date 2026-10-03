/** Foreground polling: one request at a time, abort on hide/offline/unmount. */
export function foregroundPolling(load: (signal: AbortSignal) => Promise<void>, interval: number, onOffline?: () => void, immediate = true) {
  let stopped = false;
  let active: AbortController | null = null;
  const refresh = async () => {
    if (stopped || active || document.visibilityState === 'hidden') return;
    if (!navigator.onLine) { onOffline?.(); return; }
    const request = new AbortController(); active = request;
    const timeout = window.setTimeout(() => request.abort(new Error('timeout')), 8000);
    try { await load(request.signal); }
    finally { window.clearTimeout(timeout); if (active === request) active = null; }
  };
  const cancel = () => { active?.abort(); active = null; };
  const visible = () => { if (document.visibilityState === 'hidden') cancel(); else void refresh(); };
  const offline = () => { cancel(); onOffline?.(); };
  const resume = () => { void refresh(); };
  if (immediate) void refresh();
  const timer = window.setInterval(resume, interval);
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('online', resume);
  window.addEventListener('offline', offline);
  window.addEventListener('pageshow', resume);
  return { refresh, stop: () => {
    stopped = true; cancel(); window.clearInterval(timer);
    document.removeEventListener('visibilitychange', visible);
    window.removeEventListener('online', resume); window.removeEventListener('offline', offline);
    window.removeEventListener('pageshow', resume);
  } };
}
