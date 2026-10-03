/** Foreground polling: one request at a time, abort on hide/offline/unmount. */
export function foregroundPolling(load: (signal: AbortSignal) => Promise<void>, interval: number, onOffline?: () => void, immediate = true, supersedeOnVisible = false) {
  let stopped = false;
  let active: AbortController | null = null;
  const refresh = async () => {
    if (stopped || active || document.visibilityState === 'hidden') return;
    if (!navigator.onLine) { onOffline?.(); return; }
    const request = new AbortController(); active = request;
    const timeout = window.setTimeout(() => request.abort(new Error('timeout')), 8000);
    let cancel = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      cancel = () => { window.clearTimeout(timeout); reject(request.signal.reason); };
      request.signal.addEventListener('abort', cancel, { once: true });
    });
    try { await Promise.race([load(request.signal), interrupted]); }
    catch { if (!stopped && active === request && request.signal.reason?.message === 'timeout') onOffline?.(); }
    finally { window.clearTimeout(timeout); request.signal.removeEventListener('abort', cancel); if (active === request) active = null; }
  };
  const cancel = () => { active?.abort(); active = null; };
  const visible = () => { if (document.visibilityState === 'hidden' || supersedeOnVisible) cancel(); if (document.visibilityState !== 'hidden') void refresh(); };
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
